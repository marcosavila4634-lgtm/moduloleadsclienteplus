package br.com.clienteplus.crm.ia;

import br.com.clienteplus.crm.comum.Json;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Configurações do agente (coluna crm_agentes.config). Os nomes das chaves
 * são os mesmos do Meppy, para a importação ser direta.
 */
public class AgenteConfig {

  private final Map<String, Object> c;

  public AgenteConfig(Object config) {
    this.c = Json.m(config);
  }

  public Map<String, Object> mapa() {
    return c;
  }

  public String instrucoes() { return Json.s(c, "customInstructions", ""); }
  public String personalidade() { return Json.s(c, "personality", ""); }
  public String objetivo() { return Json.s(c, "objective", ""); }
  public String saudacao() { return Json.s(c, "greetingMessage", ""); }
  /** informal | formal | neutro */
  public String tom() { return Json.s(c, "tone", "informal"); }
  public boolean emojis() { return Json.b(c, "useEmojis", true); }
  public boolean girias() { return Json.b(c, "useSlang", false); }
  public List<String> giriasLista() { return Json.ls(c, "customSlang"); }
  /** mixed | lower | normal */
  public String capitalizacao() { return Json.s(c, "capitalization", "normal"); }
  /** male | female | neutral */
  public String genero() { return Json.s(c, "gender", "neutral"); }
  public String idioma() { return Json.s(c, "languageMode", "pt-br"); }
  /** soft | normal | aggressive */
  public String estiloVenda() { return Json.s(c, "salesStyle", "normal"); }
  public String estiloVoz() { return Json.s(c, "voiceStyle", ""); }
  public String exemplosVoz() { return Json.s(c, "voiceExamples", ""); }
  public String treinoTexto() { return Json.s(c, "trainingText", ""); }
  public List<Object> treinoQa() { return Json.l(c.get("trainingQa")); }
  public String regrasTransferencia() { return Json.s(c, "handoffRules", ""); }
  public Map<String, Object> transferencia() { return Json.m(c.get("handoffConfig")); }
  public Map<String, Object> horario() { return Json.m(c.get("businessHours")); }
  /** responder | mensagem | nao_responder (fora do horário comercial) */
  public String foraHorario() { return Json.s(c, "outOfHoursMode", "responder"); }
  public String foraHorarioMensagem() { return Json.s(c, "outOfHoursMessage", ""); }
  public boolean visao() { return Json.b(c, "visionEnabled", true); }
  public boolean agenda() { return Json.b(c, "nativeCalendarEnabled", false); }
  public boolean followUp() { return Json.b(c, "followUpEnabled", false); }
  public int followUpMax() { return Json.i(c, "followUpMax", 3); }
  public int followUpInicio() { return Json.i(c, "followUpStartHour", 9); }
  public int followUpFim() { return Json.i(c, "followUpEndHour", 20); }
  public String followUpInstrucao() { return Json.s(c, "followupCustomInstruction", ""); }
  public String followUpTagFinal() { return Json.s(c, "followupFinalTag", ""); }

  /** Horas de espera antes de cada follow-up (ex.: [1, 2, 4]). */
  public List<Double> followUpAtrasos() {
    List<Double> out = new ArrayList<>();
    for (Object o : Json.l(c.get("followupDelays"))) {
      if (o instanceof Number n) out.add(n.doubleValue());
    }
    if (out.isEmpty()) out.add(Json.d(c, "followUpDelayHours", 1));
    return out;
  }

  public boolean dividir() { return Json.b(c, "splitMessages", true); }
  public int dividirBlocos() { return Math.max(1, Json.i(c, "splitMaxBlocks", 3)); }
  public int dividirCaracteres() { return Math.max(60, Json.i(c, "splitMaxChars", 200)); }
  public boolean promessaCancelaAoResponder() { return Json.b(c, "promiseAutoCancelOnReply", true); }
  /** Segundos esperando o cliente terminar de digitar antes de responder. */
  public int aguardarSegundos() { return Math.max(0, Json.i(c, "debounceSeconds", 8)); }
  /** Quantas mensagens anteriores a IA lê. */
  public int historico() { return Math.max(6, Json.i(c, "historyLimit", 40)); }
  /** low | medium | high */
  public String esforco() { return Json.s(c, "effort", "medium"); }
  public int maxTokens() { return Math.max(1000, Json.i(c, "maxTokens", 4000)); }
  /** A IA pode mover o negócio de etapa sozinha. */
  public boolean moverEtapas() { return Json.b(c, "autoMoveStages", true); }
  /** A IA pode marcar tags sozinha. */
  public boolean marcarTags() { return Json.b(c, "autoTags", true); }
  /** Chave Pix para cobranças geradas pela IA. */
  public String pixChave() { return Json.s(c, "pixKey", ""); }
  public String linkPagamento() { return Json.s(c, "paymentLink", ""); }
}
