package br.com.clienteplus.crm.auth;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;
import jakarta.enterprise.context.ApplicationScoped;
import javax.crypto.spec.SecretKeySpec;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;
import org.jose4j.jwk.HttpsJwks;
import org.jose4j.jws.AlgorithmIdentifiers;
import org.jose4j.jws.JsonWebSignature;
import org.jose4j.jwt.JwtClaims;
import org.jose4j.jwt.consumer.JwtConsumer;
import org.jose4j.jwt.consumer.JwtConsumerBuilder;
import org.jose4j.keys.resolvers.HttpsJwksVerificationKeyResolver;

/**
 * Tokens de acesso.
 *
 * - Próprios (HS256, emissor "gestao-plus-crm"): login com e-mail e senha do módulo.
 * - Supabase (chaves públicas JWKS do projeto do Cliente Plus): quando o módulo
 *   roda dentro do Cliente Plus, o painel manda o mesmo token que já usa na API.
 */
@ApplicationScoped
public class Tokens {

  private static final Logger LOG = Logger.getLogger(Tokens.class);
  public static final String EMISSOR = "gestao-plus-crm";

  public record Identidade(String tipo, UUID usuarioId, UUID supabaseId, String email, String nome, boolean pre2fa) {}

  private final SecretKeySpec chave;
  private final int validadeHoras;
  private final JwtConsumer proprio;
  private final JwtConsumer supabase;

  public Tokens(
      @ConfigProperty(name = "crm.jwt.segredo") String segredo,
      @ConfigProperty(name = "crm.jwt.validade-horas") int validadeHoras,
      @ConfigProperty(name = "crm.supabase.url") Optional<String> supabaseUrl) {
    if (segredo.length() < 32) throw new IllegalStateException("CRM_JWT_SEGREDO precisa ter pelo menos 32 caracteres");
    this.chave = new SecretKeySpec(segredo.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    this.validadeHoras = validadeHoras;
    this.proprio = new JwtConsumerBuilder()
        .setRequireExpirationTime()
        .setAllowedClockSkewInSeconds(30)
        .setExpectedIssuer(EMISSOR)
        .setExpectedAudience(EMISSOR)
        .setVerificationKey(chave)
        .setJwsAlgorithmConstraints(org.jose4j.jwa.AlgorithmConstraints.ConstraintType.PERMIT, AlgorithmIdentifiers.HMAC_SHA256)
        .build();
    String url = supabaseUrl.map(String::trim).orElse("");
    if (url.isEmpty()) {
      this.supabase = null;
    } else {
      String base = url.replaceAll("/+$", "");
      HttpsJwks jwks = new HttpsJwks(base + "/auth/v1/.well-known/jwks.json");
      this.supabase = new JwtConsumerBuilder()
          .setRequireExpirationTime()
          .setAllowedClockSkewInSeconds(30)
          .setExpectedIssuer(base + "/auth/v1")
          .setExpectedAudience("authenticated")
          .setVerificationKeyResolver(new HttpsJwksVerificationKeyResolver(jwks))
          .build();
    }
  }

  public String emitir(UUID usuarioId, String email, boolean pre2fa) {
    try {
      JwtClaims c = new JwtClaims();
      c.setIssuer(EMISSOR);
      c.setAudience(EMISSOR);
      c.setSubject(usuarioId.toString());
      c.setClaim("email", email);
      if (pre2fa) {
        // token curto que só serve para concluir o login com o código do autenticador
        c.setClaim("pre2fa", true);
        c.setExpirationTimeMinutesInTheFuture(5);
      } else {
        c.setExpirationTimeMinutesInTheFuture(validadeHoras * 60f);
      }
      c.setIssuedAtToNow();
      c.setGeneratedJwtId();
      JsonWebSignature jws = new JsonWebSignature();
      jws.setPayload(c.toJson());
      jws.setAlgorithmHeaderValue(AlgorithmIdentifiers.HMAC_SHA256);
      jws.setKey(chave);
      return jws.getCompactSerialization();
    } catch (Exception e) {
      throw new IllegalStateException("Falha ao emitir token", e);
    }
  }

  /** Valida o token; devolve vazio se inválido/vencido. */
  public Optional<Identidade> validar(String token) {
    try {
      JwtClaims c = proprio.processToClaims(token);
      return Optional.of(new Identidade("proprio", UUID.fromString(c.getSubject()), null,
          c.getStringClaimValue("email"), null, Boolean.TRUE.equals(c.getClaimValue("pre2fa"))));
    } catch (Exception e) {
      // não é token próprio: tenta Supabase
    }
    if (supabase == null) return Optional.empty();
    try {
      JwtClaims c = supabase.processToClaims(token);
      Object meta = c.getClaimValue("user_metadata");
      String nome = null;
      if (meta instanceof java.util.Map<?, ?> m) {
        Object n = m.get("full_name") != null ? m.get("full_name") : m.get("name");
        nome = n == null ? null : String.valueOf(n);
      }
      return Optional.of(new Identidade("supabase", null, UUID.fromString(c.getSubject()), c.getStringClaimValue("email"), nome, false));
    } catch (Exception e) {
      LOG.debug("Token recusado: " + e.getMessage());
      return Optional.empty();
    }
  }
}
