package br.com.clienteplus.crm.comum;

import br.com.clienteplus.crm.auth.Sessao;
import io.smallrye.mutiny.Multi;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.Map;
import java.util.UUID;
import org.jboss.resteasy.reactive.RestStreamElementType;

@Path("/")
public class EventosResource {

  @Inject Hub hub;
  @Inject Sessao sessao;

  /** Fluxo de eventos (SSE) da loja atual. O painel lê com fetch + Authorization. */
  @GET
  @Path("eventos")
  @Produces(MediaType.SERVER_SENT_EVENTS)
  @RestStreamElementType(MediaType.APPLICATION_JSON)
  public Multi<Map<String, Object>> eventos() {
    UUID loja = sessao.loja();
    return hub.assinar(loja);
  }

  @GET
  @Path("saude")
  public Map<String, Object> saude() {
    return Map.of("ok", true);
  }
}
