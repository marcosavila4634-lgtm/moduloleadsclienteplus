package br.com.clienteplus.crm.comum;

import jakarta.enterprise.context.ApplicationScoped;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/** AES-256-GCM para segredos guardados no banco (tokens da Meta, chaves de integrações). */
@ApplicationScoped
public class Cripto {

  private static final SecureRandom RND = new SecureRandom();
  private final SecretKeySpec chave;

  public Cripto(@ConfigProperty(name = "crm.cripto.chave") String chaveBase64) {
    byte[] k = Base64.getDecoder().decode(chaveBase64.trim());
    if (k.length != 32) throw new IllegalStateException("CRM_CHAVE_CRIPTOGRAFIA precisa ter 32 bytes em base64");
    this.chave = new SecretKeySpec(k, "AES");
  }

  public String cifrar(String texto) {
    if (texto == null) return null;
    try {
      byte[] iv = new byte[12];
      RND.nextBytes(iv);
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      c.init(Cipher.ENCRYPT_MODE, chave, new GCMParameterSpec(128, iv));
      byte[] cifra = c.doFinal(texto.getBytes(StandardCharsets.UTF_8));
      return Base64.getEncoder().encodeToString(ByteBuffer.allocate(12 + cifra.length).put(iv).put(cifra).array());
    } catch (Exception e) {
      throw new IllegalStateException("Falha ao cifrar", e);
    }
  }

  public String decifrar(String base64) {
    if (base64 == null || base64.isBlank()) return null;
    try {
      byte[] tudo = Base64.getDecoder().decode(base64);
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      c.init(Cipher.DECRYPT_MODE, chave, new GCMParameterSpec(128, tudo, 0, 12));
      return new String(c.doFinal(tudo, 12, tudo.length - 12), StandardCharsets.UTF_8);
    } catch (Exception e) {
      throw new IllegalStateException("Falha ao decifrar", e);
    }
  }

  public static String tokenAleatorio(int bytes) {
    byte[] b = new byte[bytes];
    RND.nextBytes(b);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
  }

  public static String sha256(String s) {
    try {
      return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public static String hmacSha256Hex(String segredo, byte[] dados) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(segredo.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return java.util.HexFormat.of().formatHex(mac.doFinal(dados));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  /** Comparação em tempo constante (assinaturas de webhook). */
  public static boolean iguais(String a, String b) {
    if (a == null || b == null) return false;
    return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
  }
}
