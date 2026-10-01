package br.com.clienteplus.crm.canais;

import br.com.clienteplus.crm.atendimento.Atendimento;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Json;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Map;
import java.util.UUID;
import org.jboss.logging.Logger;

/**
 * Ponto único das mensagens AUTOMÁTICAS (follow-up, automações, disparos,
 * lembretes): respeita a janela de horário da loja (fila crm_fila_envio) e a
 * regra das 24 h do WhatsApp (fora dela, só template aprovado).
 */
@ApplicationScoped
public class Expedicao {

  private static final Logger LOG = Logger.getLogger(Expedicao.class);

  @Inject Db db;
  @Inject Atendimento atendimento;

  public enum Resultado { ENVIADA, AGENDADA, SEM_JANELA_24H, FALHOU }

  public ZoneId fuso(UUID storeId) {
    return ZoneId.of(Json.s(db.um("select fuso from crm_lojas where id = ?", storeId), "fuso", "America/Sao_Paulo"));
  }

  public Map<String, Object> janela(UUID storeId) {
    return Json.m(Json.m(db.valor("select config from crm_lojas where id = ?", storeId)).get("janela_envio"));
  }

  /** Próximo instante permitido pela janela da loja a partir de {@code desejado}. */
  public Instant proximoPermitido(UUID storeId, Instant desejado) {
    ZoneId tz = fuso(storeId);
    return JanelaEnvio.proximo(janela(storeId), desejado.atZone(tz)).toInstant();
  }

  public boolean podeAgora(UUID storeId) {
    Instant agora = Instant.now();
    return !proximoPermitido(storeId, agora).isAfter(agora.plusSeconds(60));
  }

  /** A janela de 24 h do WhatsApp está aberta (cliente escreveu nas últimas 24 h)? */
  public boolean janela24h(UUID conversaId) {
    Map<String, Object> c = db.um("select canal, ultima_do_cliente_em from crm_conversas where id = ?", conversaId);
    if (c == null || c.get("ultimaDoClienteEm") == null) return false;
    long horas = "instagram".equals(c.get("canal")) ? 24 : 24;
    return Duration.between(Instant.parse((String) c.get("ultimaDoClienteEm")), Instant.now()).toHours() < horas;
  }

  /**
   * Envia agora se estiver na janela; senão agenda. {@code templateReserva}
   * (formato de template da Cloud API) é usado se a janela de 24 h fechou.
   */
  public Resultado enviarAutomatico(UUID storeId, UUID conversaId, Envio.Pedido pedido, Map<String, Object> templateReserva,
      Atendimento.Remetente rem, String origem) {
    Instant agora = Instant.now();
    Instant quando = proximoPermitido(storeId, agora);
    if (quando.isAfter(agora.plusSeconds(60))) {
      agendar(storeId, conversaId, pedido, templateReserva, rem, origem, quando);
      return Resultado.AGENDADA;
    }
    return enviarJa(storeId, conversaId, pedido, templateReserva, rem);
  }

  public void agendar(UUID storeId, UUID conversaId, Envio.Pedido p, Map<String, Object> templateReserva, Atendimento.Remetente rem, String origem, Instant quando) {
    UUID contato = conversaId == null ? null : UUID.fromString((String) db.valor("select contato_id::text from crm_conversas where id = ?", conversaId));
    db.executa("""
        insert into crm_fila_envio (store_id, conversa_id, contato_id, pedido, template_reserva, remetente, agente_id, origem, enviar_em)
        values (?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?)""",
        storeId, conversaId, contato, pedidoMapa(p), templateReserva, rem.tipo(), rem.agenteId(), origem, proximoPermitido(storeId, quando));
  }

  public Resultado enviarJa(UUID storeId, UUID conversaId, Envio.Pedido pedido, Map<String, Object> templateReserva, Atendimento.Remetente rem) {
    Envio.Pedido p = pedido;
    Map<String, Object> cv = db.um("select canal from crm_conversas where id = ?", conversaId);
    if (!"template".equals(p.tipo()) && cv != null && "whatsapp".equals(cv.get("canal")) && !janela24h(conversaId)) {
      if (templateReserva == null || templateReserva.isEmpty()) {
        atendimento.registroSistema(storeId, conversaId, "Mensagem automática não enviada: passaram 24 h desde a última mensagem do cliente e não há template configurado.");
        return Resultado.SEM_JANELA_24H;
      }
      p = new Envio.Pedido("template", null, null, null, null, null, templateReserva, null, null);
    }
    try {
      Map<String, Object> m = atendimento.enviar(storeId, conversaId, p, rem);
      return "failed".equals(m.get("statusEntrega")) ? Resultado.FALHOU : Resultado.ENVIADA;
    } catch (Exception e) {
      LOG.warnf("Envio automático falhou na conversa %s: %s", conversaId, e.getMessage());
      return Resultado.FALHOU;
    }
  }

  /** Processa a fila (chamado pelo agendador). */
  public void processarFila() {
    for (Map<String, Object> f : db.lista("select * from crm_fila_envio where status = 'pending' and enviar_em <= now() order by enviar_em limit 100")) {
      UUID id = UUID.fromString((String) f.get("id"));
      if (db.executa("update crm_fila_envio set status = 'sending' where id = ? and status = 'pending'", id) == 0) continue;
      UUID storeId = UUID.fromString((String) f.get("storeId"));
      UUID conversaId = f.get("conversaId") == null ? null : UUID.fromString((String) f.get("conversaId"));
      if (conversaId == null) {
        db.executa("update crm_fila_envio set status = 'failed', erro = 'sem conversa' where id = ?", id);
        continue;
      }
      Atendimento.Remetente rem = new Atendimento.Remetente((String) f.get("remetente"), null,
          f.get("agenteId") == null ? null : UUID.fromString((String) f.get("agenteId")), f.get("agenteId") == null ? "Automação" : db.valor("select nome from crm_agentes where id = ?::uuid", f.get("agenteId")));
      Resultado r = enviarJa(storeId, conversaId, pedidoDe(Json.m(f.get("pedido"))), Json.m(f.get("templateReserva")), rem);
      db.executa("update crm_fila_envio set status = ?, erro = ? where id = ?", r == Resultado.ENVIADA ? "sent" : "failed", r == Resultado.ENVIADA ? null : r.name(), id);
    }
  }

  /** Cliente respondeu: cancela mensagens automáticas agendadas de follow-up para ele. */
  public void cancelarFollowUps(UUID conversaId) {
    db.executa("update crm_fila_envio set status = 'canceled' where conversa_id = ? and status = 'pending' and origem in ('followup','carrinho','pix')", conversaId);
  }

  public static Map<String, Object> pedidoMapa(Envio.Pedido p) {
    return Json.de("tipo", p.tipo(), "texto", p.texto(), "midiaUrl", p.midiaUrl(), "midiaMime", p.midiaMime(), "arquivoNome", p.arquivoNome(),
        "legenda", p.legenda(), "template", p.template(), "interativo", p.interativo());
  }

  public static Envio.Pedido pedidoDe(Map<String, Object> m) {
    return new Envio.Pedido(Json.s(m, "tipo", "text"), Json.s(m, "texto"), Json.s(m, "midiaUrl"), Json.s(m, "midiaMime"), Json.s(m, "arquivoNome"),
        Json.s(m, "legenda"), m.get("template") == null ? null : Json.m(m.get("template")), m.get("interativo") == null ? null : Json.m(m.get("interativo")), null);
  }

  public static ZonedDateTime agora(ZoneId tz) {
    return ZonedDateTime.now(tz);
  }
}
