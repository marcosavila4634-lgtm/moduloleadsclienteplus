package br.com.clienteplus.crm.ia;

import br.com.clienteplus.crm.comum.Arquivos;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Json;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Transcrição de áudios (o Claude não ouve áudio). Usa um serviço compatível
 * com a API Whisper (/audio/transcriptions), configurado em TRANSCRICAO_URL e
 * TRANSCRICAO_CHAVE. Sem ele, a IA recebe "[áudio sem transcrição]".
 */
@ApplicationScoped
public class Transcricao {

  private static final Logger LOG = Logger.getLogger(Transcricao.class);
  private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();

  @Inject Db db;
  @Inject Arquivos arquivos;
  @ConfigProperty(name = "crm.transcricao.url") Optional<String> url;
  @ConfigProperty(name = "crm.transcricao.chave") Optional<String> chave;
  @ConfigProperty(name = "crm.transcricao.modelo") String modelo;

  public boolean configurada() {
    return url.filter(s -> !s.isBlank()).isPresent() && chave.filter(s -> !s.isBlank()).isPresent();
  }

  /** Transcreve a mensagem de áudio (se ainda não tiver) e grava o texto. */
  public String transcrever(UUID storeId, Map<String, Object> msg) {
    if (msg.get("transcricao") != null) return (String) msg.get("transcricao");
    if (!configurada()) return null;
    UUID arq = Arquivos.idDaUrl((String) msg.get("midiaUrl"));
    if (arq == null) return null;
    try {
      byte[] audio = arquivos.ler(storeId, arq);
      String mime = msg.get("midiaMime") == null ? "audio/ogg" : ((String) msg.get("midiaMime")).split(";")[0];
      String limite = "----crm" + UUID.randomUUID();
      String ext = mime.contains("mpeg") ? "mp3" : mime.contains("mp4") ? "m4a" : "ogg";
      byte[] ini = ("--" + limite + "\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n" + modelo + "\r\n"
          + "--" + limite + "\r\nContent-Disposition: form-data; name=\"language\"\r\n\r\npt\r\n"
          + "--" + limite + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"audio." + ext + "\"\r\nContent-Type: " + mime + "\r\n\r\n").getBytes(StandardCharsets.UTF_8);
      byte[] fim = ("\r\n--" + limite + "--\r\n").getBytes(StandardCharsets.UTF_8);
      byte[] corpo = new byte[ini.length + audio.length + fim.length];
      System.arraycopy(ini, 0, corpo, 0, ini.length);
      System.arraycopy(audio, 0, corpo, ini.length, audio.length);
      System.arraycopy(fim, 0, corpo, ini.length + audio.length, fim.length);
      HttpRequest req = HttpRequest.newBuilder(URI.create(url.get().replaceAll("/+$", "") + "/audio/transcriptions"))
          .timeout(Duration.ofSeconds(120)).header("Authorization", "Bearer " + chave.get())
          .header("Content-Type", "multipart/form-data; boundary=" + limite).POST(HttpRequest.BodyPublishers.ofByteArray(corpo)).build();
      HttpResponse<String> r = http.send(req, HttpResponse.BodyHandlers.ofString());
      if (r.statusCode() >= 300) {
        LOG.warnf("Transcrição falhou (%d): %s", r.statusCode(), r.body());
        return null;
      }
      String texto = Json.s(Json.mapa(r.body()), "text");
      if (texto != null) db.executa("update crm_mensagens set transcricao = ? where id = ?::uuid", texto.trim(), msg.get("id"));
      return texto;
    } catch (Exception e) {
      LOG.warn("Transcrição falhou: " + e.getMessage());
      return null;
    }
  }
}
