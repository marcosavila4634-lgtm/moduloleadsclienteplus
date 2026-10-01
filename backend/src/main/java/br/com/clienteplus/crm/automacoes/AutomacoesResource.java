package br.com.clienteplus.crm.automacoes;

import br.com.clienteplus.crm.atendimento.Atendimento;
import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.comum.Cripto;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.comum.Limitador;
import jakarta.inject.Inject;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Automações (editor visual), pastas, execuções e gatilho por webhook. */
@Path("/")
public class AutomacoesResource {

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject MotorAutomacoes motor;
  @Inject Atendimento atendimento;
  @Inject Limitador limitador;

  @GET
  @Path("automacoes")
  public Map<String, Object> listar() {
    UUID loja = sessao.loja();
    return Json.de("automacoes", db.lista("""
        select a.id, a.pasta_id, a.nome, a.descricao, a.status, a.gatilho_tipo, a.execucoes, a.ultima_execucao_em, a.created_at, a.updated_at,
          jsonb_array_length(coalesce(a.grafo->'nodes','[]'::jsonb)) as nos,
          (select count(*) from crm_automacao_execucoes e where e.automacao_id = a.id and e.status = 'error' and e.created_at > now() - interval '7' day) as erros_7d
        from crm_automacoes a where a.store_id = ? order by a.created_at desc""", loja),
        "pastas", db.lista("select * from crm_automacao_pastas where store_id = ? order by nome", loja));
  }

  @POST
  @Path("automacoes")
  public Map<String, Object> criar(Map<String, Object> corpo) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    Object lim = Json.m(db.valor("select limites from crm_lojas where id = ?", loja)).get("automacoes");
    if (lim instanceof Number n && db.numero("select count(*) from crm_automacoes where store_id = ?", loja) >= n.longValue()) throw Erro.proibido("Limite de automações do plano atingido");
    Map<String, Object> grafo = corpo.get("grafo") == null ? Json.de("nodes", List.of(), "edges", List.of()) : Json.m(corpo.get("grafo"));
    return db.insere("crm_automacoes", Json.de("store_id", loja, "nome", Erro.obrigatorio(corpo, "nome", "Nome"), "descricao", Json.s(corpo, "descricao"),
        "pasta_id", Formatos.uuid(corpo.get("pastaId")), "grafo", grafo, "gatilho_tipo", gatilho(grafo), "status", "draft",
        "gatilho_config", Json.de("token", Cripto.tokenAleatorio(18))));
  }

  @GET
  @Path("automacoes/{id}")
  public Map<String, Object> obter(@PathParam("id") UUID id) {
    Map<String, Object> a = db.obrigatorio("Automação", "select * from crm_automacoes where id = ? and store_id = ?", id, sessao.loja());
    // contadores por nó (quantas passaram, erros) para mostrar no editor
    a.put("estatisticas", db.lista("""
        select p->>'no' as no, count(*) as passagens, count(*) filter (where (p->>'ok')::boolean = false) as erros
        from crm_automacao_execucoes e, jsonb_array_elements(e.passos) p where e.automacao_id = ? and e.created_at > now() - interval '180' day group by 1""", id));
    return a;
  }

  @PUT
  @Path("automacoes/{id}")
  public Map<String, Object> salvar(@PathParam("id") UUID id, Map<String, Object> corpo) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    Map<String, Object> a = db.obrigatorio("Automação", "select * from crm_automacoes where id = ? and store_id = ?", id, loja);
    Map<String, Object> grafo = corpo.get("grafo") == null ? Json.m(a.get("grafo")) : Json.m(corpo.get("grafo"));
    validar(grafo);
    return db.atualiza("crm_automacoes", id, loja, Json.de("nome", Json.s(corpo, "nome", (String) a.get("nome")), "descricao", Json.s(corpo, "descricao", (String) a.get("descricao")),
        "pasta_id", corpo.containsKey("pastaId") ? Formatos.uuid(corpo.get("pastaId")) : Formatos.uuid(a.get("pastaId")), "grafo", grafo, "gatilho_tipo", gatilho(grafo),
        "intervalo_repeticao_horas", Json.i(corpo, "intervaloRepeticaoHoras", Json.i(a, "intervaloRepeticaoHoras", 0)), "updated_at", Instant.now()));
  }

  @POST
  @Path("automacoes/{id}/status")
  public Map<String, Object> status(@PathParam("id") UUID id, Map<String, Object> corpo) {
    sessao.exigir("admin");
    String st = Json.s(corpo, "status", "active");
    Erro.exigir(List.of("active", "inactive", "draft").contains(st), "Status inválido");
    if ("active".equals(st)) {
      Map<String, Object> a = db.obrigatorio("Automação", "select grafo from crm_automacoes where id = ? and store_id = ?", id, sessao.loja());
      Erro.exigir(gatilho(Json.m(a.get("grafo"))) != null, "Adicione um gatilho antes de ativar");
    }
    return db.atualiza("crm_automacoes", id, sessao.loja(), Json.de("status", st, "updated_at", Instant.now()));
  }

  @POST
  @Path("automacoes/{id}/duplicar")
  public Map<String, Object> duplicar(@PathParam("id") UUID id) {
    sessao.exigir("admin");
    Map<String, Object> a = db.obrigatorio("Automação", "select * from crm_automacoes where id = ? and store_id = ?", id, sessao.loja());
    return db.insere("crm_automacoes", Json.de("store_id", sessao.loja(), "nome", a.get("nome") + " (cópia)", "descricao", a.get("descricao"), "pasta_id", Formatos.uuid(a.get("pastaId")),
        "grafo", Json.m(a.get("grafo")), "gatilho_tipo", a.get("gatilhoTipo"), "status", "draft", "gatilho_config", Json.de("token", Cripto.tokenAleatorio(18))));
  }

  @DELETE
  @Path("automacoes/{id}")
  public Map<String, Object> apagar(@PathParam("id") UUID id) {
    sessao.exigir("admin");
    db.executa("delete from crm_automacoes where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  /** Roda a automação agora para um contato (botão "Executar automação"). */
  @POST
  @Path("automacoes/{id}/executar")
  public Map<String, Object> executar(@PathParam("id") UUID id, Map<String, Object> corpo) {
    sessao.exigir("supervisor");
    UUID loja = sessao.loja();
    Map<String, Object> a = db.obrigatorio("Automação", "select * from crm_automacoes where id = ? and store_id = ?", id, loja);
    UUID contato = Formatos.uuid(corpo.get("contatoId"));
    Erro.exigir(contato != null, "Escolha o contato");
    db.obrigatorio("Contato", "select id from crm_contatos where id = ? and store_id = ?", contato, loja);
    UUID conversa = Formatos.uuid(db.valor("select id from crm_conversas where contato_id = ? order by ultima_mensagem_em desc nulls last limit 1", contato));
    String gatilho = null;
    for (Object n : Json.l(Json.m(a.get("grafo")).get("nodes"))) if ("trigger".equals(Json.s(Json.m(n), "kind"))) { gatilho = Json.s(Json.m(n), "id"); break; }
    UUID ex = motor.iniciar(a, gatilho, contato, conversa, Json.de("manual", true));
    return Json.de("execucaoId", ex);
  }

  @GET
  @Path("automacoes/{id}/execucoes")
  public List<Map<String, Object>> execucoes(@PathParam("id") UUID id, @QueryParam("status") String status) {
    db.obrigatorio("Automação", "select id from crm_automacoes where id = ? and store_id = ?", id, sessao.loja());
    return db.lista("""
        select e.*, ct.nome as contato_nome, ct.telefone as contato_telefone from crm_automacao_execucoes e left join crm_contatos ct on ct.id = e.contato_id
        where e.automacao_id = ? and (?::text is null or e.status = ?) order by e.created_at desc limit 300""", id, status, status);
  }

  @POST
  @Path("automacoes/execucoes/{id}/cancelar")
  public Map<String, Object> cancelar(@PathParam("id") UUID id) {
    db.executa("update crm_automacao_execucoes set status = 'canceled', finalizada_em = now() where id = ? and store_id = ? and status in ('waiting','waiting_reply','running')", id, sessao.loja());
    return Map.of("ok", true);
  }

  @POST
  @Path("automacoes/pastas")
  public Map<String, Object> novaPasta(Map<String, Object> corpo) {
    return db.insere("crm_automacao_pastas", Json.de("store_id", sessao.loja(), "nome", Erro.obrigatorio(corpo, "nome", "Nome")));
  }

  @DELETE
  @Path("automacoes/pastas/{id}")
  public Map<String, Object> apagarPasta(@PathParam("id") UUID id) {
    db.executa("delete from crm_automacao_pastas where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  /**
   * Gatilho por webhook (sistemas de fora chamam). Endereço:
   * /api/publico/automacoes/{id}/{token}. Corpo JSON livre; "telefone" (ou phone)
   * identifica/cria o contato. Tudo fica disponível como {webhook.campo}.
   */
  @POST
  @Path("publico/automacoes/{id}/{token}")
  public Map<String, Object> webhook(@PathParam("id") UUID id, @PathParam("token") String token, Map<String, Object> corpo) {
    limitador.conferir("webhook-aut:" + id, 600, 60);
    Map<String, Object> a = db.um("select * from crm_automacoes where id = ? and status = 'active'", id);
    if (a == null || !Cripto.iguais(Json.s(Json.m(a.get("gatilhoConfig")), "token"), token)) throw Erro.naoEncontrado("Automação não encontrada");
    UUID loja = UUID.fromString((String) a.get("storeId"));
    Map<String, Object> dados = corpo == null ? Json.de() : corpo;
    String tel = Formatos.telefone(Json.s(dados, "telefone", Json.s(dados, "phone", Json.s(dados, "whatsapp"))));
    List<Object> lista = Json.l(dados.get("contatos"));
    int iniciadas = 0;
    String gatilho = null;
    for (Object n : Json.l(Json.m(a.get("grafo")).get("nodes"))) {
      Map<String, Object> no = Json.m(n);
      if ("trigger".equals(Json.s(no, "kind")) && List.of("http_request", "api_broadcast", "webhook").contains(Json.s(no, "type", ""))) { gatilho = Json.s(no, "id"); break; }
    }
    if (gatilho == null) throw Erro.requisicao("Esta automação não tem gatilho de webhook");
    if (!lista.isEmpty()) {
      for (Object o : lista.subList(0, Math.min(1000, lista.size()))) {
        Map<String, Object> c = Json.m(o);
        String t = Formatos.telefone(Json.s(c, "telefone", Json.s(c, "phone")));
        if (t == null) continue;
        var ct = atendimento.contatoPorTelefone(loja, t, Json.s(c, "nome", Json.s(c, "name")), null, "webhook");
        UUID conversa = Formatos.uuid(db.valor("select id from crm_conversas where contato_id = ? order by ultima_mensagem_em desc nulls last limit 1", ct.id()));
        if (motor.iniciar(a, gatilho, ct.id(), conversa, Json.de("webhook", c)) != null) iniciadas++;
      }
    } else {
      UUID contato = null, conversa = null;
      if (tel != null) {
        var ct = atendimento.contatoPorTelefone(loja, tel, Json.s(dados, "nome", Json.s(dados, "name")), null, "webhook");
        contato = ct.id();
        conversa = Formatos.uuid(db.valor("select id from crm_conversas where contato_id = ? order by ultima_mensagem_em desc nulls last limit 1", contato));
      }
      if (motor.iniciar(a, gatilho, contato, conversa, Json.de("webhook", dados)) != null) iniciadas++;
    }
    return Json.de("ok", true, "execucoes", iniciadas);
  }

  private static String gatilho(Map<String, Object> grafo) {
    for (Object n : Json.l(grafo.get("nodes"))) if ("trigger".equals(Json.s(Json.m(n), "kind"))) return Json.s(Json.m(n), "type");
    return null;
  }

  private static void validar(Map<String, Object> grafo) {
    List<Object> nos = Json.l(grafo.get("nodes"));
    Erro.exigir(nos.size() <= 300, "Automação grande demais (máximo 300 blocos)");
    java.util.Set<String> ids = new java.util.HashSet<>();
    for (Object n : nos) {
      String id = Json.s(Json.m(n), "id");
      Erro.exigir(id != null && ids.add(id), "Bloco sem identificação ou repetido");
    }
    for (Object e : Json.l(grafo.get("edges"))) {
      Map<String, Object> l = Json.m(e);
      Erro.exigir(ids.contains(Json.s(l, "source")) && ids.contains(Json.s(l, "target")), "Ligação para um bloco que não existe");
    }
  }
}
