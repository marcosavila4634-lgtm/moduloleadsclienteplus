package br.com.clienteplus.crm.canais;

import br.com.clienteplus.crm.atendimento.Atendimento;
import br.com.clienteplus.crm.comum.Arquivos;
import br.com.clienteplus.crm.comum.Cripto;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Json;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Webhook da Meta (WhatsApp Cloud API e Instagram).
 * GET: verificação do endereço. POST: eventos — assinatura X-Hub-Signature-256
 * conferida com o App Secret; responde 200 na hora e processa em segundo plano.
 */
@Path("/webhooks/meta")
public class WebhookMeta {

  private static final Logger LOG = Logger.getLogger(WebhookMeta.class);
  private static final ExecutorService FILA = Executors.newVirtualThreadPerTaskExecutor();
  private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).followRedirects(HttpClient.Redirect.NORMAL).build();

  @Inject Db db;
  @Inject Conexoes conexoes;
  @Inject MetaApi meta;
  @Inject Atendimento atendimento;
  @Inject Arquivos arquivos;
  @Inject Captacao captacao;

  @ConfigProperty(name = "crm.meta.verify-token") String verifyToken;
  @ConfigProperty(name = "crm.meta.app-secret") java.util.Optional<String> appSecret;

  @GET
  public Response verificar(@QueryParam("hub.mode") String modo, @QueryParam("hub.verify_token") String token, @QueryParam("hub.challenge") String desafio) {
    if ("subscribe".equals(modo) && verifyToken != null && !verifyToken.isBlank() && Cripto.iguais(verifyToken, token))
      return Response.ok(desafio, "text/plain").build();
    return Response.status(403).build();
  }

  @POST
  public Response receber(byte[] corpo, @jakarta.ws.rs.core.Context HttpHeaders headers) {
    String segredo = appSecret.orElse("");
    if (segredo.isBlank()) {
      LOG.warn("META_APP_SECRET não configurado: webhook recusado");
      return Response.status(503).build();
    }
    String assinatura = headers.getHeaderString("X-Hub-Signature-256");
    if (assinatura == null || !Cripto.iguais("sha256=" + Cripto.hmacSha256Hex(segredo, corpo), assinatura)) {
      LOG.warn("Webhook da Meta com assinatura inválida");
      return Response.status(401).build();
    }
    String json = new String(corpo, StandardCharsets.UTF_8);
    FILA.submit(() -> {
      try {
        processar(Json.mapa(json));
      } catch (Exception e) {
        LOG.error("Falha ao processar webhook da Meta", e);
      }
    });
    return Response.ok().build();
  }

  void processar(Map<String, Object> evento) {
    String objeto = Json.s(evento, "object");
    for (Object eo : Json.l(evento.get("entry"))) {
      Map<String, Object> entry = Json.m(eo);
      if ("instagram".equals(objeto) || "page".equals(objeto)) {
        for (Object mo : Json.l(entry.get("messaging"))) instagram(Json.s(entry, "id"), Json.m(mo));
        for (Object co : Json.l(entry.get("changes"))) {
          Map<String, Object> ch = Json.m(co);
          Map<String, Object> v = Json.m(ch.get("value"));
          try {
            if ("comments".equals(Json.s(ch, "field"))) captacao.comentario(Json.s(entry, "id"), v);
            else if ("leadgen".equals(Json.s(ch, "field"))) captacao.lead(v);
          } catch (Exception e) {
            LOG.error("Falha no evento " + Json.s(ch, "field"), e);
          }
        }
        continue;
      }
      for (Object co : Json.l(entry.get("changes"))) {
        Map<String, Object> ch = Json.m(co);
        String campo = Json.s(ch, "field");
        Map<String, Object> v = Json.m(ch.get("value"));
        switch (campo == null ? "" : campo) {
          case "messages" -> whatsappMensagens(v, false);
          case "smb_message_echoes" -> whatsappMensagens(v, true);
          case "history" -> whatsappHistorico(v);
          case "message_template_status_update" -> templateStatus(v);
          case "account_update", "phone_number_quality_update" -> LOG.infof("Meta: %s %s", campo, Json.texto(v));
          default -> LOG.debugf("Meta: campo ignorado %s", campo);
        }
      }
    }
  }

  // ---------------- WhatsApp ----------------

  private void whatsappMensagens(Map<String, Object> v, boolean ecos) {
    String pnid = Json.s(Json.m(v.get("metadata")), "phone_number_id");
    Conexoes.Conexao cx = conexoes.porPhoneNumberId(pnid);
    if (cx == null) {
      LOG.warnf("Mensagem para número não cadastrado (phone_number_id %s)", pnid);
      return;
    }
    db.executa("update crm_conexoes set ultima_mensagem_em = now(), status = case when status = 'erro' then 'conectado' else status end where id = ?", cx.id());
    Map<String, String> nomes = new java.util.HashMap<>();
    for (Object co : Json.l(v.get("contacts"))) {
      Map<String, Object> c = Json.m(co);
      nomes.put(Json.s(c, "wa_id"), Json.s(Json.m(c.get("profile")), "name"));
    }
    for (Object so : Json.l(v.get("statuses"))) {
      Map<String, Object> s = Json.m(so);
      String erro = null;
      List<Object> errs = Json.l(s.get("errors"));
      if (!errs.isEmpty()) {
        Map<String, Object> e = Json.m(errs.get(0));
        erro = MetaApi.explicar(new MetaApi.ErroMeta(0, Json.i(e, "code", 0), Json.s(e, "title", Json.s(e, "message"))));
      }
      atendimento.statusEntrega(Json.s(s, "id"), Json.s(s, "status"), erro);
    }
    List<Object> msgs = ecos ? Json.l(v.get("message_echoes")) : Json.l(v.get("messages"));
    for (Object mo : msgs) {
      Map<String, Object> m = Json.m(mo);
      String cliente = ecos ? Json.s(m, "to") : Json.s(m, "from");
      try {
        atendimento.receber(montarWhatsapp(cx, m, cliente, nomes.get(cliente), ecos));
      } catch (Exception e) {
        LOG.errorf(e, "Falha ao gravar mensagem do WhatsApp %s", Json.s(m, "id"));
      }
    }
  }

  private Atendimento.Recebida montarWhatsapp(Conexoes.Conexao cx, Map<String, Object> m, String cliente, String nome, boolean eco) {
    String tipo = Json.s(m, "type", "text");
    String texto = null, midiaUrl = null, mime = null, arquivo = null, botao = null;
    Map<String, Object> extra = Json.de();
    Map<String, Object> ctx = Json.m(m.get("context"));
    if (Json.s(ctx, "id") != null) extra.put("respondendo_a", Json.s(ctx, "id"));
    switch (tipo) {
      case "text" -> texto = Json.s(Json.m(m.get("text")), "body");
      case "image", "video", "audio", "document", "sticker" -> {
        Map<String, Object> md = Json.m(m.get(tipo));
        texto = Json.s(md, "caption");
        mime = Json.s(md, "mime_type");
        arquivo = Json.s(md, "filename");
        if (Json.b(md, "voice", false)) extra.put("voz", true);
        try {
          MetaApi.Midia midia = meta.baixarMidia(Json.s(md, "id"), cx.token());
          Arquivos.Salvo s = arquivos.salvar(cx.storeId(), midia.dados(), midia.mime() != null ? midia.mime() : mime, arquivo, false);
          midiaUrl = s.url();
          mime = s.mime();
        } catch (Exception e) {
          LOG.warnf("Não baixei a mídia %s: %s", Json.s(md, "id"), e.getMessage());
          extra.put("midia_id", Json.s(md, "id"));
        }
      }
      case "interactive" -> {
        Map<String, Object> it = Json.m(m.get("interactive"));
        Map<String, Object> r = Json.m(it.get("button_reply")).isEmpty() ? Json.m(it.get("list_reply")) : Json.m(it.get("button_reply"));
        texto = Json.s(r, "title");
        botao = Json.s(r, "id");
        tipo = "text";
        extra.put("resposta_interativa", r);
      }
      case "button" -> {
        Map<String, Object> b = Json.m(m.get("button"));
        texto = Json.s(b, "text");
        botao = Json.s(b, "payload");
        tipo = "text";
      }
      case "location" -> {
        Map<String, Object> l = Json.m(m.get("location"));
        extra.put("localizacao", l);
        texto = "📍 " + Json.s(l, "name", "") + " " + Json.s(l, "address", "") + " (" + l.get("latitude") + ", " + l.get("longitude") + ")";
      }
      case "contacts" -> {
        extra.put("contatos", m.get("contacts"));
        StringBuilder sb = new StringBuilder("👤 Contato compartilhado:");
        for (Object co : Json.l(m.get("contacts"))) {
          Map<String, Object> c = Json.m(co);
          sb.append("\n").append(Json.s(Json.m(c.get("name")), "formatted_name", ""));
          for (Object po : Json.l(c.get("phones"))) sb.append(" ").append(Json.s(Json.m(po), "phone", ""));
        }
        texto = sb.toString();
      }
      case "reaction" -> {
        Map<String, Object> r = Json.m(m.get("reaction"));
        texto = Json.s(r, "emoji");
        extra.put("reagiu_a", Json.s(r, "message_id"));
      }
      default -> texto = "[mensagem do tipo " + tipo + "]";
    }
    Map<String, Object> origem = null;
    Map<String, Object> ref = Json.m(m.get("referral"));
    if (!ref.isEmpty()) {
      origem = Json.de("canal", "ad".equals(Json.s(ref, "source_type")) ? "meta_ads" : "meta_" + Json.s(ref, "source_type", "post"),
          "ad_id", Json.s(ref, "source_id"), "url", Json.s(ref, "source_url"), "titulo", Json.s(ref, "headline"),
          "texto", Json.s(ref, "body"), "ctwa_clid", Json.s(ref, "ctwa_clid"), "midia", Json.s(ref, "image_url", Json.s(ref, "video_url")));
      extra.put("referral", ref);
      if (Json.s(ref, "source_id") != null)
        db.executa("""
            insert into crm_anuncios (store_id, ad_id, titulo, texto, midia_url, url_origem) values (?, ?, ?, ?, ?, ?)
            on conflict (store_id, ad_id) do update set titulo = coalesce(excluded.titulo, crm_anuncios.titulo)""",
            cx.storeId(), Json.s(ref, "source_id"), Json.s(ref, "headline"), Json.s(ref, "body"), Json.s(origem, "midia"), Json.s(ref, "source_url"));
    } else if (texto != null) {
      origem = origemPorLink(cx.storeId(), texto);
    }
    Instant quando = m.get("timestamp") == null ? Instant.now() : Instant.ofEpochSecond(Long.parseLong(String.valueOf(m.get("timestamp"))));
    return new Atendimento.Recebida(cx.storeId(), cx, "whatsapp", cliente, null, nome, "reaction".equals(tipo) ? "text" : tipo, texto,
        midiaUrl, mime, arquivo, Json.s(m, "id"), quando, extra, botao, eco, origem);
  }

  /** Mensagem vinda de link rastreado: o código [ref:xxxx] identifica a origem. */
  private Map<String, Object> origemPorLink(UUID storeId, String texto) {
    var mt = java.util.regex.Pattern.compile("\\[ref:([A-Za-z0-9_-]{4,40})\\]").matcher(texto);
    if (!mt.find()) return null;
    Map<String, Object> l = db.um("update crm_links set conversas = conversas + 1 where store_id = ? and codigo = ? returning id, nome, campanha, origem, midia", storeId, mt.group(1));
    if (l == null) return null;
    return Json.de("canal", Json.s(l, "origem", "link"), "link_id", l.get("id"), "link", l.get("nome"), "campanha", l.get("campanha"), "midia", l.get("midia"));
  }

  /** Histórico do app do celular (coexistência): grava mensagens antigas sem acionar IA. */
  private void whatsappHistorico(Map<String, Object> v) {
    String pnid = Json.s(Json.m(v.get("metadata")), "phone_number_id");
    Conexoes.Conexao cx = conexoes.porPhoneNumberId(pnid);
    if (cx == null) return;
    for (Object ho : Json.l(v.get("history"))) {
      for (Object to : Json.l(Json.m(ho).get("threads"))) {
        Map<String, Object> t = Json.m(to);
        String cliente = Json.s(t, "id");
        for (Object mo : Json.l(t.get("messages"))) {
          Map<String, Object> m = Json.m(mo);
          boolean nosso = !cliente.equals(Json.s(m, "from"));
          try {
            var r = montarWhatsapp(cx, m, cliente, null, nosso);
            atendimento.receberHistorico(r);
          } catch (Exception e) {
            LOG.debugf("Histórico: mensagem ignorada (%s)", e.getMessage());
          }
        }
      }
    }
  }

  private void templateStatus(Map<String, Object> v) {
    db.executa("update crm_templates_whatsapp set status = ?, motivo_rejeicao = ?, updated_at = now() where meta_id = ?",
        Json.s(v, "event"), Json.s(v, "reason"), Json.s(v, "message_template_id"));
  }

  // ---------------- Instagram ----------------

  private void instagram(String contaId, Map<String, Object> ev) {
    Map<String, Object> msg = Json.m(ev.get("message"));
    if (msg.isEmpty() && ev.get("postback") == null) return;
    Conexoes.Conexao cx = conexoes.porInstagram(contaId);
    if (cx == null) {
      LOG.warnf("Instagram: conta %s não cadastrada", contaId);
      return;
    }
    boolean eco = Json.b(msg, "is_echo", false);
    String cliente = eco ? Json.s(Json.m(ev.get("recipient")), "id") : Json.s(Json.m(ev.get("sender")), "id");
    String texto = Json.s(msg, "text");
    String tipo = "text", midiaUrl = null, mime = null, botao = null;
    Map<String, Object> extra = Json.de();
    Map<String, Object> qr = Json.m(msg.get("quick_reply"));
    if (!qr.isEmpty()) botao = Json.s(qr, "payload");
    Map<String, Object> pb = Json.m(ev.get("postback"));
    if (!pb.isEmpty()) {
      texto = Json.s(pb, "title");
      botao = Json.s(pb, "payload");
    }
    Map<String, Object> story = Json.m(Json.m(msg.get("reply_to")).get("story"));
    if (!story.isEmpty()) extra.put("resposta_story", story);
    List<Object> anexos = Json.l(msg.get("attachments"));
    if (!anexos.isEmpty()) {
      Map<String, Object> a = Json.m(anexos.get(0));
      String t = Json.s(a, "type", "file");
      tipo = switch (t) { case "image", "audio", "video" -> t; case "story_mention" -> "image"; default -> "document"; };
      if ("story_mention".equals(t)) extra.put("mencao_story", true);
      String url = Json.s(Json.m(a.get("payload")), "url");
      if (url != null) {
        try {
          HttpResponse<byte[]> r = http.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(60)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
          mime = r.headers().firstValue("content-type").orElse(null);
          midiaUrl = arquivos.salvar(cx.storeId(), r.body(), mime, null, false).url();
        } catch (Exception e) {
          extra.put("midia_externa", url);
        }
      }
    }
    String nome = null, usuario = null;
    if (!eco) {
      try {
        Map<String, Object> p = meta.instagramPerfil(cliente, cx.token());
        nome = Json.s(p, "name");
        usuario = Json.s(p, "username");
        if (usuario != null) db.executa("update crm_contatos set instagram_usuario = ?, instagram_dados = ?::jsonb, instagram_enriquecido_em = now() where store_id = ? and instagram_id = ?",
            usuario, p, cx.storeId(), cliente);
      } catch (Exception e) {
        LOG.debug("Perfil do Instagram indisponível: " + e.getMessage());
      }
    }
    Instant quando = ev.get("timestamp") == null ? Instant.now() : Instant.ofEpochMilli(((Number) ev.get("timestamp")).longValue());
    atendimento.receber(new Atendimento.Recebida(cx.storeId(), cx, "instagram", null, cliente, nome != null ? nome : usuario, tipo, texto,
        midiaUrl, mime, null, Json.s(msg, "mid"), quando, extra, botao, eco, story.isEmpty() ? null : Json.de("canal", "instagram_story")));
    if (usuario != null) db.executa("update crm_contatos set instagram_usuario = coalesce(instagram_usuario, ?) where store_id = ? and instagram_id = ?", usuario, cx.storeId(), cliente);
  }
}
