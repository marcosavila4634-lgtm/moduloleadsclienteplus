package br.com.clienteplus.crm.atendimento;

import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.canais.Envio;
import br.com.clienteplus.crm.canais.Templates;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.ia.AgenteRuntime;
import br.com.clienteplus.crm.ia.Analise;
import jakarta.inject.Inject;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Central de atendimento (inbox). */
@Path("/conversas")
public class ConversasResource {

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject Atendimento atendimento;
  @Inject Templates templates;
  @Inject AgenteRuntime runtime;
  @Inject Analise analise;
  @Inject br.com.clienteplus.crm.canais.Conexoes conexoes;

  /** Atendente só vê as conversas dele, da fila do setor e as da IA (supervisor+ vê tudo). */
  private String filtroVisibilidade(List<Object> p) {
    if (sessao.peloMenos("supervisor")) return "";
    p.add(sessao.usuario());
    p.add(sessao.setor());
    return " and (c.humano_id = ? or c.humano_id is null and (c.setor_id is null or c.setor_id = ?::uuid))";
  }

  @GET
  public List<Map<String, Object>> listar(@QueryParam("aba") String aba, @QueryParam("canal") String canal, @QueryParam("tag") String tag,
      @QueryParam("conexao") UUID conexao, @QueryParam("busca") String busca, @QueryParam("status") String status,
      @QueryParam("minhas") boolean minhas, @QueryParam("setor") UUID setor, @QueryParam("antes") String antes, @QueryParam("limite") Integer limite) {
    UUID loja = sessao.loja();
    List<Object> p = new ArrayList<>();
    StringBuilder w = new StringBuilder(" where c.store_id = ?");
    p.add(loja);
    w.append(filtroVisibilidade(p));
    switch (aba == null ? "todas" : aba) {
      case "nao_lidas" -> w.append(" and c.nao_lidas > 0");
      case "ia" -> w.append(" and c.atribuida_a = 'ai' and c.ia_ativa");
      case "humano" -> w.append(" and c.atribuida_a = 'human' and c.humano_id is not null");
      case "fila" -> w.append(" and c.atribuida_a = 'human' and c.humano_id is null");
      case "arquivadas" -> w.append(" and c.arquivada_em is not null");
      default -> { }
    }
    if (!"arquivadas".equals(aba)) w.append(" and c.arquivada_em is null");
    if (canal != null && !canal.isBlank()) { w.append(" and c.canal = ?"); p.add(canal); }
    if (tag != null && !tag.isBlank()) { w.append(" and ? = any(ct.tags)"); p.add(tag); }
    if (conexao != null) { w.append(" and c.conexao_id = ?"); p.add(conexao); }
    if (status != null && !status.isBlank()) { w.append(" and c.status = ?"); p.add(status); }
    if (minhas) { w.append(" and c.humano_id = ?"); p.add(sessao.usuario()); }
    if (setor != null) { w.append(" and c.setor_id = ?"); p.add(setor); }
    if (antes != null && !antes.isBlank()) { w.append(" and c.ultima_mensagem_em < ?"); p.add(Formatos.instante(antes)); }
    if (busca != null && !busca.isBlank()) {
      String b = "%" + busca.trim().toLowerCase() + "%";
      w.append(" and (lower(coalesce(ct.nome,'')) like ? or ct.telefone like ? or lower(coalesce(c.ultima_mensagem,'')) like ? or lower(coalesce(ct.instagram_usuario,'')) like ?)");
      p.add(b); p.add("%" + busca.replaceAll("\\D", "") + "%"); p.add(b); p.add(b);
    }
    p.add(Math.min(200, limite == null ? 60 : limite));
    return db.lista(Atendimento.VIEW + w + " order by c.ultima_mensagem_em desc nulls last limit ?", p.toArray());
  }

  @GET
  @Path("/contadores")
  public Map<String, Object> contadores() {
    UUID loja = sessao.loja();
    List<Object> p = new ArrayList<>();
    p.add(loja);
    String vis = filtroVisibilidade(p);
    return db.um("""
        select count(*) filter (where c.nao_lidas > 0) as nao_lidas,
          count(*) filter (where c.atribuida_a = 'ai' and c.ia_ativa) as ia,
          count(*) filter (where c.atribuida_a = 'human' and c.humano_id is not null) as humano,
          count(*) filter (where c.atribuida_a = 'human' and c.humano_id is null) as fila,
          count(*) filter (where c.aguardando_resposta and c.status in ('new','open')) as esperando
        from crm_conversas c join crm_contatos ct on ct.id = c.contato_id where c.store_id = ? and c.arquivada_em is null""" + vis, p.toArray());
  }

  @GET
  @Path("/{id}")
  public Map<String, Object> obter(@PathParam("id") UUID id) {
    Map<String, Object> c = db.obrigatorio("Conversa", Atendimento.VIEW + " where c.id = ? and c.store_id = ?", id, sessao.loja());
    UUID contato = UUID.fromString((String) c.get("contatoId"));
    c.put("negocio", db.um("select n.id, n.titulo, n.valor, n.score_ia, n.etapa_id, n.funil_id, e.nome as etapa_nome, e.cor as etapa_cor from crm_negocios n join crm_etapas e on e.id = n.etapa_id where n.contato_id = ? order by (n.ganho_em is null and n.perdido_em is null) desc, n.updated_at desc limit 1", contato));
    c.put("memorias", db.lista("select id, fato, categoria, fonte, updated_at from crm_memorias where contato_id = ? order by updated_at desc limit 50", contato));
    c.put("promessas", db.lista("select * from crm_promessas where contato_id = ? and status = 'pendente' order by vence_em", contato));
    c.put("pedidos", db.lista("select id, numero, status, total, created_at from crm_pedidos where contato_id = ? order by created_at desc limit 10", contato));
    c.put("janela24h", db.numero("select count(*) from crm_conversas where id = ? and ultima_do_cliente_em > now() - interval '24' hour", id) > 0);
    return c;
  }

  /** Mensagens (mais recentes primeiro na busca; devolvidas em ordem cronológica). */
  @GET
  @Path("/{id}/mensagens")
  public List<Map<String, Object>> mensagens(@PathParam("id") UUID id, @QueryParam("antes") String antes, @QueryParam("limite") Integer limite) {
    db.obrigatorio("Conversa", "select id from crm_conversas where id = ? and store_id = ?", id, sessao.loja());
    int lim = Math.min(300, limite == null ? 80 : limite);
    return db.lista("""
        select * from (select m.*, u.nome as usuario_nome from crm_mensagens m left join crm_usuarios u on u.id = m.usuario_id
          where m.conversa_id = ? and (?::timestamptz is null or m.enviada_em < ?::timestamptz) order by m.enviada_em desc limit ?) x order by enviada_em""",
        id, antes == null || antes.isBlank() ? null : Formatos.instante(antes), antes == null || antes.isBlank() ? null : Formatos.instante(antes), lim);
  }

  /**
   * Envio pelo atendente. corpo: {tipo, texto, midiaUrl, midiaMime, arquivoNome, legenda,
   * templateId, variaveis, opcoes, respondendoA, manterIa}
   */
  @POST
  @Path("/{id}/mensagens")
  public Map<String, Object> enviar(@PathParam("id") UUID id, Map<String, Object> corpo) {
    UUID loja = sessao.loja();
    Map<String, Object> cv = db.obrigatorio("Conversa", "select * from crm_conversas where id = ? and store_id = ?", id, loja);
    String tipo = Json.s(corpo, "tipo", "text");
    Envio.Pedido p;
    switch (tipo) {
      case "template" -> {
        Map<String, Object> ct = db.um("select * from crm_contatos where id = ?::uuid", cv.get("contatoId"));
        Map<String, Object> t = templates.montar(loja, Formatos.uuid(corpo.get("templateId")), Json.m(corpo.get("variaveis")),
            s -> br.com.clienteplus.crm.automacoes.MotorAutomacoes.preencher(s, ct, Map.of()));
        p = new Envio.Pedido("template", null, null, null, null, null, t, null, null);
      }
      case "buttons", "list" -> {
        List<Map<String, Object>> ops = new ArrayList<>();
        int i = 0;
        for (String o : Json.ls(corpo, "opcoes")) ops.add(Json.de("id", "op" + (++i), "titulo", o));
        Map<String, Object> inter = "buttons".equals(tipo) ? Json.de("opcoes", ops) : Json.de("botao", "Ver opções", "secoes", List.of(Json.de("titulo", "Opções", "opcoes", ops)));
        p = new Envio.Pedido(tipo, Erro.obrigatorio(corpo, "texto", "Texto"), null, null, null, null, null, inter, null);
      }
      case "text" -> p = new Envio.Pedido("text", Erro.obrigatorio(corpo, "texto", "Mensagem"), null, null, null, null, null, null, Json.s(corpo, "respondendoA"));
      default -> {
        Erro.exigir(Json.s(corpo, "midiaUrl") != null, "Envie o arquivo");
        p = new Envio.Pedido(tipo, null, Json.s(corpo, "midiaUrl"), Json.s(corpo, "midiaMime"), Json.s(corpo, "arquivoNome"), Json.s(corpo, "legenda"), null, null, Json.s(corpo, "respondendoA"));
      }
    }
    Map<String, Object> msg = atendimento.enviar(loja, id, p, Atendimento.Remetente.humano(sessao.usuario(), sessao.nome()));
    // atendente respondeu: a conversa passa a ser dele (a IA para), a não ser que peça para manter
    if (!Json.b(corpo, "manterIa", false) && "ai".equals(cv.get("atribuidaA"))) {
      db.executa("update crm_conversas set ia_ativa = false, atribuida_a = 'human', handoff_status = 'human', humano_id = ?, handoff_em = coalesce(handoff_em, now()), proximo_followup_em = null where id = ?", sessao.usuario(), id);
      atendimento.emitirConversa(loja, id);
    } else if (cv.get("humanoId") == null && "human".equals(cv.get("atribuidaA"))) {
      db.executa("update crm_conversas set humano_id = ?, handoff_status = 'human' where id = ?", sessao.usuario(), id);
      atendimento.emitirConversa(loja, id);
    }
    return msg;
  }

  @POST
  @Path("/{id}/notas")
  public Map<String, Object> nota(@PathParam("id") UUID id, Map<String, Object> corpo) {
    return atendimento.nota(sessao.loja(), id, Erro.obrigatorio(corpo, "texto", "Nota"), sessao.usuario(), sessao.nome());
  }

  @POST
  @Path("/{id}/lida")
  public Map<String, Object> lida(@PathParam("id") UUID id, Map<String, Object> corpo) {
    boolean lida = corpo == null || Json.b(corpo, "lida", true);
    db.executa("update crm_conversas set nao_lidas = case when ? then 0 else greatest(nao_lidas, 1) end, marcada_lida_manual = ? where id = ? and store_id = ?", lida, !lida, id, sessao.loja());
    atendimento.emitirConversa(sessao.loja(), id);
    return Map.of("ok", true);
  }

  @PUT
  @Path("/{id}/status")
  public Map<String, Object> status(@PathParam("id") UUID id, Map<String, Object> corpo) {
    atendimento.mudarStatus(sessao.loja(), id, Erro.obrigatorio(corpo, "status", "Status"));
    return Map.of("ok", true);
  }

  /** corpo: {usuarioId?, setorId?, motivo?} — sem usuário vai para a fila. */
  @POST
  @Path("/{id}/transferir")
  public Map<String, Object> transferir(@PathParam("id") UUID id, Map<String, Object> corpo) {
    UUID usuario = Formatos.uuid(corpo.get("usuarioId"));
    if (usuario != null && db.numero("select count(*) from crm_membros where store_id = ? and usuario_id = ?", sessao.loja(), usuario) == 0) throw Erro.requisicao("Pessoa não faz parte da equipe");
    atendimento.transferirHumano(sessao.loja(), id, usuario, Formatos.uuid(corpo.get("setorId")), Json.s(corpo, "motivo"));
    return Map.of("ok", true);
  }

  @POST
  @Path("/{id}/assumir")
  public Map<String, Object> assumir(@PathParam("id") UUID id) {
    atendimento.transferirHumano(sessao.loja(), id, sessao.usuario(), null, "Assumida por " + sessao.nome());
    return Map.of("ok", true);
  }

  @POST
  @Path("/{id}/ia")
  public Map<String, Object> devolverIa(@PathParam("id") UUID id, Map<String, Object> corpo) {
    atendimento.devolverIa(sessao.loja(), id, corpo == null ? null : Formatos.uuid(corpo.get("agenteId")));
    if (corpo != null && Json.b(corpo, "responderAgora", false)) runtime.agendar(sessao.loja(), id, 1);
    return Map.of("ok", true);
  }

  @PUT
  @Path("/{id}/tags")
  public Map<String, Object> tags(@PathParam("id") UUID id, Map<String, Object> corpo) {
    UUID loja = sessao.loja();
    Map<String, Object> cv = db.obrigatorio("Conversa", "select contato_id from crm_conversas where id = ? and store_id = ?", id, loja);
    UUID contato = UUID.fromString((String) cv.get("contatoId"));
    List<String> novas = Json.ls(corpo, "tags");
    List<String> atuais = Json.ls(db.um("select tags from crm_contatos where id = ?", contato), "tags");
    for (String t : novas) if (!atuais.contains(t)) atendimento.adicionarTag(loja, contato, id, t);
    for (String t : atuais) if (!novas.contains(t)) atendimento.removerTag(loja, contato, id, t);
    atendimento.emitirConversa(loja, id);
    return Map.of("ok", true);
  }

  @PUT
  @Path("/{id}")
  public Map<String, Object> atualizar(@PathParam("id") UUID id, Map<String, Object> corpo) {
    UUID loja = sessao.loja();
    Map<String, Object> campos = new java.util.LinkedHashMap<>();
    if (corpo.containsKey("setorId")) campos.put("setor_id", Formatos.uuid(corpo.get("setorId")));
    if (corpo.containsKey("slaPrioridade")) campos.put("sla_prioridade", Json.s(corpo, "slaPrioridade"));
    if (corpo.containsKey("alertaInatividade")) campos.put("alerta_inatividade", Json.b(corpo, "alertaInatividade", false));
    if (corpo.containsKey("arquivada")) campos.put("arquivada_em", Json.b(corpo, "arquivada", false) ? java.time.Instant.now() : null);
    if (corpo.containsKey("agenteId")) campos.put("agente_id", Formatos.uuid(corpo.get("agenteId")));
    campos.put("updated_at", java.time.Instant.now());
    db.atualiza("crm_conversas", id, loja, campos);
    atendimento.emitirConversa(loja, id);
    return Map.of("ok", true);
  }

  /** Refaz o resumo e o score agora. */
  @POST
  @Path("/{id}/resumo")
  public Map<String, Object> resumo(@PathParam("id") UUID id) {
    UUID loja = sessao.loja();
    analise.analisar(loja, id);
    return db.um("select resumo, resumo_em from crm_conversas where id = ? and store_id = ?", id, loja);
  }

  /** Nova conversa com um contato (fora da janela de 24 h, só com template). */
  @POST
  public Map<String, Object> nova(Map<String, Object> corpo) {
    UUID loja = sessao.loja();
    UUID contato = Formatos.uuid(corpo.get("contatoId"));
    if (contato == null) contato = atendimento.contatoPorTelefone(loja, Erro.obrigatorio(corpo, "telefone", "Telefone"), Json.s(corpo, "nome"), null, "manual").id();
    else db.obrigatorio("Contato", "select id from crm_contatos where id = ? and store_id = ?", contato, loja);
    UUID conexao = Formatos.uuid(corpo.get("conexaoId"));
    var c = conexao == null ? conexoes.padrao(loja, "whatsapp_cloud") : conexoes.obter(conexao);
    var r = atendimento.conversaPara(loja, contato, c, "whatsapp");
    if (Json.s(corpo, "templateId") != null) enviar(r.id(), Json.de("tipo", "template", "templateId", corpo.get("templateId"), "variaveis", corpo.get("variaveis"), "manterIa", true));
    return db.um(Atendimento.VIEW + " where c.id = ?", r.id());
  }

  // ---------------- respostas rápidas ----------------

  @GET
  @Path("/respostas-rapidas")
  public List<Map<String, Object>> respostas() {
    return db.lista("select * from crm_respostas_rapidas where store_id = ? order by atalho", sessao.loja());
  }

  @POST
  @Path("/respostas-rapidas")
  public Map<String, Object> novaResposta(Map<String, Object> corpo) {
    return db.insere("crm_respostas_rapidas", Json.de("store_id", sessao.loja(), "atalho", Erro.obrigatorio(corpo, "atalho", "Atalho").replaceAll("^/", ""),
        "texto", Erro.obrigatorio(corpo, "texto", "Texto"), "midia_url", Json.s(corpo, "midiaUrl")));
  }

  @DELETE
  @Path("/respostas-rapidas/{id}")
  public Map<String, Object> apagarResposta(@PathParam("id") UUID id) {
    db.executa("delete from crm_respostas_rapidas where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }
}
