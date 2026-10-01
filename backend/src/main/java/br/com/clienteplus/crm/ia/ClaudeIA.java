package br.com.clienteplus.crm.ia;

import br.com.clienteplus.crm.comum.Cripto;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Json;
import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.core.JsonValue;
import com.anthropic.errors.AnthropicServiceException;
import com.anthropic.errors.RateLimitException;
import com.anthropic.models.messages.Message;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.StructuredMessage;
import com.anthropic.models.messages.StructuredMessageCreateParams;
import com.anthropic.models.messages.Usage;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Acesso ao Claude. Cada loja pode ter a própria chave (Configurações → IA);
 * sem ela, usa a chave do servidor (ANTHROPIC_API_KEY). Toda chamada é
 * registrada em crm_ia_uso com tokens e custo estimado.
 */
@ApplicationScoped
public class ClaudeIA {

  private static final Logger LOG = Logger.getLogger(ClaudeIA.class);

  @Inject Db db;
  @Inject Cripto cripto;

  @ConfigProperty(name = "crm.ia.chave") Optional<String> chaveServidor;
  @ConfigProperty(name = "crm.ia.modelo-padrao") String modeloPadrao;

  private final Map<String, AnthropicClient> clientes = new ConcurrentHashMap<>();

  /** Onde a chamada acontece (para registrar o uso). */
  public record Contexto(UUID storeId, UUID agenteId, UUID conversaId, String tipo) {}

  public String modeloPadrao() {
    return modeloPadrao;
  }

  public boolean configurada(UUID storeId) {
    return chave(storeId) != null;
  }

  private String chave(UUID storeId) {
    Map<String, Object> cfg = Json.m(db.valor("select config from crm_lojas where id = ?", storeId));
    String cifrada = Json.s(Json.m(cfg.get("ia")), "chave_cripto");
    if (cifrada != null) {
      try {
        return cripto.decifrar(cifrada);
      } catch (Exception e) {
        LOG.warn("Chave de IA da loja não pôde ser lida");
      }
    }
    return chaveServidor.map(String::trim).filter(s -> !s.isEmpty()).orElse(null);
  }

  private AnthropicClient cliente(UUID storeId) {
    String k = chave(storeId);
    if (k == null) throw Erro.requisicao("IA não configurada: informe a chave da Anthropic em Configurações → Inteligência Artificial");
    return clientes.computeIfAbsent(Cripto.sha256(k), h -> AnthropicOkHttpClient.builder().apiKey(k).maxRetries(3).timeout(Duration.ofMinutes(3)).build());
  }

  /**
   * Liga o fallback do servidor para recusas (o pedido recusado por um
   * classificador de segurança é refeito automaticamente por outro modelo).
   */
  public static MessageCreateParams.Builder comFallback(MessageCreateParams.Builder b) {
    return b.putAdditionalHeader("anthropic-beta", "server-side-fallback-2026-07-01")
        .putAdditionalBodyProperty("fallbacks", JsonValue.from("default"));
  }

  public Message criar(Contexto ctx, MessageCreateParams params) {
    long t0 = System.currentTimeMillis();
    String modelo = params.model().asString();
    try {
      Message m = cliente(ctx.storeId()).messages().create(params);
      registrar(ctx, modelo, m.usage(), (int) (System.currentTimeMillis() - t0), null);
      return m;
    } catch (RuntimeException e) {
      registrar(ctx, modelo, null, (int) (System.currentTimeMillis() - t0), mensagemErro(e));
      throw traduzir(e);
    }
  }

  /** Resposta em JSON validado contra a classe (structured outputs). */
  public <T> T estruturado(Contexto ctx, MessageCreateParams.Builder b, Class<T> tipo) {
    long t0 = System.currentTimeMillis();
    StructuredMessageCreateParams<T> p = b.outputConfig(tipo).build();
    String modelo = p.rawParams().model().asString();
    try {
      StructuredMessage<T> m = cliente(ctx.storeId()).messages().create(p);
      registrar(ctx, modelo, m.usage(), (int) (System.currentTimeMillis() - t0), null);
      return m.content().stream().flatMap(c -> c.text().stream()).map(t -> t.text()).findFirst()
          .orElseThrow(() -> new IllegalStateException("A IA não devolveu dados"));
    } catch (RuntimeException e) {
      registrar(ctx, modelo, null, (int) (System.currentTimeMillis() - t0), mensagemErro(e));
      throw traduzir(e);
    }
  }

  private RuntimeException traduzir(RuntimeException e) {
    if (e instanceof Erro) return e;
    if (e instanceof RateLimitException) return new Erro(429, "A IA está com muitas chamadas agora. Tente de novo em instantes.");
    if (e instanceof AnthropicServiceException s && s.statusCode() == 401) return Erro.requisicao("Chave da IA inválida. Confira em Configurações → Inteligência Artificial.");
    if (e instanceof AnthropicServiceException s && s.statusCode() == 400) return Erro.requisicao("A IA recusou o pedido: " + s.getMessage());
    return Erro.servico("A IA não respondeu: " + e.getMessage());
  }

  private static String mensagemErro(Throwable e) {
    String m = e.getMessage();
    return m == null ? e.getClass().getSimpleName() : m.substring(0, Math.min(500, m.length()));
  }

  private void registrar(Contexto ctx, String modelo, Usage u, int ms, String erro) {
    try {
      long in = u == null ? 0 : u.inputTokens();
      long out = u == null ? 0 : u.outputTokens();
      long cr = u == null ? 0 : u.cacheReadInputTokens().orElse(0L);
      long cw = u == null ? 0 : u.cacheCreationInputTokens().orElse(0L);
      db.executa("""
          insert into crm_ia_uso (store_id, agente_id, conversa_id, tipo, modelo, tokens_entrada, tokens_saida, tokens_cache_leitura, tokens_cache_escrita, custo_micro_usd, duracao_ms, erro)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
          ctx.storeId(), ctx.agenteId(), ctx.conversaId(), ctx.tipo(), modelo, (int) in, (int) out, (int) cr, (int) cw, custoMicroUsd(modelo, in, out, cr, cw), ms, erro);
    } catch (Exception e) {
      LOG.warn("Falha ao registrar uso da IA: " + e.getMessage());
    }
  }

  /** Custo estimado em milionésimos de dólar (preços por milhão de tokens). */
  public static long custoMicroUsd(String modelo, long in, long out, long cacheLeitura, long cacheEscrita) {
    double pin, pout, pcr;
    String m = modelo == null ? "" : modelo;
    if (m.contains("fable") || m.contains("mythos")) { pin = 10; pout = 50; pcr = 0.25; }
    else if (m.contains("opus-5-5")) { pin = 4; pout = 20; pcr = 0.20; }
    else if (m.contains("opus")) { pin = 5; pout = 25; pcr = 0.50; }
    else if (m.contains("sonnet-5")) { pin = 2; pout = 10; pcr = 0.20; }
    else if (m.contains("sonnet")) { pin = 3; pout = 15; pcr = 0.30; }
    else if (m.contains("haiku")) { pin = 1; pout = 5; pcr = 0.10; }
    else { pin = 4; pout = 20; pcr = 0.20; }
    double usd = (in * pin + out * pout + cacheLeitura * pcr + cacheEscrita * pin * 1.25) / 1_000_000.0;
    return Math.round(usd * 1_000_000);
  }

  /** Gasto do mês do agente em centavos de real (cotação configurável, padrão 5,50). */
  public long gastoMesCentavos(UUID storeId, UUID agenteId) {
    long micro = db.numero("select coalesce(sum(custo_micro_usd), 0) from crm_ia_uso where store_id = ? and agente_id = ? and created_at >= date_trunc('month', now())", storeId, agenteId);
    double cotacao = Json.d(Json.m(Json.m(db.valor("select config from crm_lojas where id = ?", storeId)).get("ia")), "cotacao_dolar", 5.5);
    return Math.round(micro / 1_000_000.0 * cotacao * 100);
  }
}
