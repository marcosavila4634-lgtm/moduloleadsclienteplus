package br.com.clienteplus.crm.plataforma;

import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.comum.Cripto;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.lojas.Lojas;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Área de administração da PLATAFORMA (dono do sistema que vende para as
 * lojas): empresas clientes, usuários, planos/limites, uso da IA,
 * configurações gerais e o tutorial. Só usuários com admin_plataforma.
 * Também expõe o tutorial para os usuários comuns (só leitura + progresso).
 */
@Path("/")
public class PlataformaResource {

  private static final Logger LOG = Logger.getLogger(PlataformaResource.class);

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject Lojas lojas;
  @Inject br.com.clienteplus.crm.importacao.ImportadorMeppy importador;
  @Inject br.com.clienteplus.crm.comum.Cripto cripto;
  @Inject br.com.clienteplus.crm.comum.Email email;
  @ConfigProperty(name = "crm.admin-email") Optional<String> adminEmail;
  @ConfigProperty(name = "crm.url-publica") String urlPublica;

  /** Ao ligar: marca como admin da plataforma o e-mail configurado em CRM_ADMIN_EMAIL. */
  void aoLigar(@Observes StartupEvent ev) {
    adminEmail.map(String::trim).filter(s -> !s.isBlank()).ifPresent(e -> {
      int n = db.executa("update crm_usuarios set admin_plataforma = true where lower(email) = lower(?) and not admin_plataforma", e);
      if (n > 0) LOG.infof("%s agora é administrador da plataforma", e);
    });
  }

  private void exigirAdmin() {
    if (!Json.b(db.um("select admin_plataforma from crm_usuarios where id = ?", sessao.usuario()), "adminPlataforma", false))
      throw Erro.proibido("Área restrita à administração da plataforma");
  }

  @GET
  @Path("plataforma/eu")
  public Map<String, Object> eu() {
    return Map.of("admin", Json.b(db.um("select admin_plataforma from crm_usuarios where id = ?", sessao.usuario()), "adminPlataforma", false));
  }

  @GET
  @Path("plataforma/resumo")
  public Map<String, Object> resumo() {
    exigirAdmin();
    Map<String, Object> r = db.um("""
        select (select count(*) from crm_lojas) as lojas, (select count(*) from crm_lojas where status = 'ativa') as lojas_ativas,
          (select count(*) from crm_usuarios) as usuarios, (select count(*) from crm_contatos) as contatos,
          (select count(*) from crm_conversas where ultima_mensagem_em > now() - interval '30' day) as conversas_30d,
          (select count(*) from crm_mensagens where created_at > now() - interval '30' day) as mensagens_30d,
          (select coalesce(sum(custo_micro_usd),0) from crm_ia_uso where created_at >= date_trunc('month', now())) as ia_mes_micro_usd,
          (select count(*) from crm_conexoes where status = 'conectado') as conexoes_ativas,
          (select count(*) from crm_ia_uso where erro is not null and created_at > now() - interval '24' hour) as erros_ia_24h""");
    r.put("novasPorDia", db.lista("select created_at::date as dia, count(*) as lojas from crm_lojas where created_at > now() - interval '60' day group by 1 order by 1"));
    return r;
  }

  @GET
  @Path("plataforma/lojas")
  public List<Map<String, Object>> lojas(@QueryParam("busca") String busca) {
    exigirAdmin();
    return db.lista("""
        select l.id, l.nome, l.slug, l.status, l.plano, l.limites, l.created_at, l.bloqueio_motivo,
          (select u.email from crm_membros m join crm_usuarios u on u.id = m.usuario_id where m.store_id = l.id and m.papel = 'dono' limit 1) as dono_email,
          (select count(*) from crm_membros m where m.store_id = l.id) as usuarios, (select count(*) from crm_contatos c where c.store_id = l.id) as contatos,
          (select count(*) from crm_conexoes c where c.store_id = l.id and c.status = 'conectado') as conexoes,
          (select count(*) from crm_conversas c where c.store_id = l.id and c.ultima_mensagem_em > now() - interval '30' day) as conversas_30d,
          (select coalesce(sum(custo_micro_usd),0) from crm_ia_uso u where u.store_id = l.id and u.created_at >= date_trunc('month', now())) as ia_mes_micro_usd,
          (select max(ultima_mensagem_em) from crm_conversas c where c.store_id = l.id) as ultima_atividade
        from crm_lojas l where (?::text is null or lower(l.nome) like ?) order by l.created_at desc""",
        busca, busca == null ? null : "%" + busca.toLowerCase() + "%");
  }

  /** Cria a empresa de um cliente e gera o convite do dono. corpo: {nome, emailDono, nomeDono, plano, limites} */
  @POST
  @Path("plataforma/lojas")
  @Transactional
  public Map<String, Object> novaLoja(Map<String, Object> c) {
    exigirAdmin();
    UUID id = lojas.criar(Erro.obrigatorio(c, "nome", "Nome da empresa"), null, Formatos.uuid(c.get("clientePlusStoreId")));
    db.executa("update crm_lojas set plano = ?, limites = ?::jsonb where id = ?", Json.s(c, "plano"), Json.m(c.get("limites")), id);
    String email = Erro.obrigatorio(c, "emailDono", "E-mail do dono").toLowerCase();
    String token = Cripto.tokenAleatorio(24);
    db.insere("crm_convites", Json.de("store_id", id, "email", email, "nome", Json.s(c, "nomeDono"), "papel", "dono", "token", token,
        "expira_em", Instant.now().plus(14, ChronoUnit.DAYS), "criado_por", sessao.usuario()));
    return Json.de("id", id, "convite", urlPublica.replaceAll("/+$", "") + "/convite/" + token);
  }

  /** corpo: {status, bloqueioMotivo, plano, limites} */
  @PUT
  @Path("plataforma/lojas/{id}")
  public Map<String, Object> editarLoja(@PathParam("id") UUID id, Map<String, Object> c) {
    exigirAdmin();
    String status = Json.s(c, "status", "ativa");
    Erro.exigir(List.of("ativa", "bloqueada", "teste").contains(status), "Status inválido");
    db.executa("update crm_lojas set status = ?, bloqueio_motivo = ?, plano = ?, limites = ?::jsonb, updated_at = now() where id = ?",
        status, Json.s(c, "bloqueioMotivo"), Json.s(c, "plano"), Json.m(c.get("limites")), id);
    if ("bloqueada".equals(status)) db.executa("update crm_agentes set status = 'paused' where store_id = ?", id);
    return Map.of("ok", true);
  }

  @GET
  @Path("plataforma/usuarios")
  public List<Map<String, Object>> usuarios(@QueryParam("busca") String busca) {
    exigirAdmin();
    return db.lista("""
        select u.id, u.nome, u.email, u.ativo, u.admin_plataforma, u.totp_ativo, u.created_at,
          (select string_agg(l.nome || ' (' || m.papel || ')', ', ') from crm_membros m join crm_lojas l on l.id = m.store_id where m.usuario_id = u.id) as empresas
        from crm_usuarios u where (?::text is null or lower(u.nome || ' ' || u.email) like ?) order by u.created_at desc limit 500""",
        busca, busca == null ? null : "%" + busca.toLowerCase() + "%");
  }

  @PUT
  @Path("plataforma/usuarios/{id}")
  public Map<String, Object> editarUsuario(@PathParam("id") UUID id, Map<String, Object> c) {
    exigirAdmin();
    Erro.exigir(!id.equals(sessao.usuario()) || Json.b(c, "adminPlataforma", true), "Você não pode tirar o seu próprio acesso de admin");
    db.executa("update crm_usuarios set ativo = ?, admin_plataforma = ? where id = ?", Json.b(c, "ativo", true), Json.b(c, "adminPlataforma", false), id);
    return Map.of("ok", true);
  }

  @GET
  @Path("plataforma/config")
  public Map<String, Object> config() {
    exigirAdmin();
    Map<String, Object> c = Json.m(db.valor("select config from crm_plataforma where id = 1"));
    Map<String, Object> smtp = Json.m(c.get("smtp"));
    smtp.put("senha_configurada", smtp.remove("senha_cripto") != null);
    c.put("smtp", smtp);
    c.remove("vapid");
    return c;
  }

  @PUT
  @Path("plataforma/config")
  public Map<String, Object> salvarConfig(Map<String, Object> c) {
    exigirAdmin();
    Map<String, Object> atual = Json.m(db.valor("select config from crm_plataforma where id = 1"));
    // a senha do SMTP só muda pelo endpoint próprio (fica cifrada)
    Map<String, Object> smtp = new java.util.LinkedHashMap<>(Json.m(c.get("smtp")));
    smtp.remove("senha_configurada");
    smtp.remove("senha_cripto");
    Object senha = Json.m(atual.get("smtp")).get("senha_cripto");
    if (senha != null) smtp.put("senha_cripto", senha);
    Map<String, Object> novo = new java.util.LinkedHashMap<>(c);
    novo.put("smtp", smtp);
    // chaves dos avisos (push) nunca vêm da tela
    novo.remove("vapid");
    if (atual.get("vapid") != null) novo.put("vapid", atual.get("vapid"));
    db.executa("update crm_plataforma set config = ?::jsonb, updated_at = now() where id = 1", novo);
    return config();
  }

  /** corpo: {valor} — senha do SMTP da plataforma (cifrada). */
  @PUT
  @Path("plataforma/smtp-senha")
  public Map<String, Object> senhaSmtp(Map<String, Object> c) {
    exigirAdmin();
    Map<String, Object> cfg = Json.m(db.valor("select config from crm_plataforma where id = 1"));
    Map<String, Object> smtp = Json.m(cfg.get("smtp"));
    String v = Json.s(c, "valor");
    if (v == null || v.isBlank()) smtp.remove("senha_cripto");
    else smtp.put("senha_cripto", cripto.cifrar(v));
    cfg.put("smtp", smtp);
    db.executa("update crm_plataforma set config = ?::jsonb, updated_at = now() where id = 1", cfg);
    return Map.of("ok", true);
  }

  @POST
  @Path("plataforma/testar-email")
  public Map<String, Object> testarEmail(Map<String, Object> c) {
    exigirAdmin();
    email.enviarPlataforma(Json.s(c, "para", sessao.email()), "Teste do e-mail da plataforma", "<p>O e-mail da plataforma está funcionando. ✅</p>");
    return Map.of("ok", true);
  }

  /** Configurações públicas da plataforma (nome, cores, textos) — usadas no login e no painel. */
  @GET
  @Path("publico/plataforma")
  public Map<String, Object> publica() {
    Map<String, Object> c = Json.m(db.valor("select config from crm_plataforma where id = 1"));
    return Json.de("nome", Json.s(c, "nome", "Gestão Plus CRM"), "logo", Json.s(c, "logo"), "cor", Json.s(c, "cor"), "suporte", Json.s(c, "suporte_whatsapp"),
        "cadastroAberto", Json.b(c, "cadastro_aberto", true));
  }

  /** Importa a cópia dos dados do Meppy (pasta dados-meppy). Pode repetir: não duplica. */
  @POST
  @Path("plataforma/importar-meppy")
  public Map<String, Object> importarMeppy(Map<String, Object> c) throws Exception {
    exigirAdmin();
    String pasta = c == null ? null : Json.s(c, "pasta");
    return importador.importar(java.nio.file.Path.of(pasta == null ? "../dados-meppy" : pasta), adminEmail.orElse(sessao.email()));
  }

  // ---------------- tutorial (edição: só admin) ----------------

  @GET
  @Path("plataforma/tutorial")
  public Map<String, Object> tutorialAdmin() {
    exigirAdmin();
    return Json.de("trilhas", db.lista("select * from crm_tutorial_trilhas order by ordem"), "passos", db.lista("select * from crm_tutorial_passos order by trilha, ordem"));
  }

  @POST
  @Path("plataforma/tutorial/trilhas")
  public Map<String, Object> salvarTrilha(Map<String, Object> c) {
    exigirAdmin();
    String chave = Formatos.slug(Erro.obrigatorio(c, "chave", "Chave")).replace('-', '_');
    return db.um("""
        insert into crm_tutorial_trilhas (chave, nome, descricao, icone, ordem, ativo) values (?, ?, ?, ?, ?, ?)
        on conflict (chave) do update set nome = excluded.nome, descricao = excluded.descricao, icone = excluded.icone, ordem = excluded.ordem, ativo = excluded.ativo returning *""",
        chave, Erro.obrigatorio(c, "nome", "Nome"), Json.s(c, "descricao"), Json.s(c, "icone"), Json.i(c, "ordem", 0), Json.b(c, "ativo", true));
  }

  @DELETE
  @Path("plataforma/tutorial/trilhas/{chave}")
  @Transactional
  public Map<String, Object> apagarTrilha(@PathParam("chave") String chave) {
    exigirAdmin();
    db.executa("delete from crm_tutorial_passos where trilha = ?", chave);
    db.executa("delete from crm_tutorial_trilhas where chave = ?", chave);
    return Map.of("ok", true);
  }

  @POST
  @Path("plataforma/tutorial/passos")
  public Map<String, Object> novoPasso(Map<String, Object> c) {
    exigirAdmin();
    return db.insere("crm_tutorial_passos", dadosPasso(c));
  }

  @PUT
  @Path("plataforma/tutorial/passos/{id}")
  public Map<String, Object> editarPasso(@PathParam("id") UUID id, Map<String, Object> c) {
    exigirAdmin();
    Map<String, Object> d = dadosPasso(c);
    d.put("updated_at", Instant.now());
    return db.um("update crm_tutorial_passos set trilha = ?, ordem = ?, titulo = ?, texto = ?, rota = ?, alvo = ?, posicao = ?, imagem_url = ?, video_url = ?, icone = ?, papeis = ?, ativo = ?, updated_at = now() where id = ? returning *",
        d.get("trilha"), d.get("ordem"), d.get("titulo"), d.get("texto"), d.get("rota"), d.get("alvo"), d.get("posicao"), d.get("imagem_url"), d.get("video_url"), d.get("icone"), d.get("papeis"), d.get("ativo"), id);
  }

  private static Map<String, Object> dadosPasso(Map<String, Object> c) {
    String pos = Json.s(c, "posicao", "bottom");
    Erro.exigir(List.of("top", "bottom", "left", "right", "center").contains(pos), "Posição inválida");
    return Json.de("trilha", Json.s(c, "trilha", "inicio"), "ordem", Json.i(c, "ordem", 0), "titulo", Erro.obrigatorio(c, "titulo", "Título"), "texto", Erro.obrigatorio(c, "texto", "Texto"),
        "rota", Json.s(c, "rota"), "alvo", Json.s(c, "alvo"), "posicao", pos, "imagem_url", Json.s(c, "imagemUrl"), "video_url", Json.s(c, "videoUrl"), "icone", Json.s(c, "icone"),
        "papeis", Db.texto(Json.ls(c, "papeis")), "ativo", Json.b(c, "ativo", true));
  }

  @DELETE
  @Path("plataforma/tutorial/passos/{id}")
  public Map<String, Object> apagarPasso(@PathParam("id") UUID id) {
    exigirAdmin();
    db.executa("delete from crm_tutorial_passos where id = ?", id);
    return Map.of("ok", true);
  }

  /** Reordena os passos de uma trilha. corpo: {ids:[...]} */
  @POST
  @Path("plataforma/tutorial/trilhas/{chave}/ordem")
  @Transactional
  public Map<String, Object> reordenar(@PathParam("chave") String chave, Map<String, Object> c) {
    exigirAdmin();
    int i = 0;
    for (String id : Json.ls(c, "ids")) db.executa("update crm_tutorial_passos set ordem = ? where id = ?::uuid and trilha = ?", i++, id, chave);
    return Map.of("ok", true);
  }

  // ---------------- tutorial (usuário comum: só ver e marcar progresso) ----------------

  @GET
  @Path("tutorial")
  public Map<String, Object> tutorial() {
    String papel = sessao.papel() == null ? "atendente" : sessao.papel();
    List<Map<String, Object>> passos = db.lista("""
        select id, trilha, ordem, titulo, texto, rota, alvo, posicao, imagem_url, video_url, icone from crm_tutorial_passos
        where ativo and (cardinality(papeis) = 0 or ? = any(papeis)) order by trilha, ordem""", papel);
    return Json.de("trilhas", db.lista("select chave, nome, descricao, icone from crm_tutorial_trilhas where ativo order by ordem"), "passos", passos,
        "progresso", db.lista("select trilha, passo, concluido_em, pulou from crm_tutorial_progresso where usuario_id = ?", sessao.usuario()));
  }

  /** corpo: {trilha, passo, concluido, pulou} */
  @PUT
  @Path("tutorial/progresso")
  public Map<String, Object> progresso(Map<String, Object> c) {
    db.executa("""
        insert into crm_tutorial_progresso (usuario_id, trilha, passo, concluido_em, pulou) values (?, ?, ?, case when ? then now() end, ?)
        on conflict (usuario_id, trilha) do update set passo = excluded.passo, concluido_em = coalesce(excluded.concluido_em, crm_tutorial_progresso.concluido_em),
          pulou = excluded.pulou, updated_at = now()""",
        sessao.usuario(), Erro.obrigatorio(c, "trilha", "Trilha"), Json.i(c, "passo", 0), Json.b(c, "concluido", false), Json.b(c, "pulou", false));
    return Map.of("ok", true);
  }

  @DELETE
  @Path("tutorial/progresso")
  public Map<String, Object> recomecar() {
    db.executa("delete from crm_tutorial_progresso where usuario_id = ?", sessao.usuario());
    return Map.of("ok", true);
  }
}
