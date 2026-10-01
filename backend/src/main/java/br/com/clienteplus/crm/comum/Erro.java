package br.com.clienteplus.crm.comum;

import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.Map;

/** Erro com mensagem em português que chega na tela como {"erro": "..."}. */
public class Erro extends WebApplicationException {

  public Erro(int status, String mensagem) {
    super(mensagem, Response.status(status).type(MediaType.APPLICATION_JSON).entity(Map.of("erro", mensagem)).build());
  }

  public static Erro requisicao(String m) {
    return new Erro(400, m);
  }

  public static Erro naoAutenticado(String m) {
    return new Erro(401, m);
  }

  public static Erro proibido(String m) {
    return new Erro(403, m);
  }

  public static Erro naoEncontrado(String m) {
    return new Erro(404, m);
  }

  public static Erro conflito(String m) {
    return new Erro(409, m);
  }

  public static Erro limite(String m) {
    return new Erro(429, m);
  }

  public static Erro servico(String m) {
    return new Erro(502, m);
  }

  public static void exigir(boolean condicao, String mensagem) {
    if (!condicao) throw requisicao(mensagem);
  }

  public static String obrigatorio(Map<String, Object> corpo, String campo, String nome) {
    String v = Json.s(corpo, campo);
    if (v == null || v.isBlank()) throw requisicao(nome + " é obrigatório");
    return v.trim();
  }
}
