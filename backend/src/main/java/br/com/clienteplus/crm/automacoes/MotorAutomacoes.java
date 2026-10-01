package br.com.clienteplus.crm.automacoes;

import br.com.clienteplus.crm.atendimento.Atendimento;
import br.com.clienteplus.crm.canais.Envio;
import br.com.clienteplus.crm.canais.Expedicao;
import br.com.clienteplus.crm.canais.Templates;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Email;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.comum.Pix;
import br.com.clienteplus.crm.crm.Negocios;
import br.com.clienteplus.crm.eventos.Eventos;
import br.com.clienteplus.crm.ia.AgenteRuntime;
import br.com.clienteplus.crm.ia.Horarios;
import br.com.clienteplus.crm.ia.Redator;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.ObservesAsync;
import jakarta.inject.Inject;
import java.math.BigDecimal;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jboss.logging.Logger;

/**
 * Motor das automações (fluxos visuais). Cada automação é um grafo:
 * gatilhos → condições (sim/não, switch, randomizador) → ações. Esperas e
 * "esperar resposta" ficam gravadas na execução e continuam pelo agendador.
 */
@ApplicationScoped
public class MotorAutomacoes {

  private static final Logger LOG = Logger.getLogger(MotorAutomacoes.class);
  private static final Pattern VAR = Pattern.compile("\\{([a-zA-Z_][a-zA-Z0-9_.]*)}");
  private static final Random RND = new Random();
  private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build();

  @Inject Db db;
  @Inject Atendimento atendimento;
  @Inject Expedicao expedicao;
  @Inject Templates templates;
  @Inject Negocios negocios;
  @Inject Email email;
  @Inject AgenteRuntime runtime;
  @Inject Redator redator;

  sealed interface Passo permits Seguir, Esperar, EsperarResposta, Fim {}
  record Seguir(String saida) implements Passo {}
  record Esperar(Instant ate) implements Passo {}
  record EsperarResposta(Instant limite) implements Passo {}
  record Fim() implements Passo {}

  // ---------------- gatilhos ----------------

  void mensagem(@ObservesAsync Eventos.MensagemRecebida e) {
    // quem está esperando resposta continua primeiro
    boolean continuou = respostaRecebida(e.storeId(), e.conversaId(), e.texto(), e.botaoPayload());
    Map<String, Object> ctx = Json.de("mensagem", e.texto() == null ? "" : e.texto(), "botao", e.botaoPayload());
    String canal = db.valor("select canal from crm_conversas where id = ?", e.conversaId());
    UUID conexao = Formatos.uuid(db.valor("select conexao_id from crm_conversas where id = ?", e.conversaId()));
    if (continuou) return;
    disparar(e.storeId(), e.contatoId(), e.conversaId(), ctx, (tipo, cfg) -> switch (tipo) {
      case "new_message", "message_received" -> casaMensagem(cfg, e.texto(), canal, conexao, e.novaConversa());
      case "button_reply", "button_reply_message" -> e.botaoPayload() != null && casaTexto(Json.s(cfg, "botao", Json.s(cfg, "keyword", "")), e.botaoPayload() + " " + e.texto(), "contains");
      default -> false;
    });
  }

  void tag(@ObservesAsync Eventos.TagAlterada e) {
    String alvo = e.adicionada() ? "tag_added" : "tag_removed";
    disparar(e.storeId(), e.contatoId(), e.conversaId() != null ? e.conversaId() : ultimaConversa(e.contatoId()), Json.de("tag", e.tag()),
        (tipo, cfg) -> (tipo.equals(alvo) || tipo.equals(alvo + "_message")) && (Json.s(cfg, "tag") == null || Json.s(cfg, "tag").equalsIgnoreCase(e.tag())));
  }

  void status(@ObservesAsync Eventos.StatusConversa e) {
    disparar(e.storeId(), e.contatoId(), e.conversaId(), Json.de("status_de", e.de(), "status", e.para()),
        (tipo, cfg) -> (tipo.equals("status_changed") || tipo.equals("status_changed_message"))
            && (Json.s(cfg, "para") == null || Json.s(cfg, "para").equals(e.para())) && (Json.s(cfg, "de") == null || Json.s(cfg, "de").equals(e.de())));
  }

  void etapa(@ObservesAsync Eventos.NegocioEtapa e) {
    if (e.contatoId() == null) return;
    disparar(e.storeId(), e.contatoId(), ultimaConversa(e.contatoId()), Json.de("etapa", e.nomePara(), "negocio_id", e.negocioId().toString()),
        (tipo, cfg) -> tipo.equals("stage_changed") && (Json.s(cfg, "etapa_id") == null || Json.s(cfg, "etapa_id").equals(e.etapaPara().toString())));
  }

  void contato(@ObservesAsync Eventos.ContatoCriado e) {
    disparar(e.storeId(), e.contatoId(), e.conversaId(), Json.de(), (tipo, cfg) -> tipo.equals("contact_created"));
  }

  void compra(@ObservesAsync Eventos.CompraRecebida e) {
    if (e.contatoId() == null) return;
    disparar(e.storeId(), e.contatoId(), ultimaConversa(e.contatoId()), Json.de("produto", e.produto(), "valor", e.valor(), "status_compra", e.status()),
        (tipo, cfg) -> tipo.equals("purchase") && (Json.s(cfg, "status") == null || Json.s(cfg, "status").equals(e.status())));
  }

  void emailRecebido(@ObservesAsync Eventos.EmailRecebido e) {
    disparar(e.storeId(), e.contatoId(), e.conversaId(), Json.de("assunto", e.assunto(), "mensagem", e.texto()), (tipo, cfg) -> tipo.equals("email_received"));
  }

  void manual(@ObservesAsync Eventos.ExecutarAutomacao e) {
    Map<String, Object> a = db.um("select * from crm_automacoes where id = ? and store_id = ?", e.automacaoId(), e.storeId());
    if (a == null) return;
    Map<String, Object> gatilho = null;
    for (Object n : Json.l(Json.m(a.get("grafo")).get("nodes"))) if ("trigger".equals(Json.s(Json.m(n), "kind"))) { gatilho = Json.m(n); break; }
    iniciar(a, gatilho == null ? null : Json.s(gatilho, "id"), e.contatoId(), e.conversaId() != null ? e.conversaId() : ultimaConversa(e.contatoId()), e.dados() == null ? Json.de() : e.dados());
  }

  interface Casa {
    boolean casa(String tipo, Map<String, Object> cfg);
  }

  /** Procura automações ativas com gatilho que casa e inicia uma execução para cada. */
  public void disparar(UUID storeId, UUID contatoId, UUID conversaId, Map<String, Object> ctx, Casa casa) {
    for (Map<String, Object> a : db.lista("select * from crm_automacoes where store_id = ? and status = 'active'", storeId)) {
      for (Object no : Json.l(Json.m(a.get("grafo")).get("nodes"))) {
        Map<String, Object> n = Json.m(no);
        if (!"trigger".equals(Json.s(n, "kind"))) continue;
        try {
          if (casa.casa(Json.s(n, "type", ""), Json.m(n.get("config")))) {
            iniciar(a, Json.s(n, "id"), contatoId, conversaId, new LinkedHashMap<>(ctx));
            break;
          }
        } catch (Exception ex) {
          LOG.warnf("Gatilho da automação %s falhou: %s", a.get("id"), ex.getMessage());
        }
      }
    }
  }

  private boolean casaMensagem(Map<String, Object> cfg, String texto, String canal, UUID conexao, boolean novaConversa) {
    String c = Json.s(cfg, "channel");
    if (c != null && !c.isBlank() && !"any".equals(c) && !c.equals(canal)) return false;
    String cx = Json.s(cfg, "connectionId");
    if (cx != null && !cx.isBlank() && (conexao == null || !cx.equals(conexao.toString()))) return false;
    if (Json.b(cfg, "somenteNovaConversa", false) && !novaConversa) return false;
    String palavra = Json.s(cfg, "keyword", "");
    if (palavra.isBlank() || "any".equals(Json.s(cfg, "matchMode", "any")) && palavra.isBlank()) return true;
    return casaTexto(palavra, texto, Json.s(cfg, "matchMode", "contains"));
  }

  public static boolean casaTextoPublico(String padrao, String texto) {
    return casaTexto(padrao, texto, "contains");
  }

  static boolean casaTexto(String padrao, String texto, String modo) {
    if (padrao == null || padrao.isBlank()) return true;
    String t = Formatos.semAcento(texto == null ? "" : texto).toLowerCase().trim();
    for (String p : padrao.split("[,;\\n]")) {
      String alvo = Formatos.semAcento(p).toLowerCase().trim();
      if (alvo.isEmpty()) continue;
      boolean ok = switch (modo == null ? "contains" : modo) {
        case "equals", "exact" -> t.equals(alvo);
        case "starts_with" -> t.startsWith(alvo);
        default -> t.contains(alvo);
      };
      if (ok) return true;
    }
    return false;
  }

  private UUID ultimaConversa(UUID contatoId) {
    return Formatos.uuid(db.valor("select id from crm_conversas where contato_id = ? order by ultima_mensagem_em desc nulls last limit 1", contatoId));
  }

  // ---------------- execução ----------------

  public UUID iniciar(Map<String, Object> a, String noInicial, UUID contatoId, UUID conversaId, Map<String, Object> ctx) {
    UUID storeId = UUID.fromString((String) a.get("storeId"));
    UUID automacaoId = UUID.fromString((String) a.get("id"));
    if (contatoId != null) {
      // trava de repetição (configurável) e anti-laço (30 s)
      int horas = Json.i(a, "intervaloRepeticaoHoras", 0);
      String janela = horas > 0 ? horas + " hours" : "30 seconds";
      if (db.numero("select count(*) from crm_automacao_execucoes where automacao_id = ? and contato_id = ? and created_at > now() - ?::interval", automacaoId, contatoId, janela) > 0) return null;
    }
    Map<String, Object> ex = db.insere("crm_automacao_execucoes", Json.de("store_id", storeId, "automacao_id", automacaoId, "contato_id", contatoId,
        "conversa_id", conversaId, "status", "running", "no_atual", noInicial, "contexto", ctx));
    db.executa("update crm_automacoes set execucoes = execucoes + 1, ultima_execucao_em = now() where id = ?", automacaoId);
    UUID id = UUID.fromString((String) ex.get("id"));
    Thread.startVirtualThread(() -> rodar(id, "saida"));
    return id;
  }

  /** Continua a execução a partir do nó atual, seguindo a saída indicada. */
  public void rodar(UUID execucaoId, String saidaInicial) {
    Map<String, Object> ex = db.um("select * from crm_automacao_execucoes where id = ?", execucaoId);
    if (ex == null) return;
    Map<String, Object> a = db.um("select * from crm_automacoes where id = ?::uuid", ex.get("automacaoId"));
    if (a == null) return;
    Map<String, Object> grafo = Json.m(a.get("grafo"));
    Map<String, Map<String, Object>> nos = new LinkedHashMap<>();
    for (Object o : Json.l(grafo.get("nodes"))) nos.put(Json.s(Json.m(o), "id"), Json.m(o));
    List<Map<String, Object>> ligacoes = new ArrayList<>();
    for (Object o : Json.l(grafo.get("edges"))) ligacoes.add(Json.m(o));

    UUID storeId = UUID.fromString((String) ex.get("storeId"));
    UUID contatoId = Formatos.uuid(ex.get("contatoId"));
    UUID conversaId = Formatos.uuid(ex.get("conversaId"));
    Map<String, Object> ctx = Json.m(ex.get("contexto"));
    List<Object> passos = new ArrayList<>(Json.l(ex.get("passos")));
    String atual = (String) ex.get("noAtual");
    String saida = saidaInicial;
    try {
      for (int guarda = 0; guarda < 200; guarda++) {
        String proximo = proximoNo(ligacoes, atual, saida, nos);
        if (proximo == null) {
          terminar(execucaoId, "done", null, ctx, passos, atual);
          return;
        }
        Map<String, Object> no = nos.get(proximo);
        atual = proximo;
        Passo p;
        try {
          p = executarNo(storeId, contatoId, conversaId, no, ctx);
          passos.add(Json.de("no", proximo, "tipo", no.get("type"), "ok", true, "em", Instant.now().toString(), "saida", p instanceof Seguir s ? s.saida() : p.getClass().getSimpleName()));
        } catch (Exception e) {
          passos.add(Json.de("no", proximo, "tipo", no.get("type"), "ok", false, "erro", e.getMessage(), "em", Instant.now().toString()));
          LOG.warnf("Automação %s, nó %s: %s", a.get("id"), no.get("type"), e.getMessage());
          p = new Seguir("erro");
          if (proximoNo(ligacoes, atual, "erro", nos) == null) {
            terminar(execucaoId, "error", e.getMessage(), ctx, passos, atual);
            return;
          }
        }
        if (p instanceof Esperar esp) {
          db.executa("update crm_automacao_execucoes set status = 'waiting', no_atual = ?, retomar_em = ?, contexto = ?::jsonb, passos = ?::jsonb where id = ?", atual, esp.ate(), ctx, passos, execucaoId);
          return;
        }
        if (p instanceof EsperarResposta er) {
          db.executa("update crm_automacao_execucoes set status = 'waiting_reply', no_atual = ?, retomar_em = ?, contexto = ?::jsonb, passos = ?::jsonb where id = ?", atual, er.limite(), ctx, passos, execucaoId);
          return;
        }
        if (p instanceof Fim) {
          terminar(execucaoId, "done", null, ctx, passos, atual);
          return;
        }
        saida = ((Seguir) p).saida();
      }
      terminar(execucaoId, "error", "Fluxo longo demais (possível laço)", ctx, passos, atual);
    } catch (Exception e) {
      terminar(execucaoId, "error", e.getMessage(), ctx, passos, atual);
    }
  }

  private void terminar(UUID id, String status, String erro, Map<String, Object> ctx, List<Object> passos, String no) {
    db.executa("update crm_automacao_execucoes set status = ?, erro = ?, contexto = ?::jsonb, passos = ?::jsonb, no_atual = ?, finalizada_em = now(), retomar_em = null where id = ?",
        status, erro, ctx, passos, no, id);
  }

  /** Próximo nó: se o atual for null, é o primeiro nó ligado a um gatilho. */
  private static String proximoNo(List<Map<String, Object>> ligacoes, String atual, String saida, Map<String, Map<String, Object>> nos) {
    if (atual == null) {
      for (Map<String, Object> e : ligacoes) {
        Map<String, Object> origem = nos.get(Json.s(e, "source"));
        if (origem != null && "trigger".equals(Json.s(origem, "kind"))) return Json.s(e, "target");
      }
      return null;
    }
    String padrao = null;
    for (Map<String, Object> e : ligacoes) {
      if (!atual.equals(Json.s(e, "source"))) continue;
      String h = Json.s(e, "sourceHandle", Json.s(e, "conditionResult"));
      if (h == null || h.isBlank() || "saida".equals(h)) {
        if (padrao == null) padrao = Json.s(e, "target");
        if ("saida".equals(saida)) return Json.s(e, "target");
      } else if (h.equals(saida)) return Json.s(e, "target");
    }
    return "erro".equals(saida) || "no".equals(saida) || "timeout".equals(saida) ? null : padrao;
  }

  // ---------------- nós ----------------

  private Passo executarNo(UUID storeId, UUID contatoId, UUID conversaId, Map<String, Object> no, Map<String, Object> ctx) {
    String kind = Json.s(no, "kind", "action");
    String tipo = Json.s(no, "type", "");
    Map<String, Object> cfg = Json.m(no.get("config"));
    if ("trigger".equals(kind)) return new Seguir("saida");
    if ("condition".equals(kind) || List.of("switch", "randomizer", "fallback").contains(tipo)) return condicao(storeId, contatoId, conversaId, tipo, cfg, ctx);
    Map<String, Object> contato = contatoId == null ? Json.de() : db.um("select * from crm_contatos where id = ?", contatoId);
    java.util.function.UnaryOperator<String> preencher = s -> preencher(s, contato, ctx);
    Atendimento.Remetente rem = Atendimento.Remetente.sistema("Automação");
    boolean ignorarJanela = Json.b(cfg, "ignorar_janela", false);
    Map<String, Object> reserva = templateReserva(storeId, cfg, preencher);

    switch (tipo) {
      case "send_message", "send_instagram", "text", "image", "audio", "file" -> {
        exigirConversa(conversaId);
        List<Object> msgs = Json.l(cfg.get("mensagens"));
        if (msgs.isEmpty()) msgs = List.of(Json.de("tipo", switch (tipo) { case "image" -> "image"; case "audio" -> "audio"; case "file" -> "document"; default -> Json.s(cfg, "tipo", "text"); },
            "texto", Json.s(cfg, "texto", Json.s(cfg, "message")), "url", Json.s(cfg, "url"), "nome", Json.s(cfg, "nome")));
        for (Object mo : msgs) {
          Map<String, Object> m = Json.m(mo);
          String t = Json.s(m, "tipo", "text");
          Envio.Pedido p = "text".equals(t) ? Envio.Pedido.texto(preencher.apply(Json.s(m, "texto", "")))
              : Envio.Pedido.midia(t, Json.s(m, "url"), Json.s(m, "mime"), Json.s(m, "nome"), preencher.apply(Json.s(m, "texto", "")));
          if ("text".equals(t) && (p.texto() == null || p.texto().isBlank())) continue;
          enviar(storeId, conversaId, p, reserva, rem, ignorarJanela);
        }
        return new Seguir("saida");
      }
      case "send_list" -> {
        exigirConversa(conversaId);
        List<Map<String, Object>> ops = new ArrayList<>();
        int i = 0;
        for (Object o : Json.l(cfg.get("opcoes"))) {
          Map<String, Object> op = Json.m(o);
          ops.add(Json.de("id", Json.s(op, "id", "op" + (++i)), "titulo", preencher.apply(Json.s(op, "titulo", "")), "descricao", Json.s(op, "descricao")));
        }
        String tipoEnvio = ops.size() <= 3 && !Json.b(cfg, "forcar_lista", false) ? "buttons" : "list";
        Map<String, Object> inter = "buttons".equals(tipoEnvio) ? Json.de("opcoes", ops, "rodape", Json.s(cfg, "rodape"))
            : Json.de("titulo", Json.s(cfg, "titulo"), "rodape", Json.s(cfg, "rodape"), "botao", Json.s(cfg, "botao", "Ver opções"), "secoes", List.of(Json.de("titulo", Json.s(cfg, "secao", "Opções"), "opcoes", ops)));
        enviar(storeId, conversaId, new Envio.Pedido(tipoEnvio, preencher.apply(Json.s(cfg, "texto", "Escolha uma opção")), null, null, null, null, null, inter, null), reserva, rem, ignorarJanela);
        return new Seguir("saida");
      }
      case "send_hsm_template" -> {
        exigirConversa(conversaId);
        Map<String, Object> t = templates.montar(storeId, Formatos.uuid(cfg.get("template_id")), Json.m(cfg.get("variaveis")), preencher);
        enviar(storeId, conversaId, new Envio.Pedido("template", null, null, null, null, null, t, null, null), null, rem, ignorarJanela);
        return new Seguir("saida");
      }
      case "send_email" -> {
        String para = preencher.apply(Json.s(cfg, "para", "{email}"));
        email.enviar(storeId, para, preencher.apply(Json.s(cfg, "assunto", "")), preencher.apply(Json.s(cfg, "corpo", "")).replace("\n", "<br>"));
        return new Seguir("saida");
      }
      case "ai_message" -> {
        exigirConversa(conversaId);
        UUID agente = Formatos.uuid(cfg.get("agente_id"));
        if (agente == null) agente = Formatos.uuid(db.valor("select agente_id from crm_conversas where id = ?", conversaId));
        String texto = redator.escrever(storeId, agente, conversaId, preencher.apply(Json.s(cfg, "instrucao", "Escreva a próxima mensagem para o cliente.")));
        if (Json.s(cfg, "salvar_em") != null) ctx.put(Json.s(cfg, "salvar_em").replaceFirst("^var\\.", ""), texto);
        if (Json.b(cfg, "enviar", true) && texto != null && !texto.isBlank()) {
          String nome = agente == null ? "IA" : db.valor("select nome from crm_agentes where id = ?", agente);
          for (String parte : texto.split("\\n\\s*\\n")) if (!parte.isBlank()) enviar(storeId, conversaId, Envio.Pedido.texto(parte.trim()), reserva, Atendimento.Remetente.ia(agente, nome), ignorarJanela);
        }
        return new Seguir("saida");
      }
      case "assign_agent" -> {
        exigirConversa(conversaId);
        UUID agente = Formatos.uuid(cfg.get("agente_id"));
        if (agente == null) atendimento.devolverIa(storeId, conversaId, null);
        else {
          db.executa("update crm_conversas set agente_id = ?, ia_ativa = true, atribuida_a = 'ai', handoff_status = 'ai' where id = ? and store_id = ?", agente, conversaId, storeId);
          atendimento.emitirConversa(storeId, conversaId);
        }
        if (Json.b(cfg, "responder_agora", false)) runtime.agendar(storeId, conversaId, 1);
        return new Seguir("saida");
      }
      case "transfer_human" -> {
        exigirConversa(conversaId);
        atendimento.transferirHumano(storeId, conversaId, Formatos.uuid(cfg.get("usuario_id")), Formatos.uuid(cfg.get("setor_id")), preencher.apply(Json.s(cfg, "motivo", "Automação")));
        return new Seguir("saida");
      }
      case "add_tag", "add_tags" -> {
        List<String> tags = Json.ls(cfg, "tags");
        if (Json.s(cfg, "tag") != null) tags.add(Json.s(cfg, "tag"));
        for (String t : tags) atendimento.adicionarTag(storeId, contatoId, conversaId, preencher.apply(t));
        return new Seguir("saida");
      }
      case "remove_tag", "remove_tags" -> {
        List<String> tags = Json.ls(cfg, "tags");
        if (Json.s(cfg, "tag") != null) tags.add(Json.s(cfg, "tag"));
        for (String t : tags) atendimento.removerTag(storeId, contatoId, conversaId, preencher.apply(t));
        return new Seguir("saida");
      }
      case "set_status" -> {
        exigirConversa(conversaId);
        atendimento.mudarStatus(storeId, conversaId, Json.s(cfg, "status", "resolved"));
        return new Seguir("saida");
      }
      case "edit_fields", "set_field" -> {
        for (Object o : Json.l(cfg.get("campos")).isEmpty() ? List.of(cfg) : Json.l(cfg.get("campos"))) setCampo(storeId, contatoId, Json.m(o), ctx, preencher);
        return new Seguir("saida");
      }
      case "create_lead" -> {
        String tel = Formatos.telefone(preencher.apply(Json.s(cfg, "telefone", "{webhook.telefone}")));
        if (tel == null) throw new IllegalArgumentException("Sem telefone para criar o lead");
        var ct = atendimento.contatoPorTelefone(storeId, tel, preencher.apply(Json.s(cfg, "nome", "")), null, "automacao");
        ctx.put("contato_id", ct.id().toString());
        db.executa("update crm_automacao_execucoes set contato_id = ? where contato_id is null and automacao_id in (select automacao_id from crm_automacao_execucoes where id = (select id from crm_automacao_execucoes where contexto->>'contato_id' = ? limit 1))", ct.id(), ct.id().toString());
        return new Seguir("saida");
      }
      case "create_deal" -> {
        if (contatoId == null) throw new IllegalArgumentException("Sem contato");
        Map<String, Object> d = Json.de("funilId", cfg.get("funil_id"), "etapaId", cfg.get("etapa_id"), "contatoId", contatoId.toString(),
            "titulo", preencher.apply(Json.s(cfg, "titulo", Json.s(contato, "nome", "Novo negócio"))), "valor", Json.d(cfg, "valor", 0), "origem", "automacao");
        Map<String, Object> n = negocios.criar(storeId, d, null);
        ctx.put("negocio_id", n.get("id"));
        return new Seguir("saida");
      }
      case "move_deal" -> {
        if (contatoId == null) throw new IllegalArgumentException("Sem contato");
        Map<String, Object> n = negocios.garantir(storeId, contatoId, conversaId, "automacao");
        if (n != null) negocios.mover(storeId, UUID.fromString((String) n.get("id")), Formatos.uuid(cfg.get("etapa_id")), "automacao", null, Json.s(no, "name"));
        return new Seguir("saida");
      }
      case "delete_lead" -> {
        if (contatoId != null) db.executa("delete from crm_contatos where id = ? and store_id = ?", contatoId, storeId);
        return new Fim();
      }
      case "generate_pix" -> {
        exigirConversa(conversaId);
        Map<String, Object> pix = Json.m(Json.m(db.valor("select config from crm_lojas where id = ?", storeId)).get("pix"));
        if (Json.s(pix, "chave") == null) throw new IllegalArgumentException("Configure a chave Pix da loja");
        double valor = Double.parseDouble(preencher.apply(Json.s(cfg, "valor", "0")).replace(",", "."));
        String codigo = Pix.copiaECola(Json.s(pix, "chave"), db.valor("select nome from crm_lojas where id = ?", storeId), Json.s(pix, "cidade", "BRASIL"), BigDecimal.valueOf(valor), "AUT" + System.currentTimeMillis());
        ctx.put("pix", codigo);
        if (Json.s(cfg, "texto") != null) enviar(storeId, conversaId, Envio.Pedido.texto(preencher.apply(Json.s(cfg, "texto"))), reserva, rem, ignorarJanela);
        enviar(storeId, conversaId, Envio.Pedido.texto(codigo), reserva, rem, ignorarJanela);
        return new Seguir("saida");
      }
      case "call_webhook", "http_request" -> {
        String acao = Json.s(cfg, "actionId");
        if (acao != null && !acao.isBlank() && !"http_request".equals(acao)) {
          // nós "Ação" do Meppy (config.actionId): add_tags, remove_tags...
          return executarNo(storeId, contatoId, conversaId, Json.de("kind", "action", "type", acao, "config", cfg), ctx);
        }
        requisicaoHttp(cfg, ctx, preencher);
        return new Seguir("saida");
      }
      case "notify_team" -> {
        atendimento.notificarEquipe(storeId, "automacao", preencher.apply(Json.s(cfg, "titulo", "Aviso de automação")), preencher.apply(Json.s(cfg, "texto", "")),
            conversaId == null ? null : "/conversas?c=" + conversaId);
        return new Seguir("saida");
      }
      case "delay", "wait" -> {
        long qtd = Math.max(0, (long) Json.d(cfg, "quantidade", Json.d(cfg, "amount", 1)));
        String un = Json.s(cfg, "unidade", Json.s(cfg, "unit", "minutos"));
        Duration d = switch (un) {
          case "segundos", "seconds" -> Duration.ofSeconds(qtd);
          case "horas", "hours" -> Duration.ofHours(qtd);
          case "dias", "days" -> Duration.ofDays(qtd);
          default -> Duration.ofMinutes(qtd);
        };
        Instant ate = Instant.now().plus(d);
        String horaFixa = Json.s(cfg, "hora_fixa");
        if (horaFixa != null && !horaFixa.isBlank()) {
          ZoneId tz = expedicao.fuso(storeId);
          ZonedDateTime z = ate.atZone(tz).with(java.time.LocalTime.parse(horaFixa.length() == 4 ? "0" + horaFixa : horaFixa));
          if (z.toInstant().isBefore(ate)) z = z.plusDays(1);
          ate = z.toInstant();
        }
        if (!ignorarJanela) ate = expedicao.proximoPermitido(storeId, ate);
        return new Esperar(ate);
      }
      case "next_reply", "wait_reply" -> {
        long horas = (long) Json.d(cfg, "tempo_limite_horas", 24);
        return new EsperarResposta(Instant.now().plus(Duration.ofHours(Math.max(1, horas))));
      }
      case "end", "fim" -> {
        return new Fim();
      }
      case "run_js" -> throw new IllegalArgumentException("O bloco JavaScript não é executado por segurança. Use 'Operações de campos' ou 'Webhook'.");
      default -> throw new IllegalArgumentException("Ação desconhecida: " + tipo);
    }
  }

  private Passo condicao(UUID storeId, UUID contatoId, UUID conversaId, String tipo, Map<String, Object> cfg, Map<String, Object> ctx) {
    Map<String, Object> contato = contatoId == null ? Json.de() : db.um("select * from crm_contatos where id = ?", contatoId);
    Map<String, Object> conversa = conversaId == null ? Json.de() : db.um("select * from crm_conversas where id = ?", conversaId);
    boolean r;
    switch (tipo) {
      case "customer_has_tag" -> {
        String tag = Json.s(cfg, "tag", "");
        r = Json.ls(contato, "tags").stream().anyMatch(t -> t.equalsIgnoreCase(tag));
      }
      case "channel_is" -> r = Json.s(cfg, "channel", "").equals(Json.s(conversa, "canal"));
      case "status_is" -> r = Json.s(cfg, "status", "").equals(Json.s(conversa, "status"));
      case "contains_keyword" -> r = casaTexto(Json.s(cfg, "keyword", Json.s(cfg, "palavras", "")), Json.s(ctx, "resposta", Json.s(ctx, "mensagem", "")), Json.s(cfg, "matchMode", "contains"));
      case "lead_exists" -> r = contatoId != null && db.numero("select count(*) from crm_negocios where contato_id = ? and ganho_em is null and perdido_em is null", contatoId) > 0;
      case "business_hours" -> {
        Map<String, Object> loja = db.um("select fuso, horario_comercial from crm_lojas where id = ?", storeId);
        r = Horarios.aberto(Json.m(loja.get("horarioComercial")), ZonedDateTime.now(ZoneId.of(Json.s(loja, "fuso", "America/Sao_Paulo"))));
      }
      case "stage_is" -> r = contatoId != null && db.numero("select count(*) from crm_negocios where contato_id = ? and etapa_id = ?::uuid", contatoId, Json.s(cfg, "etapa_id")) > 0;
      case "randomizer" -> {
        List<Object> ramos = Json.l(cfg.get("ramos"));
        if (ramos.isEmpty()) return new Seguir(RND.nextBoolean() ? "a" : "b");
        double total = 0;
        for (Object o : ramos) total += Json.d(Json.m(o), "percentual", 0);
        double x = RND.nextDouble() * (total <= 0 ? 1 : total);
        for (Object o : ramos) {
          x -= Json.d(Json.m(o), "percentual", 0);
          if (x <= 0) return new Seguir(Json.s(Json.m(o), "id"));
        }
        return new Seguir(Json.s(Json.m(ramos.get(ramos.size() - 1)), "id"));
      }
      case "switch" -> {
        String valor = valorVariavel(Json.s(cfg, "variavel", "mensagem"), contato, ctx);
        for (Object o : Json.l(cfg.get("casos"))) {
          Map<String, Object> caso = Json.m(o);
          if (compara(valor, Json.s(caso, "operador", "equals"), preencher(Json.s(caso, "valor", ""), contato, ctx))) return new Seguir(Json.s(caso, "id"));
        }
        return new Seguir("default");
      }
      case "fallback" -> {
        return new Seguir("saida");
      }
      default -> {
        String valor = valorVariavel(Json.s(cfg, "variavel", "mensagem"), contato, ctx);
        r = compara(valor, Json.s(cfg, "operador", "equals"), preencher(Json.s(cfg, "valor", ""), contato, ctx));
      }
    }
    return new Seguir(r ? "yes" : "no");
  }

  static boolean compara(String v, String op, String alvo) {
    String a = v == null ? "" : v, b = alvo == null ? "" : alvo;
    String an = Formatos.semAcento(a).toLowerCase(), bn = Formatos.semAcento(b).toLowerCase();
    return switch (op) {
      case "not_equals" -> !an.equals(bn);
      case "contains" -> an.contains(bn);
      case "not_contains" -> !an.contains(bn);
      case "starts_with" -> an.startsWith(bn);
      case "ends_with" -> an.endsWith(bn);
      case "regex" -> {
        try {
          yield Pattern.compile(b, Pattern.CASE_INSENSITIVE).matcher(a).find();
        } catch (Exception e) {
          yield false;
        }
      }
      case "is_empty" -> a.isBlank();
      case "not_empty", "has_key" -> !a.isBlank();
      case "not_has_key" -> a.isBlank();
      case "is_true" -> List.of("true", "sim", "1", "yes").contains(an);
      case "is_false" -> List.of("false", "nao", "0", "no", "").contains(an);
      case "greater_than" -> num(a) > num(b);
      case "less_than" -> num(a) < num(b);
      default -> an.equals(bn);
    };
  }

  private static double num(String s) {
    try {
      return Double.parseDouble(s.replace(",", "."));
    } catch (Exception e) {
      return 0;
    }
  }

  // ---------------- apoio ----------------

  private void enviar(UUID storeId, UUID conversaId, Envio.Pedido p, Map<String, Object> reserva, Atendimento.Remetente rem, boolean ignorarJanela) {
    if (ignorarJanela) {
      atendimento.enviar(storeId, conversaId, p, rem);
      return;
    }
    Expedicao.Resultado r = expedicao.enviarAutomatico(storeId, conversaId, p, reserva, rem, "automacao");
    if (r == Expedicao.Resultado.SEM_JANELA_24H) throw new IllegalStateException("Janela de 24 h fechada e sem template reserva");
  }

  private Map<String, Object> templateReserva(UUID storeId, Map<String, Object> cfg, java.util.function.UnaryOperator<String> preencher) {
    UUID t = Formatos.uuid(cfg.get("template_reserva_id"));
    if (t == null) return null;
    try {
      return templates.montar(storeId, t, Json.m(cfg.get("template_reserva_variaveis")), preencher);
    } catch (Exception e) {
      return null;
    }
  }

  private static void exigirConversa(UUID conversaId) {
    if (conversaId == null) throw new IllegalArgumentException("Este contato ainda não tem conversa");
  }

  private void setCampo(UUID storeId, UUID contatoId, Map<String, Object> c, Map<String, Object> ctx, java.util.function.UnaryOperator<String> preencher) {
    String campo = Json.s(c, "campo", "");
    String op = Json.s(c, "operacao", "set");
    String valor = preencher.apply(Json.s(c, "valor", ""));
    if (campo.startsWith("var.")) {
      String k = campo.substring(4);
      ctx.put(k, novoValor(Json.s(ctx, k), op, valor));
      return;
    }
    if (contatoId == null) return;
    switch (campo) {
      case "contato.nome", "nome" -> db.executa("update crm_contatos set nome = ? where id = ? and store_id = ?", novoValor(null, op, valor), contatoId, storeId);
      case "contato.email", "email" -> db.executa("update crm_contatos set email = ? where id = ? and store_id = ?", novoValor(null, op, valor), contatoId, storeId);
      case "contato.notas", "notas" -> db.executa("update crm_contatos set notas = ? where id = ? and store_id = ?",
          novoValor(db.valor("select notas from crm_contatos where id = ?", contatoId), op, valor), contatoId, storeId);
      default -> {
        String k = campo.replaceFirst("^(campo|campos)\\.", "");
        String atual = db.valor("select campos->>? from crm_contatos where id = ?", k, contatoId);
        String novo = novoValor(atual, op, valor);
        db.executa("update crm_contatos set campos = case when ?::text is null then campos - ? else jsonb_set(campos, array[?], to_jsonb(?::text)) end where id = ? and store_id = ?",
            novo, k, k, novo, contatoId, storeId);
      }
    }
  }

  private static String novoValor(String atual, String op, String valor) {
    return switch (op) {
      case "increment" -> String.valueOf(num(atual == null ? "0" : atual) + num(valor)).replaceAll("\\.0$", "");
      case "decrement" -> String.valueOf(num(atual == null ? "0" : atual) - num(valor)).replaceAll("\\.0$", "");
      case "append" -> (atual == null || atual.isBlank() ? "" : atual + "\n") + valor;
      case "clear" -> null;
      default -> valor;
    };
  }

  /** Webhook de saída; bloqueia endereços internos (proteção contra SSRF). */
  private void requisicaoHttp(Map<String, Object> cfg, Map<String, Object> ctx, java.util.function.UnaryOperator<String> preencher) {
    String url = preencher.apply(Json.s(cfg, "url", ""));
    URI uri = URI.create(url);
    if (!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme())) throw new IllegalArgumentException("Endereço inválido");
    try {
      for (InetAddress ip : InetAddress.getAllByName(uri.getHost()))
        if (ip.isAnyLocalAddress() || ip.isLoopbackAddress() || ip.isSiteLocalAddress() || ip.isLinkLocalAddress() || ip.isMulticastAddress())
          throw new IllegalArgumentException("Endereços internos não são permitidos");
    } catch (java.net.UnknownHostException e) {
      throw new IllegalArgumentException("Endereço não encontrado");
    }
    String metodo = Json.s(cfg, "metodo", Json.s(cfg, "method", "POST")).toUpperCase();
    HttpRequest.Builder b = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20));
    for (var h : Json.m(cfg.get("headers")).entrySet()) b.header(h.getKey(), preencher.apply(String.valueOf(h.getValue())));
    String corpo = Json.s(cfg, "corpo", Json.s(cfg, "body"));
    if (corpo == null) corpo = Json.texto(Json.de("contato", ctx.get("contato"), "mensagem", ctx.get("mensagem"), "variaveis", ctx));
    if ("GET".equals(metodo)) b.GET();
    else b.header("Content-Type", "application/json").method(metodo, HttpRequest.BodyPublishers.ofString(preencher.apply(corpo)));
    try {
      HttpResponse<String> r = http.send(b.build(), HttpResponse.BodyHandlers.ofString());
      ctx.put("http_status", r.statusCode());
      String body = r.body() == null ? "" : r.body();
      try {
        ctx.put("http", Json.ler(body.length() > 100_000 ? "{}" : body, Object.class));
      } catch (Exception e) {
        ctx.put("http", Formatos.curto(body, 2000));
      }
      if (r.statusCode() >= 400) throw new IllegalStateException("Webhook respondeu " + r.statusCode());
    } catch (IllegalStateException e) {
      throw e;
    } catch (Exception e) {
      throw new IllegalStateException("Webhook sem resposta: " + e.getMessage());
    }
  }

  /** Troca {nome}, {primeiro_nome}, {telefone}, {email}, {mensagem}, {resposta}, {campo.x}, {http.a.b}, {webhook.a} ... */
  public static String preencher(String s, Map<String, Object> contato, Map<String, Object> ctx) {
    if (s == null) return null;
    Matcher m = VAR.matcher(s);
    StringBuilder sb = new StringBuilder();
    while (m.find()) m.appendReplacement(sb, Matcher.quoteReplacement(valorVariavel(m.group(1), contato, ctx)));
    m.appendTail(sb);
    return sb.toString();
  }

  static String valorVariavel(String nome, Map<String, Object> contato, Map<String, Object> ctx) {
    String nomeC = Json.s(contato, "nome", "");
    Object v = switch (nome) {
      case "nome" -> nomeC.isBlank() ? "" : nomeC;
      case "primeiro_nome" -> nomeC.isBlank() ? "" : nomeC.trim().split("\\s+")[0];
      case "telefone" -> Json.s(contato, "telefone", "");
      case "email" -> Json.s(contato, "email", "");
      case "tags" -> String.join(", ", Json.ls(contato, "tags"));
      default -> {
        if (nome.startsWith("campo.")) yield Json.m(contato.get("campos")).get(nome.substring(6));
        Object atual = ctx;
        for (String parte : nome.split("\\.")) {
          if (atual instanceof Map<?, ?> mm) atual = mm.get(parte);
          else if (atual instanceof List<?> l && parte.matches("\\d+") && Integer.parseInt(parte) < l.size()) atual = l.get(Integer.parseInt(parte));
          else { atual = null; break; }
        }
        yield atual;
      }
    };
    return v == null ? "" : v instanceof Map || v instanceof List ? Json.texto(v) : String.valueOf(v);
  }

  // ---------------- retomadas (chamadas pelo agendador) ----------------

  public boolean respostaRecebida(UUID storeId, UUID conversaId, String texto, String botao) {
    boolean algum = false;
    for (Map<String, Object> ex : db.lista("select id, contexto from crm_automacao_execucoes where conversa_id = ? and status = 'waiting_reply'", conversaId)) {
      UUID id = UUID.fromString((String) ex.get("id"));
      Map<String, Object> ctx = Json.m(ex.get("contexto"));
      ctx.put("resposta", texto == null ? "" : texto);
      if (botao != null) ctx.put("botao", botao);
      if (db.executa("update crm_automacao_execucoes set status = 'running', retomar_em = null, contexto = ?::jsonb where id = ? and status = 'waiting_reply'", ctx, id) > 0) {
        algum = true;
        Thread.startVirtualThread(() -> rodar(id, "resposta"));
      }
    }
    return algum;
  }

  public void retomarVencidas() {
    for (Map<String, Object> ex : db.lista("select id, status from crm_automacao_execucoes where status in ('waiting','waiting_reply') and retomar_em <= now() limit 200")) {
      UUID id = UUID.fromString((String) ex.get("id"));
      String saida = "waiting_reply".equals(ex.get("status")) ? "timeout" : "saida";
      if (db.executa("update crm_automacao_execucoes set status = 'running' where id = ? and status = ?", id, ex.get("status")) > 0) rodar(id, saida);
    }
  }

  /** Gatilho "Agendamento": roda no horário para o público escolhido (tags). */
  public void agendadas() {
    for (Map<String, Object> a : db.lista("select * from crm_automacoes where status = 'active'")) {
      for (Object no : Json.l(Json.m(a.get("grafo")).get("nodes"))) {
        Map<String, Object> n = Json.m(no);
        if (!"trigger".equals(Json.s(n, "kind")) || !List.of("schedule", "scheduled").contains(Json.s(n, "type", ""))) continue;
        Map<String, Object> cfg = Json.m(n.get("config"));
        UUID storeId = UUID.fromString((String) a.get("storeId"));
        ZoneId tz = expedicao.fuso(storeId);
        ZonedDateTime agora = ZonedDateTime.now(tz);
        String hora = Json.s(cfg, "hora", "09:00");
        List<String> dias = Json.ls(cfg, "dias");
        String data = Json.s(cfg, "data");
        if (data != null && !data.isBlank() && !data.equals(agora.toLocalDate().toString())) continue;
        if (!dias.isEmpty() && !dias.contains(Horarios.dia(agora.getDayOfWeek()))) continue;
        if (!agora.toLocalTime().withSecond(0).withNano(0).toString().equals(hora.length() == 4 ? "0" + hora : hora)) continue;
        String chave = a.get("id") + ":" + agora.toLocalDate() + ":" + hora;
        if (db.numero("select count(*) from crm_lembretes_enviados where tipo = 'automacao_agendada' and referencia = ?", chave) > 0) continue;
        db.executa("insert into crm_lembretes_enviados (store_id, contato_id, tipo, referencia) select ?, id, 'automacao_agendada', ? from crm_contatos where store_id = ? limit 1", storeId, chave, storeId);
        List<String> tags = Json.ls(cfg, "tags");
        List<Map<String, Object>> publico = db.lista("select id from crm_contatos where store_id = ? and not opt_out and (cardinality(?::text[]) = 0 or tags && ?::text[]) limit 5000",
            storeId, br.com.clienteplus.crm.comum.Db.texto(tags), br.com.clienteplus.crm.comum.Db.texto(tags));
        for (Map<String, Object> c : publico) {
          UUID contato = UUID.fromString((String) c.get("id"));
          iniciar(a, Json.s(n, "id"), contato, ultimaConversa(contato), Json.de());
        }
      }
    }
  }
}
