package br.com.clienteplus.crm.comum;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;
import org.jose4j.jws.AlgorithmIdentifiers;
import org.jose4j.jws.JsonWebSignature;
import org.jose4j.jwt.JwtClaims;

/**
 * Avisos no celular/computador (Web Push, RFC 8291 + VAPID RFC 8292), sem
 * serviço de terceiros. As chaves VAPID são geradas na primeira vez e ficam
 * na configuração da plataforma (a privada cifrada).
 */
@ApplicationScoped
public class WebPush {

  private static final Logger LOG = Logger.getLogger(WebPush.class);
  private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
  private static final Base64.Decoder D64 = Base64.getUrlDecoder();
  private static final SecureRandom RANDOM = new SecureRandom();

  @Inject Db db;
  @Inject Cripto cripto;
  @ConfigProperty(name = "crm.admin-email") java.util.Optional<String> adminEmail;

  private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
  private volatile KeyPair vapid;

  /** Chave pública VAPID (base64url) que o navegador usa para se inscrever. */
  public String chavePublica() {
    return B64.encodeToString(cru((ECPublicKey) chaves().getPublic()));
  }

  /** Manda o aviso para todos os aparelhos do usuário naquela loja (em segundo plano). */
  public void enviar(UUID storeId, UUID usuarioId, String titulo, String texto, String link) {
    var inscricoes = db.lista("select id, endpoint, p256dh, auth from crm_push_inscricoes where store_id = ? and usuario_id = ?", storeId, usuarioId);
    if (inscricoes.isEmpty()) return;
    byte[] carga = Json.texto(Json.de("titulo", titulo, "texto", texto == null ? "" : texto, "link", link == null ? "/painel" : link, "loja", storeId.toString()))
        .getBytes(StandardCharsets.UTF_8);
    Thread.startVirtualThread(() -> {
      for (Map<String, Object> i : inscricoes) {
        try {
          int status = enviarUm((String) i.get("endpoint"), (String) i.get("p256dh"), (String) i.get("auth"), carga);
          // 404/410 = o aparelho cancelou a inscrição
          if (status == 404 || status == 410) db.executa("delete from crm_push_inscricoes where id = ?::uuid", i.get("id"));
          else if (status >= 400) LOG.debugf("Push recusado (%d) para %s", status, i.get("endpoint"));
        } catch (Exception e) {
          LOG.debug("Falha no push: " + e.getMessage());
        }
      }
    });
  }

  int enviarUm(String endpoint, String p256dh, String auth, byte[] carga) throws Exception {
    byte[] corpo = cifrar(D64.decode(p256dh), D64.decode(auth), carga);
    URI uri = URI.create(endpoint);
    String aud = uri.getScheme() + "://" + uri.getHost() + (uri.getPort() > 0 ? ":" + uri.getPort() : "");
    HttpRequest r = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20))
        .header("Content-Encoding", "aes128gcm").header("Content-Type", "application/octet-stream").header("TTL", "86400").header("Urgency", "high")
        .header("Authorization", "vapid t=" + jwt(aud) + ", k=" + chavePublica())
        .POST(HttpRequest.BodyPublishers.ofByteArray(corpo)).build();
    return http.send(r, HttpResponse.BodyHandlers.discarding()).statusCode();
  }

  private String jwt(String aud) throws Exception {
    JwtClaims c = new JwtClaims();
    c.setAudience(aud);
    c.setExpirationTimeMinutesInTheFuture(12 * 60);
    c.setSubject("mailto:" + adminEmail.filter(s -> !s.isBlank()).orElse("suporte@clienteplus.club"));
    JsonWebSignature jws = new JsonWebSignature();
    jws.setPayload(c.toJson());
    jws.setKey(chaves().getPrivate());
    jws.setAlgorithmHeaderValue(AlgorithmIdentifiers.ECDSA_USING_P256_CURVE_AND_SHA256);
    jws.setHeader("typ", "JWT");
    return jws.getCompactSerialization();
  }

  /** Criptografia aes128gcm do RFC 8291 (um registro só). */
  static byte[] cifrar(byte[] uaPublico, byte[] authSecret, byte[] carga) throws Exception {
    KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
    g.initialize(new ECGenParameterSpec("secp256r1"));
    KeyPair efemera = g.generateKeyPair();
    ECParameterSpec params = ((ECPublicKey) efemera.getPublic()).getParams();
    ECPublicKey ua = (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(ponto(uaPublico), params));
    KeyAgreement ka = KeyAgreement.getInstance("ECDH");
    ka.init(efemera.getPrivate());
    ka.doPhase(ua, true);
    byte[] ecdh = ka.generateSecret();
    byte[] asPublico = cru((ECPublicKey) efemera.getPublic());

    byte[] prkKey = hmac(authSecret, ecdh);
    byte[] keyInfo = juntar("WebPush: info".getBytes(StandardCharsets.US_ASCII), new byte[] {0}, uaPublico, asPublico, new byte[] {1});
    byte[] ikm = hmac(prkKey, keyInfo);
    byte[] salt = new byte[16];
    RANDOM.nextBytes(salt);
    byte[] prk = hmac(salt, ikm);
    byte[] cek = Arrays.copyOf(hmac(prk, juntar("Content-Encoding: aes128gcm".getBytes(StandardCharsets.US_ASCII), new byte[] {0, 1})), 16);
    byte[] nonce = Arrays.copyOf(hmac(prk, juntar("Content-Encoding: nonce".getBytes(StandardCharsets.US_ASCII), new byte[] {0, 1})), 12);

    Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
    aes.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
    byte[] cifrado = aes.doFinal(juntar(carga, new byte[] {2}));
    return juntar(salt, ByteBuffer.allocate(4).putInt(4096).array(), new byte[] {(byte) asPublico.length}, asPublico, cifrado);
  }

  private KeyPair chaves() {
    if (vapid != null) return vapid;
    synchronized (this) {
      if (vapid != null) return vapid;
      try {
        Map<String, Object> cfg = Json.m(db.valor("select config from crm_plataforma where id = 1"));
        Map<String, Object> v = Json.m(cfg.get("vapid"));
        KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
        g.initialize(new ECGenParameterSpec("secp256r1"));
        if (Json.s(v, "privada_cripto") != null && Json.s(v, "publica") != null) {
          ECParameterSpec params = ((ECPublicKey) g.generateKeyPair().getPublic()).getParams();
          KeyFactory kf = KeyFactory.getInstance("EC");
          ECPrivateKey priv = (ECPrivateKey) kf.generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(cripto.decifrar(Json.s(v, "privada_cripto")))));
          ECPublicKey pub = (ECPublicKey) kf.generatePublic(new ECPublicKeySpec(ponto(D64.decode(Json.s(v, "publica"))), params));
          vapid = new KeyPair(pub, priv);
        } else {
          KeyPair kp = g.generateKeyPair();
          db.executa("update crm_plataforma set config = jsonb_set(config, '{vapid}', ?::jsonb), updated_at = now() where id = 1",
              Json.texto(Json.de("publica", B64.encodeToString(cru((ECPublicKey) kp.getPublic())), "privada_cripto", cripto.cifrar(Base64.getEncoder().encodeToString(kp.getPrivate().getEncoded())))));
          vapid = kp;
        }
        return vapid;
      } catch (Exception e) {
        throw new IllegalStateException("Não consegui preparar as chaves de push", e);
      }
    }
  }

  private static byte[] cru(ECPublicKey k) {
    return juntar(new byte[] {4}, fixo(k.getW().getAffineX()), fixo(k.getW().getAffineY()));
  }

  private static ECPoint ponto(byte[] cru) {
    if (cru.length != 65 || cru[0] != 4) throw new IllegalArgumentException("Chave pública inválida");
    return new ECPoint(new BigInteger(1, Arrays.copyOfRange(cru, 1, 33)), new BigInteger(1, Arrays.copyOfRange(cru, 33, 65)));
  }

  private static byte[] fixo(BigInteger n) {
    byte[] b = n.toByteArray();
    if (b.length == 32) return b;
    byte[] r = new byte[32];
    if (b.length > 32) System.arraycopy(b, b.length - 32, r, 0, 32);
    else System.arraycopy(b, 0, r, 32 - b.length, b.length);
    return r;
  }

  private static byte[] hmac(byte[] chave, byte[] dados) throws Exception {
    Mac m = Mac.getInstance("HmacSHA256");
    m.init(new SecretKeySpec(chave, "HmacSHA256"));
    return m.doFinal(dados);
  }

  private static byte[] juntar(byte[]... partes) {
    ByteArrayOutputStream o = new ByteArrayOutputStream();
    for (byte[] p : partes) o.writeBytes(p);
    return o.toByteArray();
  }
}
