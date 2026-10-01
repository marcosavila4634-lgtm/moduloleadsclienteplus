package br.com.clienteplus.crm.comum;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;

public final class Formatos {

  public static final ZoneId SP = ZoneId.of("America/Sao_Paulo");
  private static final DateTimeFormatter DATA_HORA = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm", new Locale("pt", "BR"));

  private Formatos() {}

  /** numeric do banco: inteiro sem ".0", decimal como double. */
  public static Number numero(BigDecimal b) {
    if (b == null) return null;
    BigDecimal s = b.stripTrailingZeros();
    if (s.scale() <= 0 && s.abs().compareTo(BigDecimal.valueOf(Long.MAX_VALUE)) < 0) return s.longValue();
    return b.doubleValue();
  }

  /** Só dígitos; celulares brasileiros ganham o 55 se vierem sem DDI. */
  public static String telefone(String t) {
    if (t == null) return null;
    String d = t.replaceAll("\\D", "");
    if (d.isEmpty()) return null;
    if ((d.length() == 10 || d.length() == 11) && !d.startsWith("55")) d = "55" + d;
    return d;
  }

  /** Variações do mesmo celular brasileiro com e sem o nono dígito. */
  public static String[] variacoesTelefone(String t) {
    String d = telefone(t);
    if (d == null) return new String[0];
    if (d.startsWith("55") && d.length() == 13 && d.charAt(4) == '9') return new String[] {d, d.substring(0, 4) + d.substring(5)};
    if (d.startsWith("55") && d.length() == 12) return new String[] {d, d.substring(0, 4) + "9" + d.substring(4)};
    return new String[] {d};
  }

  public static String semAcento(String s) {
    if (s == null) return "";
    return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
  }

  public static String slug(String s) {
    String r = semAcento(s).toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
    return r.isEmpty() ? "loja" : r;
  }

  public static UUID uuid(Object o) {
    if (o == null) return null;
    if (o instanceof UUID u) return u;
    String s = String.valueOf(o);
    if (s.isBlank()) return null;
    try {
      return UUID.fromString(s);
    } catch (IllegalArgumentException e) {
      throw Erro.requisicao("Identificador inválido: " + s);
    }
  }

  public static Instant instante(Object o) {
    if (o == null) return null;
    if (o instanceof Instant i) return i;
    String s = String.valueOf(o).trim();
    if (s.isEmpty()) return null;
    try {
      return Instant.parse(s);
    } catch (Exception e) {
      try {
        return OffsetDateTime.parse(s).toInstant();
      } catch (Exception e2) {
        throw Erro.requisicao("Data inválida: " + s);
      }
    }
  }

  public static String dataHora(Instant i) {
    return i == null ? "" : DATA_HORA.format(i.atZone(SP));
  }

  public static String reais(double v) {
    return String.format(new Locale("pt", "BR"), "R$ %,.2f", v);
  }

  /** Limita texto (para prévias e logs). */
  public static String curto(String s, int max) {
    if (s == null) return null;
    return s.length() <= max ? s : s.substring(0, max - 1) + "…";
  }

  /** Escapa texto para colocar dentro de HTML (e-mails). */
  public static String html(String s) {
    if (s == null) return "";
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
  }
}
