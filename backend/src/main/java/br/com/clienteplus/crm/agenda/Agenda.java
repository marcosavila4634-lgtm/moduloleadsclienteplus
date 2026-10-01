package br.com.clienteplus.crm.agenda;

import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Hub;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.ia.Horarios;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Regras da agenda: horários livres, marcar sem conflito, cancelar. Usado pelas telas, pela IA e pela página pública. */
@ApplicationScoped
public class Agenda {

  @Inject Db db;
  @Inject Hub hub;

  public ZoneId fuso(UUID storeId) {
    return ZoneId.of(Json.s(db.um("select fuso from crm_agenda_config where store_id = ?", storeId), "fuso", "America/Sao_Paulo"));
  }

  /** Horários livres de um serviço num dia (início de cada vaga), por profissional. */
  public List<Map<String, Object>> vagas(UUID storeId, UUID tipoId, UUID colaboradorId, LocalDate dia) {
    Map<String, Object> tipo = db.obrigatorio("Serviço", "select * from crm_agenda_tipos where id = ? and store_id = ? and ativo", tipoId, storeId);
    Map<String, Object> cfg = db.um("select * from crm_agenda_config where store_id = ?", storeId);
    ZoneId tz = fuso(storeId);
    int dur = Json.i(tipo, "duracaoMin", 60);
    int passo = Math.max(15, dur + Json.i(tipo, "intervaloMin", 0));
    Instant minimo = Instant.now().plusSeconds(3600L * Json.i(cfg, "antecedenciaMinimaHoras", 2));
    if (dia.isAfter(LocalDate.now(tz).plusDays(Json.i(cfg, "diasMaximosFrente", 60)))) return List.of();

    List<Map<String, Object>> profs = new ArrayList<>();
    List<String> ids = Json.ls(tipo, "colaboradores");
    for (Map<String, Object> c : db.lista("select * from crm_agenda_colaboradores where store_id = ? and ativo order by nome", storeId)) {
      if (colaboradorId != null && !colaboradorId.toString().equals(c.get("id"))) continue;
      if (!ids.isEmpty() && !ids.contains((String) c.get("id"))) continue;
      profs.add(c);
    }
    Map<String, Object> horarioLoja = Json.m(db.valor("select horario_comercial from crm_lojas where id = ?", storeId));
    if (profs.isEmpty()) profs.add(Json.de("id", null, "nome", null, "horarios", Map.of()));

    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> p : profs) {
      Map<String, Object> hr = Json.m(p.get("horarios")).isEmpty() ? horarioLoja : Json.m(p.get("horarios"));
      UUID pid = Formatos.uuid(p.get("id"));
      for (Object faixa : Json.l(hr.get(Horarios.dia(dia.getDayOfWeek())))) {
        var f = Json.l(faixa);
        if (f.size() < 2) continue;
        LocalTime ini = LocalTime.parse(String.valueOf(f.get(0))), fim = LocalTime.parse(String.valueOf(f.get(1)));
        for (LocalTime t = ini; !t.plusMinutes(dur).isAfter(fim); t = t.plusMinutes(passo)) {
          ZonedDateTime z = dia.atTime(t).atZone(tz);
          Instant a = z.toInstant(), b = a.plusSeconds(dur * 60L);
          if (a.isBefore(minimo)) continue;
          if (conflito(storeId, pid, a, b, null)) continue;
          out.add(Json.de("inicio", a.toString(), "hora", t.toString(), "colaboradorId", p.get("id"), "colaborador", p.get("nome")));
        }
      }
    }
    out.sort((x, y) -> ((String) x.get("inicio")).compareTo((String) y.get("inicio")));
    return out;
  }

  public boolean conflito(UUID storeId, UUID colaboradorId, Instant ini, Instant fim, UUID ignorarEvento) {
    long ev = db.numero("""
        select count(*) from crm_agenda_eventos where store_id = ? and status not in ('canceled','no_show')
          and (?::uuid is null or colaborador_id = ? or colaborador_id is null) and inicio < ? and fim > ? and (?::uuid is null or id <> ?)""",
        storeId, colaboradorId, colaboradorId, fim, ini, ignorarEvento, ignorarEvento);
    long bl = db.numero("""
        select count(*) from crm_agenda_bloqueios where store_id = ? and (colaborador_id is null or ?::uuid is null or colaborador_id = ?)
          and inicio < ? and fim > ?""", storeId, colaboradorId, colaboradorId, fim, ini);
    return ev + bl > 0;
  }

  /** Marca um horário; recusa se ocupado. */
  public Map<String, Object> marcar(UUID storeId, Map<String, Object> d, String origem) {
    UUID tipoId = Formatos.uuid(d.get("tipoId"));
    Map<String, Object> tipo = tipoId == null ? null : db.obrigatorio("Serviço", "select * from crm_agenda_tipos where id = ? and store_id = ?", tipoId, storeId);
    Instant ini = Formatos.instante(d.get("inicio"));
    Erro.exigir(ini != null, "Informe o horário");
    Instant fim = d.get("fim") != null ? Formatos.instante(d.get("fim")) : ini.plusSeconds(60L * (tipo == null ? 60 : Json.i(tipo, "duracaoMin", 60)));
    Erro.exigir(fim.isAfter(ini), "O fim precisa ser depois do início");
    UUID col = Formatos.uuid(d.get("colaboradorId"));
    if (col != null) db.obrigatorio("Profissional", "select id from crm_agenda_colaboradores where id = ? and store_id = ?", col, storeId);
    if (conflito(storeId, col, ini, fim, null)) throw Erro.conflito("Este horário já está ocupado");
    UUID contato = Formatos.uuid(d.get("contatoId"));
    if (contato != null) db.obrigatorio("Contato", "select id from crm_contatos where id = ? and store_id = ?", contato, storeId);
    String titulo = Json.s(d, "titulo", tipo == null ? "Compromisso" : (String) tipo.get("nome"));
    Map<String, Object> e = db.insere("crm_agenda_eventos", Json.de("store_id", storeId, "tipo_id", tipoId, "colaborador_id", col, "contato_id", contato,
        "conversa_id", Formatos.uuid(d.get("conversaId")), "negocio_id", Formatos.uuid(d.get("negocioId")), "titulo", titulo, "descricao", Json.s(d, "descricao"),
        "inicio", ini, "fim", fim, "valor", d.get("valor") != null ? Json.d(d, "valor", 0) : (tipo == null ? 0 : Json.d(tipo, "preco", 0)),
        "status", Json.s(d, "status", "scheduled"), "origem", origem, "notas", Json.s(d, "notas"),
        "comissao_percentual", col == null ? null : db.valor("select comissao_percentual from crm_agenda_colaboradores where id = ?", col)));
    hub.emitir(storeId, "agenda", e);
    return e;
  }

  public void cancelar(UUID storeId, UUID eventoId, String motivo) {
    Map<String, Object> e = db.um("update crm_agenda_eventos set status = 'canceled', cancelado_motivo = ?, updated_at = now() where id = ? and store_id = ? returning *", motivo, eventoId, storeId);
    if (e == null) throw Erro.naoEncontrado("Agendamento não encontrado");
    hub.emitir(storeId, "agenda", e);
  }
}
