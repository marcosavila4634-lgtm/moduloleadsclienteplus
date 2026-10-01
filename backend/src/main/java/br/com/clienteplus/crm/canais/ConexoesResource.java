package br.com.clienteplus.crm.canais;

import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import jakarta.inject.Inject;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/** Conexões (WhatsApp oficial, Instagram) e templates aprovados da Meta. */
@Path("/conexoes")
public class ConexoesResource {

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject Conexoes conexoes;
  @Inject MetaApi meta;

  @ConfigProperty(name = "crm.meta.app-id") Optional<String> appId;
  @ConfigProperty(name = "crm.meta.app-secret") Optional<String> appSecret;
  @ConfigProperty(name = "crm.meta.config-id") Optional<String> configId;
  @ConfigProperty(name = "crm.meta.verify-token") String verifyToken;
  @ConfigProperty(name = "crm.url-publica") String urlPublica;

  @GET
  public List<Map<String, Object>> listar() {
    List<Map<String, Object>> l = db.lista("""
        select c.*, a.nome as agente_nome, (select count(*) from crm_conversas v where v.conexao_id = c.id) as conversas
        from crm_conexoes c left join crm_agentes a on a.id = c.agente_id where c.store_id = ? order by c.created_at""", sessao.loja());
    l.forEach(Conexoes::publica);
    return l;
  }

  /** Dados para configurar o webhook na Meta (endereço e token de verificação). */
  @GET
  @Path("/webhook")
  public Map<String, Object> webhook() {
    sessao.exigir("admin");
    return Json.de("url", urlPublica.replaceAll("/+$", "") + "/api/webhooks/meta", "verifyToken", verifyToken,
        "appConfigurado", appSecret.filter(s -> !s.isBlank()).isPresent(), "appId", appId.orElse(""), "configId", configId.orElse(""));
  }

  /**
   * Conexão manual do WhatsApp Cloud API: {nome, phoneNumberId, wabaId, token}.
   * Confere o número na Meta, assina o webhook da WABA e grava o token cifrado.
   */
  @POST
  @Path("/whatsapp")
  public Map<String, Object> whatsapp(Map<String, Object> corpo) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    Object lim = Json.m(db.valor("select limites from crm_lojas where id = ?", loja)).get("conexoes");
    if (lim instanceof Number n && db.numero("select count(*) from crm_conexoes where store_id = ?", loja) >= n.longValue()) throw Erro.proibido("Limite de conexões do plano atingido");
    String pnid = Erro.obrigatorio(corpo, "phoneNumberId", "ID do número (Phone Number ID)").replaceAll("\\D", "");
    String waba = Erro.obrigatorio(corpo, "wabaId", "ID da conta do WhatsApp Business (WABA ID)").replaceAll("\\D", "");
    String token = Erro.obrigatorio(corpo, "token", "Token de acesso");
    if (db.numero("select count(*) from crm_conexoes where phone_number_id = ?", pnid) > 0) throw Erro.conflito("Este número já está conectado");
    Map<String, Object> info;
    try {
      info = meta.numero(pnid, token);
      meta.assinarWaba(waba, token);
    } catch (MetaApi.ErroMeta e) {
      throw Erro.requisicao("A Meta recusou: " + MetaApi.explicar(e));
    }
    String telefone = Formatos.telefone(Json.s(info, "display_phone_number"));
    Map<String, Object> c = db.insere("crm_conexoes", Json.de("store_id", loja, "nome", Json.s(corpo, "nome", Json.s(info, "verified_name", "WhatsApp")),
        "tipo", "whatsapp_cloud", "status", "conectado", "telefone", telefone, "phone_number_id", pnid, "waba_id", waba,
        "config", Json.de("qualidade", Json.s(info, "quality_rating"), "nome_verificado", Json.s(info, "verified_name"), "limite", Json.s(info, "messaging_limit_tier"))));
    UUID id = UUID.fromString((String) c.get("id"));
    conexoes.guardarCredenciais(id, Json.de("token", token));
    sincronizarTemplates(id);
    return Conexoes.publica(c);
  }

  /** Cadastro incorporado da Meta (Embedded Signup): troca o code pelo token e conecta. */
  @POST
  @Path("/whatsapp/cadastro-meta")
  public Map<String, Object> cadastroMeta(Map<String, Object> corpo) {
    sessao.exigir("admin");
    String app = appId.orElse(""), segredo = appSecret.orElse("");
    Erro.exigir(!app.isBlank() && !segredo.isBlank(), "O app da Meta ainda não foi configurado no servidor");
    String token;
    try {
      token = meta.trocarCodigo(app, segredo, Erro.obrigatorio(corpo, "code", "Código"));
    } catch (MetaApi.ErroMeta e) {
      throw Erro.requisicao("A Meta recusou: " + e.getMessage());
    }
    return whatsapp(Json.de("nome", Json.s(corpo, "nome"), "phoneNumberId", Erro.obrigatorio(corpo, "phoneNumberId", "Número"), "wabaId", Erro.obrigatorio(corpo, "wabaId", "WABA"), "token", token));
  }

  /** Instagram: {nome, instagramId, paginaId, token (token da página)} */
  @POST
  @Path("/instagram")
  public Map<String, Object> instagram(Map<String, Object> corpo) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    String ig = Erro.obrigatorio(corpo, "instagramId", "ID da conta do Instagram").replaceAll("\\D", "");
    String token = Erro.obrigatorio(corpo, "token", "Token da página");
    Map<String, Object> perfil;
    try {
      perfil = meta.get(ig, token, Map.of("fields", "username,name,profile_picture_url"));
    } catch (MetaApi.ErroMeta e) {
      throw Erro.requisicao("A Meta recusou: " + MetaApi.explicar(e));
    }
    Map<String, Object> c = db.insere("crm_conexoes", Json.de("store_id", loja, "nome", Json.s(corpo, "nome", "@" + Json.s(perfil, "username", "instagram")), "tipo", "instagram",
        "status", "conectado", "instagram_id", ig, "instagram_usuario", Json.s(perfil, "username"), "pagina_id", Json.s(corpo, "paginaId"),
        "config", Json.de("foto", Json.s(perfil, "profile_picture_url"), "boas_vindas", Json.s(corpo, "boasVindas"))));
    conexoes.guardarCredenciais(UUID.fromString((String) c.get("id")), Json.de("token", token));
    return Conexoes.publica(c);
  }

  @PUT
  @Path("/{id}")
  public Map<String, Object> editar(@PathParam("id") UUID id, Map<String, Object> corpo) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    Map<String, Object> c = db.obrigatorio("Conexão", "select * from crm_conexoes where id = ? and store_id = ?", id, loja);
    Map<String, Object> cfg = Json.m(c.get("config"));
    cfg.putAll(Json.m(corpo.get("config")));
    Map<String, Object> r = db.atualiza("crm_conexoes", id, loja, Json.de("nome", Json.s(corpo, "nome", (String) c.get("nome")), "agente_id", Formatos.uuid(corpo.get("agenteId")),
        "config", cfg, "updated_at", Instant.now()));
    if (Json.s(corpo, "token") != null && !Json.s(corpo, "token").isBlank()) {
      conexoes.guardarCredenciais(id, Json.de("token", Json.s(corpo, "token")));
      db.executa("update crm_conexoes set status = 'conectado', ultimo_erro = null where id = ?", id);
    }
    if (corpo.containsKey("agenteId")) {
      db.executa("delete from crm_agente_conexoes where conexao_id = ?", id);
      if (Formatos.uuid(corpo.get("agenteId")) != null) db.executa("insert into crm_agente_conexoes (agente_id, conexao_id) values (?, ?) on conflict do nothing", Formatos.uuid(corpo.get("agenteId")), id);
    }
    return Conexoes.publica(r);
  }

  /** Confere se o token ainda funciona e atualiza qualidade/limite do número. */
  @POST
  @Path("/{id}/testar")
  public Map<String, Object> testar(@PathParam("id") UUID id) {
    Map<String, Object> m = db.obrigatorio("Conexão", "select id from crm_conexoes where id = ? and store_id = ?", id, sessao.loja());
    Conexoes.Conexao c = conexoes.obter(UUID.fromString((String) m.get("id")));
    try {
      Map<String, Object> info = "instagram".equals(c.tipo()) ? meta.get(c.instagramId(), c.token(), Map.of("fields", "username")) : meta.numero(c.phoneNumberId(), c.token());
      db.executa("update crm_conexoes set status = 'conectado', ultimo_erro = null, config = config || ?::jsonb where id = ?",
          Json.de("qualidade", Json.s(info, "quality_rating"), "limite", Json.s(info, "messaging_limit_tier")), id);
      return Json.de("ok", true, "info", info);
    } catch (MetaApi.ErroMeta e) {
      db.executa("update crm_conexoes set status = 'erro', ultimo_erro = ? where id = ?", MetaApi.explicar(e), id);
      return Json.de("ok", false, "erro", MetaApi.explicar(e));
    }
  }

  @POST
  @Path("/{id}/desconectar")
  public Map<String, Object> desconectar(@PathParam("id") UUID id) {
    sessao.exigir("admin");
    db.executa("update crm_conexoes set status = 'desconectado', credenciais_cripto = null where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  @DELETE
  @Path("/{id}")
  public Map<String, Object> apagar(@PathParam("id") UUID id) {
    sessao.exigir("dono");
    db.executa("delete from crm_conexoes where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  // ---------------- templates ----------------

  @GET
  @Path("/templates")
  public List<Map<String, Object>> templates(@QueryParam("conexao") UUID conexao, @QueryParam("status") String status) {
    return db.lista("""
        select t.*, c.nome as conexao_nome from crm_templates_whatsapp t join crm_conexoes c on c.id = t.conexao_id
        where t.store_id = ? and (?::uuid is null or t.conexao_id = ?) and (?::text is null or t.status = ?) order by t.nome""",
        sessao.loja(), conexao, conexao, status, status);
  }

  @POST
  @Path("/{id}/templates/sincronizar")
  public Map<String, Object> sincronizar(@PathParam("id") UUID id) {
    db.obrigatorio("Conexão", "select id from crm_conexoes where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("total", sincronizarTemplates(id));
  }

  int sincronizarTemplates(UUID conexaoId) {
    Conexoes.Conexao c = conexoes.obter(conexaoId);
    if (c == null || c.wabaId() == null || c.token() == null) return 0;
    int n = 0;
    try {
      for (Object o : meta.templates(c.wabaId(), c.token())) {
        Map<String, Object> t = Json.m(o);
        db.executa("""
            insert into crm_templates_whatsapp (store_id, conexao_id, meta_id, nome, idioma, categoria, status, motivo_rejeicao, componentes)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
            on conflict (conexao_id, nome, idioma) do update set meta_id = excluded.meta_id, categoria = excluded.categoria, status = excluded.status,
              motivo_rejeicao = excluded.motivo_rejeicao, componentes = excluded.componentes, updated_at = now()""",
            c.storeId(), conexaoId, Json.s(t, "id"), Json.s(t, "name"), Json.s(t, "language"), Json.s(t, "category"), Json.s(t, "status"),
            Json.s(t, "rejected_reason"), Json.l(t.get("components")));
        n++;
      }
    } catch (MetaApi.ErroMeta e) {
      throw Erro.requisicao("Não consegui ler os templates: " + MetaApi.explicar(e));
    }
    return n;
  }

  /**
   * Cria um template e envia para aprovação da Meta.
   * corpo: {conexaoId, nome, categoria, idioma, cabecalho?, corpo, rodape?, botoes?:[{tipo:"QUICK_REPLY"|"URL"|"PHONE_NUMBER", texto, url?, telefone?}], exemplos?:[...]}
   */
  @POST
  @Path("/templates")
  public Map<String, Object> criarTemplate(Map<String, Object> corpo) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    UUID conexaoId = Formatos.uuid(corpo.get("conexaoId"));
    db.obrigatorio("Conexão", "select id from crm_conexoes where id = ? and store_id = ?", conexaoId, loja);
    Conexoes.Conexao c = conexoes.obter(conexaoId);
    String nome = Erro.obrigatorio(corpo, "nome", "Nome").toLowerCase().replaceAll("[^a-z0-9_]", "_");
    String texto = Erro.obrigatorio(corpo, "corpo", "Texto");
    List<Object> comps = new java.util.ArrayList<>();
    if (Json.s(corpo, "cabecalho") != null && !Json.s(corpo, "cabecalho").isBlank()) comps.add(Json.de("type", "HEADER", "format", "TEXT", "text", Json.s(corpo, "cabecalho")));
    Map<String, Object> body = Json.de("type", "BODY", "text", texto);
    List<String> exemplos = Json.ls(corpo, "exemplos");
    if (texto.contains("{{1}}")) body.put("example", Json.de("body_text", List.of(exemplos.isEmpty() ? List.of("Maria") : exemplos)));
    comps.add(body);
    if (Json.s(corpo, "rodape") != null && !Json.s(corpo, "rodape").isBlank()) comps.add(Json.de("type", "FOOTER", "text", Json.s(corpo, "rodape")));
    List<Object> botoes = new java.util.ArrayList<>();
    for (Object o : Json.l(corpo.get("botoes"))) {
      Map<String, Object> b = Json.m(o);
      String tipo = Json.s(b, "tipo", "QUICK_REPLY");
      Map<String, Object> bt = Json.de("type", tipo, "text", Json.s(b, "texto", "Ok"));
      if ("URL".equals(tipo)) bt.put("url", Json.s(b, "url"));
      if ("PHONE_NUMBER".equals(tipo)) bt.put("phone_number", Json.s(b, "telefone"));
      botoes.add(bt);
    }
    if (!botoes.isEmpty()) comps.add(Json.de("type", "BUTTONS", "buttons", botoes));
    Map<String, Object> r;
    try {
      r = meta.criarTemplate(c.wabaId(), c.token(), Json.de("name", nome, "language", Json.s(corpo, "idioma", "pt_BR"), "category", Json.s(corpo, "categoria", "MARKETING"), "components", comps));
    } catch (MetaApi.ErroMeta e) {
      throw Erro.requisicao("A Meta recusou o template: " + MetaApi.explicar(e));
    }
    return db.um("""
        insert into crm_templates_whatsapp (store_id, conexao_id, meta_id, nome, idioma, categoria, status, componentes) values (?, ?, ?, ?, ?, ?, ?, ?::jsonb)
        on conflict (conexao_id, nome, idioma) do update set meta_id = excluded.meta_id, status = excluded.status, componentes = excluded.componentes returning *""",
        loja, conexaoId, Json.s(r, "id"), nome, Json.s(corpo, "idioma", "pt_BR"), Json.s(corpo, "categoria", "MARKETING"), Json.s(r, "status", "PENDING"), comps);
  }

  @DELETE
  @Path("/templates/{id}")
  public Map<String, Object> apagarTemplate(@PathParam("id") UUID id) {
    sessao.exigir("admin");
    Map<String, Object> t = db.obrigatorio("Template", "select * from crm_templates_whatsapp where id = ? and store_id = ?", id, sessao.loja());
    Conexoes.Conexao c = conexoes.obter(UUID.fromString((String) t.get("conexaoId")));
    try {
      meta.apagarTemplate(c.wabaId(), c.token(), (String) t.get("nome"));
    } catch (MetaApi.ErroMeta e) {
      throw Erro.requisicao("A Meta recusou: " + MetaApi.explicar(e));
    }
    db.executa("delete from crm_templates_whatsapp where id = ?", id);
    return Map.of("ok", true);
  }
}
