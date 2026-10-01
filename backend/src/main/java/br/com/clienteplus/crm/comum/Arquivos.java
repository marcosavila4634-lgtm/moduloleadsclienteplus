package br.com.clienteplus.crm.comum;

import br.com.clienteplus.crm.auth.Sessao;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Response;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

/**
 * Arquivos enviados (mídias do chat, base de conhecimento, fotos). Ficam em
 * disco por loja; no banco fica o registro. Privados só abrem com login da
 * mesma loja; públicos abrem por link (a Meta busca a mídia por URL).
 */
@ApplicationScoped
@jakarta.ws.rs.Path("/arquivos")
public class Arquivos {

  private static final long MAX = 100L * 1024 * 1024;
  private static final Set<String> BLOQUEADOS = Set.of("exe", "bat", "cmd", "com", "msi", "scr", "js", "vbs", "ps1", "sh", "jar", "html", "htm", "svg", "php");

  @Inject Db db;
  @Inject Sessao sessao;

  @ConfigProperty(name = "crm.arquivos-dir") String dir;
  @ConfigProperty(name = "crm.url-publica") String urlPublica;

  public record Salvo(UUID id, String url, String urlPublica, String mime, String nome) {}

  public Salvo salvar(UUID storeId, byte[] dados, String mime, String nome, boolean publico) {
    if (dados.length > MAX) throw Erro.requisicao("Arquivo maior que 100 MB");
    String ext = extensao(nome, mime);
    if (BLOQUEADOS.contains(ext)) throw Erro.requisicao("Tipo de arquivo não permitido");
    UUID id = UUID.randomUUID();
    Path pasta = Path.of(dir, storeId.toString());
    Path destino = pasta.resolve(id + (ext.isEmpty() ? "" : "." + ext));
    try {
      Files.createDirectories(pasta);
      Files.write(destino, dados);
    } catch (IOException e) {
      throw new IllegalStateException("Falha ao gravar arquivo", e);
    }
    String nomeLimpo = nome == null || nome.isBlank() ? id + (ext.isEmpty() ? "" : "." + ext) : nome.replaceAll("[\\\\/:*?\"<>|\\r\\n]", "_");
    db.executa("insert into crm_arquivos (id, store_id, nome, mime, tamanho, caminho, publico) values (?, ?, ?, ?, ?, ?, ?)",
        id, storeId, nomeLimpo, mime, (long) dados.length, destino.toString(), publico);
    return new Salvo(id, "/api/arquivos/" + id, publico ? linkPublico(id, nomeLimpo) : null, mime, nomeLimpo);
  }

  public String linkPublico(UUID id, String nome) {
    return urlPublica.replaceAll("/+$", "") + "/api/arquivos/p/" + id + "/" + java.net.URLEncoder.encode(nome == null ? "arquivo" : nome, java.nio.charset.StandardCharsets.UTF_8).replace("+", "%20");
  }

  /** Torna um arquivo público (ex.: antes de mandar para o WhatsApp) e devolve o link. */
  public String publicar(UUID storeId, UUID id) {
    Map<String, Object> a = db.obrigatorio("Arquivo", "update crm_arquivos set publico = true where id = ? and store_id = ? returning nome", id, storeId);
    return linkPublico(id, (String) a.get("nome"));
  }

  public byte[] ler(UUID storeId, UUID id) {
    Map<String, Object> a = db.obrigatorio("Arquivo", "select caminho from crm_arquivos where id = ? and store_id = ?", id, storeId);
    try {
      return Files.readAllBytes(Path.of((String) a.get("caminho")));
    } catch (IOException e) {
      throw Erro.naoEncontrado("Arquivo não encontrado");
    }
  }

  /** Pega o id de um endereço /api/arquivos/<id> (ou link público). */
  public static UUID idDaUrl(String url) {
    if (url == null) return null;
    var m = java.util.regex.Pattern.compile("/api/arquivos/(?:p/)?([0-9a-f-]{36})").matcher(url);
    return m.find() ? UUID.fromString(m.group(1)) : null;
  }

  @POST
  public Map<String, Object> enviar(@RestForm("arquivo") FileUpload arquivo, @RestForm("publico") Boolean publico) throws IOException {
    if (arquivo == null) throw Erro.requisicao("Envie o arquivo no campo 'arquivo'");
    if (arquivo.size() > MAX) throw Erro.requisicao("Arquivo maior que 100 MB");
    Salvo s = salvar(sessao.loja(), Files.readAllBytes(arquivo.uploadedFile()), arquivo.contentType(), arquivo.fileName(), Boolean.TRUE.equals(publico));
    return Json.de("id", s.id(), "url", s.url(), "urlPublica", s.urlPublica(), "mime", s.mime(), "nome", s.nome());
  }

  @GET
  @jakarta.ws.rs.Path("/{id}")
  public Response baixar(@PathParam("id") UUID id) {
    Map<String, Object> a = db.obrigatorio("Arquivo", "select nome, mime, caminho from crm_arquivos where id = ? and store_id = ?", id, sessao.loja());
    return resposta(a, false);
  }

  @GET
  @jakarta.ws.rs.Path("/p/{id}/{nome}")
  public Response publico(@PathParam("id") UUID id) {
    Map<String, Object> a = db.obrigatorio("Arquivo", "select nome, mime, caminho from crm_arquivos where id = ? and publico", id);
    return resposta(a, true);
  }

  private static Response resposta(Map<String, Object> a, boolean publico) {
    Path p = Path.of((String) a.get("caminho"));
    if (!Files.exists(p)) throw Erro.naoEncontrado("Arquivo não encontrado");
    String mime = (String) a.get("mime");
    return Response.ok(p.toFile(), mime == null ? "application/octet-stream" : mime)
        .header("Content-Disposition", "inline; filename=\"" + ((String) a.get("nome")).replace("\"", "") + "\"")
        .header("Cache-Control", publico ? "public, max-age=86400" : "private, max-age=3600")
        .header("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'")
        .build();
  }

  static String extensao(String nome, String mime) {
    if (nome != null && nome.contains(".")) {
      String e = nome.substring(nome.lastIndexOf('.') + 1).toLowerCase().replaceAll("[^a-z0-9]", "");
      if (!e.isEmpty() && e.length() <= 6) return e;
    }
    if (mime == null) return "";
    return switch (mime.split(";")[0].trim()) {
      case "image/jpeg" -> "jpg";
      case "image/png" -> "png";
      case "image/webp" -> "webp";
      case "image/gif" -> "gif";
      case "audio/ogg" -> "ogg";
      case "audio/mpeg" -> "mp3";
      case "audio/mp4", "audio/aac" -> "m4a";
      case "video/mp4" -> "mp4";
      case "application/pdf" -> "pdf";
      default -> "";
    };
  }
}
