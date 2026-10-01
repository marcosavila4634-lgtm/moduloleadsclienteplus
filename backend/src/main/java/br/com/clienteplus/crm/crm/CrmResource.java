package br.com.clienteplus.crm.crm;

import br.com.clienteplus.crm.atendimento.Atendimento;
import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.lojas.Lojas;
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
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** CRM: funis, etapas, negócios, kanban, previsão, riscos, decisões e promessas. */
@Path("/crm")
public class CrmResource {

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject Negocios negocios;
  @Inject Atendimento atendimento;

  // ---------------- funis e etapas ----------------

  @GET
  @Path("/funis")
  public List<Map<String, Object>> funis() {
    UUID loja = sessao.loja();
    List<Map<String, Object>> fs = db.lista("""
        select f.*, (select count(*) from crm_negocios n where n.funil_id = f.id) as negocios from crm_funis f where f.store_id = ? order by f.ordem, f.created_at""", loja);
    for (Map<String, Object> f : fs) f.put("etapas", db.lista("select * from crm_etapas where funil_id = ?::uuid order by ordem", f.get("id")));
    return fs;
  }

  @POST
  @Path("/funis")
  @Transactional
  public Map<String, Object> novoFunil(Map<String, Object> corpo) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    Map<String, Object> f = db.insere("crm_funis", Json.de("store_id", loja, "nome", Erro.obrigatorio(corpo, "nome", "Nome"), "descricao", Json.s(corpo, "descricao"),
        "cor", Json.s(corpo, "cor", "#6C5CE7"), "icone", Json.s(corpo, "icone", "handshake"), "config", Json.de("score_weights", Lojas.pesosPadrao(), "auto_criar", false),
        "ordem", (int) db.numero("select count(*) from crm_funis where store_id = ?", loja)));
    List<Object> etapas = Json.l(corpo.get("etapas"));
    if (etapas.isEmpty()) etapas = List.of(Json.de("nome", "Novo"), Json.de("nome", "Em andamento"), Json.de("nome", "Ganho", "ganho", true, "cor", "#22C55E"), Json.de("nome", "Perdido", "perda", true, "cor", "#EF4444"));
    int i = 0;
    for (Object o : etapas) {
      Map<String, Object> e = Json.m(o);
      db.executa("insert into crm_etapas (store_id, funil_id, nome, cor, ordem, ganho, perda, probabilidade) values (?, ?::uuid, ?, ?, ?, ?, ?, ?)", loja, f.get("id"),
          Json.s(e, "nome", "Etapa"), Json.s(e, "cor", "#6366f1"), i++, Json.b(e, "ganho", false), Json.b(e, "perda", false), Json.i(e, "probabilidade", 0));
    }
    return f;
  }

  /** Atualiza funil e a lista completa de etapas (novas sem id, removidas saem se não tiverem negócios). */
  @PUT
  @Path("/funis/{id}")
  @Transactional
  public Map<String, Object> editarFunil(@PathParam("id") UUID id, Map<String, Object> corpo) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    Map<String, Object> f = db.obrigatorio("Funil", "select * from crm_funis where id = ? and store_id = ?", id, loja);
    Map<String, Object> cfg = Json.m(f.get("config"));
    if (corpo.get("pesos") != null) cfg.put("score_weights", Json.m(corpo.get("pesos")));
    if (corpo.containsKey("autoCriar")) cfg.put("auto_criar", Json.b(corpo, "autoCriar", true));
    db.atualiza("crm_funis", id, loja, Json.de("nome", Json.s(corpo, "nome", (String) f.get("nome")), "descricao", Json.s(corpo, "descricao"), "cor", Json.s(corpo, "cor", (String) f.get("cor")),
        "ativo", Json.b(corpo, "ativo", true), "config", cfg, "updated_at", Instant.now()));
    if (corpo.get("etapas") != null) {
      List<String> manter = new ArrayList<>();
      int i = 0;
      for (Object o : Json.l(corpo.get("etapas"))) {
        Map<String, Object> e = Json.m(o);
        UUID eid = Formatos.uuid(e.get("id"));
        Map<String, Object> dados = Json.de("nome", Json.s(e, "nome", "Etapa"), "cor", Json.s(e, "cor", "#6366f1"), "ordem", i++, "ganho", Json.b(e, "ganho", false),
            "perda", Json.b(e, "perda", false), "probabilidade", Json.i(e, "probabilidade", 0), "config", Json.m(e.get("config")));
        if (eid != null && db.numero("select count(*) from crm_etapas where id = ? and funil_id = ?", eid, id) > 0) db.atualiza("crm_etapas", eid, loja, dados);
        else {
          dados.put("store_id", loja);
          dados.put("funil_id", id);
          eid = UUID.fromString((String) db.insere("crm_etapas", dados).get("id"));
        }
        manter.add(eid.toString());
      }
      for (Map<String, Object> e : db.lista("select id from crm_etapas where funil_id = ?", id)) {
        if (manter.contains((String) e.get("id"))) continue;
        if (db.numero("select count(*) from crm_negocios where etapa_id = ?::uuid", e.get("id")) > 0) throw Erro.conflito("Mova os negócios antes de remover a etapa");
        db.executa("delete from crm_etapas where id = ?::uuid", e.get("id"));
      }
    }
    return Map.of("ok", true);
  }

  @DELETE
  @Path("/funis/{id}")
  public Map<String, Object> apagarFunil(@PathParam("id") UUID id) {
    sessao.exigir("admin");
    if (db.numero("select count(*) from crm_funis where store_id = ?", sessao.loja()) <= 1) throw Erro.requisicao("A loja precisa ter pelo menos um funil");
    db.executa("delete from crm_funis where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  // ---------------- kanban / lista ----------------

  /** Kanban de um funil: etapas com negócios, mapa de calor e previsão. */
  @GET
  @Path("/funis/{id}/kanban")
  public Map<String, Object> kanban(@PathParam("id") UUID id, @QueryParam("meus") boolean meus, @QueryParam("quentes") boolean quentes,
      @QueryParam("parados") boolean parados, @QueryParam("busca") String busca, @QueryParam("responsavel") UUID responsavel) {
    UUID loja = sessao.loja();
    Map<String, Object> f = db.obrigatorio("Funil", "select id, nome, cor, icone from crm_funis where id = ? and store_id = ?", id, loja);
    List<Object> p = new ArrayList<>();
    StringBuilder w = new StringBuilder(" where n.funil_id = ? and n.store_id = ?");
    p.add(id);
    p.add(loja);
    if (meus) { w.append(" and n.responsavel_id = ?"); p.add(sessao.usuario()); }
    if (responsavel != null) { w.append(" and n.responsavel_id = ?"); p.add(responsavel); }
    if (quentes) w.append(" and coalesce(n.score_ia, 0) >= 70");
    if (parados) w.append(" and n.etapa_desde < now() - interval '7' day");
    if (busca != null && !busca.isBlank()) { w.append(" and (lower(n.titulo) like ? or lower(coalesce(ct.nome,'')) like ? or ct.telefone like ?)"); String b = "%" + busca.toLowerCase() + "%"; p.add(b); p.add(b); p.add("%" + busca.replaceAll("\\D", "x") + "%"); }
    List<Map<String, Object>> todos = db.lista(Negocios.VIEW + w + " order by n.updated_at desc limit 2000", p.toArray());
    List<Map<String, Object>> etapas = db.lista("select * from crm_etapas where funil_id = ? order by ordem", id);
    Map<String, Object> mediaDias = new LinkedHashMap<>();
    for (Map<String, Object> m : db.lista("select etapa_id, avg(extract(epoch from now() - etapa_desde) / 86400) as media from crm_negocios where funil_id = ? group by etapa_id", id))
      mediaDias.put((String) m.get("etapaId"), Json.d(m, "media", 0));
    List<Map<String, Object>> calor = new ArrayList<>();
    double totalPipe = 0, ponderado = 0;
    int abertos = 0, risco = 0;
    for (Map<String, Object> e : etapas) {
      List<Map<String, Object>> ds = new ArrayList<>();
      double soma = 0;
      int frios = 0, mornos = 0, quentesN = 0, riscos = 0;
      for (Map<String, Object> n : todos) {
        if (!e.get("id").equals(n.get("etapaId"))) continue;
        n.put("previsao", previsao(n, Json.d(mediaDias, (String) e.get("id"), 0)));
        ds.add(n);
        double v = Json.d(n, "valor", 0);
        soma += v;
        int s = Json.i(n, "scoreIa", 0);
        if (s >= 70) quentesN++; else if (s >= 40) mornos++; else frios++;
        boolean emRisco = "high".equals(Json.s(Json.m(n.get("metadados")), "risk_level"));
        if (emRisco) riscos++;
        if (n.get("ganhoEm") == null && n.get("perdidoEm") == null) {
          abertos++;
          totalPipe += v;
          ponderado += v * Math.max(s, Json.i(e, "probabilidade", 0)) / 100.0;
          if (emRisco) risco++;
        }
      }
      e.put("negocios", ds);
      e.put("total", ds.size());
      e.put("valorTotal", soma);
      double heat = ds.isEmpty() ? 0 : (quentesN * 1.0 + mornos * 0.5) / ds.size();
      calor.add(Json.de("etapaId", e.get("id"), "etapa", e.get("nome"), "negocios", ds.size(), "frios", frios, "mornos", mornos, "quentes", quentesN, "riscos", riscos,
          "calor", heat, "nivel", heat >= 0.6 ? "hot" : heat >= 0.3 ? "warm" : "cool", "mediaDias", Json.d(mediaDias, (String) e.get("id"), 0)));
    }
    return Json.de("funil", f, "etapas", etapas, "calor", calor, "previsao",
        Json.de("pipeline", totalPipe, "ponderado", ponderado, "abertos", abertos, "risco", risco, "saude", abertos == 0 ? 100 : Math.round(100.0 * (abertos - risco) / abertos)));
  }

  private static Map<String, Object> previsao(Map<String, Object> n, double mediaEtapa) {
    List<Object> hist = Json.l(Json.m(n.get("metadados")).get("score_history"));
    String tendencia = "stagnant";
    if (hist.size() >= 2) {
      int ult = Json.i(Json.m(hist.get(hist.size() - 1)), "score", 0), ant = Json.i(Json.m(hist.get(hist.size() - 2)), "score", 0);
      tendencia = ult > ant + 3 ? "rising" : ult < ant - 3 ? "falling" : "stagnant";
    }
    double dias = Json.d(n, "diasNaEtapa", 0);
    return Json.de("tendencia", tendencia, "diasNaEtapa", Math.round(dias), "mediaDias", Math.round(mediaEtapa),
        "atrasado", mediaEtapa > 0 && dias > mediaEtapa * 1.5, "probabilidade", Json.i(n, "scoreIa", 0));
  }

  @GET
  @Path("/negocios")
  public Map<String, Object> lista(@QueryParam("funil") UUID funil, @QueryParam("etapa") UUID etapa, @QueryParam("status") String status,
      @QueryParam("busca") String busca, @QueryParam("pagina") Integer pagina, @QueryParam("ordem") String ordem) {
    UUID loja = sessao.loja();
    List<Object> p = new ArrayList<>();
    StringBuilder w = new StringBuilder(" where n.store_id = ?");
    p.add(loja);
    if (funil != null) { w.append(" and n.funil_id = ?"); p.add(funil); }
    if (etapa != null) { w.append(" and n.etapa_id = ?"); p.add(etapa); }
    if ("abertos".equals(status)) w.append(" and n.ganho_em is null and n.perdido_em is null");
    if ("ganhos".equals(status)) w.append(" and n.ganho_em is not null");
    if ("perdidos".equals(status)) w.append(" and n.perdido_em is not null");
    if (busca != null && !busca.isBlank()) { w.append(" and (lower(n.titulo) like ? or lower(coalesce(ct.nome,'')) like ?)"); p.add("%" + busca.toLowerCase() + "%"); p.add("%" + busca.toLowerCase() + "%"); }
    long total = db.numero("select count(*) from crm_negocios n left join crm_contatos ct on ct.id = n.contato_id" + w, p.toArray());
    String ord = switch (ordem == null ? "" : ordem) { case "valor" -> "n.valor desc"; case "score" -> "n.score_ia desc nulls last"; case "antigos" -> "n.created_at"; default -> "n.updated_at desc"; };
    int pg = Math.max(1, pagina == null ? 1 : pagina);
    p.add((pg - 1) * 50);
    return Json.de("itens", db.lista(Negocios.VIEW + w + " order by " + ord + " limit 50 offset ?", p.toArray()), "total", total, "pagina", pg);
  }

  @GET
  @Path("/negocios/{id}")
  public Map<String, Object> negocio(@PathParam("id") UUID id) {
    Map<String, Object> n = db.obrigatorio("Negócio", Negocios.VIEW + " where n.id = ? and n.store_id = ?", id, sessao.loja());
    n.put("eventos", db.lista("select e.*, u.nome as autor_nome from crm_negocio_eventos e left join crm_usuarios u on u.id = e.autor_id where e.negocio_id = ? order by e.created_at desc limit 200", id));
    n.put("promessas", db.lista("select * from crm_promessas where negocio_id = ? order by vence_em", id));
    n.put("conversaAtual", db.valor("select id from crm_conversas where contato_id = ?::uuid order by ultima_mensagem_em desc nulls last limit 1", n.get("contatoId")));
    return n;
  }

  @POST
  @Path("/negocios")
  public Map<String, Object> criar(Map<String, Object> corpo) {
    return negocios.criar(sessao.loja(), corpo, sessao.usuario());
  }

  @PUT
  @Path("/negocios/{id}")
  public Map<String, Object> editar(@PathParam("id") UUID id, Map<String, Object> corpo) {
    UUID loja = sessao.loja();
    Map<String, Object> n = db.obrigatorio("Negócio", "select * from crm_negocios where id = ? and store_id = ?", id, loja);
    Map<String, Object> c = new LinkedHashMap<>();
    if (corpo.containsKey("titulo")) c.put("titulo", Erro.obrigatorio(corpo, "titulo", "Título"));
    if (corpo.containsKey("valor")) {
      c.put("valor", Json.d(corpo, "valor", 0));
      negocios.evento(loja, id, "valor", String.valueOf(n.get("valor")), String.valueOf(c.get("valor")), "usuario", sessao.usuario(), null, null);
    }
    if (corpo.containsKey("prioridade")) c.put("prioridade", Json.s(corpo, "prioridade"));
    if (corpo.containsKey("responsavelId")) {
      c.put("responsavel_id", Formatos.uuid(corpo.get("responsavelId")));
      negocios.evento(loja, id, "responsavel", null, Json.s(corpo, "responsavelId"), "usuario", sessao.usuario(), null, null);
    }
    if (corpo.containsKey("fechamentoPrevisto")) c.put("fechamento_previsto", Json.s(corpo, "fechamentoPrevisto") == null || Json.s(corpo, "fechamentoPrevisto").isBlank() ? null : LocalDate.parse(Json.s(corpo, "fechamentoPrevisto")));
    if (corpo.containsKey("categoriaForecast")) c.put("categoria_forecast", Json.s(corpo, "categoriaForecast"));
    if (corpo.containsKey("tags")) c.put("tags", Db.texto(Json.ls(corpo, "tags")));
    if (corpo.containsKey("campos")) c.put("campos", Json.m(corpo.get("campos")));
    c.put("updated_at", Instant.now());
    c.put("ultima_atividade_em", Instant.now());
    db.atualiza("crm_negocios", id, loja, c);
    negocios.emitir(loja, id);
    return db.um(Negocios.VIEW + " where n.id = ?", id);
  }

  /** corpo: {etapaId, motivo?, motivoPerdaId?} */
  @POST
  @Path("/negocios/{id}/mover")
  public Map<String, Object> mover(@PathParam("id") UUID id, Map<String, Object> corpo) {
    UUID loja = sessao.loja();
    UUID etapa = Formatos.uuid(corpo.get("etapaId"));
    Erro.exigir(etapa != null, "Escolha a etapa");
    String motivo = Json.s(corpo, "motivo");
    UUID mp = Formatos.uuid(corpo.get("motivoPerdaId"));
    if (mp != null) {
      motivo = db.valor("select nome from crm_motivos_perda where id = ? and store_id = ?", mp, loja);
      db.executa("update crm_negocios set motivo_perda_id = ? where id = ? and store_id = ?", mp, id, loja);
    }
    negocios.mover(loja, id, etapa, "usuario", sessao.usuario(), motivo);
    return db.um(Negocios.VIEW + " where n.id = ?", id);
  }

  @POST
  @Path("/negocios/{id}/notas")
  public Map<String, Object> nota(@PathParam("id") UUID id, Map<String, Object> corpo) {
    db.obrigatorio("Negócio", "select id from crm_negocios where id = ? and store_id = ?", id, sessao.loja());
    negocios.evento(sessao.loja(), id, "nota", null, null, "usuario", sessao.usuario(), Erro.obrigatorio(corpo, "texto", "Nota"), null);
    return Map.of("ok", true);
  }

  @DELETE
  @Path("/negocios/{id}")
  public Map<String, Object> apagar(@PathParam("id") UUID id) {
    sessao.exigir("supervisor");
    db.executa("delete from crm_negocios where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  // ---------------- painel do CRM ----------------

  @GET
  @Path("/resumo")
  public Map<String, Object> resumo(@QueryParam("funil") UUID funil, @QueryParam("dias") Integer dias) {
    UUID loja = sessao.loja();
    int d = dias == null ? 30 : dias;
    Map<String, Object> r = db.um("""
        select count(*) filter (where ganho_em is null and perdido_em is null) as abertos,
          count(*) filter (where ganho_em > now() - (? || ' days')::interval) as ganhos,
          count(*) filter (where perdido_em > now() - (? || ' days')::interval) as perdidos,
          coalesce(sum(valor) filter (where ganho_em > now() - (? || ' days')::interval), 0) as receita,
          coalesce(sum(valor) filter (where ganho_em is null and perdido_em is null), 0) as pipeline,
          coalesce(avg(valor) filter (where ganho_em is not null and valor > 0), 0) as ticket,
          coalesce(avg(extract(epoch from ganho_em - created_at) / 86400) filter (where ganho_em is not null), 0) as dias_ate_fechar,
          count(*) filter (where score_ia >= 70 and ganho_em is null and perdido_em is null) as quentes,
          count(*) filter (where (score_ia < 40 or ultima_atividade_em < now() - interval '7' day) and ganho_em is null and perdido_em is null) as esfriando
        from crm_negocios where store_id = ? and (?::uuid is null or funil_id = ?)""", String.valueOf(d), String.valueOf(d), String.valueOf(d), loja, funil, funil);
    long g = Json.i(r, "ganhos", 0), p = Json.i(r, "perdidos", 0);
    r.put("conversao", g + p == 0 ? 0 : Math.round(1000.0 * g / (g + p)) / 10.0);
    r.put("porOrigem", db.lista("select coalesce(origem,'sem origem') as origem, count(*) as negocios, count(*) filter (where ganho_em is not null) as ganhos, coalesce(sum(valor) filter (where ganho_em is not null),0) as receita from crm_negocios where store_id = ? group by 1 order by 2 desc", loja));
    r.put("motivosPerda", db.lista("select coalesce(motivo_perda,'Sem motivo') as motivo, count(*) as total from crm_negocios where store_id = ? and perdido_em is not null group by 1 order by 2 desc limit 10", loja));
    r.put("porResponsavel", db.lista("""
        select coalesce(u.nome,'IA / sem dono') as nome, count(*) filter (where n.ganho_em is not null) as ganhos, coalesce(sum(n.valor) filter (where n.ganho_em is not null),0) as receita,
          count(*) filter (where n.ganho_em is null and n.perdido_em is null) as abertos
        from crm_negocios n left join crm_usuarios u on u.id = n.responsavel_id where n.store_id = ? group by 1 order by 3 desc""", loja));
    return r;
  }

  /** SLA: tempo na etapa comparado com o limite configurado em cada etapa (config.sla_dias). */
  @GET
  @Path("/sla")
  public List<Map<String, Object>> sla(@QueryParam("funil") UUID funil) {
    return db.lista(Negocios.VIEW + """
         where n.store_id = ? and (?::uuid is null or n.funil_id = ?) and n.ganho_em is null and n.perdido_em is null
           and (e.config->>'sla_dias') is not null and n.etapa_desde < now() - ((e.config->>'sla_dias') || ' days')::interval
         order by n.etapa_desde""", sessao.loja(), funil, funil);
  }

  /** Previsão de receita em 30/60/90 dias (valor × probabilidade). */
  @GET
  @Path("/previsao")
  public Map<String, Object> previsao() {
    UUID loja = sessao.loja();
    List<Map<String, Object>> ds = db.lista(Negocios.VIEW + " where n.store_id = ? and n.ganho_em is null and n.perdido_em is null order by n.valor desc", loja);
    Map<String, Object> out = new LinkedHashMap<>();
    for (int dias : List.of(30, 60, 90)) {
      double total = 0, pond = 0;
      int n = 0;
      LocalDate limite = LocalDate.now().plusDays(dias);
      for (Map<String, Object> d : ds) {
        String fp = (String) d.get("fechamentoPrevisto");
        if (fp != null && LocalDate.parse(fp).isAfter(limite)) continue;
        n++;
        total += Json.d(d, "valor", 0);
        pond += Json.d(d, "valor", 0) * Json.i(d, "scoreIa", 0) / 100.0;
      }
      out.put("d" + dias, Json.de("negocios", n, "total", total, "ponderado", pond));
    }
    out.put("negocios", ds);
    out.put("porCategoria", db.lista("select categoria_forecast as categoria, count(*) as negocios, coalesce(sum(valor),0) as valor from crm_negocios where store_id = ? and ganho_em is null and perdido_em is null group by 1", loja));
    // cascata: como o pipeline mudou no mês (entradas, ganhos, perdas)
    out.put("cascata", db.um("""
        select coalesce(sum(valor) filter (where created_at < date_trunc('month', now()) and (ganho_em is null or ganho_em >= date_trunc('month', now())) and (perdido_em is null or perdido_em >= date_trunc('month', now()))),0) as inicio,
          coalesce(sum(valor) filter (where created_at >= date_trunc('month', now())),0) as novos,
          coalesce(sum(valor) filter (where ganho_em >= date_trunc('month', now())),0) as ganhos,
          coalesce(sum(valor) filter (where perdido_em >= date_trunc('month', now())),0) as perdidos,
          coalesce(sum(valor) filter (where ganho_em is null and perdido_em is null),0) as fim
        from crm_negocios where store_id = ?""", loja));
    return out;
  }

  @GET
  @Path("/decisoes")
  public List<Map<String, Object>> decisoes(@QueryParam("limite") Integer limite) {
    return db.lista("""
        select d.*, a.nome as agente_nome, ct.nome as contato_nome, n.titulo as negocio_titulo from crm_decisoes d
        left join crm_agentes a on a.id = d.agente_id left join crm_conversas c on c.id = d.conversa_id left join crm_contatos ct on ct.id = c.contato_id
        left join crm_negocios n on n.id = d.negocio_id where d.store_id = ? order by d.created_at desc limit ?""", sessao.loja(), Math.min(500, limite == null ? 100 : limite));
  }

  @PUT
  @Path("/decisoes/{id}")
  public Map<String, Object> revisarDecisao(@PathParam("id") UUID id, Map<String, Object> corpo) {
    db.executa("update crm_decisoes set status = ?, revisada_por = ? where id = ? and store_id = ?", Json.s(corpo, "status", "aplicada"), sessao.usuario(), id, sessao.loja());
    return Map.of("ok", true);
  }

  @GET
  @Path("/promessas")
  public List<Map<String, Object>> promessas(@QueryParam("status") String status) {
    return db.lista("""
        select p.*, ct.nome as contato_nome, ct.telefone as contato_telefone from crm_promessas p left join crm_contatos ct on ct.id = p.contato_id
        where p.store_id = ? and (?::text is null or p.status = ?) order by p.vence_em nulls last""", sessao.loja(), status, status);
  }

  @PUT
  @Path("/promessas/{id}")
  public Map<String, Object> promessa(@PathParam("id") UUID id, Map<String, Object> corpo) {
    db.executa("update crm_promessas set status = ? where id = ? and store_id = ?", Json.s(corpo, "status", "cumprida"), id, sessao.loja());
    return Map.of("ok", true);
  }

  @GET
  @Path("/motivos-perda")
  public List<Map<String, Object>> motivos() {
    return db.lista("select * from crm_motivos_perda where store_id = ? order by nome", sessao.loja());
  }

  @POST
  @Path("/motivos-perda")
  public Map<String, Object> novoMotivo(Map<String, Object> corpo) {
    return db.insere("crm_motivos_perda", Json.de("store_id", sessao.loja(), "nome", Erro.obrigatorio(corpo, "nome", "Nome")));
  }

  @DELETE
  @Path("/motivos-perda/{id}")
  public Map<String, Object> apagarMotivo(@PathParam("id") UUID id) {
    db.executa("update crm_motivos_perda set ativo = false where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  /** Leads sem responsável humano (para distribuir). */
  @GET
  @Path("/sem-dono")
  public List<Map<String, Object>> semDono() {
    return db.lista(Negocios.VIEW + " where n.store_id = ? and n.responsavel_id is null and n.ganho_em is null and n.perdido_em is null order by n.created_at desc limit 300", sessao.loja());
  }

  /** Distribui os negócios sem dono em rodízio entre as pessoas escolhidas. corpo: {usuarios:[ids], negocios?:[ids]} */
  @POST
  @Path("/sem-dono/distribuir")
  @Transactional
  public Map<String, Object> distribuir(Map<String, Object> corpo) {
    sessao.exigir("supervisor");
    UUID loja = sessao.loja();
    List<String> usuarios = Json.ls(corpo, "usuarios");
    Erro.exigir(!usuarios.isEmpty(), "Escolha quem vai receber");
    List<String> ids = Json.ls(corpo, "negocios");
    if (ids.isEmpty()) ids = semDono().stream().map(n -> (String) n.get("id")).toList();
    int i = 0;
    for (String n : ids) {
      UUID u = UUID.fromString(usuarios.get(i++ % usuarios.size()));
      db.executa("update crm_negocios set responsavel_id = ? where id = ?::uuid and store_id = ?", u, n, loja);
      negocios.evento(loja, UUID.fromString(n), "responsavel", null, u.toString(), "usuario", sessao.usuario(), "Distribuição", null);
    }
    return Map.of("distribuidos", ids.size());
  }
}
