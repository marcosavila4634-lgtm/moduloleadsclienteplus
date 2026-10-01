package br.com.clienteplus.crm.comum;

import br.com.clienteplus.crm.auth.Sessao;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import java.util.Map;

/** Inscrição do aparelho (celular/computador) para receber avisos. */
@Path("/push")
public class PushResource {

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject WebPush push;

  @GET
  @Path("/chave")
  public Map<String, Object> chave() {
    return Map.of("chave", push.chavePublica());
  }

  /** corpo: a PushSubscription do navegador {endpoint, keys:{p256dh, auth}} + aparelho */
  @POST
  @Path("/inscrever")
  public Map<String, Object> inscrever(Map<String, Object> corpo) {
    String endpoint = Erro.obrigatorio(corpo, "endpoint", "Endereço");
    Erro.exigir(endpoint.startsWith("https://"), "Endereço inválido");
    Map<String, Object> k = Json.m(corpo.get("keys"));
    db.executa("""
        insert into crm_push_inscricoes (store_id, usuario_id, endpoint, p256dh, auth, aparelho) values (?, ?, ?, ?, ?, ?)
        on conflict (endpoint) do update set store_id = excluded.store_id, usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth""",
        sessao.loja(), sessao.usuario(), endpoint, Erro.obrigatorio(k, "p256dh", "Chave"), Erro.obrigatorio(k, "auth", "Chave"), Formatos.curto(Json.s(corpo, "aparelho"), 200));
    return Map.of("ok", true);
  }

  @POST
  @Path("/cancelar")
  public Map<String, Object> cancelar(Map<String, Object> corpo) {
    db.executa("delete from crm_push_inscricoes where endpoint = ? and usuario_id = ?", Json.s(corpo, "endpoint"), sessao.usuario());
    return Map.of("ok", true);
  }

  @POST
  @Path("/testar")
  public Map<String, Object> testar() {
    push.enviar(sessao.loja(), sessao.usuario(), "Avisos ligados! 🔔", "É assim que você vai saber quando chegar conversa.", "/conversas");
    return Map.of("ok", true);
  }
}
