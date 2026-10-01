package br.com.clienteplus.crm.canais;

import br.com.clienteplus.crm.comum.Cripto;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Json;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.Map;
import java.util.UUID;

/** Leitura das conexões com as credenciais decifradas (só no servidor, nunca vão para a tela). */
@ApplicationScoped
public class Conexoes {

  @Inject Db db;
  @Inject Cripto cripto;

  public record Conexao(UUID id, UUID storeId, String nome, String tipo, String status, String phoneNumberId, String wabaId,
      String instagramId, String paginaId, String token, UUID agenteId, Map<String, Object> config, String telefone) {}

  public Conexao obter(UUID id) {
    Map<String, Object> m = db.um("select * from crm_conexoes where id = ?", id);
    return m == null ? null : montar(m);
  }

  public Conexao porPhoneNumberId(String phoneNumberId) {
    Map<String, Object> m = db.um("select * from crm_conexoes where phone_number_id = ?", phoneNumberId);
    return m == null ? null : montar(m);
  }

  public Conexao porInstagram(String igId) {
    Map<String, Object> m = db.um("select * from crm_conexoes where instagram_id = ? or pagina_id = ?", igId, igId);
    return m == null ? null : montar(m);
  }

  /** Primeira conexão conectada do tipo (para quando a conversa não tem conexão). */
  public Conexao padrao(UUID storeId, String tipo) {
    Map<String, Object> m = db.um("select * from crm_conexoes where store_id = ? and tipo = ? order by (status = 'conectado') desc, created_at limit 1", storeId, tipo);
    return m == null ? null : montar(m);
  }

  public void guardarCredenciais(UUID id, Map<String, Object> cred) {
    db.executa("update crm_conexoes set credenciais_cripto = ?, updated_at = now() where id = ?", cripto.cifrar(Json.texto(cred)), id);
  }

  private Conexao montar(Map<String, Object> m) {
    String token = null;
    String cifrado = (String) m.get("credenciaisCripto");
    if (cifrado != null) token = Json.s(Json.mapa(cripto.decifrar(cifrado)), "token");
    return new Conexao(UUID.fromString((String) m.get("id")), UUID.fromString((String) m.get("storeId")), (String) m.get("nome"),
        (String) m.get("tipo"), (String) m.get("status"), (String) m.get("phoneNumberId"), (String) m.get("wabaId"),
        (String) m.get("instagramId"), (String) m.get("paginaId"), token,
        m.get("agenteId") == null ? null : UUID.fromString((String) m.get("agenteId")), Json.m(m.get("config")), (String) m.get("telefone"));
  }

  /** Dados seguros para a tela (sem token). */
  public static Map<String, Object> publica(Map<String, Object> m) {
    m.remove("credenciaisCripto");
    return m;
  }
}
