package br.com.clienteplus.crm.atendimento;

import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Hub;
import br.com.clienteplus.crm.comum.Json;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Response;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Contatos, tags, campos personalizados e memórias. */
@Path("/contatos")
public class ContatosResource {

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject Atendimento atendimento;
  @Inject Hub hub;

  private record Filtro(String where, List<Object> params) {}

  private Filtro filtro(String busca, String tag, String origem, UUID conexao, String semTag) {
    List<Object> p = new ArrayList<>();
    StringBuilder w = new StringBuilder(" where c.store_id = ?");
    p.add(sessao.loja());
    if (busca != null && !busca.isBlank()) {
      String b = "%" + busca.trim().toLowerCase() + "%";
      String d = busca.replaceAll("\\D", "");
      w.append(" and (lower(coalesce(c.nome,'')) like ? or lower(coalesce(c.email,'')) like ? or lower(coalesce(c.instagram_usuario,'')) like ?");
      p.add(b); p.add(b); p.add(b);
      if (!d.isEmpty()) { w.append(" or c.telefone like ?"); p.add("%" + d + "%"); }
      w.append(")");
    }
    if (tag != null && !tag.isBlank()) { w.append(" and ? = any(c.tags)"); p.add(tag); }
    if (semTag != null && !semTag.isBlank()) { w.append(" and not (? = any(c.tags))"); p.add(semTag); }
    if (origem != null && !origem.isBlank()) { w.append(" and c.origem = ?"); p.add(origem); }
    if (conexao != null) { w.append(" and c.conexao_id = ?"); p.add(conexao); }
    return new Filtro(w.toString(), p);
  }

  @GET
  public Map<String, Object> listar(@QueryParam("busca") String busca, @QueryParam("tag") String tag, @QueryParam("semTag") String semTag,
      @QueryParam("origem") String origem, @QueryParam("conexao") UUID conexao, @QueryParam("pagina") Integer pagina, @QueryParam("limite") Integer limite,
      @QueryParam("ordem") String ordem) {
    Filtro f = filtro(busca, tag, origem, conexao, semTag);
    int lim = Math.min(200, limite == null ? 50 : limite);
    int pg = Math.max(1, pagina == null ? 1 : pagina);
    long total = db.numero("select count(*) from crm_contatos c" + f.where(), f.params().toArray());
    String ord = switch (ordem == null ? "" : ordem) {
      case "nome" -> "lower(coalesce(c.nome,'zzz'))";
      case "antigos" -> "c.created_at";
      case "mensagens" -> "c.total_mensagens desc";
      default -> "c.ultimo_contato_em desc nulls last";
    };
    List<Object> p = new ArrayList<>(f.params());
    p.add(lim);
    p.add((pg - 1) * lim);
    List<Map<String, Object>> itens = db.lista("""
        select c.*, cx.nome as conexao_nome,
          (select id from crm_conversas v where v.contato_id = c.id order by ultima_mensagem_em desc nulls last limit 1) as conversa_id
        from crm_contatos c left join crm_conexoes cx on cx.id = c.conexao_id""" + f.where() + " order by " + ord + " limit ? offset ?", p.toArray());
    return Json.de("itens", itens, "total", total, "pagina", pg, "limite", lim);
  }

  @GET
  @Path("/{id}")
  public Map<String, Object> obter(@PathParam("id") UUID id) {
    UUID loja = sessao.loja();
    Map<String, Object> c = db.obrigatorio("Contato", "select * from crm_contatos where id = ? and store_id = ?", id, loja);
    c.put("memorias", db.lista("select * from crm_memorias where contato_id = ? order by updated_at desc", id));
    c.put("conversas", db.lista("select id, canal, status, ultima_mensagem, ultima_mensagem_em, atribuida_a from crm_conversas where contato_id = ? order by ultima_mensagem_em desc nulls last", id));
    c.put("negocios", db.lista("select n.id, n.titulo, n.valor, n.score_ia, n.ganho_em, n.perdido_em, e.nome as etapa_nome, e.cor as etapa_cor, f.nome as funil_nome from crm_negocios n join crm_etapas e on e.id = n.etapa_id join crm_funis f on f.id = n.funil_id where n.contato_id = ? order by n.created_at desc", id));
    c.put("compras", db.lista("select * from crm_compras where contato_id = ? order by comprado_em desc", id));
    c.put("pedidos", db.lista("select id, numero, status, total, created_at from crm_pedidos where contato_id = ? order by created_at desc", id));
    c.put("agendamentos", db.lista("select id, titulo, inicio, status from crm_agenda_eventos where contato_id = ? order by inicio desc limit 20", id));
    c.put("nps", db.lista("select nota, comentario, respondida_em from crm_nps where contato_id = ? and status = 'respondida' order by respondida_em desc", id));
    return c;
  }

  @POST
  public Map<String, Object> criar(Map<String, Object> corpo) {
    UUID loja = sessao.loja();
    String tel = Formatos.telefone(Json.s(corpo, "telefone"));
    Erro.exigir(tel != null || Json.s(corpo, "email") != null, "Informe telefone ou e-mail");
    if (tel != null && db.numero("select count(*) from crm_contatos where store_id = ? and telefone = any(?)", loja, new Db.Arr("text", Formatos.variacoesTelefone(tel))) > 0)
      throw Erro.conflito("Já existe um contato com este telefone");
    Map<String, Object> c = db.insere("crm_contatos", Json.de("store_id", loja, "telefone", tel, "nome", Json.s(corpo, "nome"), "email", Json.s(corpo, "email"),
        "notas", Json.s(corpo, "notas"), "origem", Json.s(corpo, "origem", "manual"), "tags", Db.texto(Json.ls(corpo, "tags")), "campos", Json.m(corpo.get("campos")),
        "aniversario", data(Json.s(corpo, "aniversario")), "primeiro_contato_em", java.time.Instant.now()));
    for (String t : Json.ls(corpo, "tags")) db.executa("insert into crm_tags (store_id, nome) values (?, ?) on conflict do nothing", loja, t);
    return c;
  }

  @PUT
  @Path("/{id}")
  public Map<String, Object> atualizar(@PathParam("id") UUID id, Map<String, Object> corpo) {
    UUID loja = sessao.loja();
    db.obrigatorio("Contato", "select id from crm_contatos where id = ? and store_id = ?", id, loja);
    Map<String, Object> campos = new LinkedHashMap<>();
    if (corpo.containsKey("nome")) campos.put("nome", Json.s(corpo, "nome"));
    if (corpo.containsKey("email")) campos.put("email", Json.s(corpo, "email"));
    if (corpo.containsKey("telefone")) campos.put("telefone", Formatos.telefone(Json.s(corpo, "telefone")));
    if (corpo.containsKey("notas")) campos.put("notas", Json.s(corpo, "notas"));
    if (corpo.containsKey("campos")) campos.put("campos", Json.m(corpo.get("campos")));
    if (corpo.containsKey("aniversario")) campos.put("aniversario", data(Json.s(corpo, "aniversario")));
    if (corpo.containsKey("optOut")) campos.put("opt_out", Json.b(corpo, "optOut", false));
    if (corpo.containsKey("bloqueado")) campos.put("bloqueado", Json.b(corpo, "bloqueado", false));
    campos.put("updated_at", java.time.Instant.now());
    Map<String, Object> c = db.atualiza("crm_contatos", id, loja, campos);
    if (corpo.containsKey("tags")) {
      List<String> novas = Json.ls(corpo, "tags"), atuais = Json.ls(c, "tags");
      for (String t : novas) if (!atuais.contains(t)) atendimento.adicionarTag(loja, id, null, t);
      for (String t : atuais) if (!novas.contains(t)) atendimento.removerTag(loja, id, null, t);
    }
    hub.emitir(loja, "contato", Map.of("id", id));
    return db.um("select * from crm_contatos where id = ?", id);
  }

  @DELETE
  @Path("/{id}")
  public Map<String, Object> apagar(@PathParam("id") UUID id) {
    sessao.exigir("admin");
    db.executa("delete from crm_contatos where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  @POST
  @Path("/apagar-varios")
  public Map<String, Object> apagarVarios(Map<String, Object> corpo) {
    sessao.exigir("admin");
    List<UUID> ids = Json.ls(corpo, "ids").stream().map(UUID::fromString).toList();
    int n = db.executa("delete from crm_contatos where store_id = ? and id = any(?)", sessao.loja(), Db.uuids(ids));
    return Map.of("apagados", n);
  }

  /** {ids, adicionar:[], remover:[]} */
  @POST
  @Path("/tags-em-massa")
  public Map<String, Object> tagsEmMassa(Map<String, Object> corpo) {
    UUID loja = sessao.loja();
    List<String> ids = Json.ls(corpo, "ids");
    for (String i : ids) {
      UUID id = UUID.fromString(i);
      for (String t : Json.ls(corpo, "adicionar")) atendimento.adicionarTag(loja, id, null, t);
      for (String t : Json.ls(corpo, "remover")) atendimento.removerTag(loja, id, null, t);
    }
    return Map.of("ok", true, "contatos", ids.size());
  }

  /** Importa CSV (texto). Colunas reconhecidas: nome, telefone, email, tags (separadas por |), aniversario, notas, e demais viram campos. */
  @POST
  @Path("/importar")
  @Transactional
  public Map<String, Object> importar(Map<String, Object> corpo) {
    UUID loja = sessao.loja();
    String csv = Erro.obrigatorio(corpo, "csv", "Arquivo");
    List<String> tagsExtra = Json.ls(corpo, "tags");
    String[] linhas = csv.replace("﻿", "").split("\\r?\\n");
    Erro.exigir(linhas.length > 1, "O arquivo está vazio");
    char sep = linhas[0].contains(";") ? ';' : ',';
    List<String> cab = csvLinha(linhas[0], sep).stream().map(s -> Formatos.semAcento(s).toLowerCase().trim()).toList();
    int criados = 0, atualizados = 0, ignorados = 0;
    for (int i = 1; i < linhas.length; i++) {
      if (linhas[i].isBlank()) continue;
      List<String> v = csvLinha(linhas[i], sep);
      Map<String, String> r = new LinkedHashMap<>();
      for (int j = 0; j < cab.size() && j < v.size(); j++) r.put(cab.get(j), v.get(j).trim());
      String tel = Formatos.telefone(r.getOrDefault("telefone", r.getOrDefault("celular", r.getOrDefault("whatsapp", r.get("phone")))));
      if (tel == null) { ignorados++; continue; }
      List<String> tags = new ArrayList<>(tagsExtra);
      if (r.get("tags") != null) for (String t : r.get("tags").split("[|,]")) if (!t.isBlank()) tags.add(t.trim());
      Map<String, Object> campos = new LinkedHashMap<>();
      for (var e : r.entrySet()) if (!List.of("nome", "name", "telefone", "celular", "whatsapp", "phone", "email", "tags", "aniversario", "notas").contains(e.getKey()) && !e.getValue().isBlank()) campos.put(e.getKey(), e.getValue());
      Map<String, Object> existente = db.um("select id from crm_contatos where store_id = ? and telefone = any(?)", loja, new Db.Arr("text", Formatos.variacoesTelefone(tel)));
      String nome = r.getOrDefault("nome", r.get("name"));
      if (existente == null) {
        db.executa("insert into crm_contatos (store_id, telefone, nome, email, tags, campos, notas, origem, aniversario) values (?, ?, ?, ?, ?, ?::jsonb, ?, 'importacao', ?)",
            loja, tel, nome, r.get("email"), Db.texto(tags), campos, r.get("notas"), data(r.get("aniversario")));
        criados++;
      } else {
        db.executa("""
            update crm_contatos set nome = coalesce(nullif(nome,''), ?), email = coalesce(email, ?), campos = campos || ?::jsonb,
              tags = (select array(select distinct unnest(tags || ?::text[]))), updated_at = now() where id = ?::uuid""",
            nome, r.get("email"), campos, Db.texto(tags), existente.get("id"));
        atualizados++;
      }
      for (String t : tags) db.executa("insert into crm_tags (store_id, nome) values (?, ?) on conflict do nothing", loja, t);
    }
    return Json.de("criados", criados, "atualizados", atualizados, "ignorados", ignorados);
  }

  @GET
  @Path("/exportar")
  @Produces("text/csv")
  public Response exportar(@QueryParam("busca") String busca, @QueryParam("tag") String tag, @QueryParam("origem") String origem) {
    sessao.exigir("supervisor");
    Filtro f = filtro(busca, tag, origem, null, null);
    StringBuilder sb = new StringBuilder("﻿nome;telefone;email;tags;origem;mensagens;primeiro contato;último contato;aniversário;notas\n");
    for (Map<String, Object> c : db.lista("select * from crm_contatos c" + f.where() + " order by c.created_at", f.params().toArray()))
      sb.append(csv(c.get("nome"))).append(';').append(csv(c.get("telefone"))).append(';').append(csv(c.get("email"))).append(';')
          .append(csv(String.join("|", Json.ls(c, "tags")))).append(';').append(csv(c.get("origem"))).append(';').append(c.get("totalMensagens")).append(';')
          .append(csv(c.get("primeiroContatoEm"))).append(';').append(csv(c.get("ultimoContatoEm"))).append(';').append(csv(c.get("aniversario"))).append(';').append(csv(c.get("notas"))).append('\n');
    return Response.ok(sb.toString().getBytes(StandardCharsets.UTF_8)).header("Content-Disposition", "attachment; filename=\"contatos.csv\"").build();
  }

  // ---------------- memórias ----------------

  @POST
  @Path("/{id}/memorias")
  public Map<String, Object> novaMemoria(@PathParam("id") UUID id, Map<String, Object> corpo) {
    UUID loja = sessao.loja();
    db.obrigatorio("Contato", "select id from crm_contatos where id = ? and store_id = ?", id, loja);
    return db.insere("crm_memorias", Json.de("store_id", loja, "contato_id", id, "fato", Erro.obrigatorio(corpo, "fato", "Fato"), "categoria", Json.s(corpo, "categoria", "outro"), "fonte", "humano"));
  }

  @DELETE
  @Path("/{id}/memorias/{mid}")
  public Map<String, Object> apagarMemoria(@PathParam("id") UUID id, @PathParam("mid") UUID mid) {
    db.executa("delete from crm_memorias where id = ? and contato_id = ? and store_id = ?", mid, id, sessao.loja());
    return Map.of("ok", true);
  }

  // ---------------- tags ----------------

  @GET
  @Path("/tags")
  public List<Map<String, Object>> tags() {
    return db.lista("""
        select t.*, (select count(*) from crm_contatos c where c.store_id = t.store_id and t.nome = any(c.tags)) as contatos
        from crm_tags t where t.store_id = ? order by t.nome""", sessao.loja());
  }

  @POST
  @Path("/tags")
  public Map<String, Object> novaTag(Map<String, Object> corpo) {
    return db.insere("crm_tags", Json.de("store_id", sessao.loja(), "nome", Erro.obrigatorio(corpo, "nome", "Nome").trim(), "cor", Json.s(corpo, "cor", "#a053fd"), "descricao", Json.s(corpo, "descricao")));
  }

  @PUT
  @Path("/tags/{id}")
  @Transactional
  public Map<String, Object> editarTag(@PathParam("id") UUID id, Map<String, Object> corpo) {
    UUID loja = sessao.loja();
    Map<String, Object> t = db.obrigatorio("Tag", "select * from crm_tags where id = ? and store_id = ?", id, loja);
    String nome = Erro.obrigatorio(corpo, "nome", "Nome").trim();
    if (!nome.equals(t.get("nome"))) {
      db.executa("update crm_contatos set tags = array_replace(tags, ?, ?) where store_id = ?", t.get("nome"), nome, loja);
      db.executa("update crm_conversas set tags = array_replace(tags, ?, ?) where store_id = ?", t.get("nome"), nome, loja);
    }
    return db.atualiza("crm_tags", id, loja, Json.de("nome", nome, "cor", Json.s(corpo, "cor", (String) t.get("cor")), "descricao", Json.s(corpo, "descricao")));
  }

  @DELETE
  @Path("/tags/{id}")
  @Transactional
  public Map<String, Object> apagarTag(@PathParam("id") UUID id) {
    UUID loja = sessao.loja();
    Map<String, Object> t = db.obrigatorio("Tag", "select nome from crm_tags where id = ? and store_id = ?", id, loja);
    db.executa("update crm_contatos set tags = array_remove(tags, ?) where store_id = ?", t.get("nome"), loja);
    db.executa("update crm_conversas set tags = array_remove(tags, ?) where store_id = ?", t.get("nome"), loja);
    db.executa("delete from crm_tags where id = ?", id);
    return Map.of("ok", true);
  }

  // ---------------- campos personalizados ----------------

  @GET
  @Path("/campos")
  public List<Map<String, Object>> campos(@QueryParam("entidade") String entidade) {
    return db.lista("select * from crm_campos where store_id = ? and entidade = ? order by grupo nulls first, ordem", sessao.loja(), entidade == null ? "contato" : entidade);
  }

  @POST
  @Path("/campos")
  public Map<String, Object> novoCampo(Map<String, Object> corpo) {
    sessao.exigir("admin");
    String nome = Erro.obrigatorio(corpo, "nome", "Nome");
    return db.insere("crm_campos", Json.de("store_id", sessao.loja(), "entidade", Json.s(corpo, "entidade", "contato"), "chave", Json.s(corpo, "chave", Formatos.slug(nome).replace('-', '_')),
        "nome", nome, "tipo", Json.s(corpo, "tipo", "texto"), "opcoes", Json.l(corpo.get("opcoes")), "grupo", Json.s(corpo, "grupo"), "ordem", Json.i(corpo, "ordem", 0),
        "obrigatorio", Json.b(corpo, "obrigatorio", false)));
  }

  @PUT
  @Path("/campos/{id}")
  public Map<String, Object> editarCampo(@PathParam("id") UUID id, Map<String, Object> corpo) {
    sessao.exigir("admin");
    return db.atualiza("crm_campos", id, sessao.loja(), Json.de("nome", Erro.obrigatorio(corpo, "nome", "Nome"), "tipo", Json.s(corpo, "tipo", "texto"),
        "opcoes", Json.l(corpo.get("opcoes")), "grupo", Json.s(corpo, "grupo"), "ordem", Json.i(corpo, "ordem", 0), "obrigatorio", Json.b(corpo, "obrigatorio", false)));
  }

  @DELETE
  @Path("/campos/{id}")
  public Map<String, Object> apagarCampo(@PathParam("id") UUID id) {
    sessao.exigir("admin");
    db.executa("delete from crm_campos where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  // ---------------- apoio ----------------

  private static java.time.LocalDate data(String s) {
    if (s == null || s.isBlank()) return null;
    try {
      if (s.matches("\\d{2}/\\d{2}/\\d{4}")) return java.time.LocalDate.of(Integer.parseInt(s.substring(6)), Integer.parseInt(s.substring(3, 5)), Integer.parseInt(s.substring(0, 2)));
      return java.time.LocalDate.parse(s.substring(0, 10));
    } catch (Exception e) {
      return null;
    }
  }

  static List<String> csvLinha(String linha, char sep) {
    List<String> out = new ArrayList<>();
    StringBuilder cur = new StringBuilder();
    boolean aspas = false;
    for (int i = 0; i < linha.length(); i++) {
      char c = linha.charAt(i);
      if (c == '"') {
        if (aspas && i + 1 < linha.length() && linha.charAt(i + 1) == '"') { cur.append('"'); i++; }
        else aspas = !aspas;
      } else if (c == sep && !aspas) { out.add(cur.toString()); cur.setLength(0); }
      else cur.append(c);
    }
    out.add(cur.toString());
    return out;
  }

  /** Célula CSV segura (aspas e proteção contra fórmulas no Excel). */
  public static String csv(Object o) {
    if (o == null) return "";
    String s = String.valueOf(o).replace("\"", "\"\"").replace("\r", " ").replace("\n", " ");
    if (!s.isEmpty() && "=+-@".indexOf(s.charAt(0)) >= 0) s = "'" + s;
    return "\"" + s + "\"";
  }
}
