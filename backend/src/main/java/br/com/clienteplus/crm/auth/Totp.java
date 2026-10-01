package br.com.clienteplus.crm.auth;

import java.nio.ByteBuffer;
import java.security.SecureRandom;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Códigos de 6 dígitos do app autenticador (RFC 6238, 30 s, SHA-1). */
public final class Totp {

  private static final String B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

  private Totp() {}

  public static String novoSegredo() {
    byte[] b = new byte[20];
    new SecureRandom().nextBytes(b);
    StringBuilder sb = new StringBuilder();
    int buffer = 0, bits = 0;
    for (byte x : b) {
      buffer = (buffer << 8) | (x & 0xff);
      bits += 8;
      while (bits >= 5) {
        sb.append(B32.charAt((buffer >> (bits - 5)) & 31));
        bits -= 5;
      }
    }
    if (bits > 0) sb.append(B32.charAt((buffer << (5 - bits)) & 31));
    return sb.toString();
  }

  public static String uri(String segredo, String email, String emissor) {
    return "otpauth://totp/" + enc(emissor) + ":" + enc(email) + "?secret=" + segredo + "&issuer=" + enc(emissor) + "&digits=6&period=30";
  }

  /** Aceita o código do intervalo atual e de um antes/depois (relógio do celular adiantado/atrasado). */
  public static boolean confere(String segredo, String codigo) {
    if (segredo == null || codigo == null || !codigo.trim().matches("\\d{6}")) return false;
    long t = System.currentTimeMillis() / 30000;
    for (long d = -1; d <= 1; d++) if (codigo(segredo, t + d).equals(codigo.trim())) return true;
    return false;
  }

  private static String codigo(String segredo, long passo) {
    try {
      Mac mac = Mac.getInstance("HmacSHA1");
      mac.init(new SecretKeySpec(base32(segredo), "HmacSHA1"));
      byte[] h = mac.doFinal(ByteBuffer.allocate(8).putLong(passo).array());
      int o = h[h.length - 1] & 0xf;
      int bin = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
      return String.format("%06d", bin % 1_000_000);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private static byte[] base32(String s) {
    s = s.replace("=", "").toUpperCase();
    ByteBuffer out = ByteBuffer.allocate(s.length() * 5 / 8);
    int buffer = 0, bits = 0;
    for (char c : s.toCharArray()) {
      int v = B32.indexOf(c);
      if (v < 0) continue;
      buffer = (buffer << 5) | v;
      bits += 5;
      if (bits >= 8) {
        out.put((byte) (buffer >> (bits - 8)));
        bits -= 8;
      }
    }
    return java.util.Arrays.copyOf(out.array(), out.position());
  }

  private static String enc(String s) {
    return java.net.URLEncoder.encode(s, java.nio.charset.StandardCharsets.UTF_8).replace("+", "%20");
  }
}
