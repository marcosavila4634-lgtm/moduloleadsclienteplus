package br.com.clienteplus.crm.crm;

import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Hub;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.eventos.Eventos;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Event;
import jakarta.inject.Inject;
import java.util.Map;
import java.util.UUID;

/** Regras dos negócios (deals): criar, mover de etapa, ganhar, perder, histórico. */
@ApplicationScoped
public class Negocios {

  @Inject Db db;
  @Inject Hub hub;
  @Inject Event<Object> eventos;

  public static final String VIEW = """
      select n.*, e.nome as etapa_nome, e.cor as etapa_cor, e.ganho as etapa_ganho, e.perda as etapa_perda,
        ct.nome as contato_nome, ct.telefone as contato_telefone, ct.foto_url as contato_foto, u.nome as responsavel_nome,
        extract(epoch from now() - n.etapa_desde) / 86400 as dias_na_etapa
      from crm_negocios n
      join crm_etapas e on e.id = n.etapa_id
      left join crm_contatos ct on ct.id = n.contato_id
      left join crm_usuarios u on u.id = n.responsavel_id
      """;

  /** Funil padrão da loja (o primeiro ativo). */
  public UUID funilPadrao(UUID storeId) {
    return Formatos.uuid(db.valor("select id from crm_funis where store_id = ? and ativo order by ordem, created_at limit 1", storeId));
  }

  public UUID primeiraEtapa(UUID funilId) {
    return Formatos.uuid(db.valor("select id from crm_etapas where funil_id = ? and not ganho and not perda order by ordem limit 1", funilId));
  }

  /** Negócio aberto do contato; cria no funil padrão se não houver (quando o funil permite). */
  public Map<String, Object> garantir(UUID storeId, UUID contatoId, UUID conversaId, String origem) {
    Map<String, Object> n = db.um("select * from crm_negocios where store_id = ? and contato_id = ? and ganho_em is null and perdido_em is null order by created_at desc limit 1", storeId, contatoId);
    if (n != null) {
      if (n.get("conversaId") == null && conversaId != null) db.executa("update crm_negocios set conversa_id = ? where id = ?", conversaId, UUID.fromString((String) n.get("id")));
      return n;
    }
    UUID funil = funilPadrao(storeId);
    if (funil == null) return null;
    Map<String, Object> fcfg = Json.m(db.valor("select config from crm_funis where id = ?", funil));
    if (!Json.b(fcfg, "auto_criar", true)) return null;
    UUID etapa = primeiraEtapa(funil);
    if (etapa == null) return null;
    Map<String, Object> ct = db.um("select nome, telefone, instagram_usuario from crm_contatos where id = ?", contatoId);
    String titulo = Json.s(ct, "nome", Json.s(ct, "telefone", Json.s(ct, "instagramUsuario", "Novo lead")));
    Map<String, Object> novo = db.insere("crm_negocios", Json.de("store_id", storeId, "funil_id", funil, "etapa_id", etapa, "contato_id", contatoId,
        "conversa_id", conversaId, "titulo", titulo, "origem", origem, "ultima_atividade_em", java.time.Instant.now(), "score_ia", 30));
    evento(storeId, UUID.fromString((String) novo.get("id")), "criado", null, null, "sistema", null, "Negócio criado automaticamente", null);
    emitir(storeId, UUID.fromString((String) novo.get("id")));
    return novo;
  }

  public Map<String, Object> criar(UUID storeId, Map<String, Object> dados, UUID usuarioId) {
    UUID funil = Formatos.uuid(dados.get("funilId"));
    if (funil == null) funil = funilPadrao(storeId);
    Erro.exigir(funil != null, "Crie um funil primeiro");
    db.obrigatorio("Funil", "select id from crm_funis where id = ? and store_id = ?", funil, storeId);
    UUID etapa = Formatos.uuid(dados.get("etapaId"));
    if (etapa == null) etapa = primeiraEtapa(funil);
    db.obrigatorio("Etapa", "select id from crm_etapas where id = ? and funil_id = ?", etapa, funil);
    UUID contato = Formatos.uuid(dados.get("contatoId"));
    if (contato != null) db.obrigatorio("Contato", "select id from crm_contatos where id = ? and store_id = ?", contato, storeId);
    Map<String, Object> n = db.insere("crm_negocios", Json.de("store_id", storeId, "funil_id", funil, "etapa_id", etapa, "contato_id", contato,
        "titulo", Erro.obrigatorio(dados, "titulo", "Título"), "valor", Json.d(dados, "valor", 0), "prioridade", Json.s(dados, "prioridade", "medium"),
        "responsavel_id", Formatos.uuid(dados.get("responsavelId")), "fechamento_previsto", dados.get("fechamentoPrevisto") == null || String.valueOf(dados.get("fechamentoPrevisto")).isBlank() ? null : java.time.LocalDate.parse(String.valueOf(dados.get("fechamentoPrevisto"))),
        "origem", Json.s(dados, "origem", "manual"), "tags", Db.texto(Json.ls(dados, "tags")), "campos", Json.m(dados.get("campos")),
        "ultima_atividade_em", java.time.Instant.now()));
    UUID id = UUID.fromString((String) n.get("id"));
    evento(storeId, id, "criado", null, null, "usuario", usuarioId, null, null);
    emitir(storeId, id);
    return n;
  }

  /** Move o negócio para outra etapa (do mesmo funil ou de outro). */
  public void mover(UUID storeId, UUID negocioId, UUID etapaId, String autorTipo, UUID autorId, String motivo) {
    Map<String, Object> n = db.obrigatorio("Negócio", "select n.*, e.nome as etapa_nome from crm_negocios n join crm_etapas e on e.id = n.etapa_id where n.id = ? and n.store_id = ?", negocioId, storeId);
    Map<String, Object> e = db.obrigatorio("Etapa", "select e.*, f.store_id from crm_etapas e join crm_funis f on f.id = e.funil_id where e.id = ? and f.store_id = ?", etapaId, storeId);
    if (etapaId.toString().equals(n.get("etapaId"))) return;
    boolean ganho = Json.b(e, "ganho", false), perda = Json.b(e, "perda", false);
    db.executa("""
        update crm_negocios set etapa_id = ?, funil_id = ?, etapa_desde = now(), ultima_atividade_em = now(), updated_at = now(),
          ganho_em = case when ? then coalesce(ganho_em, now()) else null end,
          perdido_em = case when ? then coalesce(perdido_em, now()) else null end,
          motivo_perda = case when ? then coalesce(?, motivo_perda) else null end,
          categoria_forecast = case when ? then 'closed' when ? then 'omitted' when categoria_forecast in ('closed','omitted') then 'pipeline' else categoria_forecast end
        where id = ?""", etapaId, UUID.fromString((String) e.get("funilId")), ganho, perda, perda, motivo, ganho, perda, negocioId);
    evento(storeId, negocioId, ganho ? "ganho" : perda ? "perdido" : "etapa", (String) n.get("etapaNome"), (String) e.get("nome"), autorTipo, autorId, motivo, null);
    emitir(storeId, negocioId);
    UUID contato = n.get("contatoId") == null ? null : UUID.fromString((String) n.get("contatoId"));
    eventos.fireAsync(new Eventos.NegocioEtapa(storeId, negocioId, contato, UUID.fromString((String) n.get("etapaId")), etapaId, (String) e.get("nome")));
  }

  public UUID etapaPorNome(UUID storeId, UUID funilId, String nome) {
    if (nome == null) return null;
    String alvo = Formatos.semAcento(nome).toLowerCase().replaceAll("[^a-z0-9 ]", "").trim();
    for (Map<String, Object> e : db.lista("select e.id, e.nome from crm_etapas e join crm_funis f on f.id = e.funil_id where f.store_id = ? and (?::uuid is null or e.funil_id = ?) order by f.ordem, e.ordem", storeId, funilId, funilId)) {
      String n = Formatos.semAcento((String) e.get("nome")).toLowerCase().replaceAll("[^a-z0-9 ]", "").trim();
      if (n.equals(alvo) || n.startsWith(alvo) || alvo.startsWith(n)) return UUID.fromString((String) e.get("id"));
    }
    return null;
  }

  public UUID etapaGanho(UUID funilId) {
    return Formatos.uuid(db.valor("select id from crm_etapas where funil_id = ? and ganho order by ordem limit 1", funilId));
  }

  public UUID etapaPerda(UUID funilId) {
    return Formatos.uuid(db.valor("select id from crm_etapas where funil_id = ? and perda order by ordem limit 1", funilId));
  }

  public void evento(UUID storeId, UUID negocioId, String tipo, String de, String para, String autorTipo, UUID autorId, String texto, Map<String, Object> dados) {
    db.executa("insert into crm_negocio_eventos (store_id, negocio_id, tipo, de, para, autor_tipo, autor_id, texto, dados) values (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)",
        storeId, negocioId, tipo, de, para, autorTipo, autorId, texto, dados);
  }

  public void emitir(UUID storeId, UUID negocioId) {
    Map<String, Object> n = db.um(VIEW + " where n.id = ?", negocioId);
    if (n != null) hub.emitir(storeId, "negocio", n);
  }
}
