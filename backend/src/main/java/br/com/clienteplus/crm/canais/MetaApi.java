package br.com.clienteplus.crm.canais;

import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Json;
import jakarta.enterprise.context.ApplicationScoped;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Chamadas à Graph API da Meta: WhatsApp Cloud API (mensagens, mídia,
 * templates, número) e Instagram (mensagens diretas).
 */
@ApplicationScoped
public class MetaApi {

  private static final Logger LOG = Logger.getLogger(MetaApi.class);
  private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).followRedirects(HttpClient.Redirect.NORMAL).build();

  @ConfigProperty(name = "crm.meta.graph-url") String graph;

  public static class ErroMeta extends RuntimeException {
    public final int status;
    public final int codigo;

    ErroMeta(int status, int codigo, String msg) {
      super(msg);
      this.status = status;
      this.codigo = codigo;
    }
  }

  // ---------------- WhatsApp: envio ----------------

  /** Envia uma mensagem (corpo no formato da Cloud API, sem messaging_product/to). Devolve o id wamid. */
  public String enviar(String phoneNumberId, String token, String para, String tipo, Map<String, Object> conteudo) {
    Map<String, Object> corpo = Json.de("messaging_product", "whatsapp", "recipient_type", "individual", "to", para, "type", tipo, tipo, conteudo);
    Map<String, Object> r = post(phoneNumberId + "/messages", token, corpo);
    List<Object> msgs = Json.l(r.get("messages"));
    return msgs.isEmpty() ? null : Json.s(Json.m(msgs.get(0)), "id");
  }

  public String enviarComContexto(String phoneNumberId, String token, String para, String tipo, Map<String, Object> conteudo, String respondendoA) {
    Map<String, Object> corpo = Json.de("messaging_product", "whatsapp", "recipient_type", "individual", "to", para, "type", tipo, tipo, conteudo);
    if (respondendoA != null) corpo.put("context", Map.of("message_id", respondendoA));
    Map<String, Object> r = post(phoneNumberId + "/messages", token, corpo);
    List<Object> msgs = Json.l(r.get("messages"));
    return msgs.isEmpty() ? null : Json.s(Json.m(msgs.get(0)), "id");
  }

  public String texto(String phoneNumberId, String token, String para, String texto) {
    return enviar(phoneNumberId, token, para, "text", Json.de("preview_url", true, "body", texto));
  }

  /** Marca como lida e mostra "digitando..." para o cliente (some sozinho em até 25 s). */
  public void lidaEDigitando(String phoneNumberId, String token, String wamid, boolean digitando) {
    try {
      Map<String, Object> corpo = Json.de("messaging_product", "whatsapp", "status", "read", "message_id", wamid);
      if (digitando) corpo.put("typing_indicator", Map.of("type", "text"));
      post(phoneNumberId + "/messages", token, corpo);
    } catch (Exception e) {
      LOG.debug("Falha ao marcar como lida: " + e.getMessage());
    }
  }

  // ---------------- WhatsApp: mídia ----------------

  public record Midia(byte[] dados, String mime) {}

  public Midia baixarMidia(String mediaId, String token) {
    Map<String, Object> info = get(mediaId, token, Map.of());
    String url = Json.s(info, "url");
    if (url == null) throw new ErroMeta(404, 0, "Mídia sem endereço");
    try {
      HttpRequest req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(60))
          .header("Authorization", "Bearer " + token).GET().build();
      HttpResponse<byte[]> r = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
      if (r.statusCode() >= 300) throw new ErroMeta(r.statusCode(), 0, "Falha ao baixar mídia (" + r.statusCode() + ")");
      return new Midia(r.body(), Json.s(info, "mime_type"));
    } catch (ErroMeta e) {
      throw e;
    } catch (Exception e) {
      throw new ErroMeta(0, 0, "Falha ao baixar mídia: " + e.getMessage());
    }
  }

  // ---------------- WhatsApp: número, templates ----------------

  public Map<String, Object> numero(String phoneNumberId, String token) {
    return get(phoneNumberId, token, Map.of("fields", "display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput,name_status,messaging_limit_tier"));
  }

  public void assinarWaba(String wabaId, String token) {
    post(wabaId + "/subscribed_apps", token, Map.of());
  }

  public void registrarNumero(String phoneNumberId, String token, String pin) {
    post(phoneNumberId + "/register", token, Json.de("messaging_product", "whatsapp", "pin", pin));
  }

  public List<Object> templates(String wabaId, String token) {
    Map<String, Object> r = get(wabaId + "/message_templates", token, Map.of("limit", "200", "fields", "id,name,language,category,status,rejected_reason,components"));
    return Json.l(r.get("data"));
  }

  public Map<String, Object> criarTemplate(String wabaId, String token, Map<String, Object> corpo) {
    return post(wabaId + "/message_templates", token, corpo);
  }

  public void apagarTemplate(String wabaId, String token, String nome) {
    requisicao("DELETE", wabaId + "/message_templates?name=" + URLEncoder.encode(nome, StandardCharsets.UTF_8), token, null);
  }

  /** Troca o "code" do cadastro incorporado (Embedded Signup) por um token de negócio. */
  public String trocarCodigo(String appId, String appSecret, String code) {
    Map<String, Object> r = get("oauth/access_token", null, Map.of("client_id", appId, "client_secret", appSecret, "code", code));
    String t = Json.s(r, "access_token");
    if (t == null) throw new ErroMeta(400, 0, "A Meta não devolveu o token");
    return t;
  }

  // ---------------- Instagram ----------------

  public String instagramEnviar(String igId, String token, String paraIgsid, Map<String, Object> mensagem) {
    Map<String, Object> r = post(igId + "/messages", token, Json.de("recipient", Map.of("id", paraIgsid), "message", mensagem));
    return Json.s(r, "message_id");
  }

  public Map<String, Object> instagramPerfil(String igsid, String token) {
    return get(igsid, token, Map.of("fields", "name,username,profile_pic,follower_count,is_verified_user,is_user_follow_business"));
  }

  // ---------------- HTTP ----------------

  public Map<String, Object> get(String caminho, String token, Map<String, String> query) {
    StringBuilder q = new StringBuilder();
    for (var e : query.entrySet()) q.append(q.isEmpty() ? "?" : "&").append(e.getKey()).append('=').append(URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8));
    return requisicao("GET", caminho + q, token, null);
  }

  public Map<String, Object> post(String caminho, String token, Object corpo) {
    return requisicao("POST", caminho, token, corpo);
  }

  private Map<String, Object> requisicao(String metodo, String caminho, String token, Object corpo) {
    try {
      HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(graph.replaceAll("/+$", "") + "/" + caminho)).timeout(Duration.ofSeconds(30));
      if (token != null) b.header("Authorization", "Bearer " + token);
      if (corpo != null) b.header("Content-Type", "application/json").method(metodo, HttpRequest.BodyPublishers.ofString(Json.texto(corpo)));
      else b.method(metodo, HttpRequest.BodyPublishers.noBody());
      HttpResponse<String> r = http.send(b.build(), HttpResponse.BodyHandlers.ofString());
      Map<String, Object> m = r.body() == null || r.body().isBlank() ? Map.of() : Json.mapa(r.body());
      if (r.statusCode() >= 300) {
        Map<String, Object> err = Json.m(m.get("error"));
        String msg = Json.s(err, "error_user_msg", Json.s(err, "message", "Erro " + r.statusCode()));
        throw new ErroMeta(r.statusCode(), Json.i(err, "code", 0), msg);
      }
      return m;
    } catch (ErroMeta e) {
      throw e;
    } catch (Exception e) {
      throw new ErroMeta(0, 0, "Sem resposta da Meta: " + e.getMessage());
    }
  }

  /** Mensagem amigável para os erros mais comuns da Cloud API. */
  public static String explicar(ErroMeta e) {
    return switch (e.codigo) {
      case 131047 -> "Passaram 24 h desde a última mensagem do cliente. Use um template aprovado.";
      case 131026 -> "O número não tem WhatsApp ou não pode receber esta mensagem.";
      case 131056 -> "Muitas mensagens para este número em pouco tempo. Aguarde um pouco.";
      case 190 -> "O token da Meta expirou ou é inválido. Reconecte o número.";
      case 132001 -> "Template não existe ou não foi aprovado neste idioma.";
      case 131051 -> "Tipo de mensagem não suportado.";
      case 131053 -> "Não foi possível enviar a mídia (formato/tamanho).";
      default -> e.getMessage();
    };
  }

  static void exigirToken(String token) {
    if (token == null || token.isBlank()) throw Erro.requisicao("Conexão sem token. Reconecte o número.");
  }
}
