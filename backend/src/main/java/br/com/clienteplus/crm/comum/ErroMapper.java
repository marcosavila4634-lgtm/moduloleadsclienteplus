package br.com.clienteplus.crm.comum;

import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import java.util.Map;
import org.jboss.logging.Logger;

/**
 * Erros inesperados viram 500 com mensagem genérica (o detalhe fica só no log,
 * para não vazar SQL ou dados internos). Violação de unicidade vira 409.
 */
@Provider
public class ErroMapper implements ExceptionMapper<Throwable> {

  private static final Logger LOG = Logger.getLogger(ErroMapper.class);

  @Override
  public Response toResponse(Throwable e) {
    if (e instanceof WebApplicationException w) {
      Response r = w.getResponse();
      if (r.hasEntity()) return r;
      return json(r.getStatus(), r.getStatus() == 404 ? "Não encontrado" : "Requisição inválida");
    }
    Throwable causa = e;
    while (causa != null) {
      if (causa instanceof Db.ErroBanco b && "23505".equals(b.sqlState)) return json(409, "Já existe um registro com esses dados");
      if (causa instanceof Db.ErroBanco b && "23503".equals(b.sqlState)) return json(409, "Este registro está em uso por outro cadastro");
      if (causa instanceof IllegalArgumentException ia && ia.getMessage() != null && ia.getMessage().startsWith("JSON inválido")) {
        LOG.warn("Dados inválidos: " + ia.getMessage(), e);
        return json(400, "Dados inválidos");
      }
      causa = causa.getCause();
    }
    LOG.error("Erro não tratado", e);
    return json(500, "Erro interno. Tente de novo em instantes.");
  }

  private static Response json(int status, String msg) {
    return Response.status(status).type(MediaType.APPLICATION_JSON).entity(Map.of("erro", msg)).build();
  }
}
