package br.com.clienteplus.crm.comum;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** JSON sem cerimônia: ler, escrever e pegar valores de mapas vindos da API. */
public final class Json {

  public static final ObjectMapper M = new ObjectMapper()
      .findAndRegisterModules()
      .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

  private Json() {}

  public static String texto(Object o) {
    try {
      return o instanceof String s ? s : M.writeValueAsString(o);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public static <T> T ler(String s, Class<T> tipo) {
    try {
      return M.readValue(s, tipo);
    } catch (Exception e) {
      throw new IllegalArgumentException("JSON inválido: " + e.getMessage(), e);
    }
  }

  public static Map<String, Object> mapa(String s) {
    try {
      return M.readValue(s, new TypeReference<LinkedHashMap<String, Object>>() {});
    } catch (Exception e) {
      throw new IllegalArgumentException("JSON inválido: " + e.getMessage(), e);
    }
  }

  public static JsonNode arvore(String s) {
    try {
      return M.readTree(s);
    } catch (Exception e) {
      throw new IllegalArgumentException("JSON inválido: " + e.getMessage(), e);
    }
  }

  public static ObjectNode objeto() {
    return M.createObjectNode();
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> m(Object o) {
    if (o == null) return new LinkedHashMap<>();
    if (o instanceof Map<?, ?> mm) return (Map<String, Object>) mm;
    return M.convertValue(o, new TypeReference<LinkedHashMap<String, Object>>() {});
  }

  @SuppressWarnings("unchecked")
  public static List<Object> l(Object o) {
    if (o == null) return new ArrayList<>();
    if (o instanceof List<?> ll) return (List<Object>) ll;
    return M.convertValue(o, new TypeReference<List<Object>>() {});
  }

  public static String s(Map<String, Object> m, String k) {
    Object v = m == null ? null : m.get(k);
    return v == null ? null : String.valueOf(v);
  }

  public static String s(Map<String, Object> m, String k, String padrao) {
    String v = s(m, k);
    return v == null || v.isBlank() ? padrao : v;
  }

  public static boolean b(Map<String, Object> m, String k, boolean padrao) {
    Object v = m == null ? null : m.get(k);
    if (v instanceof Boolean x) return x;
    if (v instanceof String x) return Boolean.parseBoolean(x);
    return padrao;
  }

  public static int i(Map<String, Object> m, String k, int padrao) {
    Object v = m == null ? null : m.get(k);
    if (v instanceof Number n) return n.intValue();
    if (v instanceof String x && !x.isBlank()) {
      try {
        return (int) Double.parseDouble(x);
      } catch (NumberFormatException e) {
        return padrao;
      }
    }
    return padrao;
  }

  public static double d(Map<String, Object> m, String k, double padrao) {
    Object v = m == null ? null : m.get(k);
    if (v instanceof Number n) return n.doubleValue();
    if (v instanceof String x && !x.isBlank()) {
      try {
        return Double.parseDouble(x.replace(",", "."));
      } catch (NumberFormatException e) {
        return padrao;
      }
    }
    return padrao;
  }

  @SuppressWarnings("unchecked")
  public static List<String> ls(Map<String, Object> m, String k) {
    Object v = m == null ? null : m.get(k);
    List<String> out = new ArrayList<>();
    if (v instanceof List<?> l) for (Object x : l) if (x != null) out.add(String.valueOf(x));
    return out;
  }

  /** Mapa ordenado a partir de pares chave, valor. */
  public static Map<String, Object> de(Object... kv) {
    Map<String, Object> m = new LinkedHashMap<>();
    for (int i = 0; i + 1 < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
    return m;
  }
}
