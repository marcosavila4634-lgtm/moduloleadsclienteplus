package br.com.clienteplus.crm.lojas;

import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Criação de empresas (lojas) com o básico pronto para usar. */
@ApplicationScoped
public class Lojas {

  @Inject Db db;

  /** Pesos padrão do score de IA (iguais aos do Meppy). */
  public static Map<String, Object> pesosPadrao() {
    Map<String, Object> p = new LinkedHashMap<>();
    p.put("base", 30);
    p.put("urgency_high", 18);
    p.put("urgency_medium", 8);
    p.put("fast_response", 12);
    p.put("moderate_response", 6);
    p.put("high_engagement", 10);
    p.put("moderate_engagement", 5);
    p.put("value_confirmed", 15);
    p.put("purchase_confirmed", 15);
    p.put("interest_shown", 5);
    p.put("sent_media", 5);
    p.put("complete_profile", 5);
    p.put("competitor", -10);
    p.put("objection_price", -8);
    p.put("objection_thinking", -15);
    p.put("objection_repeated", -12);
    p.put("ghosting_mild", -12);
    p.put("ghosting_severe", -25);
    return p;
  }

  public static Map<String, Object> horarioPadrao() {
    Map<String, Object> h = new LinkedHashMap<>();
    for (String d : List.of("seg", "ter", "qua", "qui", "sex")) h.put(d, List.of(List.of("09:00", "18:00")));
    h.put("sab", List.of(List.of("09:00", "13:00")));
    h.put("dom", List.of());
    return h;
  }

  @Transactional
  public UUID criar(String nome, UUID donoId, UUID clientePlusStoreId) {
    String base = Formatos.slug(nome);
    String slug = base;
    for (int i = 2; db.numero("select count(*) from crm_lojas where slug = ?", slug) > 0; i++) slug = base + "-" + i;
    Map<String, Object> config = Json.de(
        "assinatura_atendente", true,
        "distribuicao", Json.de("modo", "manual"),
        "sla", Json.de("primeira_resposta_min", 15, "alerta_inatividade_min", 60),
        "relatorio", Json.de("semanal", false, "dia", 1, "hora", 9, "diario", false, "hora_diario", 8),
        "janela_atribuicao_dias", 7);
    Map<String, Object> loja = db.insere("crm_lojas", Json.de(
        "nome", nome, "slug", slug, "horario_comercial", horarioPadrao(), "config", config, "cliente_plus_store_id", clientePlusStoreId));
    UUID storeId = UUID.fromString((String) loja.get("id"));
    if (donoId != null) db.executa("insert into crm_membros (store_id, usuario_id, papel) values (?, ?, 'dono')", storeId, donoId);
    criarFunilPadrao(storeId);
    db.executa("insert into crm_agenda_config (store_id) values (?) on conflict do nothing", storeId);
    for (String m : List.of("Preço", "Comprou do concorrente", "Sem resposta", "Sem interesse", "Momento errado"))
      db.executa("insert into crm_motivos_perda (store_id, nome) values (?, ?)", storeId, m);
    return storeId;
  }

  public UUID criarFunilPadrao(UUID storeId) {
    Map<String, Object> f = db.insere("crm_funis", Json.de(
        "store_id", storeId, "nome", "Vendas", "descricao", "Pipeline completo de vendas com qualificação e negociação",
        "cor", "#6C5CE7", "icone", "handshake", "config", Json.de("score_weights", pesosPadrao())));
    UUID funilId = UUID.fromString((String) f.get("id"));
    Object[][] etapas = {
      {"Novo Lead", "#3B82F6", 10, false, false},
      {"Em Contato", "#F59E0B", 30, false, false},
      {"Qualificado", "#8B5CF6", 60, false, false},
      {"Fechado ✅", "#22C55E", 100, true, false},
      {"Perdido ❌", "#EF4444", 0, false, true},
    };
    int ordem = 0;
    for (Object[] e : etapas)
      db.executa("insert into crm_etapas (store_id, funil_id, nome, cor, probabilidade, ganho, perda, ordem) values (?, ?, ?, ?, ?, ?, ?, ?)",
          storeId, funilId, e[0], e[1], e[2], e[3], e[4], ordem++);
    return funilId;
  }
}
