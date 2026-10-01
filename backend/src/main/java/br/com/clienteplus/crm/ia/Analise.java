package br.com.clienteplus.crm.ia;

import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Hub;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.crm.Negocios;
import br.com.clienteplus.crm.eventos.Eventos;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.OutputConfig;
import com.fasterxml.jackson.annotation.JsonPropertyDescription;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.ObservesAsync;
import jakarta.inject.Inject;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import org.jboss.logging.Logger;

/**
 * Inteligência da conversa (roda alguns minutos depois da atividade): resumo,
 * sentimento, sinais de compra/objeção → score de IA do negócio (pesos do
 * funil), memórias do cliente, promessas e avanço automático de etapa.
 */
@ApplicationScoped
public class Analise {

  private static final Logger LOG = Logger.getLogger(Analise.class);

  @Inject Db db;
  @Inject ClaudeIA ia;
  @Inject Negocios negocios;
  @Inject Hub hub;

  private final ScheduledExecutorService relogio = Executors.newSingleThreadScheduledExecutor();
  private final Map<UUID, ScheduledFuture<?>> pendentes = new ConcurrentHashMap<>();

  public record Fato(@JsonPropertyDescription("Fato duradouro sobre o cliente, em uma frase") String fato,
      @JsonPropertyDescription("preferencia, pessoal, compra, objecao, sentimento ou outro") String categoria) {}

  public record PromessaIA(@JsonPropertyDescription("O que foi prometido") String descricao,
      @JsonPropertyDescription("cliente ou empresa") String quem,
      @JsonPropertyDescription("Prazo em ISO 8601 com fuso, ou vazio se não houver") String venceEm) {}

  public record Resultado(
      @JsonPropertyDescription("Resumo objetivo da conversa em até 5 frases, em português") String resumo,
      @JsonPropertyDescription("positivo, neutro ou negativo") String sentimento,
      @JsonPropertyDescription("Cliente tem pressa/prazo curto") boolean urgenciaAlta,
      @JsonPropertyDescription("Cliente tem algum prazo, sem pressa") boolean urgenciaMedia,
      @JsonPropertyDescription("Mostrou interesse claro em produto/serviço") boolean interesseDemonstrado,
      @JsonPropertyDescription("Concordou com o preço/valor") boolean valorConfirmado,
      @JsonPropertyDescription("Disse que vai comprar ou já pagou") boolean compraConfirmada,
      @JsonPropertyDescription("Citou concorrente") boolean concorrente,
      @JsonPropertyDescription("Reclamou do preço") boolean objecaoPreco,
      @JsonPropertyDescription("Disse que vai pensar/ver depois") boolean objecaoPensar,
      @JsonPropertyDescription("Repetiu a mesma objeção") boolean objecaoRepetida,
      @JsonPropertyDescription("Desistiu claramente da compra") boolean desistiu,
      @JsonPropertyDescription("Valor total estimado do negócio em reais (0 se desconhecido)") double valorEstimado,
      @JsonPropertyDescription("Nome exato da etapa do funil que melhor descreve o momento, ou vazio") String etapaSugerida,
      @JsonPropertyDescription("Por que essa etapa") String motivoEtapa,
      @JsonPropertyDescription("Próximo passo recomendado para o vendedor") String proximoPasso,
      @JsonPropertyDescription("Fatos novos e duradouros sobre o cliente (não repita os já conhecidos)") List<Fato> memorias,
      @JsonPropertyDescription("Promessas com prazo feitas na conversa") List<PromessaIA> promessas) {}

  void aoReceber(@ObservesAsync Eventos.MensagemRecebida e) {
    agendar(e.storeId(), e.conversaId(), 180);
  }

  /** Chamado depois que a IA respondeu. */
  public void depois(UUID storeId, UUID conversaId) {
    agendar(storeId, conversaId, 60);
  }

  private void agendar(UUID storeId, UUID conversaId, int segundos) {
    ScheduledFuture<?> antigo = pendentes.remove(conversaId);
    if (antigo != null) antigo.cancel(false);
    pendentes.put(conversaId, relogio.schedule(() -> Thread.startVirtualThread(() -> {
      pendentes.remove(conversaId);
      try {
        analisar(storeId, conversaId);
      } catch (Exception ex) {
        LOG.warnf("Análise da conversa %s falhou: %s", conversaId, ex.getMessage());
      }
    }), segundos, TimeUnit.SECONDS));
  }

  public void analisar(UUID storeId, UUID conversaId) {
    if (!ia.configurada(storeId)) return;
    Map<String, Object> cv = db.um("select c.*, ct.nome as contato_nome from crm_conversas c join crm_contatos ct on ct.id = c.contato_id where c.id = ? and c.store_id = ?", conversaId, storeId);
    if (cv == null) return;
    UUID contatoId = UUID.fromString((String) cv.get("contatoId"));
    Map<String, Object> neg = negocios.garantir(storeId, contatoId, conversaId, (String) cv.get("origem"));
    List<Map<String, Object>> msgs = db.lista("""
        select * from (select remetente, remetente_nome, tipo, conteudo, transcricao, enviada_em from crm_mensagens
          where conversa_id = ? and visibilidade = 'all' order by enviada_em desc limit 80) x order by enviada_em""", conversaId);
    if (msgs.stream().noneMatch(m -> "customer".equals(m.get("remetente")))) return;

    StringBuilder t = new StringBuilder();
    for (Map<String, Object> m : msgs) {
      String quem = switch (String.valueOf(m.get("remetente"))) { case "customer" -> "Cliente"; case "ai" -> "IA"; case "agent" -> "Atendente"; default -> "Sistema"; };
      String c = m.get("transcricao") != null ? "[áudio] " + m.get("transcricao") : m.get("conteudo") != null ? (String) m.get("conteudo") : "[" + m.get("tipo") + "]";
      t.append(String.valueOf(m.get("enviadaEm")), 0, 16).append(" ").append(quem).append(": ").append(c).append("\n");
    }
    List<String> etapas = neg == null ? List.of() : db.lista("select nome from crm_etapas where funil_id = ?::uuid order by ordem", neg.get("funilId")).stream().map(x -> (String) x.get("nome")).toList();
    List<String> jaSabe = db.lista("select fato from crm_memorias where contato_id = ? limit 40", contatoId).stream().map(x -> (String) x.get("fato")).toList();
    String instr = "Analise a conversa de WhatsApp entre a empresa e o cliente abaixo e preencha os campos.\n"
        + "Etapas do funil: " + String.join(", ", etapas) + "\n"
        + "Fatos já conhecidos (não repita): " + (jaSabe.isEmpty() ? "nenhum" : String.join(" | ", jaSabe)) + "\n"
        + "Agora: " + Instant.now() + "\n\n<conversa>\n" + t + "</conversa>";

    Map<String, Object> cfgLoja = Json.m(Json.m(db.valor("select config from crm_lojas where id = ?", storeId)).get("ia"));
    MessageCreateParams.Builder b = MessageCreateParams.builder()
        .model(Json.s(cfgLoja, "modelo_analise", ia.modeloPadrao()))
        .maxTokens(4000L)
        .outputConfig(OutputConfig.builder().effort(OutputConfig.Effort.LOW).build())
        .addUserMessage(instr);
    Resultado r = ia.estruturado(new ClaudeIA.Contexto(storeId, cv.get("agenteId") == null ? null : UUID.fromString((String) cv.get("agenteId")), conversaId, "score"), b, Resultado.class);
    aplicar(storeId, cv, contatoId, neg, r, msgs);
  }

  private void aplicar(UUID storeId, Map<String, Object> cv, UUID contatoId, Map<String, Object> neg, Resultado r, List<Map<String, Object>> msgs) {
    UUID conversaId = UUID.fromString((String) cv.get("id"));
    db.executa("update crm_conversas set resumo = ?, resumo_em = now() where id = ?", r.resumo(), conversaId);

    int novas = 0;
    for (Fato f : r.memorias() == null ? List.<Fato>of() : r.memorias()) {
      if (f.fato() == null || f.fato().isBlank() || novas >= 5) continue;
      if (db.numero("select count(*) from crm_memorias where contato_id = ? and lower(fato) = lower(?)", contatoId, f.fato()) > 0) continue;
      db.executa("insert into crm_memorias (store_id, contato_id, fato, categoria, fonte) values (?, ?, ?, ?, 'ia')", storeId, contatoId, Formatos.curto(f.fato(), 500), Json.s(Json.de("c", f.categoria()), "c", "outro"));
      novas++;
    }
    if (r.sentimento() != null) {
      db.executa("delete from crm_memorias where contato_id = ? and categoria = 'sentimento' and fonte = 'ia'", contatoId);
      db.executa("insert into crm_memorias (store_id, contato_id, fato, categoria, fonte, confianca) values (?, ?, ?, 'sentimento', 'ia', 0.7)", storeId, contatoId, "Último sentimento na conversa: " + r.sentimento());
    }
    UUID negId = neg == null ? null : UUID.fromString((String) neg.get("id"));
    for (PromessaIA p : r.promessas() == null ? List.<PromessaIA>of() : r.promessas()) {
      if (p.descricao() == null || p.descricao().isBlank()) continue;
      if (db.numero("select count(*) from crm_promessas where contato_id = ? and lower(descricao) = lower(?)", contatoId, p.descricao()) > 0) continue;
      Instant vence = null;
      try {
        vence = p.venceEm() == null || p.venceEm().isBlank() ? null : Formatos.instante(p.venceEm());
      } catch (Exception ignorado) {
        // prazo ilegível
      }
      db.executa("insert into crm_promessas (store_id, conversa_id, negocio_id, contato_id, descricao, quem, vence_em) values (?, ?, ?, ?, ?, ?, ?)",
          storeId, conversaId, negId, contatoId, p.descricao(), "empresa".equals(p.quem()) ? "empresa" : "cliente", vence);
    }
    if (neg == null) return;

    // ---- score (pesos do funil) ----
    Map<String, Object> pesos = Json.m(Json.m(db.valor("select config from crm_funis where id = ?::uuid", neg.get("funilId"))).get("score_weights"));
    if (pesos.isEmpty()) pesos = br.com.clienteplus.crm.lojas.Lojas.pesosPadrao();
    Map<String, Object> fatores = new LinkedHashMap<>();
    int score = Json.i(pesos, "base", 30);
    score += soma(fatores, pesos, "urgency_high", r.urgenciaAlta());
    score += soma(fatores, pesos, "urgency_medium", !r.urgenciaAlta() && r.urgenciaMedia());
    score += soma(fatores, pesos, "interest_shown", r.interesseDemonstrado());
    score += soma(fatores, pesos, "value_confirmed", r.valorConfirmado());
    score += soma(fatores, pesos, "purchase_confirmed", r.compraConfirmada());
    score += soma(fatores, pesos, "competitor", r.concorrente());
    score += soma(fatores, pesos, "objection_price", r.objecaoPreco());
    score += soma(fatores, pesos, "objection_thinking", r.objecaoPensar());
    score += soma(fatores, pesos, "objection_repeated", r.objecaoRepetida());
    long doCliente = msgs.stream().filter(m -> "customer".equals(m.get("remetente"))).count();
    score += soma(fatores, pesos, "high_engagement", doCliente >= 10);
    score += soma(fatores, pesos, "moderate_engagement", doCliente >= 4 && doCliente < 10);
    score += soma(fatores, pesos, "sent_media", msgs.stream().anyMatch(m -> "customer".equals(m.get("remetente")) && List.of("image", "audio", "video", "document").contains(m.get("tipo"))));
    Map<String, Object> ct = db.um("select nome, email, telefone from crm_contatos where id = ?", contatoId);
    score += soma(fatores, pesos, "complete_profile", ct.get("nome") != null && (ct.get("email") != null || ct.get("telefone") != null));
    Long resposta = tempoResposta(msgs);
    score += soma(fatores, pesos, "fast_response", resposta != null && resposta < 5 * 60);
    score += soma(fatores, pesos, "moderate_response", resposta != null && resposta >= 5 * 60 && resposta < 3600);
    Instant ultimaCliente = cv.get("ultimaDoClienteEm") == null ? null : Instant.parse((String) cv.get("ultimaDoClienteEm"));
    boolean nosUltimo = !"customer".equals(cv.get("ultimoRemetente"));
    long diasSumido = ultimaCliente == null ? 0 : Duration.between(ultimaCliente, Instant.now()).toDays();
    score += soma(fatores, pesos, "ghosting_severe", nosUltimo && diasSumido >= 7);
    score += soma(fatores, pesos, "ghosting_mild", nosUltimo && diasSumido >= 2 && diasSumido < 7);
    score = Math.max(0, Math.min(100, score));

    Map<String, Object> meta = Json.m(neg.get("metadados"));
    List<Object> hist = new ArrayList<>(Json.l(meta.get("score_history")));
    hist.add(Json.de("score", score, "at", Instant.now().toString()));
    while (hist.size() > 30) hist.remove(0);
    meta.put("score_history", hist);
    meta.put("previous_ai_score", neg.get("scoreIa"));
    meta.put("score_updated_at", Instant.now().toString());
    meta.put("closing_score_factors", fatores);
    meta.put("sentiment", r.sentimento());
    meta.put("next_step", r.proximoPasso());
    meta.put("summary", r.resumo());
    String risco = score < 40 || diasSumido >= 7 ? "high" : score < 55 || diasSumido >= 3 ? "medium" : "low";
    meta.put("risk_level", risco);
    meta.put("risk_count", "high".equals(risco) ? Json.i(meta, "risk_count", 0) + 1 : 0);
    String categoria = score >= 80 ? "commit" : score >= 60 ? "best_case" : "pipeline";
    Map<String, Object> campos = Json.de("score_ia", score, "metadados", meta, "ultima_atividade_em", Instant.now());
    if (neg.get("ganhoEm") == null && neg.get("perdidoEm") == null) campos.put("categoria_forecast", categoria);
    if (r.valorEstimado() > 0 && Json.d(neg, "valor", 0) == 0) campos.put("valor", r.valorEstimado());
    db.atualiza("crm_negocios", negId, storeId, campos);
    negocios.evento(storeId, negId, "score", String.valueOf(neg.get("scoreIa")), String.valueOf(score), "ia", null, r.proximoPasso(), Json.de("fatores", fatores));

    // ---- avanço automático de etapa ----
    boolean pode = cv.get("agenteId") == null || new AgenteConfig(db.valor("select config from crm_agentes where id = ?::uuid", cv.get("agenteId"))).moverEtapas();
    if (pode && r.etapaSugerida() != null && !r.etapaSugerida().isBlank() && neg.get("ganhoEm") == null && neg.get("perdidoEm") == null) {
      UUID etapa = negocios.etapaPorNome(storeId, UUID.fromString((String) neg.get("funilId")), r.etapaSugerida());
      if (etapa != null) {
        Map<String, Object> nova = db.um("select ordem, ganho, perda from crm_etapas where id = ?", etapa);
        Map<String, Object> atual = db.um("select ordem from crm_etapas where id = ?::uuid", neg.get("etapaId"));
        if (!Json.b(nova, "ganho", false) && !Json.b(nova, "perda", false) && Json.i(nova, "ordem", 0) > Json.i(atual, "ordem", 0)) {
          negocios.mover(storeId, negId, etapa, "ia", null, r.motivoEtapa());
          meta.put("last_auto_move", Json.de("to", r.etapaSugerida(), "at", Instant.now().toString(), "reason", r.motivoEtapa()));
          db.executa("update crm_negocios set metadados = ?::jsonb where id = ?", meta, negId);
          db.executa("insert into crm_decisoes (store_id, conversa_id, negocio_id, acao, motivo, dados) values (?, ?, ?, 'mover_etapa', ?, ?::jsonb)",
              storeId, conversaId, negId, r.motivoEtapa(), Json.de("etapa", r.etapaSugerida(), "automatico", true));
        }
      }
    }
    negocios.emitir(storeId, negId);
    hub.emitir(storeId, "contato", Map.of("id", contatoId));
  }

  private static int soma(Map<String, Object> fatores, Map<String, Object> pesos, String chave, boolean ativo) {
    if (!ativo) return 0;
    int p = Json.i(pesos, chave, 0);
    if (p != 0) fatores.put(chave, p);
    return p;
  }

  /** Mediana (segundos) do tempo que o cliente leva para responder às nossas mensagens. */
  private static Long tempoResposta(List<Map<String, Object>> msgs) {
    List<Long> tempos = new ArrayList<>();
    Instant nossa = null;
    for (Map<String, Object> m : msgs) {
      Instant t = Instant.parse((String) m.get("enviadaEm"));
      if ("customer".equals(m.get("remetente"))) {
        if (nossa != null) tempos.add(Duration.between(nossa, t).getSeconds());
        nossa = null;
      } else if (nossa == null) nossa = t;
    }
    if (tempos.isEmpty()) return null;
    tempos.sort(Long::compare);
    return tempos.get(tempos.size() / 2);
  }
}
