package br.com.clienteplus.crm.auth;

import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Json;
import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Toda rota da API exige login, menos as públicas (login, páginas públicas,
 * webhooks). Também escolhe a loja (cabeçalho X-Loja) e confere se o usuário
 * é membro dela — nenhum dado de outra loja passa daqui.
 */
@Provider
@Priority(Priorities.AUTHENTICATION)
public class AuthFiltro implements ContainerRequestFilter {

  private static final List<String> PUBLICAS = List.of(
      "/auth/login", "/auth/cadastro", "/auth/2fa/entrar", "/auth/convite/", "/auth/esqueci", "/auth/redefinir",
      "/publico/", "/webhooks/", "/saude", "/arquivos/p/", "/l/");

  @Inject Tokens tokens;
  @Inject Sessao sessao;
  @Inject Db db;

  @Override
  public void filter(ContainerRequestContext ctx) {
    if ("OPTIONS".equals(ctx.getMethod())) return;
    String path = "/" + ctx.getUriInfo().getPath().replaceFirst("^/+", "").replaceFirst("^api/", "");
    boolean publica = PUBLICAS.stream().anyMatch(p -> path.equals(p) || (p.endsWith("/") && path.startsWith(p)));

    String auth = ctx.getHeaderString("Authorization");
    if (auth == null || !auth.startsWith("Bearer ")) {
      if (!publica) negar(ctx, 401, "Faça login para continuar");
      return;
    }
    var id = tokens.validar(auth.substring(7).trim()).orElse(null);
    if (id == null) {
      if (!publica) negar(ctx, 401, "Sua sessão expirou. Entre de novo.");
      return;
    }
    if (id.pre2fa()) {
      // só serve para /auth/2fa/entrar
      if (!path.equals("/auth/2fa/entrar")) negar(ctx, 401, "Confirme o código do autenticador");
      sessao.definirUsuario(id.usuarioId(), null, id.email());
      return;
    }

    Map<String, Object> u = "supabase".equals(id.tipo()) ? usuarioSupabase(id) : db.um("select id, nome, email, ativo from crm_usuarios where id = ?", id.usuarioId());
    if (u == null || !Json.b(u, "ativo", true)) {
      negar(ctx, 401, "Usuário não encontrado ou desativado");
      return;
    }
    UUID usuarioId = UUID.fromString((String) u.get("id"));
    sessao.definirUsuario(usuarioId, (String) u.get("nome"), (String) u.get("email"));

    String pedida = ctx.getHeaderString("X-Loja");
    Map<String, Object> m;
    if (pedida != null && !pedida.isBlank()) {
      UUID loja;
      try {
        loja = UUID.fromString(pedida.trim());
      } catch (IllegalArgumentException e) {
        negar(ctx, 400, "Empresa inválida");
        return;
      }
      m = db.um("select store_id, papel, setor_id from crm_membros where usuario_id = ? and store_id = ?", usuarioId, loja);
      if (m == null) {
        negar(ctx, 403, "Você não tem acesso a esta empresa");
        return;
      }
    } else {
      m = db.um("select store_id, papel, setor_id from crm_membros where usuario_id = ? order by created_at limit 1", usuarioId);
    }
    if (m != null) {
      UUID loja = UUID.fromString((String) m.get("storeId"));
      if ("bloqueada".equals(db.valor("select status from crm_lojas where id = ?", loja)) && !path.startsWith("/auth/") && !path.startsWith("/plataforma/")) {
        negar(ctx, 403, "O acesso desta empresa está suspenso. Fale com o suporte.");
        return;
      }
      sessao.definirLoja(loja, (String) m.get("papel"), m.get("setorId") == null ? null : UUID.fromString((String) m.get("setorId")));
    }
  }

  /** Usuário do Supabase: acha pelo id; se não existir, liga pelo e-mail ou cria. */
  private Map<String, Object> usuarioSupabase(Tokens.Identidade id) {
    Map<String, Object> u = db.um("select id, nome, email, ativo from crm_usuarios where supabase_user_id = ?", id.supabaseId());
    if (u != null) return u;
    if (id.email() != null) {
      u = db.um("update crm_usuarios set supabase_user_id = ? where lower(email) = lower(?) and supabase_user_id is null returning id, nome, email, ativo", id.supabaseId(), id.email());
      if (u != null) return u;
    }
    String nome = id.nome() != null ? id.nome() : (id.email() == null ? "Usuário" : id.email().split("@")[0]);
    return db.um("insert into crm_usuarios (nome, email, supabase_user_id) values (?, ?, ?) returning id, nome, email, ativo",
        nome, id.email() == null ? id.supabaseId() + "@supabase" : id.email(), id.supabaseId());
  }

  private static void negar(ContainerRequestContext ctx, int status, String msg) {
    ctx.abortWith(Response.status(status).type(MediaType.APPLICATION_JSON).entity(Map.of("erro", msg)).build());
  }
}
