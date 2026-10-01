package br.com.clienteplus.crm.auth;

import br.com.clienteplus.crm.comum.Cripto;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.comum.Limitador;
import br.com.clienteplus.crm.lojas.Lojas;
import io.quarkus.elytron.security.common.BcryptUtil;
import io.vertx.core.http.HttpServerRequest;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Context;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

@Path("/auth")
public class AuthResource {

  @Inject Db db;
  @Inject Tokens tokens;
  @Inject Sessao sessao;
  @Inject Limitador limitador;
  @Inject Lojas lojas;
  @Inject Cripto cripto;
  @Inject br.com.clienteplus.crm.comum.Email email;
  @org.eclipse.microprofile.config.inject.ConfigProperty(name = "crm.url-publica") String urlPublica;
  @Context HttpServerRequest req;

  /**
   * Esqueci a senha: manda um link (vale 1 hora) por e-mail. Responde igual
   * exista ou não a conta, para não revelar quem é cliente.
   */
  @POST
  @Path("/esqueci")
  public Map<String, Object> esqueci(Map<String, Object> corpo) {
    String em = Erro.obrigatorio(corpo, "email", "E-mail").trim().toLowerCase();
    limitador.conferir("esqueci:" + ip(), 10, 3600);
    limitador.conferir("esqueci:" + em, 3, 3600);
    Map<String, Object> u = db.um("select id, nome from crm_usuarios where lower(email) = ? and ativo", em);
    if (u != null) {
      String token = Cripto.tokenAleatorio(32);
      db.executa("update crm_usuarios set reset_token_hash = ?, reset_expira = now() + interval '1' hour where id = ?::uuid", Cripto.sha256(token), u.get("id"));
      String link = urlPublica.replaceAll("/+$", "") + "/redefinir/" + token;
      String html = "<p>Olá, " + Formatos.html(Json.s(u, "nome", "")) + "!</p><p>Recebemos um pedido para trocar a sua senha do LeadsPlus.</p>"
          + "<p><a href=\"" + link + "\" style=\"background:#f47b20;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:bold\">Criar nova senha</a></p>"
          + "<p style=\"color:#777\">O link vale 1 hora. Se não foi você, ignore este e-mail — sua senha continua a mesma.</p>";
      try {
        if (email.plataformaConfigurada()) email.enviarPlataforma(em, "Trocar sua senha", html);
        else {
          // sem SMTP da plataforma: usa o de alguma empresa da pessoa
          String loja = db.valor("select m.store_id::text from crm_membros m join crm_lojas l on l.id = m.store_id where m.usuario_id = ?::uuid and l.config->'smtp'->>'host' is not null limit 1", u.get("id"));
          if (loja != null) email.enviar(UUID.fromString(loja), em, "Trocar sua senha", html);
          else org.jboss.logging.Logger.getLogger(AuthResource.class).warnf("Sem SMTP para recuperar senha de %s. Link: %s", em, link);
        }
      } catch (Exception e) {
        org.jboss.logging.Logger.getLogger(AuthResource.class).warn("Falha ao enviar recuperação de senha: " + e.getMessage());
      }
    }
    return Map.of("ok", true);
  }

  /** corpo: {token, senha} */
  @POST
  @Path("/redefinir")
  public Map<String, Object> redefinir(Map<String, Object> corpo) {
    limitador.conferir("redefinir:" + ip(), 10, 600);
    String token = Erro.obrigatorio(corpo, "token", "Link");
    String nova = Erro.obrigatorio(corpo, "senha", "Nova senha");
    validarSenha(nova);
    Map<String, Object> u = db.um("select id, email from crm_usuarios where reset_token_hash = ? and reset_expira > now() and ativo", Cripto.sha256(token));
    if (u == null) throw Erro.requisicao("Este link expirou ou já foi usado. Peça um novo.");
    db.executa("update crm_usuarios set senha_hash = ?, reset_token_hash = null, reset_expira = null, updated_at = now() where id = ?::uuid", BcryptUtil.bcryptHash(nova, 12), u.get("id"));
    limitador.limpar("login:" + Json.s(u, "email", "").toLowerCase());
    return Map.of("ok", true);
  }

  private String ip() {
    return req == null || req.remoteAddress() == null ? "?" : req.remoteAddress().hostAddress();
  }

  @POST
  @Path("/login")
  public Map<String, Object> login(Map<String, Object> corpo) {
    String email = Erro.obrigatorio(corpo, "email", "E-mail").toLowerCase();
    String senha = Erro.obrigatorio(corpo, "senha", "Senha");
    limitador.conferir("login:" + ip(), 20, 600);
    limitador.conferir("login:" + email, 8, 600);
    Map<String, Object> u = db.um("select id, email, senha_hash, ativo, totp_ativo from crm_usuarios where lower(email) = ?", email);
    // mesma resposta para e-mail inexistente e senha errada (não revela quem tem conta)
    if (u == null || u.get("senhaHash") == null || !BcryptUtil.matches(senha, (String) u.get("senhaHash")))
      throw Erro.naoAutenticado("E-mail ou senha incorretos");
    if (!Json.b(u, "ativo", true)) throw Erro.proibido("Usuário desativado");
    limitador.limpar("login:" + email);
    UUID id = UUID.fromString((String) u.get("id"));
    if (Json.b(u, "totpAtivo", false)) return Map.of("precisa2fa", true, "token", tokens.emitir(id, email, true));
    return Map.of("token", tokens.emitir(id, email, false));
  }

  @POST
  @Path("/2fa/entrar")
  public Map<String, Object> entrar2fa(Map<String, Object> corpo) {
    UUID id = sessao.usuario();
    limitador.conferir("2fa:" + id, 6, 300);
    Map<String, Object> u = db.obrigatorio("Usuário", "select email, totp_segredo from crm_usuarios where id = ?", id);
    if (!Totp.confere(cripto.decifrar((String) u.get("totpSegredo")), Json.s(corpo, "codigo")))
      throw Erro.naoAutenticado("Código inválido");
    return Map.of("token", tokens.emitir(id, (String) u.get("email"), false));
  }

  /** Cadastro de uma nova empresa com o primeiro usuário (dono). */
  @POST
  @Path("/cadastro")
  @Transactional
  public Map<String, Object> cadastro(Map<String, Object> corpo) {
    limitador.conferir("cadastro:" + ip(), 5, 3600);
    String nome = Erro.obrigatorio(corpo, "nome", "Nome");
    String email = Erro.obrigatorio(corpo, "email", "E-mail").toLowerCase();
    String senha = Erro.obrigatorio(corpo, "senha", "Senha");
    String empresa = Erro.obrigatorio(corpo, "empresa", "Nome da empresa");
    validarSenha(senha);
    Erro.exigir(email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+"), "E-mail inválido");
    if (db.numero("select count(*) from crm_usuarios where lower(email) = ?", email) > 0) throw Erro.conflito("Já existe uma conta com este e-mail");
    Map<String, Object> u = db.insere("crm_usuarios", Json.de("nome", nome, "email", email, "senha_hash", BcryptUtil.bcryptHash(senha, 12)));
    UUID id = UUID.fromString((String) u.get("id"));
    lojas.criar(empresa, id, null);
    return Map.of("token", tokens.emitir(id, email, false));
  }

  /** Dados do usuário logado e as empresas a que ele tem acesso. */
  @GET
  @Path("/me")
  public Map<String, Object> me() {
    UUID id = sessao.usuario();
    Map<String, Object> u = db.um("select id, nome, email, foto_url, totp_ativo, supabase_user_id is not null as integrado from crm_usuarios where id = ?", id);
    var empresas = db.lista("""
        select l.id, l.nome, l.slug, m.papel from crm_membros m join crm_lojas l on l.id = m.store_id
        where m.usuario_id = ? order by l.nome""", id);
    Map<String, Object> loja = sessao.lojaOuNula() != null
        ? db.um("select id, nome, slug, fuso, horario_comercial, config from crm_lojas where id = ?", sessao.lojaOuNula()) : null;
    return Json.de("usuario", u, "empresas", empresas, "loja", loja, "papel", sessao.papel(), "setorId", sessao.setor());
  }

  @PUT
  @Path("/perfil")
  public Map<String, Object> perfil(Map<String, Object> corpo) {
    String nome = Erro.obrigatorio(corpo, "nome", "Nome");
    String foto = Json.s(corpo, "fotoUrl");
    return db.um("update crm_usuarios set nome = ?, foto_url = ?, updated_at = now() where id = ? returning id, nome, email, foto_url", nome, foto, sessao.usuario());
  }

  @PUT
  @Path("/senha")
  public Map<String, Object> senha(Map<String, Object> corpo) {
    UUID id = sessao.usuario();
    limitador.conferir("senha:" + id, 5, 600);
    String atual = Json.s(corpo, "atual");
    String nova = Erro.obrigatorio(corpo, "nova", "Nova senha");
    validarSenha(nova);
    String hash = db.valor("select senha_hash from crm_usuarios where id = ?", id);
    if (hash != null && (atual == null || !BcryptUtil.matches(atual, hash))) throw Erro.requisicao("Senha atual incorreta");
    db.executa("update crm_usuarios set senha_hash = ?, updated_at = now() where id = ?", BcryptUtil.bcryptHash(nova, 12), id);
    return Map.of("ok", true);
  }

  /** Passo 1 do 2FA: gera o segredo (ainda não liga). */
  @POST
  @Path("/2fa/preparar")
  public Map<String, Object> preparar2fa(Map<String, Object> corpo) {
    UUID id = sessao.usuario();
    confirmarSenha(id, Json.s(corpo, "senha"));
    String segredo = Totp.novoSegredo();
    db.executa("update crm_usuarios set totp_segredo = ?, totp_ativo = false where id = ?", cripto.cifrar(segredo), id);
    return Map.of("segredo", segredo, "uri", Totp.uri(segredo, sessao.email(), "LeadsPlus"));
  }

  /** Passo 2: confirma com um código do app e liga. */
  @POST
  @Path("/2fa/ativar")
  public Map<String, Object> ativar2fa(Map<String, Object> corpo) {
    UUID id = sessao.usuario();
    String seg = db.valor("select totp_segredo from crm_usuarios where id = ?", id);
    if (seg == null || !Totp.confere(cripto.decifrar(seg), Json.s(corpo, "codigo"))) throw Erro.requisicao("Código inválido");
    db.executa("update crm_usuarios set totp_ativo = true where id = ?", id);
    return Map.of("ok", true);
  }

  @POST
  @Path("/2fa/desativar")
  public Map<String, Object> desativar2fa(Map<String, Object> corpo) {
    UUID id = sessao.usuario();
    confirmarSenha(id, Json.s(corpo, "senha"));
    db.executa("update crm_usuarios set totp_ativo = false, totp_segredo = null where id = ?", id);
    return Map.of("ok", true);
  }

  @GET
  @Path("/convite/{token}")
  public Map<String, Object> verConvite(@PathParam("token") String token) {
    Map<String, Object> c = db.obrigatorio("Convite", """
        select c.email, c.nome, c.papel, l.nome as empresa, c.expira_em, c.aceito_em,
          exists(select 1 from crm_usuarios u where lower(u.email) = lower(c.email)) as tem_conta
        from crm_convites c join crm_lojas l on l.id = c.store_id where c.token = ?""", token);
    if (c.get("aceitoEm") != null) throw Erro.requisicao("Este convite já foi usado");
    if (Instant.parse((String) c.get("expiraEm")).isBefore(Instant.now())) throw Erro.requisicao("Este convite expirou");
    return c;
  }

  /** Aceita o convite: cria a conta (ou usa a existente, conferindo a senha) e entra na empresa. */
  @POST
  @Path("/convite/{token}")
  @Transactional
  public Map<String, Object> aceitarConvite(@PathParam("token") String token, Map<String, Object> corpo) {
    limitador.conferir("convite:" + ip(), 10, 600);
    Map<String, Object> c = db.obrigatorio("Convite", "select * from crm_convites where token = ? for update", token);
    if (c.get("aceitoEm") != null) throw Erro.requisicao("Este convite já foi usado");
    if (Instant.parse((String) c.get("expiraEm")).isBefore(Instant.now())) throw Erro.requisicao("Este convite expirou");
    String email = ((String) c.get("email")).toLowerCase();
    String senha = Erro.obrigatorio(corpo, "senha", "Senha");
    Map<String, Object> u = db.um("select id, senha_hash from crm_usuarios where lower(email) = ?", email);
    UUID uid;
    if (u == null) {
      validarSenha(senha);
      String nome = Json.s(corpo, "nome", Json.s(c, "nome", email.split("@")[0]));
      uid = UUID.fromString((String) db.insere("crm_usuarios", Json.de("nome", nome, "email", email, "senha_hash", BcryptUtil.bcryptHash(senha, 12))).get("id"));
    } else if (u.get("senhaHash") == null) {
      // usuário que veio da importação (ainda sem senha): o convite define a senha
      validarSenha(senha);
      uid = UUID.fromString((String) u.get("id"));
      db.executa("update crm_usuarios set senha_hash = ?, updated_at = now() where id = ?", BcryptUtil.bcryptHash(senha, 12), uid);
    } else {
      if (!BcryptUtil.matches(senha, (String) u.get("senhaHash"))) throw Erro.naoAutenticado("Senha incorreta");
      uid = UUID.fromString((String) u.get("id"));
    }
    db.executa("""
        insert into crm_membros (store_id, usuario_id, papel, setor_id) values (?, ?, ?, ?)
        on conflict (store_id, usuario_id) do update set papel = excluded.papel, setor_id = excluded.setor_id""",
        UUID.fromString((String) c.get("storeId")), uid, c.get("papel"), c.get("setorId") == null ? null : UUID.fromString((String) c.get("setorId")));
    db.executa("update crm_convites set aceito_em = now() where id = ?", UUID.fromString((String) c.get("id")));
    return Map.of("token", tokens.emitir(uid, email, false), "loja", c.get("storeId"));
  }

  /** Nova empresa para o mesmo usuário (várias empresas, igual à "holding" do Meppy). */
  @POST
  @Path("/empresas")
  public Map<String, Object> novaEmpresa(Map<String, Object> corpo) {
    String nome = Erro.obrigatorio(corpo, "nome", "Nome da empresa");
    UUID id = lojas.criar(nome, sessao.usuario(), null);
    return Map.of("id", id);
  }

  static String conviteToken() {
    return Cripto.tokenAleatorio(24);
  }

  static Instant conviteValidade() {
    return Instant.now().plus(7, ChronoUnit.DAYS);
  }

  private void confirmarSenha(UUID id, String senha) {
    String hash = db.valor("select senha_hash from crm_usuarios where id = ?", id);
    if (hash != null && (senha == null || !BcryptUtil.matches(senha, hash))) throw Erro.requisicao("Senha incorreta");
  }

  static void validarSenha(String s) {
    if (s.length() < 8) throw Erro.requisicao("A senha precisa ter pelo menos 8 caracteres");
    if (!s.matches(".*[A-Za-z].*") || !s.matches(".*\\d.*")) throw Erro.requisicao("A senha precisa ter letras e números");
  }
}
