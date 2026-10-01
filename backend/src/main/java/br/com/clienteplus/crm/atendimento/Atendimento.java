package br.com.clienteplus.crm.atendimento;

import br.com.clienteplus.crm.canais.Conexoes;
import br.com.clienteplus.crm.canais.Envio;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Hub;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.eventos.Eventos;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Event;
import jakarta.inject.Inject;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jboss.logging.Logger;

/**
 * Regras do atendimento: contatos e conversas, mensagens recebidas e enviadas,
 * tags, status, transferência IA ↔ humano. Toda mensagem passa por aqui.
 */
@ApplicationScoped
public class Atendimento {

  private static final Logger LOG = Logger.getLogger(Atendimento.class);

  @Inject Db db;
  @Inject Hub hub;
  @Inject br.com.clienteplus.crm.comum.WebPush push;
  @Inject Envio envio;
  @Inject Conexoes conexoes;
  @Inject Event<Object> eventos;

  public static final String VIEW = """
      select c.*, ct.nome as contato_nome, ct.telefone as contato_telefone, ct.foto_url as contato_foto,
        ct.instagram_usuario as contato_instagram, ct.tags as contato_tags, ct.email as contato_email,
        cx.nome as conexao_nome, cx.tipo as conexao_tipo, u.nome as humano_nome, a.nome as agente_nome, s.nome as setor_nome
      from crm_conversas c
      join crm_contatos ct on ct.id = c.contato_id
      left join crm_conexoes cx on cx.id = c.conexao_id
      left join crm_usuarios u on u.id = c.humano_id
      left join crm_agentes a on a.id = c.agente_id
      left join crm_setores s on s.id = c.setor_id
      """;

  public record Contato(Map<String, Object> dados, boolean novo) {
    public UUID id() {
      return UUID.fromString((String) dados.get("id"));
    }
  }

  public record Remetente(String tipo, UUID usuarioId, UUID agenteId, String nome) {
    public static Remetente humano(UUID usuarioId, String nome) {
      return new Remetente("agent", usuarioId, null, nome);
    }

    public static Remetente ia(UUID agenteId, String nome) {
      return new Remetente("ai", null, agenteId, nome);
    }

    public static Remetente sistema(String nome) {
      return new Remetente("system", null, null, nome);
    }
  }

  /** Mensagem que chegou de um canal. */
  public record Recebida(UUID storeId, Conexoes.Conexao conexao, String canal, String telefone, String instagramId, String nomePerfil,
      String tipo, String texto, String midiaUrl, String midiaMime, String arquivoNome, String canalMensagemId, Instant quando,
      Map<String, Object> metadados, String botaoPayload, boolean enviadaPeloCelular, Map<String, Object> origemDados) {}

  // ---------------- contatos ----------------

  public Contato contatoPorTelefone(UUID storeId, String telefone, String nome, UUID conexaoId, String origem) {
    String[] vars = Formatos.variacoesTelefone(telefone);
    if (vars.length == 0) throw Erro.requisicao("Telefone inválido");
    Map<String, Object> c = db.um("select * from crm_contatos where store_id = ? and telefone = any(?) order by created_at limit 1", storeId, new Db.Arr("text", vars));
    if (c != null) {
      if ((c.get("nome") == null || String.valueOf(c.get("nome")).isBlank()) && nome != null && !nome.isBlank())
        c = db.um("update crm_contatos set nome = ?, updated_at = now() where id = ? returning *", nome, UUID.fromString((String) c.get("id")));
      return new Contato(c, false);
    }
    c = db.um("""
        insert into crm_contatos (store_id, telefone, nome, origem, conexao_id, remote_jid, primeiro_contato_em, ultimo_contato_em)
        values (?, ?, ?, ?, ?, ?, now(), now())
        on conflict (store_id, telefone) where telefone is not null do update set updated_at = now() returning *""",
        storeId, vars[0], nome, origem, conexaoId, vars[0] + "@s.whatsapp.net");
    return new Contato(c, true);
  }

  public Contato contatoPorInstagram(UUID storeId, String igsid, String nome, String usuario, UUID conexaoId) {
    Map<String, Object> c = db.um("select * from crm_contatos where store_id = ? and instagram_id = ?", storeId, igsid);
    if (c != null) return new Contato(c, false);
    c = db.um("""
        insert into crm_contatos (store_id, instagram_id, instagram_usuario, nome, origem, conexao_id, primeiro_contato_em, ultimo_contato_em)
        values (?, ?, ?, ?, 'instagram', ?, now(), now()) returning *""", storeId, igsid, usuario, nome, conexaoId);
    return new Contato(c, true);
  }

  // ---------------- conversas ----------------

  public record ConversaRes(Map<String, Object> dados, boolean nova) {
    public UUID id() {
      return UUID.fromString((String) dados.get("id"));
    }
  }

  /** A conversa ativa do contato naquela conexão; cria se não houver. */
  public ConversaRes conversaPara(UUID storeId, UUID contatoId, Conexoes.Conexao cx, String canal) {
    Map<String, Object> c = db.um("""
        select * from crm_conversas where store_id = ? and contato_id = ? and canal = ? and arquivada_em is null
          and (conexao_id is not distinct from ?::uuid or conexao_id is null)
        order by ultima_mensagem_em desc nulls last limit 1""", storeId, contatoId, canal, cx == null ? null : cx.id());
    if (c != null) {
      if (c.get("conexaoId") == null && cx != null) db.executa("update crm_conversas set conexao_id = ? where id = ?", cx.id(), UUID.fromString((String) c.get("id")));
      return new ConversaRes(c, false);
    }
    UUID agente = agenteDaConexao(storeId, cx);
    boolean ia = agente != null;
    Map<String, Object> nova = db.insere("crm_conversas", Json.de(
        "store_id", storeId, "contato_id", contatoId, "conexao_id", cx == null ? null : cx.id(), "canal", canal, "status", "new",
        "ia_ativa", ia, "agente_id", agente, "atribuida_a", ia ? "ai" : "human", "handoff_status", ia ? "ai" : "queue",
        "provedor", cx == null ? null : cx.tipo()));
    UUID id = UUID.fromString((String) nova.get("id"));
    if (!ia) distribuirHumano(storeId, id);
    return new ConversaRes(db.um("select * from crm_conversas where id = ?", id), true);
  }

  private UUID agenteDaConexao(UUID storeId, Conexoes.Conexao cx) {
    if (cx != null && cx.agenteId() != null) {
      String st = db.valor("select status from crm_agentes where id = ?", cx.agenteId());
      if ("active".equals(st)) return cx.agenteId();
    }
    if (cx != null) {
      Map<String, Object> a = db.um("""
          select a.id from crm_agentes a join crm_agente_conexoes ac on ac.agente_id = a.id
          where ac.conexao_id = ? and a.status = 'active' order by a.created_at limit 1""", cx.id());
      if (a != null) return UUID.fromString((String) a.get("id"));
    }
    return null;
  }

  /** Distribuição automática de leads para humanos (rodízio / menos ocupado), conforme a loja. */
  public void distribuirHumano(UUID storeId, UUID conversaId) {
    Map<String, Object> cfg = Json.m(db.valor("select config from crm_lojas where id = ?", storeId));
    String modo = Json.s(Json.m(cfg.get("distribuicao")), "modo", "manual");
    if ("manual".equals(modo)) return;
    UUID setor = Formatos.uuid(db.valor("select setor_id from crm_conversas where id = ?", conversaId));
    String ordem = "rodizio".equals(modo)
        ? "(select max(c.handoff_em) from crm_conversas c where c.humano_id = m.usuario_id) asc nulls first"
        : "(select count(*) from crm_conversas c where c.humano_id = m.usuario_id and c.status in ('new','open','pending')) asc";
    Map<String, Object> m = db.um("""
        select m.usuario_id from crm_membros m join crm_usuarios u on u.id = m.usuario_id
        where m.store_id = ? and m.recebe_leads and u.ativo and (?::uuid is null or m.setor_id = ?)
          and (m.limite_conversas = 0 or (select count(*) from crm_conversas c where c.humano_id = m.usuario_id and c.status in ('new','open','pending')) < m.limite_conversas)
        order by """ + ordem + " limit 1", storeId, setor, setor);
    if (m == null) return;
    UUID usuario = UUID.fromString((String) m.get("usuarioId"));
    db.executa("update crm_conversas set humano_id = ?, atribuida_a = 'human', handoff_status = 'human', handoff_em = now() where id = ?", usuario, conversaId);
    notificar(storeId, usuario, "conversa", "Nova conversa para você", null, "/conversas?c=" + conversaId);
  }

  // ---------------- receber ----------------

  /** Grava a mensagem recebida e avisa IA/automações. Devolve o id da mensagem (null se repetida). */
  public UUID receber(Recebida r) {
    UUID storeId = r.storeId();
    if (r.canalMensagemId() != null && db.numero("select count(*) from crm_mensagens where store_id = ? and canal_mensagem_id = ?", storeId, r.canalMensagemId()) > 0)
      return null; // a Meta às vezes reenvia o mesmo webhook
    UUID conexaoId = r.conexao() == null ? null : r.conexao().id();
    Contato ct = r.instagramId() != null
        ? contatoPorInstagram(storeId, r.instagramId(), r.nomePerfil(), null, conexaoId)
        : contatoPorTelefone(storeId, r.telefone(), r.nomePerfil(), conexaoId, r.canal());
    ConversaRes cv = conversaPara(storeId, ct.id(), r.conexao(), r.canal());
    Instant quando = r.quando() == null ? Instant.now() : r.quando();
    String remetente = r.enviadaPeloCelular() ? "agent" : "customer";
    Map<String, Object> msg = db.insere("crm_mensagens", Json.de(
        "store_id", storeId, "conversa_id", cv.id(), "conteudo", r.texto(), "remetente", remetente,
        "remetente_nome", r.enviadaPeloCelular() ? "Celular" : null, "tipo", r.tipo(), "midia_url", r.midiaUrl(), "midia_mime", r.midiaMime(),
        "arquivo_nome", r.arquivoNome(), "metadados", r.metadados() == null ? Map.of() : r.metadados(),
        "canal_mensagem_id", r.canalMensagemId(), "enviada_em", quando, "status_entrega", r.enviadaPeloCelular() ? "sent" : null));
    UUID msgId = UUID.fromString((String) msg.get("id"));
    String previa = previa(r.tipo(), r.texto());

    if (r.enviadaPeloCelular()) {
      // resposta dada pelo app do celular (coexistência): conta como humano
      db.executa("""
          update crm_conversas set ultima_mensagem = ?, ultima_mensagem_em = ?, ultimo_remetente = 'agent', aguardando_resposta = false,
            primeira_resposta_em = coalesce(primeira_resposta_em, case when ultima_do_cliente_em is not null then ?::timestamptz end),
            updated_at = now() where id = ?""", previa, quando, quando, cv.id());
    } else {
      db.executa("""
          update crm_conversas set ultima_mensagem = ?, ultima_mensagem_em = ?, ultima_do_cliente_em = ?, ultimo_remetente = 'customer',
            nao_lidas = nao_lidas + 1, aguardando_resposta = true, marcada_lida_manual = false,
            status = case when status in ('resolved','closed') then 'open' else status end,
            resolvida_em = case when status in ('resolved','closed') then null else resolvida_em end,
            followups_enviados = 0, proximo_followup_em = null,
            origem = coalesce(origem, ?), origem_dados = coalesce(origem_dados, ?::jsonb), updated_at = now()
          where id = ?""", previa, quando, quando, r.origemDados() == null ? null : Json.s(r.origemDados(), "canal"), r.origemDados(), cv.id());
      db.executa("update crm_contatos set total_mensagens = total_mensagens + 1, ultimo_contato_em = ?, updated_at = now() where id = ?", quando, ct.id());
      // cliente respondeu: cancela retomadas automáticas que estavam na fila
      db.executa("update crm_fila_envio set status = 'canceled' where conversa_id = ? and status = 'pending' and origem in ('followup','carrinho','pix')", cv.id());
    }
    emitirMensagem(storeId, cv.id(), msg);
    if (!r.enviadaPeloCelular()) {
      if (ct.novo()) eventos.fireAsync(new Eventos.ContatoCriado(storeId, ct.id(), cv.id()));
      eventos.fireAsync(new Eventos.MensagemRecebida(storeId, cv.id(), ct.id(), msgId, r.texto(), r.tipo(), cv.nova(), ct.novo(), r.botaoPayload()));
    }
    return msgId;
  }

  /** Mensagem antiga (histórico do celular): grava sem contar como não lida e sem acionar IA/automações. */
  public void receberHistorico(Recebida r) {
    UUID storeId = r.storeId();
    if (r.canalMensagemId() != null && db.numero("select count(*) from crm_mensagens where store_id = ? and canal_mensagem_id = ?", storeId, r.canalMensagemId()) > 0) return;
    Contato ct = contatoPorTelefone(storeId, r.telefone(), r.nomePerfil(), r.conexao() == null ? null : r.conexao().id(), "whatsapp");
    Map<String, Object> cv = db.um("select id from crm_conversas where store_id = ? and contato_id = ? and canal = 'whatsapp' order by created_at limit 1", storeId, ct.id());
    UUID conversaId = cv != null ? UUID.fromString((String) cv.get("id")) : UUID.fromString((String) db.insere("crm_conversas", Json.de(
        "store_id", storeId, "contato_id", ct.id(), "conexao_id", r.conexao() == null ? null : r.conexao().id(), "canal", "whatsapp",
        "status", "resolved", "ia_ativa", false, "atribuida_a", "human", "handoff_status", "human", "coexistencia", true, "provedor", "coexistence_history")).get("id"));
    Instant quando = r.quando() == null ? Instant.now() : r.quando();
    db.insere("crm_mensagens", Json.de("store_id", storeId, "conversa_id", conversaId, "conteudo", r.texto(),
        "remetente", r.enviadaPeloCelular() ? "agent" : "customer", "tipo", r.tipo(), "midia_url", r.midiaUrl(), "midia_mime", r.midiaMime(),
        "arquivo_nome", r.arquivoNome(), "metadados", r.metadados() == null ? Map.of() : r.metadados(), "canal_mensagem_id", r.canalMensagemId(), "enviada_em", quando));
    db.executa("""
        update crm_conversas set ultima_mensagem = case when ultima_mensagem_em is null or ultima_mensagem_em < ? then ? else ultima_mensagem end,
          ultima_mensagem_em = greatest(coalesce(ultima_mensagem_em, ?), ?) where id = ?""", quando, previa(r.tipo(), r.texto()), quando, quando, conversaId);
  }

  // ---------------- enviar ----------------

  /** Envia pela conexão da conversa, grava e atualiza métricas. Devolve a mensagem gravada. */
  public Map<String, Object> enviar(UUID storeId, UUID conversaId, Envio.Pedido p, Remetente rem) {
    Map<String, Object> cv = db.obrigatorio("Conversa", "select * from crm_conversas where id = ? and store_id = ?", conversaId, storeId);
    Map<String, Object> ct = db.um("select telefone, instagram_id, bloqueado from crm_contatos where id = ?", UUID.fromString((String) cv.get("contatoId")));
    if (Json.b(ct, "bloqueado", false)) throw Erro.requisicao("Este contato está bloqueado");
    Conexoes.Conexao cx = cv.get("conexaoId") == null ? conexoes.padrao(storeId, "instagram".equals(cv.get("canal")) ? "instagram" : "whatsapp_cloud")
        : conexoes.obter(UUID.fromString((String) cv.get("conexaoId")));
    String destino = "instagram".equals(cv.get("canal")) ? (String) ct.get("instagramId") : (String) ct.get("telefone");
    if (destino == null) throw Erro.requisicao("Contato sem telefone/Instagram para responder");

    String texto = p.texto();
    if ("agent".equals(rem.tipo()) && rem.nome() != null && "text".equals(p.tipo()) && assinaturaAtiva(storeId))
      texto = "*" + rem.nome() + ":*\n" + texto;
    Envio.Pedido enviado = texto == null || texto.equals(p.texto()) ? p
        : new Envio.Pedido(p.tipo(), texto, p.midiaUrl(), p.midiaMime(), p.arquivoNome(), p.legenda(), p.template(), p.interativo(), p.respondendoA());

    String canalId = null;
    String erro = null;
    try {
      canalId = envio.enviar(cx, destino, enviado);
    } catch (Erro e) {
      erro = e.getMessage();
    }
    String conteudo = switch (p.tipo()) {
      case "template" -> textoTemplate(p.template());
      case "list", "buttons" -> p.texto();
      default -> texto != null ? texto : p.legenda();
    };
    Map<String, Object> meta = Json.de();
    if (p.interativo() != null) meta.put("interativo", p.interativo());
    if (p.template() != null) meta.put("template", p.template());
    if (p.respondendoA() != null) meta.put("respondendo_a", p.respondendoA());
    Map<String, Object> msg = db.insere("crm_mensagens", Json.de(
        "store_id", storeId, "conversa_id", conversaId, "conteudo", conteudo, "remetente", rem.tipo(), "remetente_nome", rem.nome(),
        "usuario_id", rem.usuarioId(), "agente_id", rem.agenteId(),
        "tipo", switch (p.tipo()) { case "list", "buttons" -> "interactive"; default -> p.tipo(); },
        "midia_url", p.midiaUrl(), "midia_mime", p.midiaMime(), "arquivo_nome", p.arquivoNome(), "legenda", p.legenda(),
        "metadados", meta, "status_entrega", erro == null ? "sent" : "failed", "erro_entrega", erro, "canal_mensagem_id", canalId));
    if (erro == null) {
      Instant agora = Instant.now();
      Long ms = null;
      if (cv.get("primeiraRespostaEm") == null && cv.get("ultimaDoClienteEm") != null)
        ms = Duration.between(Instant.parse((String) cv.get("ultimaDoClienteEm")), agora).toMillis();
      db.executa("""
          update crm_conversas set ultima_mensagem = ?, ultima_mensagem_em = now(), ultimo_remetente = ?, aguardando_resposta = false,
            primeira_resposta_em = coalesce(primeira_resposta_em, case when ?::bigint is not null then now() end),
            primeira_resposta_ms = coalesce(primeira_resposta_ms, ?::bigint),
            status = case when status = 'new' then 'open' else status end, updated_at = now()
          where id = ?""", previa(p.tipo(), conteudo), rem.tipo(), ms, ms, conversaId);
      eventos.fireAsync(new Eventos.MensagemEnviada(storeId, conversaId, UUID.fromString((String) cv.get("contatoId")), rem.tipo()));
    }
    emitirMensagem(storeId, conversaId, msg);
    if (erro != null && !"agent".equals(rem.tipo())) LOG.warnf("Falha ao enviar (%s) na conversa %s: %s", rem.tipo(), conversaId, erro);
    if (erro != null && "agent".equals(rem.tipo())) throw new Erro(422, erro);
    return msg;
  }

  /** Nota interna: fica na conversa, o cliente não vê. */
  public Map<String, Object> nota(UUID storeId, UUID conversaId, String texto, UUID usuarioId, String nome) {
    db.obrigatorio("Conversa", "select id from crm_conversas where id = ? and store_id = ?", conversaId, storeId);
    Map<String, Object> msg = db.insere("crm_mensagens", Json.de("store_id", storeId, "conversa_id", conversaId, "conteudo", texto,
        "remetente", "agent", "remetente_nome", nome, "usuario_id", usuarioId, "tipo", "note", "visibilidade", "internal"));
    emitirMensagem(storeId, conversaId, msg);
    return msg;
  }

  /** Mensagem de sistema (ex.: "Conversa transferida para Ana"). Não vai para o cliente. */
  public void registroSistema(UUID storeId, UUID conversaId, String texto) {
    Map<String, Object> msg = db.insere("crm_mensagens", Json.de("store_id", storeId, "conversa_id", conversaId, "conteudo", texto,
        "remetente", "system", "tipo", "note", "visibilidade", "internal"));
    emitirMensagem(storeId, conversaId, msg);
  }

  public void statusEntrega(String canalMensagemId, String status, String erro) {
    Map<String, Object> m = db.um("""
        update crm_mensagens set status_entrega = case
            when status_entrega = 'read' then 'read'
            when status_entrega = 'delivered' and ? = 'sent' then 'delivered'
            else ? end,
          erro_entrega = coalesce(?, erro_entrega)
        where canal_mensagem_id = ? returning id, store_id, conversa_id, status_entrega, erro_entrega""", status, status, erro, canalMensagemId);
    if (m == null) return;
    UUID storeId = UUID.fromString((String) m.get("storeId"));
    hub.emitir(storeId, "entrega", m);
    db.executa("""
        update crm_disparo_envios set status = case when status in ('replied') then status when ? = 'read' then 'read'
          when ? = 'delivered' and status <> 'read' then 'delivered' when ? = 'failed' then 'failed' else status end, erro = coalesce(?, erro)
        where canal_mensagem_id = ?""", status, status, status, erro, canalMensagemId);
  }

  // ---------------- tags, status, atribuição ----------------

  public void adicionarTag(UUID storeId, UUID contatoId, UUID conversaId, String tag) {
    String t = tag.trim();
    if (t.isEmpty()) return;
    db.executa("insert into crm_tags (store_id, nome) values (?, ?) on conflict do nothing", storeId, t);
    int n = db.executa("update crm_contatos set tags = array_append(tags, ?), updated_at = now() where id = ? and store_id = ? and not (? = any(tags))", t, contatoId, storeId, t);
    if (conversaId != null) db.executa("update crm_conversas set tags = array_append(tags, ?) where id = ? and not (? = any(tags))", t, conversaId, t);
    if (n > 0) {
      hub.emitir(storeId, "contato", Map.of("id", contatoId));
      eventos.fireAsync(new Eventos.TagAlterada(storeId, contatoId, conversaId, t, true));
    }
  }

  public void removerTag(UUID storeId, UUID contatoId, UUID conversaId, String tag) {
    int n = db.executa("update crm_contatos set tags = array_remove(tags, ?), updated_at = now() where id = ? and store_id = ? and ? = any(tags)", tag, contatoId, storeId, tag);
    db.executa("update crm_conversas set tags = array_remove(tags, ?) where contato_id = ? and store_id = ?", tag, contatoId, storeId);
    if (n > 0) {
      hub.emitir(storeId, "contato", Map.of("id", contatoId));
      eventos.fireAsync(new Eventos.TagAlterada(storeId, contatoId, conversaId, tag, false));
    }
  }

  public void mudarStatus(UUID storeId, UUID conversaId, String status) {
    Erro.exigir(List.of("new", "open", "pending", "resolved", "closed").contains(status), "Status inválido");
    Map<String, Object> cv = db.obrigatorio("Conversa", "select status, contato_id, created_at from crm_conversas where id = ? and store_id = ?", conversaId, storeId);
    String de = (String) cv.get("status");
    if (status.equals(de)) return;
    boolean fechando = status.equals("resolved") || status.equals("closed");
    db.executa("""
        update crm_conversas set status = ?, resolvida_em = case when ? then now() else null end,
          resolucao_ms = case when ? then (extract(epoch from now() - created_at) * 1000)::bigint else resolucao_ms end,
          proximo_followup_em = case when ? then null else proximo_followup_em end, updated_at = now() where id = ?""",
        status, fechando, fechando, fechando, conversaId);
    emitirConversa(storeId, conversaId);
    eventos.fireAsync(new Eventos.StatusConversa(storeId, conversaId, UUID.fromString((String) cv.get("contatoId")), de, status));
  }

  /** Passa a conversa para um humano (fila do setor ou pessoa) e desliga a IA nela. */
  public void transferirHumano(UUID storeId, UUID conversaId, UUID usuarioId, UUID setorId, String motivo) {
    db.executa("""
        update crm_conversas set ia_ativa = false, atribuida_a = 'human', handoff_status = ?, handoff_motivo = ?, handoff_em = now(),
          humano_id = coalesce(?, humano_id), setor_id = coalesce(?, setor_id), proximo_followup_em = null, updated_at = now()
        where id = ? and store_id = ?""", usuarioId == null ? "queue" : "human", motivo, usuarioId, setorId, conversaId, storeId);
    if (usuarioId == null) distribuirHumano(storeId, conversaId);
    Map<String, Object> c = db.um("select humano_id from crm_conversas where id = ?", conversaId);
    String quem = c.get("humanoId") == null ? "a fila" : db.valor("select nome from crm_usuarios where id = ?", UUID.fromString((String) c.get("humanoId")));
    registroSistema(storeId, conversaId, "Conversa transferida para " + quem + (motivo == null ? "" : " — " + motivo));
    if (c.get("humanoId") != null && !UUID.fromString((String) c.get("humanoId")).equals(usuarioId == null ? null : usuarioId))
      notificar(storeId, UUID.fromString((String) c.get("humanoId")), "handoff", "Conversa transferida para você", motivo, "/conversas?c=" + conversaId);
    else if (c.get("humanoId") == null)
      notificarEquipe(storeId, "handoff", "Cliente aguardando atendimento humano", motivo, "/conversas?c=" + conversaId);
    emitirConversa(storeId, conversaId);
  }

  /** Devolve a conversa para a IA. */
  public void devolverIa(UUID storeId, UUID conversaId, UUID agenteId) {
    UUID agente = agenteId;
    if (agente == null) agente = Formatos.uuid(db.valor("select agente_id from crm_conversas where id = ? and store_id = ?", conversaId, storeId));
    if (agente == null) {
      Map<String, Object> cv = db.um("select conexao_id from crm_conversas where id = ?", conversaId);
      if (cv != null && cv.get("conexaoId") != null) agente = agenteDaConexao(storeId, conexoes.obter(UUID.fromString((String) cv.get("conexaoId"))));
    }
    if (agente == null) throw Erro.requisicao("Nenhum agente de IA ativo para esta conexão");
    db.executa("""
        update crm_conversas set ia_ativa = true, agente_id = ?, atribuida_a = 'ai', handoff_status = 'ai', humano_encerrou_em = now(), updated_at = now()
        where id = ? and store_id = ?""", agente, conversaId, storeId);
    registroSistema(storeId, conversaId, "Conversa devolvida para a IA");
    emitirConversa(storeId, conversaId);
  }

  // ---------------- avisos ----------------

  public void emitirMensagem(UUID storeId, UUID conversaId, Map<String, Object> msg) {
    hub.emitir(storeId, "mensagem", Map.of("conversaId", conversaId, "mensagem", msg));
    emitirConversa(storeId, conversaId);
  }

  public void emitirConversa(UUID storeId, UUID conversaId) {
    Map<String, Object> c = db.um(VIEW + " where c.id = ?", conversaId);
    if (c != null) hub.emitir(storeId, "conversa", c);
  }

  public void notificar(UUID storeId, UUID usuarioId, String tipo, String titulo, String texto, String link) {
    Map<String, Object> n = db.insere("crm_notificacoes", Json.de("store_id", storeId, "usuario_id", usuarioId, "tipo", tipo, "titulo", titulo, "texto", texto, "link", link));
    hub.emitir(storeId, "notificacao", n);
    push.enviar(storeId, usuarioId, titulo, texto, link);
  }

  public void notificarEquipe(UUID storeId, String tipo, String titulo, String texto, String link) {
    for (Map<String, Object> m : db.lista("select usuario_id from crm_membros where store_id = ? and papel in ('dono','admin','supervisor')", storeId))
      notificar(storeId, UUID.fromString((String) m.get("usuarioId")), tipo, titulo, texto, link);
  }

  private boolean assinaturaAtiva(UUID storeId) {
    return Json.b(Json.m(db.valor("select config from crm_lojas where id = ?", storeId)), "assinatura_atendente", true);
  }

  public static String previa(String tipo, String texto) {
    if (texto != null && !texto.isBlank()) return Formatos.curto(texto.replaceAll("\\s+", " "), 200);
    return switch (tipo == null ? "" : tipo) {
      case "image" -> "📷 Imagem";
      case "audio" -> "🎤 Áudio";
      case "video" -> "🎬 Vídeo";
      case "document" -> "📄 Documento";
      case "sticker" -> "Figurinha";
      case "location" -> "📍 Localização";
      case "template" -> "Template";
      default -> "📎 Mídia";
    };
  }

  static String textoTemplate(Map<String, Object> t) {
    if (t == null) return null;
    String texto = Json.s(t, "_texto");
    return texto != null ? texto : "Template: " + Json.s(t, "name");
  }

  public static List<String> tags(Object o) {
    List<String> out = new ArrayList<>();
    for (Object x : Json.l(o)) out.add(String.valueOf(x));
    return out;
  }
}
