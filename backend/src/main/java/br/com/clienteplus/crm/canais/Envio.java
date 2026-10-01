package br.com.clienteplus.crm.canais;

import br.com.clienteplus.crm.comum.Arquivos;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Json;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Envia uma mensagem pelo canal da conexão (WhatsApp Cloud API ou Instagram).
 * Arquivos do sistema são enviados para a Meta (upload) — não dependem de o
 * servidor estar público.
 */
@ApplicationScoped
public class Envio {

  @Inject MetaApi meta;
  @Inject Arquivos arquivos;
  @ConfigProperty(name = "crm.meta.graph-url") String graph;
  private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();

  /**
   * Pedido de envio.
   * tipo: text | image | audio | video | document | sticker | template | list | buttons | reaction | location
   */
  public record Pedido(String tipo, String texto, String midiaUrl, String midiaMime, String arquivoNome, String legenda,
      Map<String, Object> template, Map<String, Object> interativo, String respondendoA) {

    public static Pedido texto(String t) {
      return new Pedido("text", t, null, null, null, null, null, null, null);
    }

    public static Pedido midia(String tipo, String url, String mime, String nome, String legenda) {
      return new Pedido(tipo, null, url, mime, nome, legenda, null, null, null);
    }
  }

  /** Devolve o id da mensagem no canal. */
  public String enviar(Conexoes.Conexao c, String destino, Pedido p) {
    if (c == null) throw Erro.requisicao("Esta conversa não tem um canal conectado para responder");
    if (!"conectado".equals(c.status())) throw Erro.requisicao("A conexão \"" + c.nome() + "\" está desconectada");
    MetaApi.exigirToken(c.token());
    try {
      return switch (c.tipo()) {
        case "whatsapp_cloud" -> whatsapp(c, destino, p);
        case "instagram" -> instagram(c, destino, p);
        default -> throw Erro.requisicao("Canal " + c.tipo() + " ainda não envia mensagens");
      };
    } catch (MetaApi.ErroMeta e) {
      throw new Erro(422, MetaApi.explicar(e));
    }
  }

  private String whatsapp(Conexoes.Conexao c, String para, Pedido p) {
    String pn = c.phoneNumberId();
    return switch (p.tipo()) {
      case "text" -> meta.enviarComContexto(pn, c.token(), para, "text", Json.de("preview_url", true, "body", p.texto()), p.respondendoA());
      case "image", "audio", "video", "document", "sticker" -> {
        Map<String, Object> m = Json.de("id", subirMidia(c, p));
        if (p.legenda() != null && !p.legenda().isBlank() && !"audio".equals(p.tipo()) && !"sticker".equals(p.tipo())) m.put("caption", p.legenda());
        if ("document".equals(p.tipo()) && p.arquivoNome() != null) m.put("filename", p.arquivoNome());
        yield meta.enviarComContexto(pn, c.token(), para, p.tipo(), m, p.respondendoA());
      }
      case "template" -> {
        Map<String, Object> t = new java.util.LinkedHashMap<>(p.template());
        t.keySet().removeIf(k -> k.startsWith("_"));
        yield meta.enviar(pn, c.token(), para, "template", t);
      }
      case "list" -> meta.enviar(pn, c.token(), para, "interactive", lista(p));
      case "buttons" -> meta.enviar(pn, c.token(), para, "interactive", botoes(p));
      case "reaction" -> meta.enviar(pn, c.token(), para, "reaction", Json.de("message_id", p.respondendoA(), "emoji", p.texto()));
      case "location" -> meta.enviar(pn, c.token(), para, "location", p.interativo());
      default -> throw Erro.requisicao("Tipo de mensagem não suportado: " + p.tipo());
    };
  }

  private String instagram(Conexoes.Conexao c, String igsid, Pedido p) {
    String id = c.instagramId();
    return switch (p.tipo()) {
      case "text" -> meta.instagramEnviar(id, c.token(), igsid, Json.de("text", p.texto()));
      case "image", "audio", "video", "document" -> {
        String url = urlPublica(c, p.midiaUrl());
        String tipo = "document".equals(p.tipo()) ? "file" : p.tipo();
        yield meta.instagramEnviar(id, c.token(), igsid, Json.de("attachment", Json.de("type", tipo, "payload", Json.de("url", url))));
      }
      case "buttons", "list" -> {
        // Instagram: respostas rápidas (até 13)
        List<Map<String, Object>> qr = new ArrayList<>();
        for (Object o : Json.l(Json.m(p.interativo()).get("opcoes"))) {
          Map<String, Object> op = Json.m(o);
          qr.add(Json.de("content_type", "text", "title", Json.s(op, "titulo"), "payload", Json.s(op, "id", Json.s(op, "titulo"))));
        }
        yield meta.instagramEnviar(id, c.token(), igsid, Json.de("text", p.texto(), "quick_replies", qr.subList(0, Math.min(13, qr.size()))));
      }
      default -> throw Erro.requisicao("O Instagram não aceita este tipo de mensagem");
    };
  }

  private String urlPublica(Conexoes.Conexao c, String url) {
    UUID arq = Arquivos.idDaUrl(url);
    return arq != null ? arquivos.publicar(c.storeId(), arq) : url;
  }

  /** Sobe o arquivo para a Meta e devolve o media id. Links externos são baixados antes. */
  private String subirMidia(Conexoes.Conexao c, Pedido p) {
    byte[] dados;
    String mime = p.midiaMime();
    UUID arq = Arquivos.idDaUrl(p.midiaUrl());
    if (arq != null) {
      dados = arquivos.ler(c.storeId(), arq);
    } else {
      try {
        HttpResponse<byte[]> r = http.send(HttpRequest.newBuilder(URI.create(p.midiaUrl())).timeout(Duration.ofSeconds(60)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        if (r.statusCode() >= 300) throw Erro.requisicao("Não consegui baixar a mídia do link informado");
        dados = r.body();
        if (mime == null) mime = r.headers().firstValue("content-type").orElse(null);
      } catch (Erro e) {
        throw e;
      } catch (Exception e) {
        throw Erro.requisicao("Não consegui baixar a mídia do link informado");
      }
    }
    if (mime == null) mime = switch (p.tipo()) {
      case "image" -> "image/jpeg";
      case "audio" -> "audio/ogg";
      case "video" -> "video/mp4";
      case "sticker" -> "image/webp";
      default -> "application/pdf";
    };
    String limite = "----crm" + UUID.randomUUID();
    String nome = p.arquivoNome() == null ? "arquivo" : p.arquivoNome().replace("\"", "");
    byte[] ini = ("--" + limite + "\r\nContent-Disposition: form-data; name=\"messaging_product\"\r\n\r\nwhatsapp\r\n"
        + "--" + limite + "\r\nContent-Disposition: form-data; name=\"type\"\r\n\r\n" + mime + "\r\n"
        + "--" + limite + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" + nome + "\"\r\nContent-Type: " + mime + "\r\n\r\n").getBytes(StandardCharsets.UTF_8);
    byte[] fim = ("\r\n--" + limite + "--\r\n").getBytes(StandardCharsets.UTF_8);
    byte[] corpo = new byte[ini.length + dados.length + fim.length];
    System.arraycopy(ini, 0, corpo, 0, ini.length);
    System.arraycopy(dados, 0, corpo, ini.length, dados.length);
    System.arraycopy(fim, 0, corpo, ini.length + dados.length, fim.length);
    try {
      HttpRequest req = HttpRequest.newBuilder(URI.create(graph.replaceAll("/+$", "") + "/" + c.phoneNumberId() + "/media"))
          .timeout(Duration.ofSeconds(120))
          .header("Authorization", "Bearer " + c.token())
          .header("Content-Type", "multipart/form-data; boundary=" + limite)
          .POST(HttpRequest.BodyPublishers.ofByteArray(corpo)).build();
      HttpResponse<String> r = http.send(req, HttpResponse.BodyHandlers.ofString());
      Map<String, Object> m = Json.mapa(r.body());
      if (r.statusCode() >= 300) {
        Map<String, Object> err = Json.m(m.get("error"));
        throw new MetaApi.ErroMeta(r.statusCode(), Json.i(err, "code", 0), Json.s(err, "message", "Falha ao enviar mídia"));
      }
      return Json.s(m, "id");
    } catch (MetaApi.ErroMeta e) {
      throw e;
    } catch (Exception e) {
      throw new MetaApi.ErroMeta(0, 0, "Falha ao enviar mídia: " + e.getMessage());
    }
  }

  /** interativo: {"titulo","rodape","botao","secoes":[{"titulo","opcoes":[{id,titulo,descricao}]}]} */
  private static Map<String, Object> lista(Pedido p) {
    Map<String, Object> i = Json.m(p.interativo());
    List<Map<String, Object>> secoes = new ArrayList<>();
    for (Object so : Json.l(i.get("secoes"))) {
      Map<String, Object> s = Json.m(so);
      List<Map<String, Object>> rows = new ArrayList<>();
      int n = 0;
      for (Object oo : Json.l(s.get("opcoes"))) {
        Map<String, Object> o = Json.m(oo);
        String titulo = Json.s(o, "titulo", "Opção");
        Map<String, Object> row = Json.de("id", Json.s(o, "id", "op" + (++n)), "title", curto(titulo, 24));
        if (Json.s(o, "descricao") != null) row.put("description", curto(Json.s(o, "descricao"), 72));
        rows.add(row);
      }
      secoes.add(Json.de("title", curto(Json.s(s, "titulo", "Opções"), 24), "rows", rows));
    }
    Map<String, Object> m = Json.de("type", "list", "body", Map.of("text", p.texto() == null ? "Escolha uma opção" : p.texto()),
        "action", Json.de("button", curto(Json.s(i, "botao", "Ver opções"), 20), "sections", secoes));
    if (Json.s(i, "titulo") != null) m.put("header", Map.of("type", "text", "text", curto(Json.s(i, "titulo"), 60)));
    if (Json.s(i, "rodape") != null) m.put("footer", Map.of("text", curto(Json.s(i, "rodape"), 60)));
    return m;
  }

  /** interativo: {"opcoes":[{id,titulo}] (até 3), "rodape"} */
  private static Map<String, Object> botoes(Pedido p) {
    Map<String, Object> i = Json.m(p.interativo());
    List<Map<String, Object>> bs = new ArrayList<>();
    int n = 0;
    for (Object oo : Json.l(i.get("opcoes"))) {
      if (bs.size() >= 3) break;
      Map<String, Object> o = Json.m(oo);
      n++;
      bs.add(Json.de("type", "reply", "reply", Json.de("id", Json.s(o, "id", "b" + n), "title", curto(Json.s(o, "titulo", "Opção"), 20))));
    }
    Map<String, Object> m = Json.de("type", "button", "body", Map.of("text", p.texto() == null ? "Escolha" : p.texto()), "action", Map.of("buttons", bs));
    if (Json.s(i, "rodape") != null) m.put("footer", Map.of("text", curto(Json.s(i, "rodape"), 60)));
    return m;
  }

  private static String curto(String s, int max) {
    return s.length() <= max ? s : s.substring(0, max);
  }
}
