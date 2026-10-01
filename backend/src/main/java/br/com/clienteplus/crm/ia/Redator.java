package br.com.clienteplus.crm.ia;

import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Json;
import com.anthropic.models.messages.CacheControlEphemeral;
import com.anthropic.models.messages.ContentBlock;
import com.anthropic.models.messages.Message;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.MessageParam;
import com.anthropic.models.messages.OutputConfig;
import com.anthropic.models.messages.TextBlockParam;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Textos avulsos escritos pela IA com a voz do agente (bloco de IA das
 * automações, follow-up, mensagens de reativação). Não usa ferramentas.
 */
@ApplicationScoped
public class Redator {

  @Inject Db db;
  @Inject ClaudeIA ia;
  @Inject PromptAgente prompt;
  @Inject AgenteRuntime runtime;

  /** Escreve a próxima mensagem seguindo a instrução. Sem agente, usa um tom neutro da loja. */
  public String escrever(UUID storeId, UUID agenteId, UUID conversaId, String instrucao) {
    Map<String, Object> agente = agenteId == null ? null : db.um("select * from crm_agentes where id = ? and store_id = ?", agenteId, storeId);
    String estavel, variavel = "";
    AgenteConfig cfg;
    if (agente != null) {
      PromptAgente.Prompt p = prompt.montar(agente, storeId, conversaId);
      estavel = p.estavel();
      variavel = p.variavel();
      cfg = new AgenteConfig(agente.get("config"));
    } else {
      estavel = "Você escreve mensagens de WhatsApp em nome da empresa " + db.valor("select nome from crm_lojas where id = ?", storeId)
          + ". Seja cordial, natural e breve. Não invente informações.";
      cfg = new AgenteConfig(Map.of());
    }
    List<MessageParam> hist = conversaId == null ? List.of() : runtime.historico(storeId, conversaId, cfg, instrucaoCompleta(instrucao));
    MessageCreateParams.Builder b = MessageCreateParams.builder()
        .model(agente == null ? ia.modeloPadrao() : Json.s(agente, "modelo", ia.modeloPadrao()))
        .maxTokens(2000L)
        .systemOfTextBlockParams(List.of(
            TextBlockParam.builder().text(estavel).cacheControl(CacheControlEphemeral.builder().build()).build(),
            TextBlockParam.builder().text(variavel.isBlank() ? "(sem contexto extra)" : variavel).build()))
        .outputConfig(OutputConfig.builder().effort(OutputConfig.Effort.LOW).build());
    if (hist.isEmpty()) b.addUserMessage(instrucaoCompleta(instrucao));
    else b.messages(hist);
    ClaudeIA.comFallback(b);
    Message m = ia.criar(new ClaudeIA.Contexto(storeId, agenteId, conversaId, "redacao"), b.build());
    StringBuilder sb = new StringBuilder();
    for (ContentBlock bl : m.content()) bl.text().ifPresent(t -> sb.append(t.text()));
    String r = sb.toString().trim();
    return r.contains("[SEM_RESPOSTA]") ? "" : r;
  }

  private static String instrucaoCompleta(String instrucao) {
    return "[Instrução interna da empresa — não mencione ao cliente] " + instrucao
        + "\nEscreva apenas a mensagem que será enviada ao cliente, sem aspas nem explicações.";
  }
}
