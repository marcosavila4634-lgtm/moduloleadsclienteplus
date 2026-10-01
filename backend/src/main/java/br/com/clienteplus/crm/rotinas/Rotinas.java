package br.com.clienteplus.crm.rotinas;

import br.com.clienteplus.crm.atendimento.Atendimento;
import br.com.clienteplus.crm.automacoes.MotorAutomacoes;
import br.com.clienteplus.crm.canais.Conexoes;
import br.com.clienteplus.crm.canais.DisparosResource;
import br.com.clienteplus.crm.canais.Envio;
import br.com.clienteplus.crm.canais.Expedicao;
import br.com.clienteplus.crm.canais.Templates;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.eventos.Eventos;
import br.com.clienteplus.crm.ia.AgenteConfig;
import br.com.clienteplus.crm.ia.AgenteRuntime;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.ObservesAsync;
import jakarta.inject.Inject;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Tudo que roda sozinho de tempo em tempo. Cada rotina tem trava própria
 * (não roda duas vezes ao mesmo tempo) e erros de uma loja não param as outras.
 */
@ApplicationScoped
public class Rotinas {

  private static final Logger LOG = Logger.getLogger(Rotinas.class);

  @Inject Db db;
  @Inject Expedicao expedicao;
  @Inject MotorAutomacoes motor;
  @Inject DisparosResource disparos;
  @Inject AgenteRuntime runtime;
  @Inject Atendimento atendimento;
  @Inject Conexoes conexoes;
  @Inject Templates templates;
  @ConfigProperty(name = "crm.url-publica") String urlPublica;

  private final AtomicBoolean rapida = new AtomicBoolean(), media = new AtomicBoolean(), lenta = new AtomicBoolean();

  // ---------------- a cada 10 s ----------------

  @Scheduled(every = "10s", delayed = "20s", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
  void cadaDezSegundos() {
    if (!rapida.compareAndSet(false, true)) return;
    try {
      protegido("fila de envio", expedicao::processarFila);
      protegido("retomar automações", motor::retomarVencidas);
      protegido("disparos", disparos::processar);
    } finally {
      rapida.set(false);
    }
  }

  // ---------------- a cada minuto ----------------

  @Scheduled(every = "60s", delayed = "30s", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
  void cadaMinuto() {
    if (!media.compareAndSet(false, true)) return;
    try {
      protegido("follow-ups", this::followUps);
      protegido("automações agendadas", motor::agendadas);
      protegido("lembretes da agenda", this::lembretesAgenda);
      protegido("promessas", this::promessas);
      protegido("SLA", this::sla);
      protegido("carrinho abandonado", this::carrinhos);
      protegido("pix pendente", this::pixPendente);
      protegido("NPS", this::nps);
    } finally {
      media.set(false);
    }
  }

  // ---------------- a cada 15 min ----------------

  @Scheduled(every = "15m", delayed = "60s", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
  void cadaQuinzeMinutos() {
    if (!lenta.compareAndSet(false, true)) return;
    try {
      protegido("aniversários", this::aniversarios);
      protegido("recompra", this::recompra);
      protegido("relatórios", this::relatorios);
      protegido("limpeza", this::limpeza);
    } finally {
      lenta.set(false);
    }
  }

  private void protegido(String nome, Runnable r) {
    try {
      r.run();
    } catch (Exception e) {
      LOG.errorf(e, "Rotina %s falhou", nome);
    }
  }

  private boolean jaFeito(UUID loja, UUID contato, String tipo, String ref) {
    return db.numero("select count(*) from crm_lembretes_enviados where store_id = ? and contato_id = ? and tipo = ? and referencia = ?", loja, contato, tipo, ref) > 0;
  }

  private void marcarFeito(UUID loja, UUID contato, String tipo, String ref) {
    db.executa("insert into crm_lembretes_enviados (store_id, contato_id, tipo, referencia) values (?, ?, ?, ?)", loja, contato, tipo, ref);
  }

  private UUID conversaDoContato(UUID loja, UUID contato) {
    UUID c = Formatos.uuid(db.valor("select id from crm_conversas where contato_id = ? and canal = 'whatsapp' order by ultima_mensagem_em desc nulls last limit 1", contato));
    if (c != null) return c;
    Conexoes.Conexao cx = conexoes.padrao(loja, "whatsapp_cloud");
    return cx == null ? null : atendimento.conversaPara(loja, contato, cx, "whatsapp").id();
  }

  private Map<String, Object> cfg(UUID loja, String secao) {
    return Json.m(Json.m(db.valor("select config from crm_lojas where id = ?", loja)).get(secao));
  }

  private Map<String, Object> reserva(UUID loja, Map<String, Object> cfg, Map<String, Object> contato, Map<String, Object> vars) {
    UUID t = Formatos.uuid(cfg.get("template_id"));
    if (t == null) return null;
    try {
      Map<String, Object> v = Json.m(cfg.get("template_variaveis"));
      if (v.isEmpty()) v = vars;
      return templates.montar(loja, t, v, s -> MotorAutomacoes.preencher(s, contato, vars));
    } catch (Exception e) {
      return null;
    }
  }

  // ---------------- follow-up da IA ----------------

  void followUps() {
    for (Map<String, Object> c : db.lista("""
        select c.id, c.store_id, c.agente_id, c.followups_enviados, c.contato_id from crm_conversas c
        where c.proximo_followup_em <= now() and c.ia_ativa and c.atribuida_a = 'ai' and c.ultimo_remetente in ('ai','agent','system')
          and c.status not in ('resolved','closed') limit 50""")) {
      UUID loja = UUID.fromString((String) c.get("storeId"));
      UUID conversa = UUID.fromString((String) c.get("id"));
      db.executa("update crm_conversas set proximo_followup_em = null where id = ?", conversa);
      if (!expedicao.podeAgora(loja)) {
        db.executa("update crm_conversas set proximo_followup_em = ? where id = ?", expedicao.proximoPermitido(loja, Instant.now()), conversa);
        continue;
      }
      Map<String, Object> ag = db.um("select * from crm_agentes where id = ?::uuid and status = 'active'", c.get("agenteId"));
      if (ag == null) continue;
      AgenteConfig cfg = new AgenteConfig(ag.get("config"));
      int n = Json.i(c, "followupsEnviados", 0) + 1;
      if (expedicao.janela24h(conversa)) {
        String instrucao = "[Instrução interna — não mencione] O cliente não respondeu à última mensagem. Escreva o follow-up nº " + n + " de " + cfg.followUpMax()
            + ", retomando o assunto de forma natural e sem repetir as mensagens anteriores. " + cfg.followUpInstrucao();
        Thread.startVirtualThread(() -> {
          try {
            runtime.responder(loja, conversa, instrucao);
          } catch (Exception e) {
            LOG.warnf("Follow-up da conversa %s falhou: %s", conversa, e.getMessage());
          }
        });
      } else {
        // fora das 24 h: só com template aprovado configurado no agente
        UUID t = Formatos.uuid(Json.m(ag.get("config")).get("followupTemplateId"));
        Map<String, Object> ct = db.um("select * from crm_contatos where id = ?::uuid", c.get("contatoId"));
        if (t != null) {
          try {
            Map<String, Object> tpl = templates.montar(loja, t, Json.m(Json.m(ag.get("config")).get("followupTemplateVars")), s -> MotorAutomacoes.preencher(s, ct, Map.of()));
            expedicao.enviarJa(loja, conversa, new Envio.Pedido("template", null, null, null, null, null, tpl, null, null), null,
                Atendimento.Remetente.ia(UUID.fromString((String) ag.get("id")), (String) ag.get("nome")));
          } catch (Exception e) {
            LOG.debug("Template de follow-up: " + e.getMessage());
          }
        }
        db.executa("update crm_conversas set followups_enviados = ? where id = ?", cfg.followUpMax(), conversa);
        if (!cfg.followUpTagFinal().isBlank()) atendimento.adicionarTag(loja, UUID.fromString((String) c.get("contatoId")), conversa, cfg.followUpTagFinal());
      }
    }
  }

  // ---------------- agenda ----------------

  void lembretesAgenda() {
    for (String janela : new String[] {"24h", "2h"}) {
      boolean dia = "24h".equals(janela);
      for (Map<String, Object> e : db.lista("""
          select e.*, cfg.mensagem_24h, cfg.mensagem_2h, cfg.fuso, ct.nome as contato_nome, t.nome as tipo_nome, cb.nome as colaborador_nome
          from crm_agenda_eventos e join crm_agenda_config cfg on cfg.store_id = e.store_id join crm_contatos ct on ct.id = e.contato_id
          left join crm_agenda_tipos t on t.id = e.tipo_id left join crm_agenda_colaboradores cb on cb.id = e.colaborador_id
          where e.status in ('scheduled','confirmed') and e.contato_id is not null and e.inicio > now()
            and (%s) limit 100""".formatted(dia
          ? "cfg.lembrete_24h and e.lembrete_24h_em is null and e.inicio <= now() + interval '24' hour and e.inicio > now() + interval '3' hour"
          : "cfg.lembrete_2h and e.lembrete_2h_em is null and e.inicio <= now() + interval '2' hour"))) {
        UUID loja = UUID.fromString((String) e.get("storeId"));
        UUID id = UUID.fromString((String) e.get("id"));
        db.executa("update crm_agenda_eventos set " + (dia ? "lembrete_24h_em" : "lembrete_2h_em") + " = now() where id = ?", id);
        UUID conversa = conversaDoContato(loja, UUID.fromString((String) e.get("contatoId")));
        if (conversa == null) continue;
        ZonedDateTime z = Instant.parse((String) e.get("inicio")).atZone(ZoneId.of(Json.s(e, "fuso", "America/Sao_Paulo")));
        String texto = Json.s(e, dia ? "mensagem24h" : "mensagem2h", "")
            .replace("{nome}", Json.s(e, "contatoNome", "")).replace("{contact_name}", Json.s(e, "contatoNome", ""))
            .replace("{servico}", Json.s(e, "tipoNome", (String) e.get("titulo"))).replace("{event_type}", Json.s(e, "tipoNome", (String) e.get("titulo")))
            .replace("{hora}", z.toLocalTime().toString()).replace("{time}", z.toLocalTime().toString())
            .replace("{data}", z.toLocalDate().toString()).replace("{profissional}", Json.s(e, "colaboradorNome", ""));
        Map<String, Object> ct = db.um("select * from crm_contatos where id = ?::uuid", e.get("contatoId"));
        expedicao.enviarJa(loja, conversa, Envio.Pedido.texto(texto), reserva(loja, cfg(loja, "agenda_lembrete"), ct, Json.de("1", Json.s(ct, "nome", ""), "2", z.toLocalTime().toString())),
            Atendimento.Remetente.sistema("Agenda"));
      }
    }
  }

  // ---------------- promessas, SLA, inatividade ----------------

  void promessas() {
    for (Map<String, Object> p : db.lista("""
        update crm_promessas set status = 'vencida', lembrete_enviado_em = now() where status = 'pendente' and vence_em <= now()
        returning id, store_id, conversa_id, contato_id, descricao, quem""")) {
      UUID loja = UUID.fromString((String) p.get("storeId"));
      atendimento.notificarEquipe(loja, "promessa", "Promessa venceu", (String) p.get("descricao"), p.get("conversaId") == null ? null : "/conversas?c=" + p.get("conversaId"));
      if (p.get("conversaId") != null && "cliente".equals(p.get("quem"))) {
        UUID conversa = UUID.fromString((String) p.get("conversaId"));
        boolean ia = Json.b(db.um("select ia_ativa and atribuida_a = 'ai' as ia from crm_conversas where id = ?", conversa), "ia", false);
        if (ia && expedicao.janela24h(conversa) && expedicao.podeAgora(loja)) {
          String instr = "[Instrução interna — não mencione] O cliente tinha prometido: \"" + p.get("descricao") + "\" e o prazo passou. Escreva um lembrete gentil e curto.";
          Thread.startVirtualThread(() -> {
            try {
              runtime.responder(loja, conversa, instr);
            } catch (Exception e) {
              LOG.debug("Lembrete de promessa: " + e.getMessage());
            }
          });
        }
      }
    }
  }

  void sla() {
    for (Map<String, Object> c : db.lista("""
        select c.id, c.store_id, c.humano_id, c.ultima_do_cliente_em, l.config from crm_conversas c join crm_lojas l on l.id = c.store_id
        where c.aguardando_resposta and c.status in ('new','open','pending') and c.arquivada_em is null and c.sla_status <> 'breached'
          and c.atribuida_a = 'human' and c.ultima_do_cliente_em < now() - interval '5' minute limit 200""")) {
      int limite = Json.i(Json.m(Json.m(c.get("config")).get("sla")), "primeira_resposta_min", 15);
      long min = Duration.between(Instant.parse((String) c.get("ultimaDoClienteEm")), Instant.now()).toMinutes();
      UUID loja = UUID.fromString((String) c.get("storeId"));
      UUID id = UUID.fromString((String) c.get("id"));
      if (min >= limite) {
        db.executa("update crm_conversas set sla_status = 'breached', sla_violado_em = now() where id = ?", id);
        if (c.get("humanoId") != null) atendimento.notificar(loja, UUID.fromString((String) c.get("humanoId")), "sla", "Cliente esperando há " + min + " min", null, "/conversas?c=" + id);
        else atendimento.notificarEquipe(loja, "sla", "Cliente na fila há " + min + " min", null, "/conversas?c=" + id);
        atendimento.emitirConversa(loja, id);
      } else if (min >= limite * 0.7) db.executa("update crm_conversas set sla_status = 'warning' where id = ? and sla_status = 'ok'", id);
    }
    db.executa("update crm_conversas set sla_status = 'ok' where sla_status <> 'ok' and not aguardando_resposta");
  }

  // ---------------- loja: carrinho, pix, NPS ----------------

  void carrinhos() {
    for (Map<String, Object> p : db.lista("""
        select p.*, l.slug, l.config from crm_pedidos p join crm_lojas l on l.id = p.store_id
        where p.status = 'carrinho' and p.contato_id is not null and p.carrinho_avisos < coalesce((l.config->'carrinho'->>'max_avisos')::int, 2)
          and coalesce((l.config->'carrinho'->>'ativo')::boolean, true)
          and coalesce(p.carrinho_aviso_em, p.created_at) < now() - (coalesce((l.config->'carrinho'->>'minutos')::int, 60) || ' minutes')::interval
        limit 50""")) {
      UUID loja = UUID.fromString((String) p.get("storeId"));
      UUID contato = UUID.fromString((String) p.get("contatoId"));
      if (db.numero("select count(*) from crm_pedidos where contato_id = ? and status not in ('carrinho','cancelado') and created_at > ?::timestamptz", contato, p.get("createdAt")) > 0) {
        db.executa("update crm_pedidos set status = 'cancelado', cancelado_motivo = 'finalizou outro pedido' where id = ?::uuid", p.get("id"));
        continue;
      }
      db.executa("update crm_pedidos set carrinho_avisos = carrinho_avisos + 1, carrinho_aviso_em = now() where id = ?::uuid", p.get("id"));
      UUID conversa = conversaDoContato(loja, contato);
      if (conversa == null) continue;
      Map<String, Object> cfg = Json.m(Json.m(p.get("config")).get("carrinho"));
      Map<String, Object> ct = db.um("select * from crm_contatos where id = ?", contato);
      String link = urlPublica.replaceAll("/+$", "") + "/loja/" + p.get("slug") + "?carrinho=" + p.get("token");
      String itens = String.join(", ", db.lista("select nome from crm_pedido_itens where pedido_id = ?::uuid", p.get("id")).stream().map(x -> (String) x.get("nome")).toList());
      Map<String, Object> vars = Json.de("link", link, "itens", itens, "total", Formatos.reais(Json.d(p, "total", 0)));
      String texto = MotorAutomacoes.preencher(Json.s(cfg, "mensagem", "Oi {primeiro_nome}! Vi que você separou {itens} no nosso site e não finalizou. Quer ajuda para concluir? É só continuar aqui: {link}"), ct, vars);
      expedicao.enviarAutomatico(loja, conversa, Envio.Pedido.texto(texto), reserva(loja, cfg, ct, Json.de("1", Json.s(ct, "nome", ""), "2", link)),
          Atendimento.Remetente.sistema("Loja"), "carrinho");
    }
  }

  void pixPendente() {
    for (Map<String, Object> p : db.lista("""
        select p.*, l.config from crm_pedidos p join crm_lojas l on l.id = p.store_id
        where p.status = 'aguardando_pagamento' and p.forma_pagamento = 'pix' and p.contato_id is not null
          and coalesce((l.config->'pix_lembrete'->>'ativo')::boolean, true)
          and p.created_at < now() - (coalesce((l.config->'pix_lembrete'->>'horas')::int, 2) || ' hours')::interval limit 50""")) {
      UUID loja = UUID.fromString((String) p.get("storeId"));
      UUID contato = UUID.fromString((String) p.get("contatoId"));
      Map<String, Object> cfg = Json.m(Json.m(p.get("config")).get("pix_lembrete"));
      int max = Json.i(cfg, "max_lembretes", 2);
      long enviados = db.numero("select count(*) from crm_lembretes_enviados where contato_id = ? and tipo = 'pix_pendente' and referencia = ?", contato, p.get("id"));
      int horasCancelar = Json.i(cfg, "cancelar_apos_horas", 72);
      if (Duration.between(Instant.parse((String) p.get("createdAt")), Instant.now()).toHours() >= horasCancelar) {
        db.executa("update crm_pedidos set status = 'cancelado', cancelado_motivo = 'Pix não pago no prazo' where id = ?::uuid", p.get("id"));
        continue;
      }
      if (enviados >= max) continue;
      Instant ultimo = Formatos.instante(db.valor("select max(created_at)::text from crm_lembretes_enviados where contato_id = ? and tipo = 'pix_pendente' and referencia = ?", contato, p.get("id")));
      if (ultimo != null && ultimo.isAfter(Instant.now().minus(Duration.ofHours(Json.i(cfg, "horas", 2) * 4L)))) continue;
      marcarFeito(loja, contato, "pix_pendente", (String) p.get("id"));
      UUID conversa = conversaDoContato(loja, contato);
      if (conversa == null) continue;
      Map<String, Object> ct = db.um("select * from crm_contatos where id = ?", contato);
      String texto = MotorAutomacoes.preencher(Json.s(cfg, "mensagem", "Oi {primeiro_nome}! Seu pedido *#{numero}* ({total}) ainda está aguardando o Pix. Segue o código de novo para facilitar 👇"),
          ct, Json.de("numero", p.get("numero"), "total", Formatos.reais(Json.d(p, "total", 0))));
      if (expedicao.enviarAutomatico(loja, conversa, Envio.Pedido.texto(texto), reserva(loja, cfg, ct, Json.de("1", Json.s(ct, "nome", ""), "2", String.valueOf(p.get("numero")))),
          Atendimento.Remetente.sistema("Loja"), "pix") == Expedicao.Resultado.ENVIADA && p.get("pixCopiaCola") != null && expedicao.janela24h(conversa))
        expedicao.enviarJa(loja, conversa, Envio.Pedido.texto((String) p.get("pixCopiaCola")), null, Atendimento.Remetente.sistema("Loja"));
    }
  }

  void nps() {
    for (Map<String, Object> p : db.lista("""
        select p.*, l.config from crm_pedidos p join crm_lojas l on l.id = p.store_id
        where p.status = 'entregue' and p.nps_enviado_em is null and p.contato_id is not null and coalesce((l.config->'nps'->>'ativo')::boolean, true)
          and p.updated_at < now() - (coalesce((l.config->'nps'->>'dias')::int, 2) || ' days')::interval limit 50""")) {
      UUID loja = UUID.fromString((String) p.get("storeId"));
      db.executa("update crm_pedidos set nps_enviado_em = now() where id = ?::uuid", p.get("id"));
      if (!expedicao.podeAgora(loja)) {
        db.executa("update crm_pedidos set nps_enviado_em = null where id = ?::uuid", p.get("id"));
        continue;
      }
      UUID contato = UUID.fromString((String) p.get("contatoId"));
      UUID conversa = conversaDoContato(loja, contato);
      if (conversa == null) continue;
      Map<String, Object> cfg = Json.m(Json.m(p.get("config")).get("nps"));
      Map<String, Object> ct = db.um("select * from crm_contatos where id = ?", contato);
      String texto = MotorAutomacoes.preencher(Json.s(cfg, "mensagem", "Oi {primeiro_nome}! De 0 a 10, quanto você recomendaria a nossa loja para um amigo? Responda só com o número 🙂"), ct, Map.of());
      if (expedicao.enviarJa(loja, conversa, Envio.Pedido.texto(texto), reserva(loja, cfg, ct, Json.de("1", Json.s(ct, "nome", ""))), Atendimento.Remetente.sistema("Pesquisa")) == Expedicao.Resultado.ENVIADA)
        db.executa("insert into crm_nps (store_id, contato_id, pedido_id, conversa_id) values (?, ?, ?::uuid, ?)", loja, contato, p.get("id"), conversa);
    }
    db.executa("update crm_nps set status = 'expirada' where status = 'aguardando' and enviada_em < now() - interval '3' day");
  }

  /** Resposta do cliente: nota de NPS, resposta a disparo. */
  void aoReceber(@ObservesAsync Eventos.MensagemRecebida e) {
    try {
      disparos.respondeu(e.storeId(), e.contatoId(), e.conversaId());
      Map<String, Object> n = db.um("select id from crm_nps where conversa_id = ? and status = 'aguardando' order by enviada_em desc limit 1", e.conversaId());
      if (n != null && e.texto() != null) {
        var m = java.util.regex.Pattern.compile("^\\s*(10|[0-9])\\b(.*)", java.util.regex.Pattern.DOTALL).matcher(e.texto());
        if (m.find()) {
          int nota = Integer.parseInt(m.group(1));
          db.executa("update crm_nps set nota = ?, comentario = nullif(trim(?), ''), status = 'respondida', respondida_em = now() where id = ?::uuid", nota, m.group(2), n.get("id"));
          atendimento.adicionarTag(e.storeId(), e.contatoId(), e.conversaId(), nota >= 9 ? "PROMOTOR" : nota <= 6 ? "DETRATOR" : "NEUTRO");
          if (nota <= 6) atendimento.notificarEquipe(e.storeId(), "nps", "Cliente insatisfeito (nota " + nota + ")", e.texto(), "/conversas?c=" + e.conversaId());
          Map<String, Object> cfg = cfg(e.storeId(), "nps");
          String agradece = Json.s(cfg, nota >= 9 ? "resposta_promotor" : nota <= 6 ? "resposta_detrator" : "resposta_neutro",
              nota >= 9 ? "Muito obrigado! 💜 Que bom que você gostou." : nota <= 6 ? "Poxa, obrigado por avisar. Alguém da nossa equipe vai falar com você para resolver." : "Obrigado pela resposta! Vamos melhorar cada vez mais.");
          expedicao.enviarJa(e.storeId(), e.conversaId(), Envio.Pedido.texto(agradece), null, Atendimento.Remetente.sistema("Pesquisa"));
        }
      }
    } catch (Exception ex) {
      LOG.debug("Pós-mensagem: " + ex.getMessage());
    }
  }

  // ---------------- aniversário e recompra ----------------

  void aniversarios() {
    for (Map<String, Object> l : db.lista("select id, fuso, config from crm_lojas where status = 'ativa' and coalesce((config->'aniversario'->>'ativo')::boolean, false)")) {
      UUID loja = UUID.fromString((String) l.get("id"));
      if (!expedicao.podeAgora(loja)) continue;
      LocalDate hoje = LocalDate.now(ZoneId.of(Json.s(l, "fuso", "America/Sao_Paulo")));
      Map<String, Object> cfg = Json.m(Json.m(l.get("config")).get("aniversario"));
      for (Map<String, Object> ct : db.lista("select * from crm_contatos where store_id = ? and aniversario is not null and extract(month from aniversario) = ? and extract(day from aniversario) = ? and not opt_out",
          loja, hoje.getMonthValue(), hoje.getDayOfMonth())) {
        UUID contato = UUID.fromString((String) ct.get("id"));
        String ref = String.valueOf(hoje.getYear());
        if (jaFeito(loja, contato, "aniversario", ref)) continue;
        marcarFeito(loja, contato, "aniversario", ref);
        UUID conversa = conversaDoContato(loja, contato);
        if (conversa == null) continue;
        String cupom = Json.s(cfg, "cupom", "");
        String texto = MotorAutomacoes.preencher(Json.s(cfg, "mensagem", "Feliz aniversário, {primeiro_nome}! 🎉 Temos um presente pra você" + (cupom.isBlank() ? "." : ": use o cupom *{cupom}* na sua próxima compra.")),
            ct, Json.de("cupom", cupom));
        expedicao.enviarAutomatico(loja, conversa, Envio.Pedido.texto(texto), reserva(loja, cfg, ct, Json.de("1", Json.s(ct, "nome", ""), "2", cupom)),
            Atendimento.Remetente.sistema("Loja"), "aniversario");
      }
    }
  }

  void recompra() {
    for (Map<String, Object> r : db.lista("""
        select distinct on (p.contato_id, i.produto_id) p.store_id, p.contato_id, i.produto_id, pr.nome as produto, pr.slug, pr.dias_recompra, pr.mensagem_recompra, p.pago_em, l.slug as loja_slug
        from crm_pedidos p join crm_pedido_itens i on i.pedido_id = p.id join crm_produtos pr on pr.id = i.produto_id join crm_lojas l on l.id = p.store_id
        where pr.dias_recompra is not null and p.pago_em is not null and p.status not in ('cancelado')
          and p.pago_em + ((pr.dias_recompra - 3) || ' days')::interval <= now() and p.pago_em + ((pr.dias_recompra + 10) || ' days')::interval > now()
        order by p.contato_id, i.produto_id, p.pago_em desc limit 100""")) {
      UUID loja = UUID.fromString((String) r.get("storeId"));
      UUID contato = UUID.fromString((String) r.get("contatoId"));
      String ref = r.get("produtoId") + ":" + r.get("pagoEm");
      if (jaFeito(loja, contato, "recompra", ref)) continue;
      // se já comprou de novo depois, não lembra
      if (db.numero("select count(*) from crm_pedidos p join crm_pedido_itens i on i.pedido_id = p.id where p.contato_id = ? and i.produto_id = ?::uuid and p.pago_em > ?::timestamptz", contato, r.get("produtoId"), r.get("pagoEm")) > 0) continue;
      if (!expedicao.podeAgora(loja)) continue;
      marcarFeito(loja, contato, "recompra", ref);
      UUID conversa = conversaDoContato(loja, contato);
      if (conversa == null) continue;
      Map<String, Object> ct = db.um("select * from crm_contatos where id = ?", contato);
      String link = urlPublica.replaceAll("/+$", "") + "/loja/" + r.get("lojaSlug") + "/p/" + r.get("slug");
      String texto = MotorAutomacoes.preencher(Json.s(r, "mensagemRecompra", "Oi {primeiro_nome}! Seu *{produto}* deve estar acabando. Quer que eu separe outro pra você? {link}"),
          ct, Json.de("produto", r.get("produto"), "link", link));
      expedicao.enviarAutomatico(loja, conversa, Envio.Pedido.texto(texto), reserva(loja, cfg(loja, "recompra"), ct, Json.de("1", Json.s(ct, "nome", ""), "2", String.valueOf(r.get("produto")))),
          Atendimento.Remetente.sistema("Loja"), "recompra");
    }
  }

  // ---------------- relatórios pelo WhatsApp ----------------

  void relatorios() {
    for (Map<String, Object> l : db.lista("select id, nome, fuso, config from crm_lojas where status = 'ativa' and (config->'relatorio'->>'telefone') is not null")) {
      UUID loja = UUID.fromString((String) l.get("id"));
      Map<String, Object> cfg = Json.m(Json.m(l.get("config")).get("relatorio"));
      ZonedDateTime agora = ZonedDateTime.now(ZoneId.of(Json.s(l, "fuso", "America/Sao_Paulo")));
      boolean semanal = Json.b(cfg, "semanal", false) && agora.getDayOfWeek().getValue() == Json.i(cfg, "dia", 1) && agora.getHour() == Json.i(cfg, "hora", 9);
      boolean diario = Json.b(cfg, "diario", false) && agora.getHour() == Json.i(cfg, "hora_diario", 8);
      if (!semanal && !diario) continue;
      String tipo = semanal ? "semanal" : "diario";
      String ref = tipo + ":" + agora.toLocalDate();
      if (db.numero("select count(*) from crm_lembretes_enviados where store_id = ? and tipo = 'relatorio' and referencia = ?", loja, ref) > 0) continue;
      UUID contato = atendimento.contatoPorTelefone(loja, Json.s(cfg, "telefone"), "Relatório", null, "relatorio").id();
      marcarFeito(loja, contato, "relatorio", ref);
      int dias = semanal ? 7 : 1;
      Map<String, Object> r = db.um("""
          select (select count(*) from crm_conversas where store_id = ? and created_at > now() - (? || ' days')::interval) as novas,
            (select count(*) from crm_mensagens where store_id = ? and remetente = 'ai' and created_at > now() - (? || ' days')::interval) as ia,
            (select count(*) from crm_negocios where store_id = ? and ganho_em > now() - (? || ' days')::interval) as ganhos,
            (select coalesce(sum(valor),0) from crm_negocios where store_id = ? and ganho_em > now() - (? || ' days')::interval) as receita,
            (select count(*) from crm_pedidos where store_id = ? and pago_em > now() - (? || ' days')::interval) as pedidos,
            (select count(*) from crm_conversas where store_id = ? and aguardando_resposta and status in ('new','open','pending')) as esperando""",
          loja, dias, loja, dias, loja, dias, loja, dias, loja, dias, loja);
      String texto = "📊 *Relatório " + (semanal ? "semanal" : "do dia") + " — " + l.get("nome") + "*\n"
          + "Novas conversas: " + r.get("novas") + "\nRespostas da IA: " + r.get("ia") + "\nVendas no funil: " + r.get("ganhos") + " (" + Formatos.reais(Json.d(r, "receita", 0)) + ")"
          + "\nPedidos pagos: " + r.get("pedidos") + "\nEsperando resposta agora: " + r.get("esperando");
      UUID conversa = conversaDoContato(loja, contato);
      if (conversa != null) {
        db.executa("update crm_conversas set ia_ativa = false, atribuida_a = 'human' where id = ?", conversa);
        expedicao.enviarJa(loja, conversa, Envio.Pedido.texto(texto), reserva(loja, cfg, Map.of(), Json.de("1", texto.replace("\n", " · "))), Atendimento.Remetente.sistema("Relatório"));
      }
    }
  }

  void limpeza() {
    db.executa("delete from crm_automacao_execucoes where created_at < now() - interval '180' day");
    db.executa("delete from crm_fila_envio where status in ('sent','canceled','failed') and created_at < now() - interval '30' day");
    db.executa("delete from crm_notificacoes where created_at < now() - interval '90' day");
    db.executa("delete from crm_integracao_eventos where created_at < now() - interval '90' day");
    db.executa("update crm_pedidos set status = 'cancelado', cancelado_motivo = 'carrinho abandonado' where status = 'carrinho' and created_at < now() - interval '30' day");
  }
}
