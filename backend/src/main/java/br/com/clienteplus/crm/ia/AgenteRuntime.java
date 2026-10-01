package br.com.clienteplus.crm.ia;

import br.com.clienteplus.crm.atendimento.Atendimento;
import br.com.clienteplus.crm.canais.Conexoes;
import br.com.clienteplus.crm.canais.Envio;
import br.com.clienteplus.crm.canais.MetaApi;
import br.com.clienteplus.crm.comum.Arquivos;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.eventos.Eventos;
import com.anthropic.models.messages.Base64ImageSource;
import com.anthropic.models.messages.Base64PdfSource;
import com.anthropic.models.messages.CacheControlEphemeral;
import com.anthropic.models.messages.ContentBlock;
import com.anthropic.models.messages.ContentBlockParam;
import com.anthropic.models.messages.DocumentBlockParam;
import com.anthropic.models.messages.ImageBlockParam;
import com.anthropic.models.messages.Message;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.MessageParam;
import com.anthropic.models.messages.OutputConfig;
import com.anthropic.models.messages.StopReason;
import com.anthropic.models.messages.TextBlockParam;
import com.anthropic.models.messages.Tool;
import com.anthropic.models.messages.ToolResultBlockParam;
import com.anthropic.models.messages.ToolUseBlock;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.ObservesAsync;
import jakarta.inject.Inject;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import org.jboss.logging.Logger;

/**
 * Faz o agente responder: espera o cliente terminar de escrever, confere as
 * regras (IA ligada, horário, limite de gasto), monta o histórico (com fotos e
 * áudios transcritos), chama o Claude com as ferramentas e envia a resposta em
 * mensagens curtas.
 */
@ApplicationScoped
public class AgenteRuntime {

  private static final Logger LOG = Logger.getLogger(AgenteRuntime.class);
  private static final long MAX_IMAGEM = 5L * 1024 * 1024;

  @Inject Db db;
  @Inject ClaudeIA ia;
  @Inject PromptAgente prompt;
  @Inject FerramentasAgente ferramentas;
  @Inject Atendimento atendimento;
  @Inject Conexoes conexoes;
  @Inject MetaApi meta;
  @Inject Arquivos arquivos;
  @Inject Transcricao transcricao;
  @Inject Analise analise;
  @Inject br.com.clienteplus.crm.canais.Expedicao expedicao;

  private final ScheduledExecutorService relogio = Executors.newSingleThreadScheduledExecutor();
  private final ExecutorService trabalho = Executors.newVirtualThreadPerTaskExecutor();
  private final Map<UUID, ScheduledFuture<?>> pendentes = new ConcurrentHashMap<>();
  private final Map<UUID, Object> travas = new ConcurrentHashMap<>();

  void aoReceber(@ObservesAsync Eventos.MensagemRecebida e) {
    if ("audio".equals(e.tipo())) {
      Map<String, Object> m = db.um("select id, midia_url, midia_mime, transcricao from crm_mensagens where id = ?", e.mensagemId());
      if (m != null && transcricao.transcrever(e.storeId(), m) != null) atendimento.emitirConversa(e.storeId(), e.conversaId());
    }
    Map<String, Object> cv = db.um("select ia_ativa, atribuida_a, agente_id from crm_conversas where id = ?", e.conversaId());
    if (cv == null || !Json.b(cv, "iaAtiva", false) || !"ai".equals(cv.get("atribuidaA")) || cv.get("agenteId") == null) return;
    Map<String, Object> ag = db.um("select config from crm_agentes where id = ?::uuid and status = 'active'", cv.get("agenteId"));
    if (ag == null) return;
    agendar(e.storeId(), e.conversaId(), new AgenteConfig(ag.get("config")).aguardarSegundos());
  }

  /** (Re)agenda a resposta: se o cliente mandar outra mensagem antes, o relógio recomeça. */
  public void agendar(UUID storeId, UUID conversaId, int segundos) {
    ScheduledFuture<?> antigo = pendentes.remove(conversaId);
    if (antigo != null) antigo.cancel(false);
    pendentes.put(conversaId, relogio.schedule(() -> trabalho.submit(() -> {
      pendentes.remove(conversaId);
      try {
        responder(storeId, conversaId, null);
      } catch (Exception ex) {
        LOG.errorf(ex, "Falha ao responder a conversa %s", conversaId);
      }
    }), segundos, TimeUnit.SECONDS));
  }

  /**
   * Gera e envia a resposta. {@code instrucaoExtra} é usada nos follow-ups
   * ("o cliente não respondeu há 2 h...").
   */
  public void responder(UUID storeId, UUID conversaId, String instrucaoExtra) {
    Object trava = travas.computeIfAbsent(conversaId, k -> new Object());
    synchronized (trava) {
      Instant inicio = Instant.now();
      Map<String, Object> cv = db.um("select * from crm_conversas where id = ? and store_id = ?", conversaId, storeId);
      if (cv == null || !Json.b(cv, "iaAtiva", false) || !"ai".equals(cv.get("atribuidaA")) || cv.get("agenteId") == null) return;
      if (instrucaoExtra == null && !"customer".equals(cv.get("ultimoRemetente"))) return;
      Map<String, Object> agente = db.um("select * from crm_agentes where id = ?::uuid", cv.get("agenteId"));
      if (agente == null || !"active".equals(agente.get("status"))) return;
      AgenteConfig cfg = new AgenteConfig(agente.get("config"));
      UUID agenteId = UUID.fromString((String) agente.get("id"));
      UUID contatoId = UUID.fromString((String) cv.get("contatoId"));
      if (Json.b(db.um("select bloqueado from crm_contatos where id = ?", contatoId), "bloqueado", false)) return;
      if (!ia.configurada(storeId)) {
        LOG.warnf("IA sem chave na loja %s: conversa %s sem resposta automática", storeId, conversaId);
        return;
      }
      if (agente.get("limiteGastoCentavos") != null && ia.gastoMesCentavos(storeId, agenteId) >= ((Number) agente.get("limiteGastoCentavos")).longValue()) {
        atendimento.transferirHumano(storeId, conversaId, null, null, "Limite de gasto mensal da IA atingido");
        return;
      }
      if (instrucaoExtra == null && foraDoHorario(storeId, cfg, conversaId, agente)) return;

      String nomeAgente = (String) agente.get("nome");
      FerramentasAgente.Ctx ctx = new FerramentasAgente.Ctx(storeId, conversaId, contatoId, agenteId, nomeAgente, (String) agente.get("papel"), cfg);
      digitando(storeId, cv);
      PromptAgente.Prompt pr = prompt.montar(agente, storeId, conversaId);
      List<MessageParam> historico = historico(storeId, conversaId, cfg, instrucaoExtra);
      if (historico.isEmpty()) return;
      List<Tool> tools = ferramentas.definicoes(ctx);

      MessageCreateParams.Builder b = MessageCreateParams.builder()
          .model(Json.s(agente, "modelo", ia.modeloPadrao()))
          .maxTokens(cfg.maxTokens())
          .systemOfTextBlockParams(List.of(
              TextBlockParam.builder().text(pr.estavel()).cacheControl(CacheControlEphemeral.builder().build()).build(),
              TextBlockParam.builder().text(pr.variavel()).build()))
          .outputConfig(OutputConfig.builder().effort(esforco(cfg.esforco())).build())
          .cacheControl(CacheControlEphemeral.builder().build())
          .messages(historico);
      tools.forEach(b::addTool);
      ClaudeIA.comFallback(b);

      String resposta = null;
      ClaudeIA.Contexto uso = new ClaudeIA.Contexto(storeId, agenteId, conversaId, instrucaoExtra == null ? "resposta" : "followup");
      for (int volta = 0; volta < 8; volta++) {
        Message m = ia.criar(uso, b.build());
        StopReason sr = m.stopReason().orElse(null);
        if (StopReason.REFUSAL.equals(sr)) {
          atendimento.transferirHumano(storeId, conversaId, null, null, "A IA não pôde responder a esta mensagem");
          return;
        }
        List<ToolUseBlock> usos = new ArrayList<>();
        StringBuilder texto = new StringBuilder();
        for (ContentBlock bl : m.content()) {
          bl.toolUse().ifPresent(usos::add);
          bl.text().ifPresent(t -> texto.append(t.text()));
        }
        if (usos.isEmpty() || !StopReason.TOOL_USE.equals(sr)) {
          resposta = texto.toString().trim();
          break;
        }
        b.addMessage(m);
        List<ContentBlockParam> resultados = new ArrayList<>();
        for (ToolUseBlock u : usos) {
          Map<String, Object> entrada = Json.m(u._input().convert(Map.class));
          String r = ferramentas.executar(ctx, u.name(), entrada);
          resultados.add(ContentBlockParam.ofToolResult(ToolResultBlockParam.builder().toolUseId(u.id()).content(r).build()));
        }
        b.addMessage(MessageParam.builder().role(MessageParam.Role.USER).contentOfBlockParams(resultados).build());
      }

      if (resposta != null && !resposta.isBlank() && !resposta.contains("[SEM_RESPOSTA]")) enviarEmPartes(storeId, conversaId, cv, cfg, agenteId, nomeAgente, resposta);

      boolean chegouMais = db.numero("select count(*) from crm_mensagens where conversa_id = ? and remetente = 'customer' and created_at > ?", conversaId, inicio) > 0;
      if (!ctx.transferiu) programarFollowUp(storeId, conversaId, cfg, instrucaoExtra != null);
      analise.depois(storeId, conversaId);
      if (chegouMais && !ctx.transferiu) agendar(storeId, conversaId, 2);
    }
  }

  private boolean foraDoHorario(UUID storeId, AgenteConfig cfg, UUID conversaId, Map<String, Object> agente) {
    if ("responder".equals(cfg.foraHorario())) return false;
    Map<String, Object> loja = db.um("select fuso, horario_comercial from crm_lojas where id = ?", storeId);
    Map<String, Object> h = cfg.horario().isEmpty() ? Json.m(loja.get("horarioComercial")) : cfg.horario();
    if (Horarios.aberto(h, ZonedDateTime.now(ZoneId.of(Json.s(loja, "fuso", "America/Sao_Paulo"))))) return false;
    if ("mensagem".equals(cfg.foraHorario()) && !cfg.foraHorarioMensagem().isBlank()
        && db.numero("select count(*) from crm_mensagens where conversa_id = ? and remetente = 'ai' and conteudo = ? and created_at > now() - interval '12' hour", conversaId, cfg.foraHorarioMensagem()) == 0) {
      try {
        atendimento.enviar(storeId, conversaId, Envio.Pedido.texto(cfg.foraHorarioMensagem()), Atendimento.Remetente.ia(UUID.fromString((String) agente.get("id")), (String) agente.get("nome")));
      } catch (Exception e) {
        LOG.warn("Mensagem de fora do horário falhou: " + e.getMessage());
      }
    }
    return true;
  }

  /** Divide a resposta em mensagens (linha em branco separa) e envia com "digitando..." entre elas. */
  private void enviarEmPartes(UUID storeId, UUID conversaId, Map<String, Object> cv, AgenteConfig cfg, UUID agenteId, String nome, String texto) {
    List<String> partes = new ArrayList<>();
    if (cfg.dividir()) {
      for (String p : texto.split("\\n\\s*\\n")) if (!p.isBlank()) partes.add(p.trim());
      while (partes.size() > cfg.dividirBlocos()) {
        String ultimo = partes.remove(partes.size() - 1);
        partes.set(partes.size() - 1, partes.get(partes.size() - 1) + "\n\n" + ultimo);
      }
    } else partes.add(texto);
    for (int i = 0; i < partes.size(); i++) {
      String p = partes.get(i);
      if (i > 0) {
        digitando(storeId, cv);
        dormir(Math.min(6000, 900 + p.length() * 30L));
      }
      atendimento.enviar(storeId, conversaId, Envio.Pedido.texto(p), Atendimento.Remetente.ia(agenteId, nome));
    }
  }

  private void digitando(UUID storeId, Map<String, Object> cv) {
    try {
      if (cv.get("conexaoId") == null || !"whatsapp".equals(cv.get("canal"))) return;
      Conexoes.Conexao cx = conexoes.obter(UUID.fromString((String) cv.get("conexaoId")));
      String wamid = db.valor("select canal_mensagem_id from crm_mensagens where conversa_id = ?::uuid and remetente = 'customer' and canal_mensagem_id is not null order by enviada_em desc limit 1", cv.get("id"));
      if (cx != null && cx.token() != null && wamid != null) meta.lidaEDigitando(cx.phoneNumberId(), cx.token(), wamid, true);
    } catch (Exception e) {
      LOG.debug("digitando: " + e.getMessage());
    }
  }

  /** Próximo follow-up conforme os atrasos do agente, dentro da janela de horário. */
  void programarFollowUp(UUID storeId, UUID conversaId, AgenteConfig cfg, boolean foiFollowUp) {
    if (!cfg.followUp()) {
      db.executa("update crm_conversas set proximo_followup_em = null where id = ?", conversaId);
      return;
    }
    Map<String, Object> cv = db.um("select followups_enviados, ultimo_remetente from crm_conversas where id = ?", conversaId);
    int enviados = Json.i(cv, "followupsEnviados", 0) + (foiFollowUp ? 1 : 0);
    List<Double> atrasos = cfg.followUpAtrasos();
    if (enviados >= cfg.followUpMax()) {
      db.executa("update crm_conversas set followups_enviados = ?, proximo_followup_em = null where id = ?", enviados, conversaId);
      if (foiFollowUp && !cfg.followUpTagFinal().isBlank()) {
        UUID contato = UUID.fromString((String) db.valor("select contato_id::text from crm_conversas where id = ?", conversaId));
        atendimento.adicionarTag(storeId, contato, conversaId, cfg.followUpTagFinal());
      }
      return;
    }
    double horas = atrasos.get(Math.min(enviados, atrasos.size() - 1));
    ZoneId tz = ZoneId.of(Json.s(db.um("select fuso from crm_lojas where id = ?", storeId), "fuso", "America/Sao_Paulo"));
    ZonedDateTime quando = ZonedDateTime.now(tz).plusMinutes(Math.round(horas * 60));
    if (quando.getHour() < cfg.followUpInicio()) quando = quando.withHour(cfg.followUpInicio()).withMinute(0);
    else if (quando.getHour() >= cfg.followUpFim()) quando = quando.plusDays(1).withHour(cfg.followUpInicio()).withMinute(0);
    // respeita também a janela de horário da loja (ex.: lead das 3h só recebe às 15h)
    java.time.Instant permitido = expedicao.proximoPermitido(storeId, quando.toInstant());
    db.executa("update crm_conversas set followups_enviados = ?, proximo_followup_em = ? where id = ?", enviados, permitido, conversaId);
  }

  // ---------------- histórico ----------------

  List<MessageParam> historico(UUID storeId, UUID conversaId, AgenteConfig cfg, String instrucaoExtra) {
    List<Map<String, Object>> msgs = db.lista("""
        select * from (select id, remetente, remetente_nome, tipo, conteudo, legenda, transcricao, midia_url, midia_mime, arquivo_nome, enviada_em
          from crm_mensagens where conversa_id = ? and visibilidade = 'all' and remetente <> 'system' order by enviada_em desc limit ?) x
        order by enviada_em""", conversaId, cfg.historico());
    int imagensRestantes = cfg.visao() ? 4 : 0;
    int docsRestantes = 2;
    // conta de trás para frente para mandar só as imagens/documentos mais recentes
    List<Boolean> incluirMidia = new ArrayList<>();
    for (int i = 0; i < msgs.size(); i++) incluirMidia.add(false);
    for (int i = msgs.size() - 1; i >= 0; i--) {
      Map<String, Object> m = msgs.get(i);
      if (!"customer".equals(m.get("remetente")) || m.get("midiaUrl") == null) continue;
      String mime = String.valueOf(m.get("midiaMime"));
      if ("image".equals(m.get("tipo")) && imagensRestantes > 0 && mime.matches("image/(jpeg|png|gif|webp).*")) {
        incluirMidia.set(i, true);
        imagensRestantes--;
      } else if ("document".equals(m.get("tipo")) && docsRestantes > 0 && mime.startsWith("application/pdf")) {
        incluirMidia.set(i, true);
        docsRestantes--;
      }
    }

    List<MessageParam> out = new ArrayList<>();
    String papelAtual = null;
    List<ContentBlockParam> blocos = new ArrayList<>();
    for (int i = 0; i < msgs.size(); i++) {
      Map<String, Object> m = msgs.get(i);
      String papel = "customer".equals(m.get("remetente")) ? "user" : "assistant";
      List<ContentBlockParam> estes = blocosDe(storeId, m, "user".equals(papel) && incluirMidia.get(i));
      if (estes.isEmpty()) continue;
      if (papelAtual != null && !papel.equals(papelAtual)) {
        out.add(param(papelAtual, blocos));
        blocos = new ArrayList<>();
      }
      papelAtual = papel;
      blocos.addAll(estes);
    }
    if (papelAtual != null) out.add(param(papelAtual, blocos));
    if (out.isEmpty()) return out;
    if (out.get(0).role() == MessageParam.Role.ASSISTANT)
      out.add(0, param("user", List.of(texto("(início do histórico da conversa)"))));
    if (instrucaoExtra != null) {
      if (out.get(out.size() - 1).role() == MessageParam.Role.USER) {
        List<ContentBlockParam> ultimo = new ArrayList<>(out.get(out.size() - 1).content().asBlockParams());
        ultimo.add(texto(instrucaoExtra));
        out.set(out.size() - 1, param("user", ultimo));
      } else out.add(param("user", List.of(texto(instrucaoExtra))));
    } else if (out.get(out.size() - 1).role() == MessageParam.Role.ASSISTANT) {
      return List.of(); // nada novo do cliente
    }
    return out;
  }

  private List<ContentBlockParam> blocosDe(UUID storeId, Map<String, Object> m, boolean comMidia) {
    List<ContentBlockParam> out = new ArrayList<>();
    String tipo = String.valueOf(m.get("tipo"));
    String conteudo = (String) m.get("conteudo");
    String prefixo = "";
    if ("agent".equals(m.get("remetente")))
      prefixo = "(mensagem enviada por " + (m.get("remetenteNome") == null ? "um atendente humano" : m.get("remetenteNome") + ", atendente humano") + ") ";
    switch (tipo) {
      case "audio" -> {
        String t = (String) m.get("transcricao");
        if (t == null && "customer".equals(m.get("remetente"))) t = transcricao.transcrever(storeId, m);
        out.add(texto(prefixo + (t != null ? "[áudio] " + t : "[áudio que não pôde ser transcrito — peça gentilmente para escrever, se precisar]")));
      }
      case "image", "sticker" -> {
        if (comMidia && "image".equals(tipo)) {
          byte[] img = ler(storeId, (String) m.get("midiaUrl"));
          if (img != null && img.length <= MAX_IMAGEM) {
            out.add(ContentBlockParam.ofImage(ImageBlockParam.builder().source(Base64ImageSource.builder()
                .data(Base64.getEncoder().encodeToString(img)).mediaType(Base64ImageSource.MediaType.of(String.valueOf(m.get("midiaMime")).split(";")[0])).build()).build()));
          }
        }
        String leg = conteudo != null ? conteudo : (String) m.get("legenda");
        out.add(texto(prefixo + ("sticker".equals(tipo) ? "[figurinha]" : "[imagem]") + (leg == null ? "" : " " + leg)));
      }
      case "document" -> {
        if (comMidia) {
          byte[] pdf = ler(storeId, (String) m.get("midiaUrl"));
          if (pdf != null && pdf.length <= MAX_IMAGEM)
            out.add(ContentBlockParam.ofDocument(DocumentBlockParam.builder().source(Base64PdfSource.builder().data(Base64.getEncoder().encodeToString(pdf)).build()).build()));
        }
        out.add(texto(prefixo + "[documento " + (m.get("arquivoNome") == null ? "" : m.get("arquivoNome")) + "]" + (conteudo == null ? "" : " " + conteudo)));
      }
      case "video" -> out.add(texto(prefixo + "[vídeo]" + (conteudo == null ? "" : " " + conteudo)));
      case "template" -> out.add(texto(prefixo + (conteudo == null ? "[mensagem modelo]" : conteudo)));
      default -> {
        if (conteudo != null && !conteudo.isBlank()) out.add(texto(prefixo + conteudo));
        else if (!"text".equals(tipo)) out.add(texto(prefixo + "[" + tipo + "]"));
      }
    }
    return out;
  }

  private byte[] ler(UUID storeId, String url) {
    UUID id = Arquivos.idDaUrl(url);
    if (id == null) return null;
    try {
      return arquivos.ler(storeId, id);
    } catch (Exception e) {
      return null;
    }
  }

  private static ContentBlockParam texto(String t) {
    return ContentBlockParam.ofText(TextBlockParam.builder().text(t).build());
  }

  private static MessageParam param(String papel, List<ContentBlockParam> blocos) {
    return MessageParam.builder().role("user".equals(papel) ? MessageParam.Role.USER : MessageParam.Role.ASSISTANT).contentOfBlockParams(blocos).build();
  }

  static OutputConfig.Effort esforco(String e) {
    return switch (e == null ? "" : e) {
      case "low" -> OutputConfig.Effort.LOW;
      case "high" -> OutputConfig.Effort.HIGH;
      default -> OutputConfig.Effort.MEDIUM;
    };
  }

  private static void dormir(long ms) {
    try {
      Thread.sleep(ms);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }
}
