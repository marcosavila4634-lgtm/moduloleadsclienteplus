package br.com.clienteplus.crm.canais;

import br.com.clienteplus.crm.atendimento.Atendimento;
import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.automacoes.MotorAutomacoes;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jboss.logging.Logger;

/**
 * Disparos em massa pelo WhatsApp. Fora da janela de 24 h só com template
 * aprovado. O envio respeita o intervalo entre mensagens, o limite diário e a
 * janela de horário da loja; quem responder volta para a IA/equipe.
 */
@Path("/disparos")
@ApplicationScoped
public class DisparosResource {

  private static final Logger LOG = Logger.getLogger(DisparosResource.class);

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject Atendimento atendimento;
  @Inject Templates templates;
  @Inject Conexoes conexoes;
  @Inject Expedicao expedicao;

  @GET
  public List<Map<String, Object>> listar() {
    return db.lista("select d.*, c.nome as conexao_nome, t.nome as template_nome from crm_disparos d join crm_conexoes c on c.id = d.conexao_id left join crm_templates_whatsapp t on t.id = d.template_id where d.store_id = ? order by d.created_at desc", sessao.loja());
  }

  /** Quantos contatos o filtro alcança (antes de salvar). */
  @POST
  @Path("/publico")
  public Map<String, Object> contar(Map<String, Object> publico) {
    return Map.of("total", publicoIds(sessao.loja(), publico).size());
  }

  @POST
  public Map<String, Object> criar(Map<String, Object> c) {
    sessao.exigir("admin");
    Map<String, Object> d = dados(c);
    d.put("store_id", sessao.loja());
    return db.insere("crm_disparos", d);
  }

  @PUT
  @Path("/{id}")
  public Map<String, Object> editar(@PathParam("id") UUID id, Map<String, Object> c) {
    sessao.exigir("admin");
    Map<String, Object> atual = db.obrigatorio("Disparo", "select status from crm_disparos where id = ? and store_id = ?", id, sessao.loja());
    Erro.exigir(List.of("draft", "scheduled").contains(atual.get("status")), "Disparo já iniciado não pode ser editado");
    return db.atualiza("crm_disparos", id, sessao.loja(), dados(c));
  }

  private Map<String, Object> dados(Map<String, Object> c) {
    String modo = Json.s(c, "modo", "template");
    UUID conexao = Formatos.uuid(c.get("conexaoId"));
    db.obrigatorio("Conexão", "select id from crm_conexoes where id = ? and store_id = ?", conexao, sessao.loja());
    if ("template".equals(modo)) Erro.exigir(Formatos.uuid(c.get("templateId")) != null, "Escolha o template aprovado");
    else Erro.exigir(Json.s(c, "texto") != null, "Escreva a mensagem");
    return Json.de("nome", Erro.obrigatorio(c, "nome", "Nome"), "conexao_id", conexao, "modo", modo, "template_id", Formatos.uuid(c.get("templateId")),
        "variaveis", Json.m(c.get("variaveis")), "texto", Json.s(c, "texto"), "midia_url", Json.s(c, "midiaUrl"), "publico", Json.m(c.get("publico")),
        "agendado_para", Formatos.instante(c.get("agendadoPara")), "intervalo_segundos", Math.max(3, Json.i(c, "intervaloSegundos", 8)),
        "ia_responde", Json.b(c, "iaResponde", true), "tag_ao_responder", Json.s(c, "tagAoResponder"), "updated_at", Instant.now());
  }

  /** Monta a lista de envios e inicia (ou agenda). */
  @POST
  @Path("/{id}/iniciar")
  @Transactional
  public Map<String, Object> iniciar(@PathParam("id") UUID id) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    Map<String, Object> d = db.obrigatorio("Disparo", "select * from crm_disparos where id = ? and store_id = ?", id, loja);
    Erro.exigir(List.of("draft", "scheduled", "paused").contains(d.get("status")), "Este disparo já foi iniciado");
    if (!"paused".equals(d.get("status"))) {
      List<UUID> ids = publicoIds(loja, Json.m(d.get("publico")));
      Erro.exigir(!ids.isEmpty(), "Nenhum contato no público escolhido");
      List<Object[]> linhas = new ArrayList<>();
      for (UUID c : ids) linhas.add(new Object[] {loja, id, c});
      db.lote("insert into crm_disparo_envios (store_id, disparo_id, contato_id) values (?, ?, ?) on conflict do nothing", linhas);
      db.executa("update crm_disparos set total = ? where id = ?", ids.size(), id);
    }
    Instant quando = d.get("agendadoPara") == null ? Instant.now() : Instant.parse((String) d.get("agendadoPara"));
    db.executa("update crm_disparos set status = ?, iniciado_em = coalesce(iniciado_em, ?) where id = ?", quando.isAfter(Instant.now()) ? "scheduled" : "running", quando, id);
    return db.um("select * from crm_disparos where id = ?", id);
  }

  @POST
  @Path("/{id}/pausar")
  public Map<String, Object> pausar(@PathParam("id") UUID id) {
    db.executa("update crm_disparos set status = 'paused' where id = ? and store_id = ? and status in ('running','scheduled')", id, sessao.loja());
    return Map.of("ok", true);
  }

  @POST
  @Path("/{id}/cancelar")
  public Map<String, Object> cancelar(@PathParam("id") UUID id) {
    db.executa("update crm_disparos set status = 'canceled', concluido_em = now() where id = ? and store_id = ? and status not in ('done','canceled')", id, sessao.loja());
    db.executa("update crm_disparo_envios set status = 'skipped' where disparo_id = ? and status = 'pending'", id);
    return Map.of("ok", true);
  }

  @GET
  @Path("/{id}")
  public Map<String, Object> obter(@PathParam("id") UUID id) {
    Map<String, Object> d = db.obrigatorio("Disparo", "select * from crm_disparos where id = ? and store_id = ?", id, sessao.loja());
    d.put("envios", db.lista("select e.*, ct.nome, ct.telefone from crm_disparo_envios e join crm_contatos ct on ct.id = e.contato_id where e.disparo_id = ? order by e.enviado_em desc nulls last limit 500", id));
    d.put("porStatus", db.lista("select status, count(*) as total from crm_disparo_envios where disparo_id = ? group by status", id));
    return d;
  }

  @DELETE
  @Path("/{id}")
  public Map<String, Object> apagar(@PathParam("id") UUID id) {
    sessao.exigir("admin");
    db.executa("delete from crm_disparos where id = ? and store_id = ? and status in ('draft','done','canceled')", id, sessao.loja());
    return Map.of("ok", true);
  }

  /** publico: {tags:[], semTags:[], etapas:[ids], origem, contatos:[ids], somenteComConversa} */
  List<UUID> publicoIds(UUID loja, Map<String, Object> p) {
    List<String> contatos = Json.ls(p, "contatos");
    if (!contatos.isEmpty())
      return db.lista("select id from crm_contatos where store_id = ? and id = any(?) and not opt_out and not bloqueado and telefone is not null", loja,
          Db.uuids(contatos.stream().map(UUID::fromString).toList())).stream().map(m -> UUID.fromString((String) m.get("id"))).toList();
    List<String> tags = Json.ls(p, "tags"), sem = Json.ls(p, "semTags"), etapas = Json.ls(p, "etapas");
    return db.lista("""
        select c.id from crm_contatos c where c.store_id = ? and not c.opt_out and not c.bloqueado and c.telefone is not null
          and (cardinality(?::text[]) = 0 or c.tags && ?::text[]) and not (c.tags && ?::text[])
          and (cardinality(?::uuid[]) = 0 or exists (select 1 from crm_negocios n where n.contato_id = c.id and n.etapa_id = any(?::uuid[])))
          and (?::text is null or c.origem = ?)
        limit 50000""", loja, Db.texto(tags), Db.texto(tags), Db.texto(sem), Db.uuids(etapas.stream().map(UUID::fromString).toList()),
        Db.uuids(etapas.stream().map(UUID::fromString).toList()), Json.s(p, "origem"), Json.s(p, "origem"))
        .stream().map(m -> UUID.fromString((String) m.get("id"))).toList();
  }

  // ---------------- motor (chamado pelo agendador) ----------------

  public void processar() {
    db.executa("update crm_disparos set status = 'running' where status = 'scheduled' and agendado_para <= now()");
    for (Map<String, Object> d : db.lista("select * from crm_disparos where status = 'running'")) {
      UUID id = UUID.fromString((String) d.get("id"));
      UUID loja = UUID.fromString((String) d.get("storeId"));
      if (!expedicao.podeAgora(loja)) continue;
      Map<String, Object> ultimo = db.um("select max(enviado_em) as ultimo from crm_disparo_envios where disparo_id = ?", id);
      if (ultimo.get("ultimo") != null && Instant.parse((String) ultimo.get("ultimo")).isAfter(Instant.now().minusSeconds(Json.i(d, "intervaloSegundos", 8)))) continue;
      Map<String, Object> cx = db.um("select config from crm_conexoes where id = ?::uuid", d.get("conexaoId"));
      int limiteDia = Json.i(Json.m(cx.get("config")), "limite_diario", 1000);
      long hoje = db.numero("select count(*) from crm_disparo_envios e join crm_disparos x on x.id = e.disparo_id where x.conexao_id = ?::uuid and e.enviado_em > date_trunc('day', now())", d.get("conexaoId"));
      if (hoje >= limiteDia) continue;
      Map<String, Object> e = db.um("update crm_disparo_envios set status = 'sending' where id = (select id from crm_disparo_envios where disparo_id = ? and status = 'pending' limit 1 for update skip locked) returning *", id);
      if (e == null) {
        db.executa("update crm_disparos set status = 'done', concluido_em = now() where id = ?", id);
        continue;
      }
      enviarUm(d, e);
    }
  }

  private void enviarUm(Map<String, Object> d, Map<String, Object> e) {
    UUID loja = UUID.fromString((String) d.get("storeId"));
    UUID envio = UUID.fromString((String) e.get("id"));
    UUID contato = UUID.fromString((String) e.get("contatoId"));
    try {
      Map<String, Object> ct = db.um("select * from crm_contatos where id = ?", contato);
      Conexoes.Conexao cx = conexoes.obter(UUID.fromString((String) d.get("conexaoId")));
      var conv = atendimento.conversaPara(loja, contato, cx, "whatsapp");
      if (!Json.b(d, "iaResponde", true)) db.executa("update crm_conversas set ia_ativa = false, atribuida_a = 'human', handoff_status = 'queue' where id = ? and ultimo_remetente is null", conv.id());
      Envio.Pedido p;
      if ("template".equals(d.get("modo"))) {
        Map<String, Object> t = templates.montar(loja, UUID.fromString((String) d.get("templateId")), Json.m(d.get("variaveis")), s -> MotorAutomacoes.preencher(s, ct, Map.of()));
        p = new Envio.Pedido("template", null, null, null, null, null, t, null, null);
      } else {
        Erro.exigir(expedicao.janela24h(conv.id()), "Fora da janela de 24 h (use template)");
        String texto = MotorAutomacoes.preencher((String) d.get("texto"), ct, Map.of());
        p = d.get("midiaUrl") != null ? Envio.Pedido.midia("image", (String) d.get("midiaUrl"), null, null, texto) : Envio.Pedido.texto(texto);
      }
      Map<String, Object> msg = atendimento.enviar(loja, conv.id(), p, Atendimento.Remetente.sistema("Disparo"));
      boolean ok = !"failed".equals(msg.get("statusEntrega"));
      db.executa("update crm_disparo_envios set status = ?, canal_mensagem_id = ?, erro = ?, enviado_em = now() where id = ?", ok ? "sent" : "failed", msg.get("canalMensagemId"), msg.get("erroEntrega"), envio);
      db.executa("update crm_disparos set enviados = enviados + ?, falhas = falhas + ? where id = ?::uuid", ok ? 1 : 0, ok ? 0 : 1, d.get("id"));
    } catch (Exception ex) {
      db.executa("update crm_disparo_envios set status = 'failed', erro = ?, enviado_em = now() where id = ?", Formatos.curto(ex.getMessage(), 300), envio);
      db.executa("update crm_disparos set falhas = falhas + 1 where id = ?::uuid", d.get("id"));
      LOG.debugf("Disparo %s falhou para %s: %s", d.get("id"), contato, ex.getMessage());
    }
  }

  /** Cliente respondeu a um disparo: conta a resposta e aplica a tag configurada. */
  public void respondeu(UUID storeId, UUID contatoId, UUID conversaId) {
    for (Map<String, Object> e : db.lista("""
        update crm_disparo_envios set status = 'replied' where contato_id = ? and status in ('sent','delivered','read') and enviado_em > now() - interval '7' day
        returning disparo_id""", contatoId)) {
      Map<String, Object> d = db.um("update crm_disparos set respondidos = respondidos + 1 where id = ?::uuid returning tag_ao_responder", e.get("disparoId"));
      if (d != null && d.get("tagAoResponder") != null) atendimento.adicionarTag(storeId, contatoId, conversaId, (String) d.get("tagAoResponder"));
    }
  }
}
