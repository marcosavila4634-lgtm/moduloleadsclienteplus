package br.com.clienteplus.crm.crm;

import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.comum.Limitador;
import br.com.clienteplus.crm.ia.ClaudeIA;
import com.anthropic.models.messages.ContentBlock;
import com.anthropic.models.messages.Message;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.OutputConfig;
import com.fasterxml.jackson.annotation.JsonPropertyDescription;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Inteligência de receita: indicadores do funil, leitura da IA sobre o
 * pipeline, coach (avalia uma conversa real) e roleplay (treino com cliente
 * simulado pela IA).
 */
@Path("/inteligencia")
public class InteligenciaResource {

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject ClaudeIA ia;
  @Inject Limitador limitador;

  @GET
  @Path("/indicadores")
  public Map<String, Object> indicadores(@QueryParam("dias") Integer dias, @QueryParam("funil") UUID funil) {
    UUID loja = sessao.loja();
    String per = String.valueOf(dias == null ? 90 : dias);
    Map<String, Object> r = db.um("""
        select count(*) filter (where ganho_em > now() - (? || ' days')::interval) as ganhos,
          count(*) filter (where perdido_em > now() - (? || ' days')::interval) as perdidos,
          coalesce(avg(valor) filter (where ganho_em > now() - (? || ' days')::interval and valor > 0),0) as ticket_medio,
          coalesce(avg(extract(epoch from ganho_em - created_at) / 86400) filter (where ganho_em > now() - (? || ' days')::interval),0) as ciclo_dias,
          count(*) filter (where ganho_em is null and perdido_em is null) as abertos,
          coalesce(sum(valor) filter (where ganho_em is null and perdido_em is null),0) as pipeline,
          count(*) filter (where ganho_em is null and perdido_em is null and coalesce(ultima_atividade_em, created_at) < now() - interval '7' day) as parados,
          count(*) filter (where ganho_em is null and perdido_em is null and responsavel_id is null) as sem_dono
        from crm_negocios where store_id = ? and (?::uuid is null or funil_id = ?)""", per, per, per, per, loja, funil, funil);
    long g = Json.i(r, "ganhos", 0), p = Json.i(r, "perdidos", 0);
    double taxa = g + p == 0 ? 0 : (double) g / (g + p);
    double ciclo = Math.max(1, Json.d(r, "cicloDias", 0));
    r.put("taxaGanho", Math.round(taxa * 1000) / 10.0);
    // velocidade do funil: quanto o pipeline gera por dia
    r.put("velocidadeDia", Math.round(Json.i(r, "abertos", 0) * Json.d(r, "ticketMedio", 0) * taxa / ciclo * 100) / 100.0);
    r.put("etapas", db.lista("""
        select e.id, e.nome, e.ordem, e.cor, count(n.id) filter (where n.ganho_em is null and n.perdido_em is null) as abertos,
          coalesce(sum(n.valor) filter (where n.ganho_em is null and n.perdido_em is null),0) as valor,
          coalesce(avg(extract(epoch from now() - n.etapa_desde) / 86400) filter (where n.ganho_em is null and n.perdido_em is null),0) as dias_medios,
          (select count(distinct ev.negocio_id) from crm_negocio_eventos ev where ev.store_id = e.store_id and ev.tipo = 'etapa' and ev.de = e.nome and ev.created_at > now() - (? || ' days')::interval) as sairam
        from crm_etapas e join crm_funis f on f.id = e.funil_id left join crm_negocios n on n.etapa_id = e.id
        where f.store_id = ? and (?::uuid is null or f.id = ?) and (?::uuid is not null or f.id = (select id from crm_funis where store_id = ? order by ordem, created_at limit 1))
        group by e.id order by e.ordem""", per, loja, funil, funil, funil, loja));
    r.put("motivosPerda", db.lista("""
        select coalesce(m.nome, n.motivo_perda, 'Sem motivo') as motivo, count(*) as negocios, coalesce(sum(n.valor),0) as valor
        from crm_negocios n left join crm_motivos_perda m on m.id = n.motivo_perda_id
        where n.store_id = ? and n.perdido_em > now() - (? || ' days')::interval group by 1 order by 2 desc""", loja, per));
    r.put("vendedores", db.lista("""
        select coalesce(u.nome, 'Sem responsável') as nome, count(*) filter (where n.ganho_em > now() - (? || ' days')::interval) as ganhos,
          count(*) filter (where n.perdido_em > now() - (? || ' days')::interval) as perdidos, coalesce(sum(n.valor) filter (where n.ganho_em > now() - (? || ' days')::interval),0) as receita,
          count(*) filter (where n.ganho_em is null and n.perdido_em is null) as abertos
        from crm_negocios n left join crm_usuarios u on u.id = n.responsavel_id where n.store_id = ? group by 1 order by 4 desc""", per, per, per, loja));
    r.put("emRisco", db.lista("""
        select n.id, n.titulo, n.valor, n.score_ia, n.metadados->>'risco' as risco, ct.nome as contato_nome, e.nome as etapa,
          extract(epoch from now() - coalesce(n.ultima_atividade_em, n.created_at)) / 86400 as dias_parado
        from crm_negocios n left join crm_contatos ct on ct.id = n.contato_id join crm_etapas e on e.id = n.etapa_id
        where n.store_id = ? and n.ganho_em is null and n.perdido_em is null and n.valor > 0
          and (coalesce(n.ultima_atividade_em, n.created_at) < now() - interval '5' day or coalesce(n.score_ia, 50) < 35)
        order by n.valor desc limit 15""", loja));
    return r;
  }

  public record Ponto(String titulo, String detalhe, @JsonPropertyDescription("Ação prática e específica para fazer agora") String acao) {}

  public record Leitura(@JsonPropertyDescription("Resumo em 2-3 frases, linguagem simples") String resumo, List<Ponto> alertas, List<Ponto> oportunidades,
      @JsonPropertyDescription("Previsão realista para os próximos 30 dias, em uma frase") String previsao) {}

  /** A IA lê os números do funil e diz o que fazer. */
  @POST
  @Path("/leitura")
  public Leitura leitura(Map<String, Object> c) {
    UUID loja = sessao.loja();
    limitador.conferir("intel-leitura:" + loja, 20, 3600);
    Map<String, Object> ind = indicadores(90, Formatos.uuid(c == null ? null : c.get("funilId")));
    String prompt = "Você é um diretor comercial experiente analisando o funil de vendas de uma pequena empresa brasileira (" + db.valor("select nome from crm_lojas where id = ?", loja) + ").\n"
        + "Dados dos últimos 90 dias e do pipeline aberto (JSON):\n" + Json.texto(ind) + "\n\n"
        + "Escreva para o dono da empresa, em português simples, sem jargão. Aponte de 2 a 4 alertas (gargalos, negócios em risco, perdas) e de 2 a 4 oportunidades, "
        + "cada um com uma ação concreta. Use números dos dados. Não invente informação que não esteja nos dados.";
    MessageCreateParams.Builder b = MessageCreateParams.builder().model(ia.modeloPadrao()).maxTokens(4000L)
        .outputConfig(OutputConfig.builder().effort(OutputConfig.Effort.MEDIUM).build()).addUserMessage(prompt);
    return ia.estruturado(new ClaudeIA.Contexto(loja, null, null, "inteligencia"), b, Leitura.class);
  }

  public record Avaliacao(@JsonPropertyDescription("Nota de 0 a 10") int nota, @JsonPropertyDescription("Resumo do atendimento em 1-2 frases") String resumo,
      List<String> pontosFortes, List<String> melhorar,
      @JsonPropertyDescription("Exemplo de mensagem melhor que o vendedor poderia ter mandado") String mensagemSugerida,
      @JsonPropertyDescription("Próximo passo recomendado com este cliente") String proximoPasso) {}

  private static final String CRITERIOS = """
      Avalie como um coach de vendas consultivas: rapidez e cordialidade, perguntas para entender a necessidade, apresentação de valor (não só preço),
      tratamento de objeções, uso de prova social/urgência sem exagero, condução para o fechamento (próximo passo claro) e clareza das mensagens.
      Seja específico e cite trechos. Escreva em português simples e encorajador.""";

  /** Coach: avalia uma conversa real da equipe (ou do robô). corpo: {conversaId} */
  @POST
  @Path("/coach")
  public Avaliacao coach(Map<String, Object> c) {
    UUID loja = sessao.loja();
    sessao.exigir("supervisor");
    limitador.conferir("intel-coach:" + loja, 60, 3600);
    UUID conversa = Formatos.uuid(c.get("conversaId"));
    db.obrigatorio("Conversa", "select id from crm_conversas where id = ? and store_id = ?", conversa, loja);
    List<Map<String, Object>> msgs = db.lista("""
        select remetente, remetente_nome, coalesce(texto, transcricao, '[' || tipo || ']') as texto from crm_mensagens
        where conversa_id = ? and remetente in ('customer','agent','ai') order by created_at desc limit 120""", conversa);
    Erro.exigir(msgs.size() >= 3, "Conversa curta demais para avaliar");
    java.util.Collections.reverse(msgs);
    String transcricao = msgs.stream().map(m -> ("customer".equals(m.get("remetente")) ? "CLIENTE" : "ai".equals(m.get("remetente")) ? "ROBÔ" : "VENDEDOR (" + Json.s(m, "remetenteNome", "") + ")") + ": " + m.get("texto"))
        .collect(Collectors.joining("\n"));
    MessageCreateParams.Builder b = MessageCreateParams.builder().model(ia.modeloPadrao()).maxTokens(3000L)
        .outputConfig(OutputConfig.builder().effort(OutputConfig.Effort.MEDIUM).build())
        .addUserMessage(CRITERIOS + "\n\nConversa de WhatsApp:\n" + transcricao);
    return ia.estruturado(new ClaudeIA.Contexto(loja, null, conversa, "coach"), b, Avaliacao.class);
  }

  /**
   * Roleplay: a IA faz o papel do cliente. corpo: {cenario, perfil, dificuldade, historico:[{de:"vendedor"|"cliente", texto}]}
   * Devolve a próxima fala do cliente.
   */
  @POST
  @Path("/roleplay")
  public Map<String, Object> roleplay(Map<String, Object> c) {
    UUID loja = sessao.loja();
    limitador.conferir("intel-roleplay:" + sessao.usuario(), 200, 3600);
    List<Object> hist = Json.l(c.get("historico"));
    Erro.exigir(hist.size() <= 80, "Treino muito longo: comece outro");
    String empresa = db.valor("select nome from crm_lojas where id = ?", loja);
    String produtos = db.lista("select nome, preco from crm_produtos where store_id = ? and ativo order by destaque desc limit 20", loja).stream()
        .map(p -> p.get("nome") + " (" + Formatos.reais(Json.d(p, "preco", 0)) + ")").collect(Collectors.joining(", "));
    String sistema = "Você está num TREINO de vendas. Faça o papel de um CLIENTE que conversa pelo WhatsApp com um vendedor da empresa " + empresa + ".\n"
        + "Cenário: " + Json.s(c, "cenario", "cliente interessado, mas com dúvidas sobre preço") + "\n"
        + "Perfil do cliente: " + Json.s(c, "perfil", "pessoa comum, educada, um pouco desconfiada") + "\n"
        + "Dificuldade: " + Json.s(c, "dificuldade", "média") + " (fácil = aceita logo; difícil = traz objeções fortes, compara com concorrente, demora a decidir).\n"
        + (produtos.isBlank() ? "" : "Produtos da empresa: " + produtos + "\n")
        + "Regras: responda SÓ como o cliente, mensagens curtas de WhatsApp (1 a 3 frases), sem narrar. Não ajude o vendedor. "
        + "Se o vendedor conduzir muito bem, você pode fechar a compra; se for mal, pode desistir. Nunca diga que é uma IA.";
    MessageCreateParams.Builder b = ClaudeIA.comFallback(MessageCreateParams.builder().model(ia.modeloPadrao()).maxTokens(600L)
        .outputConfig(OutputConfig.builder().effort(OutputConfig.Effort.LOW).build()).system(sistema));
    // a conversa com a API sempre começa pelo "usuário" (o vendedor)
    if (hist.isEmpty() || "cliente".equals(Json.s(Json.m(hist.get(0)), "de")))
      b.addUserMessage("(O vendedor ainda não falou. Mande a primeira mensagem do cliente, como quem chega pelo WhatsApp.)");
    for (Object o : hist) {
      Map<String, Object> m = Json.m(o);
      String t = Json.s(m, "texto", "");
      if ("cliente".equals(Json.s(m, "de"))) b.addAssistantMessage(t.isBlank() ? "..." : t);
      else b.addUserMessage(t.isBlank() ? "..." : t);
    }
    if (!hist.isEmpty() && "cliente".equals(Json.s(Json.m(hist.get(hist.size() - 1)), "de"))) b.addUserMessage("(continue)");
    Message m = ia.criar(new ClaudeIA.Contexto(loja, null, null, "roleplay"), b.build());
    String resposta = m.content().stream().flatMap((ContentBlock bl) -> bl.text().stream()).map(t -> t.text()).collect(Collectors.joining("\n")).trim();
    return Map.of("resposta", resposta.isBlank() ? "..." : resposta);
  }

  /** Nota do treino. corpo: {cenario, historico} */
  @POST
  @Path("/roleplay/avaliar")
  public Avaliacao avaliarRoleplay(Map<String, Object> c) {
    UUID loja = sessao.loja();
    limitador.conferir("intel-roleplay-nota:" + sessao.usuario(), 40, 3600);
    List<Object> hist = Json.l(c.get("historico"));
    Erro.exigir(hist.size() >= 2, "Converse um pouco antes de pedir a nota");
    String transcricao = hist.stream().map(Json::m).map(m -> ("cliente".equals(Json.s(m, "de")) ? "CLIENTE" : "VENDEDOR") + ": " + Json.s(m, "texto", "")).collect(Collectors.joining("\n"));
    MessageCreateParams.Builder b = MessageCreateParams.builder().model(ia.modeloPadrao()).maxTokens(3000L)
        .outputConfig(OutputConfig.builder().effort(OutputConfig.Effort.MEDIUM).build())
        .addUserMessage(CRITERIOS + "\n\nEste foi um treino (roleplay). Cenário: " + Json.s(c, "cenario", "") + "\n\nConversa:\n" + transcricao);
    return ia.estruturado(new ClaudeIA.Contexto(loja, null, null, "roleplay"), b, Avaliacao.class);
  }
}
