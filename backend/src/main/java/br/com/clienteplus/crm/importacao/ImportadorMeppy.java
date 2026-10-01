package br.com.clienteplus.crm.importacao;

import br.com.clienteplus.crm.comum.Arquivos;
import br.com.clienteplus.crm.comum.Cripto;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.lojas.Lojas;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Importa a cópia dos dados do Meppy (pasta dados-meppy) para uma empresa do
 * sistema. Pode rodar de novo: o que já veio (externo_id) não duplica.
 *
 * Por segurança o agente de IA e as automações chegam DESLIGADOS e a conexão
 * do WhatsApp "desconectada" — o Meppy continua em uso até a troca.
 */
@ApplicationScoped
public class ImportadorMeppy {

  private static final Logger LOG = Logger.getLogger(ImportadorMeppy.class);
  private static final DateTimeFormatter JS_DATA = DateTimeFormatter.ofPattern("EEE MMM dd yyyy HH:mm:ss 'GMT'Z", Locale.ENGLISH);

  @Inject Db db;
  @Inject Lojas lojas;
  @Inject Arquivos arquivos;

  @ConfigProperty(name = "crm.importar-meppy") boolean importarAoLigar;
  @ConfigProperty(name = "crm.meppy.pasta") String pastaPadrao;
  @ConfigProperty(name = "crm.admin-email") java.util.Optional<String> adminEmail;
  @ConfigProperty(name = "crm.url-publica") String urlPublica;

  void aoLigar(@Observes StartupEvent ev) {
    if (!importarAoLigar) return;
    Thread.startVirtualThread(() -> {
      try {
        importar(Path.of(pastaPadrao), adminEmail.orElse(null));
      } catch (Exception e) {
        LOG.error("Importação do Meppy falhou", e);
      }
    });
  }

  private Path pasta;
  private UUID loja;
  private final Map<String, UUID> usuarios = new HashMap<>(), agentes = new HashMap<>(), etapas = new HashMap<>(), funis = new HashMap<>(),
      conexoes = new HashMap<>(), conversas = new HashMap<>();
  private final Map<String, UUID> contatosPorTelefone = new HashMap<>();
  private Map<String, Object> indiceMidias = Map.of();
  private UUID dono;

  public synchronized Map<String, Object> importar(Path pasta, String emailDonoExtra) throws Exception {
    this.pasta = pasta;
    Instant t0 = Instant.now();
    LOG.info("Importação do Meppy: início (" + pasta.toAbsolutePath() + ")");
    Map<String, Object> me = Json.m(ler("me.json").get("user"));
    String tenant = Json.s(me, "tenant_id");
    loja = Formatos.uuid(db.valor("select id from crm_lojas where externo_id = ?", tenant));
    if (loja == null) {
      loja = lojas.criar(Json.s(me, "company", "Minha empresa"), null, null);
      db.executa("update crm_lojas set externo_id = ? where id = ?", tenant, loja);
      // o funil padrão criado junto é trocado pelos funis do Meppy
      db.executa("delete from crm_funis where store_id = ?", loja);
    }
    Path idx = pasta.resolve("midias/indice.json");
    if (Files.exists(idx)) indiceMidias = Json.mapa(Files.readString(idx));
    passo("equipe", () -> equipe(me, emailDonoExtra));
    passo("tags", this::tags);
    passo("conexões", this::conexoes);
    passo("agentes", this::agentes);
    passo("funis", this::funis);
    passo("configurações", this::configuracoes);
    passo("contatos", this::contatos);
    passo("conversas e mensagens", this::conversas);
    passo("memórias e compras", this::extras);
    passo("negócios", this::negocios);
    passo("automações", this::automacoes);
    Map<String, Object> r = db.um("""
        select (select count(*) from crm_contatos where store_id = ?) as contatos, (select count(*) from crm_conversas where store_id = ?) as conversas,
          (select count(*) from crm_mensagens where store_id = ?) as mensagens, (select count(*) from crm_negocios where store_id = ?) as negocios,
          (select count(*) from crm_automacoes where store_id = ?) as automacoes, (select count(*) from crm_agentes where store_id = ?) as agentes,
          (select count(*) from crm_memorias where store_id = ?) as memorias, (select count(*) from crm_arquivos where store_id = ?) as arquivos""",
        loja, loja, loja, loja, loja, loja, loja, loja);
    r.put("loja", loja);
    r.put("segundos", ChronoUnit.SECONDS.between(t0, Instant.now()));
    LOG.info("Importação do Meppy: FIM " + Json.texto(r));
    return r;
  }

  interface Passo {
    void rodar() throws Exception;
  }

  private void passo(String nome, Passo p) throws Exception {
    long t = System.currentTimeMillis();
    p.rodar();
    LOG.infof("Importação do Meppy: %s ok (%d ms)", nome, System.currentTimeMillis() - t);
  }

  private Map<String, Object> ler(String arquivo) throws Exception {
    Path p = pasta.resolve(arquivo);
    return Files.exists(p) ? Json.mapa(Files.readString(p)) : new HashMap<>();
  }

  private List<Object> lerLista(String arquivo) throws Exception {
    Path p = pasta.resolve(arquivo);
    return Files.exists(p) ? Json.l(Json.ler(Files.readString(p), Object.class)) : new ArrayList<>();
  }

  /** Datas do Meppy: ISO, milissegundos ou o formato do JavaScript ("Sat Sep 26 2026 15:51:19 GMT+0000 (...)"). */
  static Instant data(Object o) {
    if (o == null) return null;
    if (o instanceof Number n) return Instant.ofEpochMilli(n.longValue());
    String s = String.valueOf(o).trim();
    if (s.isEmpty()) return null;
    try {
      return Instant.parse(s);
    } catch (Exception e) {
      try {
        String semParenteses = s.replaceAll("\\s*\\(.*\\)$", "");
        return ZonedDateTime.parse(semParenteses, JS_DATA).toInstant();
      } catch (Exception e2) {
        return null;
      }
    }
  }

  // ---------------- equipe ----------------

  private void equipe(Map<String, Object> me, String emailExtra) throws Exception {
    List<Object> time = Json.l(ler("equipe.json").get("team"));
    // a equipe só é montada na primeira importação; depois quem manda é a tela Equipe (quem saiu não volta)
    boolean primeira = db.numero("select count(*) from crm_membros where store_id = ?", loja) == 0;
    for (Object o : time) {
      Map<String, Object> u = Json.m(o);
      String email = Json.s(u, "email", "").toLowerCase();
      if (email.isBlank()) continue;
      UUID id = Formatos.uuid(db.valor("select id from crm_usuarios where lower(email) = ?", email));
      if (id == null) id = UUID.fromString((String) db.insere("crm_usuarios", Json.de("nome", Json.s(u, "name", email), "email", email, "externo_id", Json.s(u, "id"))).get("id"));
      Map<String, Object> av = Json.m(indiceMidias.get("avatar-" + Json.s(u, "id")));
      Path foto = av.get("arquivo") == null ? null : pasta.resolve("midias/" + av.get("arquivo"));
      if (foto != null && Files.exists(foto) && db.valor("select foto_url from crm_usuarios where id = ?", id) == null) db.executa("update crm_usuarios set foto_url = coalesce(foto_url, ?) where id = ?", arquivos.salvar(loja, Files.readAllBytes(foto), "image/jpeg", "avatar.jpg", false).url(), id);
      String papel = switch (Json.s(u, "role", "agent")) { case "owner" -> "dono"; case "admin" -> "admin"; case "supervisor" -> "supervisor"; default -> "atendente"; };
      usuarios.put(Json.s(u, "id"), id);
      if (!primeira && db.numero("select count(*) from crm_membros where store_id = ? and usuario_id = ?", loja, id) == 0) continue;
      if (primeira) db.executa("insert into crm_membros (store_id, usuario_id, papel) values (?, ?, ?) on conflict (store_id, usuario_id) do nothing", loja, id, papel);
      if ("dono".equals(papel) && dono == null) dono = id;
      convite(email, Json.s(u, "name"), papel);
    }
    if (primeira && emailExtra != null && !emailExtra.isBlank()) {
      String email = emailExtra.trim().toLowerCase();
      UUID id = Formatos.uuid(db.valor("select id from crm_usuarios where lower(email) = ?", email));
      if (id == null) id = UUID.fromString((String) db.insere("crm_usuarios", Json.de("nome", email.split("@")[0], "email", email)).get("id"));
      db.executa("insert into crm_membros (store_id, usuario_id, papel) values (?, ?, 'dono') on conflict (store_id, usuario_id) do update set papel = 'dono'", loja, id);
      convite(email, null, "dono");
    }
  }

  /** Quem ainda não tem senha recebe um link de convite (aparece no log e em Equipe). */
  private void convite(String email, String nome, String papel) {
    if (db.valor("select senha_hash from crm_usuarios where lower(email) = ?", email) != null) return;
    if (db.numero("select count(*) from crm_convites where store_id = ? and lower(email) = ? and aceito_em is null and expira_em > now()", loja, email) > 0) return;
    String token = Cripto.tokenAleatorio(24);
    db.insere("crm_convites", Json.de("store_id", loja, "email", email, "nome", nome, "papel", papel, "token", token, "expira_em", Instant.now().plus(14, ChronoUnit.DAYS)));
    LOG.infof("Convite para %s (%s): %s/convite/%s", email, papel, urlPublica.replaceAll("/+$", ""), token);
  }

  // ---------------- cadastros ----------------

  private void tags() throws Exception {
    for (Object o : Json.l(ler("tags.json").get("tags"))) {
      Map<String, Object> t = Json.m(o);
      db.executa("insert into crm_tags (store_id, nome, cor, descricao) values (?, ?, ?, ?) on conflict (store_id, nome) do update set cor = excluded.cor, descricao = excluded.descricao",
          loja, Json.s(t, "name"), Json.s(t, "color", "#a053fd"), Json.s(t, "description"));
    }
  }

  private void conexoes() throws Exception {
    for (Object o : Json.l(ler("conexoes-whatsapp.json").get("connections"))) {
      Map<String, Object> c = Json.m(o);
      String ext = Json.s(c, "id");
      UUID id = Formatos.uuid(db.valor("select id from crm_conexoes where store_id = ? and externo_id = ?", loja, ext));
      if (id == null) id = Formatos.uuid(db.valor("select id from crm_conexoes where phone_number_id = ?", Json.s(c, "phoneNumberId")));
      if (id == null)
        id = UUID.fromString((String) db.insere("crm_conexoes", Json.de("store_id", loja, "nome", Json.s(c, "name", "WhatsApp"), "tipo", "whatsapp_cloud", "status", "desconectado",
            "telefone", Formatos.telefone(Json.s(c, "displayPhoneNumber")), "phone_number_id", Json.s(c, "phoneNumberId"), "waba_id", Json.s(c, "wabaId"),
            "config", Json.de("business_id", Json.s(c, "businessId"), "limite_diario", Json.i(c, "dailySendLimit", 1000), "importado_meppy", true), "externo_id", ext)).get("id"));
      conexoes.put(ext, id);
    }
  }

  private void agentes() throws Exception {
    for (Object o : Json.l(ler("agentes.json").get("agents"))) {
      Map<String, Object> a = Json.m(o);
      String ext = Json.s(a, "id");
      Path det = pasta.resolve("agentes/" + ext + ".json");
      if (Files.exists(det)) {
        Map<String, Object> d = Json.mapa(Files.readString(det));
        a = Json.m(d.get("agent") != null ? d.get("agent") : d);
      }
      Map<String, Object> cfg = new HashMap<>();
      for (String k : List.of("customInstructions", "personality", "objective", "greetingMessage", "tone", "useEmojis", "useSlang", "capitalization", "trainingText", "trainingQa",
          "businessHours", "handoffConfig", "handoffRules", "voiceStyle", "voiceExamples", "visionEnabled", "nativeCalendarEnabled", "followUpEnabled", "followUpDelayHours",
          "followUpMax", "followUpStartHour", "followUpEndHour", "followupDelays", "followupCustomInstruction", "salesStyle", "gender", "customSlang", "languageMode",
          "promiseAutoCancelOnReply", "splitMessages", "splitMaxBlocks", "splitMaxChars", "splitStyle", "maxTokens"))
        if (a.get(k) != null) cfg.put(k, a.get(k));
      if (Json.s(a, "systemPrompt") != null && !Json.s(a, "systemPrompt").isBlank())
        cfg.put("customInstructions", Json.s(a, "systemPrompt") + "\n\n" + Json.s(cfg, "customInstructions", ""));
      cfg.putIfAbsent("debounceSeconds", 8);
      cfg.putIfAbsent("autoMoveStages", true);
      cfg.putIfAbsent("autoTags", true);
      cfg.put("maxTokens", Math.max(2000, Json.i(cfg, "maxTokens", 2000)));
      UUID id = Formatos.uuid(db.valor("select id from crm_agentes where store_id = ? and externo_id = ?", loja, ext));
      if (id == null) {
        id = UUID.fromString((String) db.insere("crm_agentes", Json.de("store_id", loja, "nome", Json.s(a, "name", "Agente"), "papel", Json.s(a, "role", "vendas"),
            "descricao", Json.s(a, "description"), "cor", Json.s(a, "avatarColor", "#a053fd"), "empresa", Json.s(a, "companyName"), "status", "paused",
            "config", cfg, "instrucoes_anteriores", Json.s(a, "customInstructionsAnterior"), "instrucoes_anteriores_em", data(a.get("customInstructionsAnteriorEm")),
            "limite_gasto_centavos", a.get("spendLimitCents") == null ? null : Json.i(a, "spendLimitCents", 0), "externo_id", ext)).get("id"));
      }
      agentes.put(ext, id);
      Path kb = pasta.resolve("agentes/" + ext + "-conhecimento.json");
      if (Files.exists(kb)) {
        int ordem = 0;
        List<Object> itens = new ArrayList<>(Json.l(Json.mapa(Files.readString(kb)).get("items")));
        java.util.Collections.reverse(itens);
        for (Object io : itens) {
          Map<String, Object> k = Json.m(io);
          if (db.numero("select count(*) from crm_agente_conhecimento where agente_id = ? and externo_id = ?", id, Json.s(k, "id")) > 0) continue;
          boolean faq = "faq".equals(Json.s(k, "contentType"));
          db.executa("insert into crm_agente_conhecimento (store_id, agente_id, tipo, titulo, pergunta, conteudo, ordem, externo_id) values (?, ?, ?, ?, ?, ?, ?, ?)",
              loja, id, faq ? "faq" : "texto", Json.s(k, "title"), faq ? Json.s(k, "title") : null, Json.s(k, "content"), ordem++, Json.s(k, "id"));
        }
      }
      Path cx = pasta.resolve("agentes/" + ext + "-conexoes.json");
      if (Files.exists(cx))
        for (Object co : Json.l(Json.mapa(Files.readString(cx)).get("connections"))) {
          UUID conexao = conexoes.get(Json.s(Json.m(co), "connectionId"));
          if (conexao == null) continue;
          db.executa("insert into crm_agente_conexoes (agente_id, conexao_id) values (?, ?) on conflict do nothing", id, conexao);
          db.executa("update crm_conexoes set agente_id = ? where id = ?", id, conexao);
        }
    }
  }

  private void funis() throws Exception {
    List<Object> ps = Json.l(ler("pipelines.json").get("pipelines"));
    int ordemFunil = 0;
    for (Object o : ps) {
      Map<String, Object> p = Json.m(o);
      String ext = Json.s(p, "id");
      UUID id = Formatos.uuid(db.valor("select id from crm_funis where store_id = ? and externo_id = ?", loja, ext));
      Map<String, Object> pesos = Json.m(Json.m(p.get("settings")).get("score_weights"));
      if (pesos.isEmpty()) pesos = Lojas.pesosPadrao();
      if (id == null)
        id = UUID.fromString((String) db.insere("crm_funis", Json.de("store_id", loja, "nome", Json.s(p, "name", "Vendas"), "descricao", Json.s(p, "description"), "cor", Json.s(p, "color", "#6C5CE7"),
            "icone", Json.s(p, "icon", "handshake"), "ativo", Json.b(p, "isActive", true), "config", Json.de("score_weights", pesos, "auto_criar", true), "ordem", ordemFunil++, "externo_id", ext)).get("id"));
      funis.put(ext, id);
      Map<String, Object> k = ler("funil-" + ext + ".json");
      List<Object> st = new ArrayList<>(Json.l(k.get("stages")));
      st.sort((x, y) -> Integer.compare(Json.i(Json.m(x), "sort_order", 0), Json.i(Json.m(y), "sort_order", 0)));
      int ordem = 0;
      for (Object so : st) {
        Map<String, Object> s = Json.m(so);
        String se = Json.s(s, "id");
        UUID sid = Formatos.uuid(db.valor("select id from crm_etapas where funil_id = ? and externo_id = ?", id, se));
        boolean ganho = Json.b(s, "is_win_stage", false), perda = Json.b(s, "is_loss_stage", false);
        if (sid == null)
          sid = UUID.fromString((String) db.insere("crm_etapas", Json.de("store_id", loja, "funil_id", id, "nome", Json.s(s, "name", "Etapa"), "cor", Json.s(s, "color", "#6366f1"),
              "ordem", ordem, "ganho", ganho, "perda", perda, "probabilidade", ganho ? 100 : perda ? 0 : Math.min(90, 10 + ordem * 25), "config", Json.m(s.get("settings")), "externo_id", se)).get("id"));
        ordem++;
        etapas.put(se, sid);
      }
    }
    if (ps.isEmpty()) lojas.criarFunilPadrao(loja);
    Path mp = pasta.resolve("motivos-perda.json");
    Object motivos = Files.exists(mp) ? Json.ler(Files.readString(mp), Object.class) : List.of();
    if (motivos instanceof Map<?, ?> mm) motivos = Json.m(mm).getOrDefault("reasons", Json.m(mm).get("lossReasons"));
    for (Object mo : Json.l(motivos))
      db.executa("insert into crm_motivos_perda (store_id, nome) values (?, ?)", loja, Json.s(Json.m(mo), "name", "Motivo"));
  }

  private void configuracoes() throws Exception {
    Map<String, Object> cfg = Json.m(db.valor("select config from crm_lojas where id = ?", loja));
    Map<String, Object> ag = Json.m(ler("agenda-config.json").get("settings"));
    if (!ag.isEmpty())
      db.executa("""
          update crm_agenda_config set fuso = ?, lembrete_24h = ?, lembrete_2h = ?, mensagem_24h = ?, mensagem_2h = ?, antecedencia_minima_horas = ?, dias_maximos_frente = ?, modo = ? where store_id = ?""",
          Json.s(ag, "timezone", "America/Sao_Paulo"), Json.b(ag, "reminder_24h_enabled", true), Json.b(ag, "reminder_2h_enabled", true),
          Json.s(ag, "reminder_message_24h", "").replace("{contact_name}", "{nome}").replace("{event_type}", "{servico}").replace("{time}", "{hora}"),
          Json.s(ag, "reminder_message_2h", "").replace("{contact_name}", "{nome}").replace("{event_type}", "{servico}").replace("{time}", "{hora}"),
          Json.i(ag, "min_scheduling_notice_hours", 2), Json.i(ag, "max_scheduling_days_ahead", 30), Json.s(ag, "agenda_mode", "general"), loja);
    Map<String, Object> rel = Json.m(ler("relatorio-semanal.json").get("settings"));
    if (!rel.isEmpty()) {
      Map<String, Object> r = Json.m(cfg.get("relatorio"));
      r.put("semanal", Json.b(rel, "enabled", false));
      r.put("dia", Json.i(rel, "send_day", 1));
      r.put("hora", Json.i(rel, "send_hour", 9));
      r.put("diario", Json.b(rel, "daily_enabled", false));
      r.put("hora_diario", Json.i(rel, "daily_hour", 8));
      if (Json.s(rel, "recipient_phone") != null && !Json.s(rel, "recipient_phone").isBlank()) r.put("telefone", Json.s(rel, "recipient_phone"));
      cfg.put("relatorio", r);
    }
    db.executa("update crm_lojas set config = ?::jsonb where id = ?", cfg, loja);
  }

  // ---------------- contatos ----------------

  private void contatos() throws Exception {
    for (Map<String, Object> m : db.lista("select id, telefone from crm_contatos where store_id = ? and telefone is not null", loja)) contatosPorTelefone.put((String) m.get("telefone"), UUID.fromString((String) m.get("id")));
    List<Object[]> lote = new ArrayList<>();
    List<Object> todos = lerLista("contatos.json");
    for (Object o : todos) {
      Map<String, Object> c = Json.m(o);
      String tel = Formatos.telefone(Json.s(c, "phone"));
      if (tel == null || contatosPorTelefone.containsKey(tel)) continue;
      UUID id = UUID.randomUUID();
      contatosPorTelefone.put(tel, id);
      String origem = Json.s(c, "source");
      lote.add(new Object[] {id, loja, tel, Json.s(c, "name"), Json.s(c, "email"), Json.s(c, "notes"), origem == null ? null : origem.toLowerCase().replace(' ', '_'),
          conexoes.get(Json.s(c, "connectionId")), Json.s(c, "remoteJid"), Json.s(c, "profilePicUrl"), Json.s(c, "instagramUsername"),
          c.get("instagramData") == null ? null : Json.texto(c.get("instagramData")), Db.texto(Json.ls(c, "tags")), Json.i(c, "totalMessages", 0),
          ts(c.get("firstContactAt")), ts(c.get("lastContactAt")), Json.s(c, "id"), ts(c.get("createdAt"))});
    }
    // contatos que só existem nas conversas (histórico do celular)
    for (Object o : lerLista("conversas.json")) {
      Map<String, Object> v = Json.m(o);
      String tel = Formatos.telefone(Json.s(v, "phone", Json.s(v, "contact")));
      if (tel == null || contatosPorTelefone.containsKey(tel)) continue;
      UUID id = UUID.randomUUID();
      contatosPorTelefone.put(tel, id);
      lote.add(new Object[] {id, loja, tel, Json.s(v, "name"), null, null, "whatsapp", conexoes.get(Json.s(v, "connectionId")), tel + "@s.whatsapp.net", Json.s(v, "profilePicUrl"),
          null, null, Db.texto(Json.ls(v, "tags")), 0, ts(v.get("createdAt")), ts(v.get("lastMessageAt")), "conv:" + Json.s(v, "id"), ts(v.get("createdAt"))});
    }
    db.lote("""
        insert into crm_contatos (id, store_id, telefone, nome, email, notas, origem, conexao_id, remote_jid, foto_url, instagram_usuario, instagram_dados, tags,
          total_mensagens, primeiro_contato_em, ultimo_contato_em, externo_id, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, coalesce(?, now())) on conflict do nothing""", lote);
    LOG.infof("Importação: %d contatos novos", lote.size());
  }

  private static java.sql.Timestamp ts(Object o) {
    Instant i = data(o);
    return i == null ? null : java.sql.Timestamp.from(i);
  }

  // ---------------- conversas e mensagens ----------------

  private void conversas() throws Exception {
    List<Object> conv = lerLista("conversas.json");
    int n = 0;
    for (Object o : conv) {
      Map<String, Object> v = Json.m(o);
      String ext = Json.s(v, "id");
      UUID existente = Formatos.uuid(db.valor("select id from crm_conversas where store_id = ? and externo_id = ?", loja, ext));
      if (existente != null) {
        conversas.put(ext, existente);
        continue;
      }
      UUID contato = contatosPorTelefone.get(Formatos.telefone(Json.s(v, "phone", Json.s(v, "contact"))));
      if (contato == null) continue;
      Map<String, Object> resumo = ler("resumos/" + ext + ".json");
      String st = Json.s(v, "status", "open");
      if (!List.of("new", "open", "pending", "resolved", "closed").contains(st)) st = "open";
      String atrib = "human".equals(Json.s(v, "ownerType")) || !"ai".equals(Json.s(v, "assignedTo")) ? "human" : "ai";
      Map<String, Object> c = db.insere("crm_conversas", Json.de("store_id", loja, "contato_id", contato, "conexao_id", conexoes.get(Json.s(v, "connectionId")),
          "canal", Json.s(v, "channel", "whatsapp"), "status", st, "ia_ativa", Json.b(v, "aiEnabled", false), "agente_id", agentes.get(Json.s(v, "aiAgentId")),
          "atribuida_a", atrib, "handoff_status", Json.s(v, "handoffStatus", atrib),
          // conversa humana sem atendente definido (atendida pelo celular) fica com o dono, como no Meppy
          "humano_id", usuarios.get(Json.s(v, "assignedHumanId")) != null ? usuarios.get(Json.s(v, "assignedHumanId")) : "human".equals(atrib) ? dono : null,
          "handoff_em", data(v.get("handoffAt")), "humano_encerrou_em", data(v.get("humanEndedAt")), "nao_lidas", Json.i(v, "unread", 0),
          "marcada_lida_manual", Json.b(v, "manuallyMarkedRead", false), "ultima_mensagem", Json.s(v, "lastMessage"), "ultima_mensagem_em", data(v.get("lastMessageAt")),
          "ultima_do_cliente_em", data(v.get("customerLastMessageAt")), "ultimo_remetente", remetente(Json.s(v, "lastMessageSender")),
          "aguardando_resposta", Json.b(v, "pendingResponse", false), "tags", Db.texto(Json.ls(v, "tags")), "origem", Json.s(v, "source"),
          "sla_prioridade", Json.s(v, "slaPriority", "medium"), "sla_status", Json.s(v, "slaStatus", "ok"), "sla_violado_em", data(v.get("slaBreachedAt")),
          "primeira_resposta_em", data(v.get("firstResponseAt")), "primeira_resposta_ms", v.get("firstResponseMs") == null ? null : ((Number) v.get("firstResponseMs")).longValue(),
          "resolvida_em", data(v.get("resolutionAt")), "resolucao_ms", v.get("resolutionMs") == null ? null : ((Number) v.get("resolutionMs")).longValue(),
          "alerta_inatividade", Json.b(v, "inactivityAlertEnabled", false), "assunto", Json.s(v, "emailSubject"), "provedor", Json.s(v, "provider"),
          "coexistencia", Json.b(v, "coexistence", false), "arquivada_em", data(v.get("archivedAt")),
          "resumo", resumo.isEmpty() ? null : Json.s(resumo, "resumo", Json.s(resumo, "summary")), "externo_id", ext, "created_at", data(v.get("createdAt"))));
      UUID id = UUID.fromString((String) c.get("id"));
      conversas.put(ext, id);
      mensagens(ext, id);
      if (++n % 100 == 0) LOG.infof("Importação: %d/%d conversas", n, conv.size());
    }
  }

  private static String remetente(String s) {
    if (s == null) return null;
    return switch (s) { case "customer", "contact", "user" -> "customer"; case "ai", "bot", "assistant" -> "ai"; case "system" -> "system"; default -> "agent"; };
  }

  private void mensagens(String convExt, UUID conversa) throws Exception {
    Path p = pasta.resolve("mensagens/" + convExt + ".json");
    if (!Files.exists(p)) return;
    List<Object[]> lote = new ArrayList<>();
    for (Object o : Json.l(Json.ler(Files.readString(p), Object.class))) {
      Map<String, Object> m = Json.m(o);
      String tipo = Json.s(m, "messageType", "text");
      String conteudo = Json.s(m, "content");
      String midiaUrl = null, mime = Json.s(m, "mediaMimeType");
      Map<String, Object> meta = Json.m(m.get("metadata"));
      if (Json.s(m, "mediaUrl") != null) {
        Map<String, Object> idx = Json.m(indiceMidias.get(Json.s(m, "id")));
        if (idx.get("arquivo") != null) {
          Path arq = pasta.resolve("midias/" + idx.get("arquivo"));
          if (Files.exists(arq)) {
            mime = Json.s(idx, "mime", mime);
            midiaUrl = arquivos.salvar(loja, Files.readAllBytes(arq), mime, Json.s(m, "filename", (String) idx.get("arquivo")), false).url();
          }
        }
        if (midiaUrl == null) meta.put("midia_meppy", Json.s(m, "mediaUrl"));
      }
      String nosso = switch (tipo) {
        case "image", "audio", "video", "document", "sticker", "location", "contacts", "template", "interactive" -> tipo;
        case "media_placeholder" -> midiaUrl != null ? (mime != null && mime.startsWith("image") ? "image" : mime != null && mime.startsWith("audio") ? "audio" : mime != null && mime.startsWith("video") ? "video" : "document") : "text";
        default -> "text";
      };
      if ("edit".equals(tipo)) meta.put("editada", true);
      if ("order".equals(tipo)) meta.put("pedido_whatsapp", true);
      if ("button".equals(tipo)) meta.put("botao", true);
      String rem = remetente(Json.s(m, "sender", "customer"));
      String vis = "internal".equals(Json.s(m, "visibility")) ? "internal" : "all";
      lote.add(new Object[] {loja, conversa, conteudo, rem, Json.s(m, "senderName"), usuarios.get(Json.s(m, "senderUserId")), nosso, midiaUrl, mime, Json.s(m, "filename"),
          Json.s(m, "caption"), Json.s(m, "transcription"), Json.texto(meta), Json.s(m, "deliveryStatus"), Json.s(m, "deliveryError"), vis,
          ts(m.get("timestamp") != null ? m.get("timestamp") : m.get("createdAt")), Json.s(m, "id")});
    }
    db.lote("""
        insert into crm_mensagens (store_id, conversa_id, conteudo, remetente, remetente_nome, usuario_id, tipo, midia_url, midia_mime, arquivo_nome, legenda, transcricao,
          metadados, status_entrega, erro_entrega, visibilidade, enviada_em, externo_id)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, coalesce(?, now()), ?) on conflict do nothing""", lote);
  }

  // ---------------- memórias, compras, negócios, automações ----------------

  private void extras() throws Exception {
    Path dir = pasta.resolve("contatos-extra");
    if (!Files.isDirectory(dir)) return;
    Map<String, String> telPorExterno = new HashMap<>();
    for (Object o : lerLista("contatos.json")) telPorExterno.put(Json.s(Json.m(o), "id"), Formatos.telefone(Json.s(Json.m(o), "phone")));
    try (var arquivosExtras = Files.list(dir)) {
      for (Path f : arquivosExtras.toList()) {
        String ext = f.getFileName().toString().replace(".json", "");
        UUID contato = contatosPorTelefone.get(telPorExterno.get(ext));
        if (contato == null) continue;
        Map<String, Object> e = Json.mapa(Files.readString(f));
        for (Object mo : Json.l(e.get("memories"))) {
          Map<String, Object> m = Json.m(mo);
          if (db.numero("select count(*) from crm_memorias where contato_id = ? and externo_id = ?", contato, Json.s(m, "id")) > 0) continue;
          String cat = Json.s(m, "category", "outro");
          db.executa("insert into crm_memorias (store_id, contato_id, fato, categoria, fonte, confianca, externo_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, coalesce(?, now()), coalesce(?, now()))",
              loja, contato, Json.s(m, "fact"), "sentiment".equals(cat) ? "sentimento" : "preference".equals(cat) ? "preferencia" : cat, "importacao",
              Json.d(m, "confidence", 0.8), Json.s(m, "id"), ts(m.get("createdAt")), ts(m.get("updatedAt")));
        }
        Object compras = Json.m(e.get("purchases")).get("purchases");
        for (Object co : Json.l(compras)) {
          Map<String, Object> c = Json.m(co);
          db.executa("""
              insert into crm_compras (store_id, contato_id, plataforma, pedido_id, produto, valor, status, dados, externo_id, comprado_em)
              values (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, coalesce(?, now())) on conflict (store_id, plataforma, pedido_id) do nothing""",
              loja, contato, Json.s(c, "platform", "meppy"), Json.s(c, "id"), Json.s(c, "productName", Json.s(c, "product")), Json.d(c, "value", Json.d(c, "amount", 0)),
              Json.s(c, "status", "approved"), c, Json.s(c, "id"), ts(c.get("createdAt")));
        }
      }
    }
  }

  private void negocios() throws Exception {
    for (Object o : lerLista("negocios.json")) {
      Map<String, Object> n = Json.m(o);
      String ext = Json.s(n, "id");
      if (db.numero("select count(*) from crm_negocios where store_id = ? and externo_id = ?", loja, ext) > 0) continue;
      UUID funil = funis.get(Json.s(n, "pipeline_id")), etapa = etapas.get(Json.s(n, "stage_id"));
      if (funil == null || etapa == null) continue;
      UUID contato = contatosPorTelefone.get(Formatos.telefone(Json.s(n, "contact_phone")));
      UUID conversa = contato == null ? null : Formatos.uuid(db.valor("select id from crm_conversas where contato_id = ? order by ultima_mensagem_em desc nulls last limit 1", contato));
      Instant criado = data(n.get("created_at"));
      Map<String, Object> meta = Json.m(n.get("metadata"));
      Map<String, Object> ev = db.insere("crm_negocios", Json.de("store_id", loja, "funil_id", funil, "etapa_id", etapa, "contato_id", contato, "conversa_id", conversa,
          "titulo", Json.s(n, "title", Json.s(n, "contact_name", "Negócio")), "valor", Json.d(n, "value", 0), "moeda", Json.s(n, "currency", "BRL"),
          "responsavel_id", usuarios.get(Json.s(n, "assigned_to")), "prioridade", Json.s(n, "priority", "medium"),
          "fechamento_previsto", n.get("expected_close_date") == null ? null : java.time.LocalDate.parse(String.valueOf(n.get("expected_close_date")).substring(0, 10)),
          "ganho_em", data(n.get("won_at")), "perdido_em", data(n.get("lost_at")), "motivo_perda", Json.s(n, "lost_reason"), "origem", Json.s(n, "source"),
          "tags", Db.texto(Json.ls(n, "tags")), "campos", Json.m(n.get("custom_fields")), "metadados", meta, "score_ia", n.get("ai_score") == null ? null : Json.i(n, "ai_score", 0),
          "categoria_forecast", Json.s(n, "forecast_category", "pipeline"), "ultima_atividade_em", data(n.get("last_activity_at")),
          "etapa_desde", data(Json.m(meta.get("last_auto_move")).get("at")) != null ? data(Json.m(meta.get("last_auto_move")).get("at")) : criado,
          "externo_id", ext, "created_at", criado == null ? Instant.now() : criado, "updated_at", data(n.get("updated_at")) == null ? Instant.now() : data(n.get("updated_at"))));
      db.executa("insert into crm_negocio_eventos (store_id, negocio_id, tipo, texto, autor_tipo, created_at) values (?, ?::uuid, 'criado', 'Importado do Meppy', 'sistema', coalesce(?, now()))",
          loja, ev.get("id"), criado == null ? null : java.sql.Timestamp.from(criado));
    }
  }

  private void automacoes() throws Exception {
    for (Object o : Json.l(ler("automacoes.json").get("automations"))) {
      Map<String, Object> a = Json.m(o);
      String ext = Json.s(a, "id");
      if (db.numero("select count(*) from crm_automacoes where store_id = ? and externo_id = ?", loja, ext) > 0) continue;
      Map<String, Object> det = ler("automacoes/" + ext + ".json");
      Map<String, Object> full = Json.m(det.get("automation"));
      Map<String, Object> grafo = Json.m(full.get("graph"));
      // gatilho de nova mensagem com conexão: troca o id da conexão do Meppy pelo nosso
      for (Object no : Json.l(grafo.get("nodes"))) {
        Map<String, Object> cfg = Json.m(Json.m(no).get("config"));
        String cx = Json.s(cfg, "connectionId");
        if (cx != null && !cx.isBlank()) cfg.put("connectionId", conexoes.containsKey(cx) ? conexoes.get(cx).toString() : "");
      }
      db.insere("crm_automacoes", Json.de("store_id", loja, "nome", Json.s(a, "name", "Automação"), "descricao", Json.s(a, "description"),
          "status", "inactive", "gatilho_tipo", Json.s(a, "triggerType"), "gatilho_config", Json.de("token", Cripto.tokenAleatorio(18), "meppy", a.get("triggerConfig")),
          "grafo", grafo.isEmpty() ? Json.de("nodes", List.of(), "edges", List.of()) : grafo, "execucoes", Json.i(a, "executionCount", 0),
          "externo_id", ext, "created_at", data(a.get("createdAt"))));
    }
  }
}
