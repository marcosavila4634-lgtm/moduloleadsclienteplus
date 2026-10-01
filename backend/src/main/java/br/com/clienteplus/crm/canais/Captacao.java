package br.com.clienteplus.crm.canais;

import br.com.clienteplus.crm.atendimento.Atendimento;
import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.automacoes.MotorAutomacoes;
import br.com.clienteplus.crm.comum.Cripto;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.crm.Negocios;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jboss.logging.Logger;

/**
 * Captação: comentário no Instagram → resposta + Direct automático;
 * formulários de anúncio da Meta (Lead Ads) → contato + funil + WhatsApp.
 */
@Path("/captacao")
@ApplicationScoped
public class Captacao {

  private static final Logger LOG = Logger.getLogger(Captacao.class);

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject MetaApi meta;
  @Inject Conexoes conexoes;
  @Inject Atendimento atendimento;
  @Inject Negocios negocios;
  @Inject Templates templates;
  @Inject Expedicao expedicao;
  @Inject Cripto cripto;

  // ---------------- comentário → Direct ----------------

  @GET
  @Path("/instagram")
  public Map<String, Object> gatilhos() {
    UUID loja = sessao.loja();
    return Json.de("gatilhos", db.lista("select g.*, c.nome as conexao_nome from crm_instagram_gatilhos g join crm_conexoes c on c.id = g.conexao_id where g.store_id = ? order by g.created_at desc", loja),
        "comentarios", db.lista("select * from crm_instagram_comentarios where store_id = ? order by created_at desc limit 100", loja));
  }

  @GET
  @Path("/instagram/{conexao}/posts")
  public List<Object> posts(@PathParam("conexao") UUID conexao) {
    db.obrigatorio("Conexão", "select id from crm_conexoes where id = ? and store_id = ? and tipo = 'instagram'", conexao, sessao.loja());
    Conexoes.Conexao c = conexoes.obter(conexao);
    try {
      return Json.l(meta.get(c.instagramId() + "/media", c.token(), Map.of("fields", "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp", "limit", "30")).get("data"));
    } catch (MetaApi.ErroMeta e) {
      throw Erro.requisicao("A Meta recusou: " + MetaApi.explicar(e));
    }
  }

  @POST
  @Path("/instagram")
  public Map<String, Object> novoGatilho(Map<String, Object> c) {
    sessao.exigir("admin");
    Map<String, Object> d = dadosGatilho(c);
    d.put("store_id", sessao.loja());
    return db.insere("crm_instagram_gatilhos", d);
  }

  @PUT
  @Path("/instagram/{id}")
  public Map<String, Object> editarGatilho(@PathParam("id") UUID id, Map<String, Object> c) {
    sessao.exigir("admin");
    return db.atualiza("crm_instagram_gatilhos", id, sessao.loja(), dadosGatilho(c));
  }

  private Map<String, Object> dadosGatilho(Map<String, Object> c) {
    UUID cx = Formatos.uuid(c.get("conexaoId"));
    db.obrigatorio("Conexão", "select id from crm_conexoes where id = ? and store_id = ? and tipo = 'instagram'", cx, sessao.loja());
    return Json.de("conexao_id", cx, "nome", Erro.obrigatorio(c, "nome", "Nome"), "midias", Db.texto(Json.ls(c, "midias")), "palavras", Db.texto(Json.ls(c, "palavras")),
        "resposta_comentario", Json.s(c, "respostaComentario"), "mensagem_direct", Erro.obrigatorio(c, "mensagemDirect", "Mensagem do Direct"),
        "link_url", Json.s(c, "linkUrl"), "link_texto", Json.s(c, "linkTexto"), "tag", Json.s(c, "tag"), "ia_assume", Json.b(c, "iaAssume", true), "ativo", Json.b(c, "ativo", true));
  }

  @DELETE
  @Path("/instagram/{id}")
  public Map<String, Object> apagarGatilho(@PathParam("id") UUID id) {
    db.executa("delete from crm_instagram_gatilhos where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  /** Webhook: novo comentário (field "comments" do objeto instagram). */
  public void comentario(String contaId, Map<String, Object> v) {
    Conexoes.Conexao cx = conexoes.porInstagram(contaId);
    if (cx == null) return;
    String comentarioId = Json.s(v, "id");
    Map<String, Object> de = Json.m(v.get("from"));
    if (contaId.equals(Json.s(de, "id"))) return; // comentário da própria conta
    String texto = Json.s(v, "text", "");
    String midia = Json.s(Json.m(v.get("media")), "id");
    Map<String, Object> reg = db.um("""
        insert into crm_instagram_comentarios (store_id, comentario_id, midia_id, usuario_id, usuario, texto) values (?, ?, ?, ?, ?, ?)
        on conflict (store_id, comentario_id) do nothing returning id""", cx.storeId(), comentarioId, midia, Json.s(de, "id"), Json.s(de, "username"), texto);
    if (reg == null) return;
    for (Map<String, Object> g : db.lista("select * from crm_instagram_gatilhos where conexao_id = ? and ativo order by created_at", cx.id())) {
      List<String> midias = Json.ls(g, "midias"), palavras = Json.ls(g, "palavras");
      if (!midias.isEmpty() && !midias.contains(midia)) continue;
      if (!palavras.isEmpty() && palavras.stream().noneMatch(p -> MotorAutomacoes.casaTextoPublico(p, texto))) continue;
      String erro = null;
      boolean respondeu = false, direct = false;
      Map<String, Object> ct = Json.de("nome", Json.s(de, "username", ""));
      try {
        if (Json.s(g, "respostaComentario") != null && !Json.s(g, "respostaComentario").isBlank()) {
          meta.post(comentarioId + "/replies", cx.token(), Json.de("message", MotorAutomacoes.preencher(Json.s(g, "respostaComentario"), ct, Map.of())));
          respondeu = true;
        }
        Map<String, Object> msg = Json.de("text", MotorAutomacoes.preencher(Json.s(g, "mensagemDirect"), ct, Map.of()));
        if (Json.s(g, "linkUrl") != null)
          msg = Json.de("attachment", Json.de("type", "template", "payload", Json.de("template_type", "button", "text", msg.get("text"),
              "buttons", List.of(Json.de("type", "web_url", "url", Json.s(g, "linkUrl"), "title", Json.s(g, "linkTexto", "Abrir"))))));
        meta.post(cx.instagramId() + "/messages", cx.token(), Json.de("recipient", Json.de("comment_id", comentarioId), "message", msg));
        direct = true;
      } catch (MetaApi.ErroMeta e) {
        erro = MetaApi.explicar(e);
      }
      db.executa("update crm_instagram_comentarios set gatilho_id = ?::uuid, respondido = ?, direct_enviado = ?, erro = ? where id = ?::uuid", g.get("id"), respondeu, direct, erro, reg.get("id"));
      db.executa("update crm_instagram_gatilhos set disparos = disparos + 1 where id = ?::uuid", g.get("id"));
      if (direct && Json.s(de, "id") != null) {
        var contato = atendimento.contatoPorInstagram(cx.storeId(), Json.s(de, "id"), Json.s(de, "username"), Json.s(de, "username"), cx.id());
        var conv = atendimento.conversaPara(cx.storeId(), contato.id(), cx, "instagram");
        db.executa("update crm_conversas set origem = coalesce(origem, 'instagram_comentario'), origem_dados = coalesce(origem_dados, ?::jsonb), ia_ativa = ? where id = ?",
            Json.de("canal", "instagram_comentario", "midia", midia, "gatilho", g.get("nome")), Json.b(g, "iaAssume", true), conv.id());
        if (Json.s(g, "tag") != null) atendimento.adicionarTag(cx.storeId(), contato.id(), conv.id(), Json.s(g, "tag"));
        atendimento.registroSistema(cx.storeId(), conv.id(), "Comentou \"" + Formatos.curto(texto, 120) + "\" e recebeu o Direct automático (" + g.get("nome") + ")");
      }
      break;
    }
  }

  // ---------------- Lead Ads ----------------

  @GET
  @Path("/formularios")
  public Map<String, Object> formularios() {
    UUID loja = sessao.loja();
    List<Map<String, Object>> fs = db.lista("select f.*, t.nome as template_nome from crm_meta_formularios f left join crm_templates_whatsapp t on t.id = f.template_id where f.store_id = ? order by f.created_at desc", loja);
    fs.forEach(f -> f.put("tokenConfigurado", f.remove("tokenCripto") != null));
    return Json.de("formularios", fs, "leads", db.lista("select l.*, ct.nome as contato_nome from crm_meta_leads l left join crm_contatos ct on ct.id = l.contato_id where l.store_id = ? order by l.created_at desc limit 200", loja));
  }

  /** corpo: {nome, paginaId, formularioId?, token (da página), funilId, tag, conexaoId, templateId, templateVariaveis, iaAssume} */
  @POST
  @Path("/formularios")
  public Map<String, Object> novoFormulario(Map<String, Object> c) {
    sessao.exigir("admin");
    Map<String, Object> d = dadosForm(c);
    d.put("store_id", sessao.loja());
    return db.insere("crm_meta_formularios", d);
  }

  @PUT
  @Path("/formularios/{id}")
  public Map<String, Object> editarFormulario(@PathParam("id") UUID id, Map<String, Object> c) {
    sessao.exigir("admin");
    Map<String, Object> d = dadosForm(c);
    if (Json.s(c, "token") == null || Json.s(c, "token").isBlank()) d.remove("token_cripto");
    return db.atualiza("crm_meta_formularios", id, sessao.loja(), d);
  }

  private Map<String, Object> dadosForm(Map<String, Object> c) {
    return Json.de("nome", Erro.obrigatorio(c, "nome", "Nome"), "pagina_id", Erro.obrigatorio(c, "paginaId", "ID da página"), "formulario_id", Json.s(c, "formularioId"),
        "token_cripto", Json.s(c, "token") == null || Json.s(c, "token").isBlank() ? null : cripto.cifrar(Json.s(c, "token")),
        "funil_id", Formatos.uuid(c.get("funilId")), "tag", Json.s(c, "tag"), "conexao_id", Formatos.uuid(c.get("conexaoId")), "template_id", Formatos.uuid(c.get("templateId")),
        "template_variaveis", Json.m(c.get("templateVariaveis")), "ia_assume", Json.b(c, "iaAssume", true), "ativo", Json.b(c, "ativo", true));
  }

  @DELETE
  @Path("/formularios/{id}")
  public Map<String, Object> apagarFormulario(@PathParam("id") UUID id) {
    db.executa("delete from crm_meta_formularios where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  /** Webhook: novo lead (field "leadgen" do objeto page). */
  public void lead(Map<String, Object> v) {
    String pagina = Json.s(v, "page_id"), form = Json.s(v, "form_id"), leadId = Json.s(v, "leadgen_id");
    Map<String, Object> f = db.um("select * from crm_meta_formularios where pagina_id = ? and (formulario_id is null or formulario_id = ?) and ativo order by formulario_id nulls last limit 1", pagina, form);
    if (f == null) {
      LOG.infof("Lead %s de página/formulário sem configuração (%s/%s)", leadId, pagina, form);
      return;
    }
    UUID loja = UUID.fromString((String) f.get("storeId"));
    Map<String, Object> reg = db.um("insert into crm_meta_leads (store_id, formulario_id, leadgen_id, anuncio_id) values (?, ?::uuid, ?, ?) on conflict (store_id, leadgen_id) do nothing returning id",
        loja, f.get("id"), leadId, Json.s(v, "ad_id"));
    if (reg == null) return;
    try {
      String token = cripto.decifrar((String) f.get("tokenCripto"));
      Map<String, Object> dados = meta.get(leadId, token, Map.of("fields", "field_data,ad_id,ad_name,campaign_name,form_id,created_time"));
      Map<String, String> campos = new java.util.LinkedHashMap<>();
      for (Object o : Json.l(dados.get("field_data"))) {
        Map<String, Object> fd = Json.m(o);
        List<String> vals = Json.ls(fd, "values");
        campos.put(Json.s(fd, "name", ""), vals.isEmpty() ? "" : vals.get(0));
      }
      String tel = campos.getOrDefault("phone_number", campos.getOrDefault("telefone", campos.get("whatsapp")));
      String nome = campos.getOrDefault("full_name", campos.getOrDefault("nome", campos.get("first_name")));
      Erro.exigir(tel != null, "Lead sem telefone");
      var ct = atendimento.contatoPorTelefone(loja, tel, nome, null, "meta_lead_ads");
      Map<String, Object> extras = new java.util.LinkedHashMap<>();
      for (var e : campos.entrySet()) if (!List.of("phone_number", "full_name", "email").contains(e.getKey())) extras.put(e.getKey(), e.getValue());
      db.executa("update crm_contatos set email = coalesce(email, ?), campos = campos || ?::jsonb where id = ?", campos.get("email"), extras, ct.id());
      db.executa("update crm_meta_leads set contato_id = ?, dados = ?::jsonb, campanha = ? where id = ?::uuid", ct.id(), dados, Json.s(dados, "campaign_name"), reg.get("id"));
      db.executa("update crm_meta_formularios set leads = leads + 1 where id = ?::uuid", f.get("id"));
      if (Json.s(f, "tag") != null) atendimento.adicionarTag(loja, ct.id(), null, Json.s(f, "tag"));
      Conexoes.Conexao cx = f.get("conexaoId") == null ? conexoes.padrao(loja, "whatsapp_cloud") : conexoes.obter(UUID.fromString((String) f.get("conexaoId")));
      if (cx == null) return;
      var conv = atendimento.conversaPara(loja, ct.id(), cx, "whatsapp");
      db.executa("update crm_conversas set origem = 'meta_lead_ads', origem_dados = ?::jsonb, ia_ativa = ia_ativa and ? where id = ?",
          Json.de("canal", "meta_lead_ads", "ad_id", Json.s(dados, "ad_id"), "campanha", Json.s(dados, "campaign_name"), "formulario", f.get("nome")), Json.b(f, "iaAssume", true), conv.id());
      negocios.garantir(loja, ct.id(), conv.id(), "meta_lead_ads");
      if (f.get("templateId") != null) {
        Map<String, Object> contato = db.um("select * from crm_contatos where id = ?", ct.id());
        Map<String, Object> t = templates.montar(loja, UUID.fromString((String) f.get("templateId")), Json.m(f.get("templateVariaveis")), s -> MotorAutomacoes.preencher(s, contato, Map.of()));
        // primeiro contato com o lead: respeita a janela de horário da loja (ex.: lead às 3h recebe às 9h)
        expedicao.enviarAutomatico(loja, conv.id(), new Envio.Pedido("template", null, null, null, null, null, t, null, null), null, Atendimento.Remetente.sistema("Lead Ads"), "lead_ads");
        db.executa("update crm_meta_leads set mensagem_enviada = true where id = ?::uuid", reg.get("id"));
      }
      atendimento.notificarEquipe(loja, "lead", "Novo lead do formulário " + f.get("nome"), nome, "/conversas?c=" + conv.id());
    } catch (Exception e) {
      db.executa("update crm_meta_leads set erro = ? where id = ?::uuid", Formatos.curto(e.getMessage(), 400), reg.get("id"));
      LOG.warnf("Lead Ads %s: %s", leadId, e.getMessage());
    }
  }
}
