package br.com.clienteplus.crm.agenda;

import br.com.clienteplus.crm.atendimento.Atendimento;
import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.comum.Cripto;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.comum.Limitador;
import io.vertx.core.http.HttpServerRequest;
import jakarta.inject.Inject;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/** Agenda: configuração, serviços, profissionais, bloqueios, eventos, comissões, formulários, prontuário e página pública. */
@Path("/")
public class AgendaResource {

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject Agenda agenda;
  @Inject Atendimento atendimento;
  @Inject Limitador limitador;
  @Context HttpServerRequest req;
  @ConfigProperty(name = "crm.url-publica") String urlPublica;

  @GET
  @Path("agenda/config")
  public Map<String, Object> config() {
    UUID loja = sessao.loja();
    db.executa("insert into crm_agenda_config (store_id) values (?) on conflict do nothing", loja);
    Map<String, Object> c = db.um("select * from crm_agenda_config where store_id = ?", loja);
    if (c.get("paginaSlug") != null) c.put("linkPublico", urlPublica.replaceAll("/+$", "") + "/agendar/" + c.get("paginaSlug"));
    return c;
  }

  @PUT
  @Path("agenda/config")
  public Map<String, Object> salvarConfig(Map<String, Object> c) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    String slug = Json.s(c, "paginaSlug");
    if (slug != null && !slug.isBlank()) {
      slug = Formatos.slug(slug);
      if (db.numero("select count(*) from crm_agenda_config where pagina_slug = ? and store_id <> ?", slug, loja) > 0) throw Erro.conflito("Este endereço já está em uso");
    } else slug = null;
    db.executa("""
        update crm_agenda_config set fuso = ?, pagina_ativa = ?, pagina_slug = ?, pagina_titulo = ?, pagina_descricao = ?, lembrete_24h = ?, lembrete_2h = ?,
          mensagem_24h = ?, mensagem_2h = ?, antecedencia_minima_horas = ?, dias_maximos_frente = ?, modo = ?, google_ical_url = ?, updated_at = now() where store_id = ?""",
        Json.s(c, "fuso", "America/Sao_Paulo"), Json.b(c, "paginaAtiva", false), slug, Json.s(c, "paginaTitulo"), Json.s(c, "paginaDescricao"),
        Json.b(c, "lembrete24h", true), Json.b(c, "lembrete2h", true), Json.s(c, "mensagem24h", ""), Json.s(c, "mensagem2h", ""),
        Json.i(c, "antecedenciaMinimaHoras", 2), Json.i(c, "diasMaximosFrente", 30), Json.s(c, "modo", "general"), Json.s(c, "googleIcalUrl"), loja);
    return config();
  }

  // ---------------- cadastros ----------------

  @GET
  @Path("agenda/cadastros")
  public Map<String, Object> cadastros() {
    UUID loja = sessao.loja();
    return Json.de("tipos", db.lista("select * from crm_agenda_tipos where store_id = ? order by nome", loja),
        "categorias", db.lista("select * from crm_agenda_categorias where store_id = ? order by nome", loja),
        "colaboradores", db.lista("select * from crm_agenda_colaboradores where store_id = ? order by nome", loja),
        "formularios", db.lista("select * from crm_formularios where store_id = ? order by tipo, nome", loja));
  }

  @POST
  @Path("agenda/tipos")
  public Map<String, Object> novoTipo(Map<String, Object> c) {
    Map<String, Object> d = dadosTipo(c);
    d.put("store_id", sessao.loja());
    return db.insere("crm_agenda_tipos", d);
  }

  @PUT
  @Path("agenda/tipos/{id}")
  public Map<String, Object> editarTipo(@PathParam("id") UUID id, Map<String, Object> c) {
    return db.atualiza("crm_agenda_tipos", id, sessao.loja(), dadosTipo(c));
  }

  private static Map<String, Object> dadosTipo(Map<String, Object> c) {
    return Json.de("nome", Erro.obrigatorio(c, "nome", "Nome"), "descricao", Json.s(c, "descricao"), "categoria_id", Formatos.uuid(c.get("categoriaId")),
        "duracao_min", Math.max(5, Json.i(c, "duracaoMin", 60)), "intervalo_min", Json.i(c, "intervaloMin", 0), "preco", Json.d(c, "preco", 0),
        "cor", Json.s(c, "cor", "#a053fd"), "local_tipo", Json.s(c, "localTipo", "presencial"), "local", Json.s(c, "local"), "ativo", Json.b(c, "ativo", true),
        "publico", Json.b(c, "publico", true), "ia_pode_agendar", Json.b(c, "iaPodeAgendar", true), "formulario_id", Formatos.uuid(c.get("formularioId")),
        "colaboradores", Db.uuids(Json.ls(c, "colaboradores").stream().map(UUID::fromString).toList()));
  }

  @DELETE
  @Path("agenda/tipos/{id}")
  public Map<String, Object> apagarTipo(@PathParam("id") UUID id) {
    db.executa("update crm_agenda_tipos set ativo = false where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  @POST
  @Path("agenda/categorias")
  public Map<String, Object> novaCategoria(Map<String, Object> c) {
    return db.insere("crm_agenda_categorias", Json.de("store_id", sessao.loja(), "nome", Erro.obrigatorio(c, "nome", "Nome"), "cor", Json.s(c, "cor", "#a053fd")));
  }

  @DELETE
  @Path("agenda/categorias/{id}")
  public Map<String, Object> apagarCategoria(@PathParam("id") UUID id) {
    db.executa("delete from crm_agenda_categorias where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  @POST
  @Path("agenda/colaboradores")
  public Map<String, Object> novoColaborador(Map<String, Object> c) {
    Map<String, Object> d = dadosColab(c);
    d.put("store_id", sessao.loja());
    return db.insere("crm_agenda_colaboradores", d);
  }

  @PUT
  @Path("agenda/colaboradores/{id}")
  public Map<String, Object> editarColaborador(@PathParam("id") UUID id, Map<String, Object> c) {
    return db.atualiza("crm_agenda_colaboradores", id, sessao.loja(), dadosColab(c));
  }

  private static Map<String, Object> dadosColab(Map<String, Object> c) {
    return Json.de("nome", Erro.obrigatorio(c, "nome", "Nome"), "email", Json.s(c, "email"), "telefone", Formatos.telefone(Json.s(c, "telefone")),
        "cor", Json.s(c, "cor", "#a053fd"), "foto_url", Json.s(c, "fotoUrl"), "comissao_percentual", Json.d(c, "comissaoPercentual", 0),
        "horarios", Json.m(c.get("horarios")), "usuario_id", Formatos.uuid(c.get("usuarioId")), "ativo", Json.b(c, "ativo", true));
  }

  @DELETE
  @Path("agenda/colaboradores/{id}")
  public Map<String, Object> apagarColaborador(@PathParam("id") UUID id) {
    db.executa("update crm_agenda_colaboradores set ativo = false where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  @GET
  @Path("agenda/bloqueios")
  public List<Map<String, Object>> bloqueios() {
    return db.lista("select b.*, c.nome as colaborador_nome from crm_agenda_bloqueios b left join crm_agenda_colaboradores c on c.id = b.colaborador_id where b.store_id = ? and b.fim > now() - interval '30' day order by b.inicio", sessao.loja());
  }

  @POST
  @Path("agenda/bloqueios")
  public Map<String, Object> novoBloqueio(Map<String, Object> c) {
    Instant ini = Formatos.instante(c.get("inicio")), fim = Formatos.instante(c.get("fim"));
    Erro.exigir(ini != null && fim != null && fim.isAfter(ini), "Período inválido");
    return db.insere("crm_agenda_bloqueios", Json.de("store_id", sessao.loja(), "colaborador_id", Formatos.uuid(c.get("colaboradorId")), "inicio", ini, "fim", fim, "motivo", Json.s(c, "motivo")));
  }

  @DELETE
  @Path("agenda/bloqueios/{id}")
  public Map<String, Object> apagarBloqueio(@PathParam("id") UUID id) {
    db.executa("delete from crm_agenda_bloqueios where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  // ---------------- eventos ----------------

  @GET
  @Path("agenda/eventos")
  public List<Map<String, Object>> eventos(@QueryParam("de") String de, @QueryParam("ate") String ate, @QueryParam("colaborador") UUID colaborador) {
    Instant a = de == null ? Instant.now().minusSeconds(86400L * 31) : Formatos.instante(de);
    Instant b = ate == null ? Instant.now().plusSeconds(86400L * 62) : Formatos.instante(ate);
    return db.lista("""
        select e.*, t.nome as tipo_nome, t.cor as tipo_cor, c.nome as colaborador_nome, c.cor as colaborador_cor, ct.nome as contato_nome, ct.telefone as contato_telefone
        from crm_agenda_eventos e left join crm_agenda_tipos t on t.id = e.tipo_id left join crm_agenda_colaboradores c on c.id = e.colaborador_id
        left join crm_contatos ct on ct.id = e.contato_id
        where e.store_id = ? and e.inicio < ? and e.fim > ? and (?::uuid is null or e.colaborador_id = ?) order by e.inicio""", sessao.loja(), b, a, colaborador, colaborador);
  }

  @GET
  @Path("agenda/vagas")
  public List<Map<String, Object>> vagas(@QueryParam("tipo") UUID tipo, @QueryParam("colaborador") UUID colaborador, @QueryParam("dia") String dia) {
    return agenda.vagas(sessao.loja(), tipo, colaborador, LocalDate.parse(dia));
  }

  @POST
  @Path("agenda/eventos")
  public Map<String, Object> novoEvento(Map<String, Object> c) {
    Map<String, Object> d = new java.util.LinkedHashMap<>(c);
    if (d.get("contatoId") == null && Json.s(c, "telefone") != null)
      d.put("contatoId", atendimento.contatoPorTelefone(sessao.loja(), Json.s(c, "telefone"), Json.s(c, "nome"), null, "agenda").id().toString());
    return agenda.marcar(sessao.loja(), d, "manual");
  }

  @PUT
  @Path("agenda/eventos/{id}")
  public Map<String, Object> editarEvento(@PathParam("id") UUID id, Map<String, Object> c) {
    UUID loja = sessao.loja();
    Map<String, Object> e = db.obrigatorio("Agendamento", "select * from crm_agenda_eventos where id = ? and store_id = ?", id, loja);
    Instant ini = c.get("inicio") != null ? Formatos.instante(c.get("inicio")) : Instant.parse((String) e.get("inicio"));
    Instant fim = c.get("fim") != null ? Formatos.instante(c.get("fim")) : Instant.parse((String) e.get("fim"));
    UUID col = c.containsKey("colaboradorId") ? Formatos.uuid(c.get("colaboradorId")) : Formatos.uuid(e.get("colaboradorId"));
    if ((c.get("inicio") != null || c.containsKey("colaboradorId")) && agenda.conflito(loja, col, ini, fim, id)) throw Erro.conflito("Este horário já está ocupado");
    String status = Json.s(c, "status", (String) e.get("status"));
    Map<String, Object> campos = Json.de("titulo", Json.s(c, "titulo", (String) e.get("titulo")), "inicio", ini, "fim", fim, "colaborador_id", col, "status", status,
        "valor", c.get("valor") == null ? Json.d(e, "valor", 0) : Json.d(c, "valor", 0), "pago", Json.b(c, "pago", Json.b(e, "pago", false)),
        "forma_pagamento", Json.s(c, "formaPagamento", (String) e.get("formaPagamento")), "notas", Json.s(c, "notas", (String) e.get("notas")), "updated_at", Instant.now());
    if ("canceled".equals(status)) campos.put("cancelado_motivo", Json.s(c, "motivo"));
    Map<String, Object> r = db.atualiza("crm_agenda_eventos", id, loja, campos);
    // atendimento concluído e pago vira compra (aparece no histórico e nas vendas)
    if (Json.b(r, "pago", false) && !Json.b(e, "pago", false) && r.get("contatoId") != null)
      db.executa("""
          insert into crm_compras (store_id, contato_id, plataforma, pedido_id, produto, valor, status, forma_pagamento) values (?, ?::uuid, 'agenda', ?, ?, ?, 'approved', ?)
          on conflict (store_id, plataforma, pedido_id) do nothing""", loja, r.get("contatoId"), "AG" + id, r.get("titulo"), Json.d(r, "valor", 0), r.get("formaPagamento"));
    return r;
  }

  @DELETE
  @Path("agenda/eventos/{id}")
  public Map<String, Object> cancelarEvento(@PathParam("id") UUID id, @QueryParam("motivo") String motivo) {
    agenda.cancelar(sessao.loja(), id, motivo);
    return Map.of("ok", true);
  }

  /** Comissões dos profissionais: atendimentos pagos no período. */
  @GET
  @Path("agenda/comissoes")
  public List<Map<String, Object>> comissoes(@QueryParam("mes") String mes) {
    LocalDate m = mes == null ? LocalDate.now().withDayOfMonth(1) : LocalDate.parse(mes + "-01");
    return db.lista("""
        select c.id, c.nome, count(e.id) as atendimentos, coalesce(sum(e.valor),0) as faturado,
          coalesce(sum(e.valor * coalesce(e.comissao_percentual, c.comissao_percentual) / 100),0) as comissao,
          coalesce(sum(e.valor * coalesce(e.comissao_percentual, c.comissao_percentual) / 100) filter (where e.comissao_paga_em is not null),0) as paga
        from crm_agenda_colaboradores c left join crm_agenda_eventos e on e.colaborador_id = c.id and e.pago and e.status <> 'canceled'
          and e.inicio >= ? and e.inicio < ?::date + interval '1' month
        where c.store_id = ? group by c.id, c.nome order by c.nome""", m, m, sessao.loja());
  }

  @POST
  @Path("agenda/comissoes/{colaborador}/pagar")
  public Map<String, Object> pagarComissao(@PathParam("colaborador") UUID colaborador, Map<String, Object> c) {
    sessao.exigir("admin");
    LocalDate m = LocalDate.parse(Erro.obrigatorio(c, "mes", "Mês") + "-01");
    int n = db.executa("update crm_agenda_eventos set comissao_paga_em = now() where store_id = ? and colaborador_id = ? and pago and comissao_paga_em is null and inicio >= ? and inicio < ?::date + interval '1' month",
        sessao.loja(), colaborador, m, m);
    return Map.of("atendimentos", n);
  }

  @GET
  @Path("agenda/relatorio")
  public Map<String, Object> relatorio(@QueryParam("dias") Integer dias) {
    int d = dias == null ? 30 : dias;
    UUID loja = sessao.loja();
    return Json.de("resumo", db.um("""
        select count(*) as total, count(*) filter (where status = 'done') as realizados, count(*) filter (where status = 'canceled') as cancelados,
          count(*) filter (where status = 'no_show') as faltas, coalesce(sum(valor) filter (where pago),0) as faturado, count(*) filter (where origem = 'ia') as pela_ia
        from crm_agenda_eventos where store_id = ? and inicio > now() - (? || ' days')::interval and inicio < now()""", loja, String.valueOf(d)),
        "porServico", db.lista("select coalesce(t.nome,'Outros') as servico, count(*) as total, coalesce(sum(e.valor) filter (where e.pago),0) as faturado from crm_agenda_eventos e left join crm_agenda_tipos t on t.id = e.tipo_id where e.store_id = ? and e.inicio > now() - (? || ' days')::interval group by 1 order by 2 desc", loja, String.valueOf(d)));
  }

  // ---------------- formulários e prontuário ----------------

  @POST
  @Path("agenda/formularios")
  public Map<String, Object> novoFormulario(Map<String, Object> c) {
    String tipo = Json.s(c, "tipo", "anamnese");
    Erro.exigir(List.of("anamnese", "consentimento", "nota").contains(tipo), "Tipo inválido");
    return db.insere("crm_formularios", Json.de("store_id", sessao.loja(), "tipo", tipo, "nome", Erro.obrigatorio(c, "nome", "Nome"), "conteudo", Json.m(c.get("conteudo"))));
  }

  @PUT
  @Path("agenda/formularios/{id}")
  public Map<String, Object> editarFormulario(@PathParam("id") UUID id, Map<String, Object> c) {
    return db.atualiza("crm_formularios", id, sessao.loja(), Json.de("nome", Erro.obrigatorio(c, "nome", "Nome"), "conteudo", Json.m(c.get("conteudo")), "ativo", Json.b(c, "ativo", true)));
  }

  @DELETE
  @Path("agenda/formularios/{id}")
  public Map<String, Object> apagarFormulario(@PathParam("id") UUID id) {
    db.executa("update crm_formularios set ativo = false where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  /** Gera o link para o cliente preencher/assinar. corpo: {formularioId, contatoId, eventoId?} */
  @POST
  @Path("agenda/formularios/enviar")
  public Map<String, Object> enviarFormulario(Map<String, Object> c) {
    UUID loja = sessao.loja();
    UUID form = Formatos.uuid(c.get("formularioId"));
    db.obrigatorio("Formulário", "select id from crm_formularios where id = ? and store_id = ?", form, loja);
    String token = Cripto.tokenAleatorio(18);
    db.insere("crm_formulario_respostas", Json.de("store_id", loja, "formulario_id", form, "contato_id", Formatos.uuid(c.get("contatoId")), "evento_id", Formatos.uuid(c.get("eventoId")), "token", token));
    return Json.de("link", urlPublica.replaceAll("/+$", "") + "/formulario/" + token);
  }

  @GET
  @Path("agenda/prontuario/{contatoId}")
  public Map<String, Object> prontuario(@PathParam("contatoId") UUID contato) {
    UUID loja = sessao.loja();
    return Json.de("registros", db.lista("select p.*, c.nome as colaborador_nome from crm_prontuarios p left join crm_agenda_colaboradores c on c.id = p.colaborador_id where p.contato_id = ? and p.store_id = ? order by p.created_at desc", contato, loja),
        "formularios", db.lista("select r.*, f.nome, f.tipo from crm_formulario_respostas r join crm_formularios f on f.id = r.formulario_id where r.contato_id = ? and r.store_id = ? order by r.created_at desc", contato, loja));
  }

  @POST
  @Path("agenda/prontuario/{contatoId}")
  public Map<String, Object> novoRegistro(@PathParam("contatoId") UUID contato, Map<String, Object> c) {
    UUID loja = sessao.loja();
    db.obrigatorio("Contato", "select id from crm_contatos where id = ? and store_id = ?", contato, loja);
    return db.insere("crm_prontuarios", Json.de("store_id", loja, "contato_id", contato, "evento_id", Formatos.uuid(c.get("eventoId")), "colaborador_id", Formatos.uuid(c.get("colaboradorId")),
        "texto", Json.s(c, "texto"), "fotos", Json.l(c.get("fotos"))));
  }

  // ---------------- público ----------------

  @GET
  @Path("publico/agendar/{slug}")
  public Map<String, Object> paginaAgendar(@PathParam("slug") String slug) {
    Map<String, Object> c = db.um("select * from crm_agenda_config where pagina_slug = ? and pagina_ativa", slug);
    if (c == null) throw Erro.naoEncontrado("Página de agendamento não encontrada");
    UUID loja = UUID.fromString((String) c.get("storeId"));
    return Json.de("loja", db.valor("select nome from crm_lojas where id = ?", loja), "titulo", c.get("paginaTitulo"), "descricao", c.get("paginaDescricao"),
        "servicos", db.lista("select id, nome, descricao, duracao_min, preco, cor, local_tipo, local, colaboradores from crm_agenda_tipos where store_id = ? and ativo and publico order by nome", loja),
        "profissionais", db.lista("select id, nome, foto_url, cor from crm_agenda_colaboradores where store_id = ? and ativo order by nome", loja));
  }

  @GET
  @Path("publico/agendar/{slug}/vagas")
  public List<Map<String, Object>> vagasPublicas(@PathParam("slug") String slug, @QueryParam("tipo") UUID tipo, @QueryParam("colaborador") UUID colaborador, @QueryParam("dia") String dia) {
    limitador.conferir("agendar-vagas:" + ip(), 120, 60);
    Map<String, Object> c = db.um("select store_id from crm_agenda_config where pagina_slug = ? and pagina_ativa", slug);
    if (c == null) throw Erro.naoEncontrado("Página não encontrada");
    UUID loja = UUID.fromString((String) c.get("storeId"));
    db.obrigatorio("Serviço", "select id from crm_agenda_tipos where id = ? and store_id = ? and publico and ativo", tipo, loja);
    return agenda.vagas(loja, tipo, colaborador, LocalDate.parse(dia));
  }

  /** corpo: {tipoId, colaboradorId?, inicio, nome, telefone, observacao?} */
  @POST
  @Path("publico/agendar/{slug}")
  public Map<String, Object> agendarPublico(@PathParam("slug") String slug, Map<String, Object> corpo) {
    limitador.conferir("agendar:" + ip(), 10, 600);
    Map<String, Object> c = db.um("select store_id from crm_agenda_config where pagina_slug = ? and pagina_ativa", slug);
    if (c == null) throw Erro.naoEncontrado("Página não encontrada");
    UUID loja = UUID.fromString((String) c.get("storeId"));
    UUID tipo = Formatos.uuid(corpo.get("tipoId"));
    db.obrigatorio("Serviço", "select id from crm_agenda_tipos where id = ? and store_id = ? and publico and ativo", tipo, loja);
    var ct = atendimento.contatoPorTelefone(loja, Erro.obrigatorio(corpo, "telefone", "WhatsApp"), Erro.obrigatorio(corpo, "nome", "Nome"), null, "agenda");
    Map<String, Object> e = agenda.marcar(loja, Json.de("tipoId", tipo, "colaboradorId", corpo.get("colaboradorId"), "inicio", corpo.get("inicio"),
        "contatoId", ct.id().toString(), "notas", Json.s(corpo, "observacao")), "publico");
    atendimento.notificarEquipe(loja, "agenda", "Novo agendamento pela página", e.get("titulo") + " — " + Formatos.dataHora(Instant.parse((String) e.get("inicio"))), "/agenda");
    return Json.de("ok", true, "inicio", e.get("inicio"), "titulo", e.get("titulo"));
  }

  @GET
  @Path("publico/formularios/{token}")
  public Map<String, Object> formularioPublico(@PathParam("token") String token) {
    Map<String, Object> r = db.obrigatorio("Formulário", """
        select r.assinado_em, f.nome, f.tipo, f.conteudo, l.nome as loja, ct.nome as contato_nome from crm_formulario_respostas r
        join crm_formularios f on f.id = r.formulario_id join crm_lojas l on l.id = r.store_id left join crm_contatos ct on ct.id = r.contato_id where r.token = ?""", token);
    return r;
  }

  @POST
  @Path("publico/formularios/{token}")
  public Map<String, Object> responderFormulario(@PathParam("token") String token, Map<String, Object> corpo) {
    limitador.conferir("form:" + ip(), 20, 600);
    Map<String, Object> r = db.obrigatorio("Formulário", "select id, assinado_em from crm_formulario_respostas where token = ?", token);
    Erro.exigir(r.get("assinadoEm") == null, "Este formulário já foi respondido");
    db.executa("update crm_formulario_respostas set respostas = ?::jsonb, assinatura_nome = ?, assinado_em = now(), ip = ? where token = ?",
        Json.m(corpo.get("respostas")), Erro.obrigatorio(corpo, "assinatura", "Nome para assinatura"), ip(), token);
    return Map.of("ok", true);
  }

  private String ip() {
    return req == null || req.remoteAddress() == null ? "?" : req.remoteAddress().hostAddress();
  }
}
