package br.com.clienteplus.crm.ia;

import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import com.anthropic.models.messages.CacheControlEphemeral;
import com.anthropic.models.messages.ContentBlock;
import com.anthropic.models.messages.Message;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.MessageParam;
import com.anthropic.models.messages.OutputConfig;
import com.anthropic.models.messages.TextBlockParam;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Agentes de IA: cadastro, base de conhecimento, conexões, métricas e teste. */
@Path("/agentes")
public class AgentesResource {

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject ClaudeIA ia;
  @Inject PromptAgente prompt;

  static Map<String, Object> configPadrao(String papel) {
    Map<String, Object> c = Json.de("tone", "informal", "useEmojis", true, "useSlang", false, "capitalization", "normal", "gender", "neutral",
        "languageMode", "pt-br", "salesStyle", "normal", "visionEnabled", true, "nativeCalendarEnabled", false, "followUpEnabled", true,
        "followupDelays", List.of(1, 4, 24), "followUpMax", 3, "followUpStartHour", 9, "followUpEndHour", 20,
        "followupCustomInstruction", "Mensagens curtas e naturais, sem pressionar. Varie a abordagem e pare se o cliente responder.",
        "splitMessages", true, "splitMaxBlocks", 3, "splitMaxChars", 200, "debounceSeconds", 8, "historyLimit", 40, "effort", "medium",
        "autoMoveStages", true, "autoTags", true, "promiseAutoCancelOnReply", true, "outOfHoursMode", "responder",
        "handoffConfig", Json.de("on_no_answer", true, "on_frustration", true, "on_repeated_question", true, "max_repeated_questions", 3, "assignment_mode", "general"));
    switch (papel == null ? "" : papel) {
      case "sdr" -> c.putAll(Json.de("objective", "Qualificar cada lead (necessidade, orçamento, prazo e quem decide) e passar os qualificados para um vendedor.", "salesStyle", "soft"));
      case "suporte" -> c.putAll(Json.de("objective", "Resolver as dúvidas e problemas dos clientes com paciência, passo a passo.", "followUpEnabled", false, "autoMoveStages", false));
      case "atendimento" -> c.putAll(Json.de("objective", "Receber bem, tirar dúvidas gerais e direcionar para o setor certo.", "nativeCalendarEnabled", true));
      case "pos_venda" -> c.putAll(Json.de("objective", "Garantir a satisfação depois da compra, ajudar com trocas/entregas e incentivar nova compra e indicação.", "autoMoveStages", false));
      default -> c.putAll(Json.de("objective", "Entender o que o cliente procura, apresentar a melhor opção, contornar objeções e fechar a venda."));
    }
    return c;
  }

  @GET
  public List<Map<String, Object>> listar() {
    return db.lista("""
        select a.*, (select count(*) from crm_conversas c where c.agente_id = a.id and c.ultima_mensagem_em > now() - interval '30' day) as conversas_30d,
          (select count(*) from crm_agente_conexoes ac where ac.agente_id = a.id) as conexoes,
          (select coalesce(sum(custo_micro_usd),0) from crm_ia_uso u where u.agente_id = a.id and u.created_at >= date_trunc('month', now())) as custo_mes_micro_usd
        from crm_agentes a where a.store_id = ? order by a.created_at""", sessao.loja());
  }

  @GET
  @Path("/modelos")
  public List<Map<String, Object>> modelos() {
    List<Map<String, Object>> out = new ArrayList<>();
    for (String[] p : new String[][] {{"vendas", "Vendas", "Conduz o lead até fechar"}, {"sdr", "SDR / Pré-vendas", "Qualifica e passa para o vendedor"},
        {"suporte", "Suporte", "Resolve dúvidas e problemas"}, {"atendimento", "Atendimento", "Recepciona e direciona"},
        {"pos_venda", "Pós-venda", "Satisfação, trocas e recompra"}, {"personalizado", "Personalizado", "Você define tudo"}})
      out.add(Json.de("papel", p[0], "nome", p[1], "descricao", p[2], "config", configPadrao(p[0])));
    return out;
  }

  @POST
  public Map<String, Object> criar(Map<String, Object> corpo) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    limite(loja, "agentes", "select count(*) from crm_agentes where store_id = ?");
    String papel = Json.s(corpo, "papel", "vendas");
    Map<String, Object> cfg = configPadrao(papel);
    cfg.putAll(Json.m(corpo.get("config")));
    return db.insere("crm_agentes", Json.de("store_id", loja, "nome", Erro.obrigatorio(corpo, "nome", "Nome"), "papel", papel, "descricao", Json.s(corpo, "descricao"),
        "cor", Json.s(corpo, "cor", "#a053fd"), "empresa", Json.s(corpo, "empresa", db.valor("select nome from crm_lojas where id = ?", loja)),
        "modelo", Json.s(corpo, "modelo", ia.modeloPadrao()), "config", cfg, "status", "paused"));
  }

  @GET
  @Path("/{id}")
  public Map<String, Object> obter(@PathParam("id") UUID id) {
    Map<String, Object> a = db.obrigatorio("Agente", "select * from crm_agentes where id = ? and store_id = ?", id, sessao.loja());
    a.put("conexoes", db.lista("select c.id, c.nome, c.tipo, c.status from crm_agente_conexoes ac join crm_conexoes c on c.id = ac.conexao_id where ac.agente_id = ?", id));
    a.put("midiasFollowup", db.lista("select * from crm_agente_midias_followup where agente_id = ? order by etapa", id));
    return a;
  }

  @PUT
  @Path("/{id}")
  public Map<String, Object> editar(@PathParam("id") UUID id, Map<String, Object> corpo) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    Map<String, Object> a = db.obrigatorio("Agente", "select * from crm_agentes where id = ? and store_id = ?", id, loja);
    Map<String, Object> cfgAntiga = Json.m(a.get("config"));
    Map<String, Object> cfg = new LinkedHashMap<>(cfgAntiga);
    cfg.putAll(Json.m(corpo.get("config")));
    Map<String, Object> c = Json.de("nome", Json.s(corpo, "nome", (String) a.get("nome")), "papel", Json.s(corpo, "papel", (String) a.get("papel")),
        "descricao", Json.s(corpo, "descricao"), "cor", Json.s(corpo, "cor", (String) a.get("cor")), "empresa", Json.s(corpo, "empresa", (String) a.get("empresa")),
        "modelo", Json.s(corpo, "modelo", (String) a.get("modelo")), "config", cfg, "updated_at", Instant.now());
    if (corpo.containsKey("limiteGastoCentavos")) c.put("limite_gasto_centavos", corpo.get("limiteGastoCentavos") == null ? null : Json.i(corpo, "limiteGastoCentavos", 0));
    String instrAntiga = Json.s(cfgAntiga, "customInstructions", "");
    if (!instrAntiga.equals(Json.s(cfg, "customInstructions", ""))) {
      c.put("instrucoes_anteriores", instrAntiga);
      c.put("instrucoes_anteriores_em", Instant.now());
    }
    return db.atualiza("crm_agentes", id, loja, c);
  }

  /** Desfaz a última troca das instruções. */
  @POST
  @Path("/{id}/restaurar-instrucoes")
  public Map<String, Object> restaurar(@PathParam("id") UUID id) {
    sessao.exigir("admin");
    Map<String, Object> a = db.obrigatorio("Agente", "select config, instrucoes_anteriores from crm_agentes where id = ? and store_id = ?", id, sessao.loja());
    Erro.exigir(a.get("instrucoesAnteriores") != null, "Não há versão anterior");
    Map<String, Object> cfg = Json.m(a.get("config"));
    String atual = Json.s(cfg, "customInstructions", "");
    cfg.put("customInstructions", a.get("instrucoesAnteriores"));
    return db.atualiza("crm_agentes", id, sessao.loja(), Json.de("config", cfg, "instrucoes_anteriores", atual, "instrucoes_anteriores_em", Instant.now()));
  }

  @POST
  @Path("/{id}/status")
  public Map<String, Object> status(@PathParam("id") UUID id, Map<String, Object> corpo) {
    sessao.exigir("admin");
    String st = Json.s(corpo, "status", "active");
    Erro.exigir(List.of("active", "paused").contains(st), "Status inválido");
    if ("active".equals(st)) Erro.exigir(ia.configurada(sessao.loja()), "Informe a chave da IA em Configurações → Inteligência Artificial antes de ativar");
    return db.atualiza("crm_agentes", id, sessao.loja(), Json.de("status", st, "updated_at", Instant.now()));
  }

  @POST
  @Path("/{id}/duplicar")
  @Transactional
  public Map<String, Object> duplicar(@PathParam("id") UUID id) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    Map<String, Object> a = db.obrigatorio("Agente", "select * from crm_agentes where id = ? and store_id = ?", id, loja);
    Map<String, Object> n = db.insere("crm_agentes", Json.de("store_id", loja, "nome", a.get("nome") + " (cópia)", "papel", a.get("papel"), "descricao", a.get("descricao"),
        "cor", a.get("cor"), "empresa", a.get("empresa"), "modelo", a.get("modelo"), "config", Json.m(a.get("config")), "status", "paused"));
    db.executa("""
        insert into crm_agente_conhecimento (store_id, agente_id, tipo, titulo, conteudo, pergunta, arquivo_url, arquivo_mime, quando_enviar, ativo, ordem)
        select store_id, ?::uuid, tipo, titulo, conteudo, pergunta, arquivo_url, arquivo_mime, quando_enviar, ativo, ordem from crm_agente_conhecimento where agente_id = ?""", n.get("id"), id);
    return n;
  }

  @DELETE
  @Path("/{id}")
  public Map<String, Object> apagar(@PathParam("id") UUID id) {
    sessao.exigir("admin");
    db.executa("delete from crm_agentes where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  /** corpo: {conexoes:[ids]} — em quais números/contas o agente atende. */
  @PUT
  @Path("/{id}/conexoes")
  @Transactional
  public Map<String, Object> conexoes(@PathParam("id") UUID id, Map<String, Object> corpo) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    db.obrigatorio("Agente", "select id from crm_agentes where id = ? and store_id = ?", id, loja);
    db.executa("delete from crm_agente_conexoes where agente_id = ?", id);
    db.executa("update crm_conexoes set agente_id = null where agente_id = ? and store_id = ?", id, loja);
    for (String c : Json.ls(corpo, "conexoes")) {
      UUID cid = UUID.fromString(c);
      if (db.numero("select count(*) from crm_conexoes where id = ? and store_id = ?", cid, loja) == 0) continue;
      db.executa("insert into crm_agente_conexoes (agente_id, conexao_id) values (?, ?)", id, cid);
      db.executa("update crm_conexoes set agente_id = ? where id = ?", id, cid);
    }
    return Map.of("ok", true);
  }

  // ---------------- base de conhecimento ----------------

  @GET
  @Path("/{id}/conhecimento")
  public Map<String, Object> conhecimento(@PathParam("id") UUID id) {
    db.obrigatorio("Agente", "select id from crm_agentes where id = ? and store_id = ?", id, sessao.loja());
    List<Map<String, Object>> itens = db.lista("select * from crm_agente_conhecimento where agente_id = ? order by ordem, created_at", id);
    long chars = itens.stream().mapToLong(i -> Json.s(i, "conteudo", "").length() + Json.s(i, "pergunta", "").length()).sum();
    return Json.de("itens", itens, "caracteres", chars, "limite", 200_000);
  }

  @POST
  @Path("/{id}/conhecimento")
  public Map<String, Object> novoConhecimento(@PathParam("id") UUID id, Map<String, Object> corpo) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    db.obrigatorio("Agente", "select id from crm_agentes where id = ? and store_id = ?", id, loja);
    return db.insere("crm_agente_conhecimento", dadosConhecimento(corpo, Json.de("store_id", loja, "agente_id", id,
        "ordem", (int) db.numero("select count(*) from crm_agente_conhecimento where agente_id = ?", id))));
  }

  @PUT
  @Path("/{id}/conhecimento/{kid}")
  public Map<String, Object> editarConhecimento(@PathParam("id") UUID id, @PathParam("kid") UUID kid, Map<String, Object> corpo) {
    sessao.exigir("admin");
    db.obrigatorio("Item", "select id from crm_agente_conhecimento where id = ? and agente_id = ? and store_id = ?", kid, id, sessao.loja());
    return db.atualiza("crm_agente_conhecimento", kid, sessao.loja(), dadosConhecimento(corpo, Json.de("updated_at", Instant.now())));
  }

  private static Map<String, Object> dadosConhecimento(Map<String, Object> corpo, Map<String, Object> base) {
    base.putAll(Json.de("tipo", Json.s(corpo, "tipo", "texto"), "titulo", Json.s(corpo, "titulo"), "conteudo", Json.s(corpo, "conteudo"), "pergunta", Json.s(corpo, "pergunta"),
        "arquivo_url", Json.s(corpo, "arquivoUrl"), "arquivo_mime", Json.s(corpo, "arquivoMime"), "quando_enviar", Json.s(corpo, "quandoEnviar"), "ativo", Json.b(corpo, "ativo", true)));
    return base;
  }

  @DELETE
  @Path("/{id}/conhecimento/{kid}")
  public Map<String, Object> apagarConhecimento(@PathParam("id") UUID id, @PathParam("kid") UUID kid) {
    sessao.exigir("admin");
    db.executa("delete from crm_agente_conhecimento where id = ? and agente_id = ? and store_id = ?", kid, id, sessao.loja());
    return Map.of("ok", true);
  }

  // ---------------- métricas e teste ----------------

  @GET
  @Path("/{id}/metricas")
  public Map<String, Object> metricas(@PathParam("id") UUID id) {
    UUID loja = sessao.loja();
    db.obrigatorio("Agente", "select id from crm_agentes where id = ? and store_id = ?", id, loja);
    Map<String, Object> m = db.um("""
        select (select count(*) from crm_conversas where agente_id = ? and ultima_mensagem_em > now() - interval '30' day) as conversas,
          (select count(*) from crm_mensagens where agente_id = ? and created_at > now() - interval '30' day) as mensagens,
          (select count(*) from crm_conversas where agente_id = ? and status in ('resolved','closed') and ia_ativa and ultima_mensagem_em > now() - interval '30' day) as resolvidas_sem_humano,
          (select count(*) from crm_conversas where agente_id = ? and handoff_em > now() - interval '30' day) as transferidas,
          (select count(*) from crm_decisoes where agente_id = ? and created_at > now() - interval '30' day) as decisoes,
          (select count(*) from crm_compras where conversa_id in (select id from crm_conversas where agente_id = ?) and influenciada_ia and comprado_em > now() - interval '30' day) as vendas,
          (select coalesce(sum(valor),0) from crm_compras where conversa_id in (select id from crm_conversas where agente_id = ?) and influenciada_ia and status = 'approved' and comprado_em > now() - interval '30' day) as receita,
          (select coalesce(sum(custo_micro_usd),0) from crm_ia_uso where agente_id = ? and created_at > now() - interval '30' day) as custo_micro_usd,
          (select coalesce(avg(duracao_ms),0) from crm_ia_uso where agente_id = ? and tipo = 'resposta' and created_at > now() - interval '30' day) as tempo_medio_ms""",
        id, id, id, id, id, id, id, id, id);
    m.put("porDia", db.lista("select date_trunc('day', created_at)::date as dia, count(*) as mensagens from crm_mensagens where agente_id = ? and created_at > now() - interval '30' day group by 1 order by 1", id));
    m.put("gastoMesCentavos", ia.gastoMesCentavos(loja, id));
    return m;
  }

  /**
   * Conversa de teste com o agente (nada é enviado a clientes, ferramentas não executam).
   * corpo: {mensagens:[{de:"cliente"|"agente", texto}]}
   */
  @POST
  @Path("/{id}/testar")
  public Map<String, Object> testar(@PathParam("id") UUID id, Map<String, Object> corpo) {
    UUID loja = sessao.loja();
    Map<String, Object> a = db.obrigatorio("Agente", "select * from crm_agentes where id = ? and store_id = ?", id, loja);
    AgenteConfig cfg = new AgenteConfig(a.get("config"));
    PromptAgente.Prompt p = prompt.montar(a, loja, null);
    List<MessageParam> msgs = new ArrayList<>();
    for (Object o : Json.l(corpo.get("mensagens"))) {
      Map<String, Object> m = Json.m(o);
      String t = Json.s(m, "texto", "");
      if (t.isBlank()) continue;
      msgs.add(MessageParam.builder().role("agente".equals(Json.s(m, "de")) ? MessageParam.Role.ASSISTANT : MessageParam.Role.USER).content(t).build());
    }
    Erro.exigir(!msgs.isEmpty() && msgs.get(msgs.size() - 1).role() == MessageParam.Role.USER, "Escreva uma mensagem como cliente");
    MessageCreateParams.Builder b = MessageCreateParams.builder().model(Json.s(a, "modelo", ia.modeloPadrao())).maxTokens(cfg.maxTokens())
        .systemOfTextBlockParams(List.of(TextBlockParam.builder().text(p.estavel()).cacheControl(CacheControlEphemeral.builder().build()).build(),
            TextBlockParam.builder().text("# Modo de teste\nEsta é uma conversa de teste do painel. Responda como responderia a um cliente real. Não há ferramentas disponíveis agora.").build()))
        .outputConfig(OutputConfig.builder().effort(AgenteRuntime.esforco(cfg.esforco())).build())
        .messages(msgs);
    ClaudeIA.comFallback(b);
    long t0 = System.currentTimeMillis();
    Message r = ia.criar(new ClaudeIA.Contexto(loja, id, null, "teste"), b.build());
    StringBuilder sb = new StringBuilder();
    for (ContentBlock bl : r.content()) bl.text().ifPresent(t -> sb.append(t.text()));
    List<String> partes = new ArrayList<>();
    for (String s : sb.toString().split("\\n\\s*\\n")) if (!s.isBlank()) partes.add(s.trim());
    return Json.de("resposta", sb.toString().trim(), "partes", partes, "ms", System.currentTimeMillis() - t0,
        "tokens", Json.de("entrada", r.usage().inputTokens(), "saida", r.usage().outputTokens(), "cache", r.usage().cacheReadInputTokens().orElse(0L)));
  }

  private void limite(UUID loja, String chave, String sqlContagem) {
    Object lim = Json.m(db.valor("select limites from crm_lojas where id = ?", loja)).get(chave);
    if (lim instanceof Number n && db.numero(sqlContagem, loja) >= n.longValue()) throw Erro.proibido("Limite do seu plano atingido (" + chave + ": " + n + ")");
  }

  static UUID uuid(Object o) {
    return Formatos.uuid(o);
  }
}
