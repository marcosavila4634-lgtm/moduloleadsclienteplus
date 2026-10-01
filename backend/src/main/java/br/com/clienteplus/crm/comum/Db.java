package br.com.clienteplus.crm.comum;

import com.fasterxml.jackson.databind.JsonNode;
import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.math.BigDecimal;
import java.sql.Array;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;
import java.util.UUID;
import org.postgresql.util.PGobject;

/**
 * Acesso ao banco por SQL parametrizado (nunca concatenar valores do usuário).
 *
 * Linhas voltam como Map com chaves em camelCase (store_id -> storeId), jsonb
 * como objetos (Map/List), arrays como List e datas como texto ISO — prontas
 * para virar o JSON da API. Parâmetros: Map/List/JsonNode viram jsonb (use
 * {@code ?::jsonb} no SQL), {@link Db#texto(Collection)} vira text[] e
 * {@link Db#uuids(Collection)} vira uuid[].
 *
 * Dentro de um método @Transactional as chamadas usam a mesma transação.
 */
@ApplicationScoped
public class Db {

  @Inject AgroalDataSource ds;

  public record Arr(String tipo, Object[] valores) {}

  public static Arr texto(Collection<String> v) {
    return new Arr("text", v == null ? new Object[0] : v.toArray());
  }

  public static Arr uuids(Collection<UUID> v) {
    return new Arr("uuid", v == null ? new Object[0] : v.toArray());
  }

  public List<Map<String, Object>> lista(String sql, Object... params) {
    try (Connection c = ds.getConnection(); PreparedStatement ps = preparar(c, sql, params); ResultSet rs = ps.executeQuery()) {
      return linhas(rs);
    } catch (SQLException e) {
      throw new ErroBanco(sql, e);
    }
  }

  public Map<String, Object> um(String sql, Object... params) {
    List<Map<String, Object>> l = lista(sql, params);
    return l.isEmpty() ? null : l.get(0);
  }

  /** Como {@link #um} mas responde 404 quando não acha. */
  public Map<String, Object> obrigatorio(String oque, String sql, Object... params) {
    Map<String, Object> m = um(sql, params);
    if (m == null) throw Erro.naoEncontrado(oque + " não encontrado(a)");
    return m;
  }

  @SuppressWarnings("unchecked")
  public <T> T valor(String sql, Object... params) {
    try (Connection c = ds.getConnection(); PreparedStatement ps = preparar(c, sql, params); ResultSet rs = ps.executeQuery()) {
      if (!rs.next()) return null;
      return (T) converter(rs.getObject(1), rs.getMetaData().getColumnTypeName(1));
    } catch (SQLException e) {
      throw new ErroBanco(sql, e);
    }
  }

  public long numero(String sql, Object... params) {
    Object v = valor(sql, params);
    return v == null ? 0 : ((Number) v).longValue();
  }

  public int executa(String sql, Object... params) {
    try (Connection c = ds.getConnection(); PreparedStatement ps = preparar(c, sql, params)) {
      return ps.executeUpdate();
    } catch (SQLException e) {
      throw new ErroBanco(sql, e);
    }
  }

  /** Várias execuções do mesmo comando (importação). */
  public void lote(String sql, List<Object[]> linhas) {
    if (linhas.isEmpty()) return;
    try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
      int n = 0;
      for (Object[] p : linhas) {
        ligar(c, ps, p);
        ps.addBatch();
        if (++n % 500 == 0) ps.executeBatch();
      }
      ps.executeBatch();
    } catch (SQLException e) {
      throw new ErroBanco(sql, e.getNextException() != null ? e.getNextException() : e);
    }
  }

  /**
   * INSERT com as colunas do mapa (chaves em snake_case), devolvendo a linha.
   * Nomes de coluna vêm do código, nunca do usuário.
   */
  public Map<String, Object> insere(String tabela, Map<String, Object> colunas) {
    StringJoiner nomes = new StringJoiner(", ");
    StringJoiner marcas = new StringJoiner(", ");
    List<Object> valores = new ArrayList<>();
    for (var e : colunas.entrySet()) {
      nomes.add(nomeSeguro(e.getKey()));
      marcas.add(marca(e.getValue()));
      valores.add(e.getValue());
    }
    return um("insert into " + nomeSeguro(tabela) + " (" + nomes + ") values (" + marcas + ") returning *", valores.toArray());
  }

  /** UPDATE ... where id = ? and store_id = ? (sempre filtrando a loja). */
  public Map<String, Object> atualiza(String tabela, UUID id, UUID storeId, Map<String, Object> colunas) {
    if (colunas.isEmpty()) return um("select * from " + nomeSeguro(tabela) + " where id = ? and store_id = ?", id, storeId);
    StringJoiner sets = new StringJoiner(", ");
    List<Object> valores = new ArrayList<>();
    for (var e : colunas.entrySet()) {
      sets.add(nomeSeguro(e.getKey()) + " = " + marca(e.getValue()));
      valores.add(e.getValue());
    }
    valores.add(id);
    valores.add(storeId);
    return um("update " + nomeSeguro(tabela) + " set " + sets + " where id = ? and store_id = ? returning *", valores.toArray());
  }

  private static String marca(Object v) {
    return (v instanceof Map || v instanceof List || v instanceof JsonNode) ? "?::jsonb" : "?";
  }

  private static String nomeSeguro(String n) {
    if (!n.matches("[a-z_][a-z0-9_]*")) throw new IllegalArgumentException("nome inválido: " + n);
    return n;
  }

  private PreparedStatement preparar(Connection c, String sql, Object[] params) throws SQLException {
    PreparedStatement ps = c.prepareStatement(sql);
    ligar(c, ps, params);
    return ps;
  }

  private void ligar(Connection c, PreparedStatement ps, Object[] params) throws SQLException {
    for (int i = 0; i < params.length; i++) {
      Object p = params[i];
      int idx = i + 1;
      if (p == null) ps.setNull(idx, Types.NULL);
      else if (p instanceof Arr a) {
        Array arr = c.createArrayOf(a.tipo(), a.valores());
        ps.setArray(idx, arr);
      } else if (p instanceof Map || p instanceof List || p instanceof JsonNode) {
        PGobject o = new PGobject();
        o.setType("jsonb");
        o.setValue(Json.texto(p));
        ps.setObject(idx, o);
      } else if (p instanceof Instant t) ps.setTimestamp(idx, Timestamp.from(t));
      else if (p instanceof OffsetDateTime t) ps.setObject(idx, t);
      else if (p instanceof LocalDate d) ps.setObject(idx, d);
      else if (p instanceof Enum<?> e) ps.setString(idx, e.name());
      else ps.setObject(idx, p);
    }
  }

  private static List<Map<String, Object>> linhas(ResultSet rs) throws SQLException {
    ResultSetMetaData md = rs.getMetaData();
    int n = md.getColumnCount();
    String[] chaves = new String[n];
    String[] tipos = new String[n];
    for (int i = 0; i < n; i++) {
      chaves[i] = camel(md.getColumnLabel(i + 1));
      tipos[i] = md.getColumnTypeName(i + 1);
    }
    List<Map<String, Object>> out = new ArrayList<>();
    while (rs.next()) {
      Map<String, Object> m = new LinkedHashMap<>();
      for (int i = 0; i < n; i++) m.put(chaves[i], converter(rs.getObject(i + 1), tipos[i]));
      out.add(m);
    }
    return out;
  }

  private static Object converter(Object v, String tipo) throws SQLException {
    if (v == null) return null;
    if (v instanceof PGobject o) {
      if ("jsonb".equals(o.getType()) || "json".equals(o.getType())) return o.getValue() == null ? null : Json.ler(o.getValue(), Object.class);
      return o.getValue();
    }
    if (v instanceof Array a) {
      Object[] arr = (Object[]) a.getArray();
      List<Object> l = new ArrayList<>(arr.length);
      for (Object x : arr) l.add(x instanceof UUID u ? u.toString() : x);
      return l;
    }
    if (v instanceof Timestamp t) return t.toInstant().toString();
    if (v instanceof OffsetDateTime t) return t.toInstant().toString();
    if (v instanceof java.sql.Date d) return d.toLocalDate().toString();
    if (v instanceof UUID u) return u.toString();
    if (v instanceof BigDecimal b) return Formatos.numero(b);
    return v;
  }

  public static String camel(String snake) {
    StringBuilder sb = new StringBuilder(snake.length());
    boolean up = false;
    for (char ch : snake.toCharArray()) {
      if (ch == '_') up = true;
      else {
        sb.append(up ? Character.toUpperCase(ch) : ch);
        up = false;
      }
    }
    return sb.toString();
  }

  public static class ErroBanco extends RuntimeException {
    public final String sqlState;

    ErroBanco(String sql, SQLException e) {
      super(e.getMessage() + " [" + sql.replaceAll("\\s+", " ").trim() + "]", e);
      this.sqlState = e.getSQLState();
    }
  }
}
