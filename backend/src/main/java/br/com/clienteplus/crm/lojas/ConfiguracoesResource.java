package br.com.clienteplus.crm.lojas;

import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.comum.Cripto;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Email;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.ia.ClaudeIA;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Configurações da empresa (loja). Segredos nunca voltam para a tela, só "configurado: sim/não". */
@Path("/configuracoes")
public class ConfiguracoesResource {

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject Cripto cripto;
  @Inject Email email;
  @Inject ClaudeIA ia;

  @GET
  public Map<String, Object> obter() {
    Map<String, Object> l = db.um("select id, nome, slug, fuso, horario_comercial, config, plano, limites, status from crm_lojas where id = ?", sessao.loja());
    Map<String, Object> cfg = Json.m(l.get("config"));
    Map<String, Object> iaCfg = Json.m(cfg.get("ia"));
    iaCfg.put("chave_configurada", iaCfg.remove("chave_cripto") != null);
    iaCfg.put("chave_servidor", ia.configurada(sessao.loja()));
    Map<String, Object> smtp = Json.m(cfg.get("smtp"));
    smtp.put("senha_configurada", smtp.remove("senha_cripto") != null);
    cfg.put("ia", iaCfg);
    cfg.put("smtp", smtp);
    l.put("config", cfg);
    l.put("uso", db.um("""
        select (select count(*) from crm_contatos where store_id = ?) as contatos, (select count(*) from crm_membros where store_id = ?) as usuarios,
          (select count(*) from crm_agentes where store_id = ?) as agentes, (select count(*) from crm_conexoes where store_id = ?) as conexoes,
          (select count(*) from crm_automacoes where store_id = ?) as automacoes,
          (select coalesce(sum(custo_micro_usd),0) from crm_ia_uso where store_id = ? and created_at >= date_trunc('month', now())) as ia_mes_micro_usd""",
        sessao.loja(), sessao.loja(), sessao.loja(), sessao.loja(), sessao.loja(), sessao.loja()));
    return l;
  }

  /** Atualiza dados gerais e seções de configuração (mescla; segredos à parte). */
  @PUT
  public Map<String, Object> salvar(Map<String, Object> corpo) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    Map<String, Object> atual = db.um("select nome, fuso, horario_comercial, config from crm_lojas where id = ?", loja);
    Map<String, Object> cfg = Json.m(atual.get("config"));
    Map<String, Object> novo = Json.m(corpo.get("config"));
    // seções permitidas
    for (String s : List.of("assinatura_atendente", "distribuicao", "sla", "relatorio", "janela_envio", "pix", "notificacoes", "carrinho", "nps", "aniversario",
        "recompra", "pix_lembrete", "status_pedido", "entrega", "janela_atribuicao_dias", "pagina", "estoque"))
      if (novo.containsKey(s)) cfg.put(s, novo.get(s));
    if (novo.get("ia") != null) {
      Map<String, Object> iaAtual = Json.m(cfg.get("ia"));
      Map<String, Object> iaNovo = Json.m(novo.get("ia"));
      for (String k : List.of("modelo_analise", "cotacao_dolar")) if (iaNovo.containsKey(k)) iaAtual.put(k, iaNovo.get(k));
      cfg.put("ia", iaAtual);
    }
    if (novo.get("smtp") != null) {
      Map<String, Object> sAtual = Json.m(cfg.get("smtp"));
      Map<String, Object> sNovo = Json.m(novo.get("smtp"));
      for (String k : List.of("host", "porta", "usuario", "remetente", "nome_remetente")) if (sNovo.containsKey(k)) sAtual.put(k, sNovo.get(k));
      cfg.put("smtp", sAtual);
    }
    String fuso = Json.s(corpo, "fuso", (String) atual.get("fuso"));
    try {
      java.time.ZoneId.of(fuso);
    } catch (Exception e) {
      throw Erro.requisicao("Fuso horário inválido");
    }
    String nome = Json.s(corpo, "nome", (String) atual.get("nome"));
    Erro.exigir(nome != null && !nome.isBlank(), "Informe o nome da empresa");
    // crm_lojas é a própria loja (não tem store_id): update direto pelo id
    db.executa("update crm_lojas set nome = ?, fuso = ?, horario_comercial = ?::jsonb, config = ?::jsonb, updated_at = now() where id = ?",
        nome.trim(), fuso, corpo.get("horarioComercial") == null ? Json.m(atual.get("horarioComercial")) : Json.m(corpo.get("horarioComercial")), cfg, loja);
    auditar("configuracoes", null);
    return obter();
  }

  /** Grava um segredo cifrado. corpo: {tipo: "ia"|"smtp", valor} */
  @PUT
  @Path("/segredo")
  public Map<String, Object> segredo(Map<String, Object> corpo) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    String tipo = Erro.obrigatorio(corpo, "tipo", "Tipo");
    String valor = Json.s(corpo, "valor");
    Map<String, Object> cfg = Json.m(db.valor("select config from crm_lojas where id = ?", loja));
    String secao = "ia".equals(tipo) ? "ia" : "smtp".equals(tipo) ? "smtp" : null;
    Erro.exigir(secao != null, "Tipo inválido");
    Map<String, Object> s = Json.m(cfg.get(secao));
    String campo = "ia".equals(tipo) ? "chave_cripto" : "senha_cripto";
    if (valor == null || valor.isBlank()) s.remove(campo);
    else {
      if ("ia".equals(tipo)) Erro.exigir(valor.trim().startsWith("sk-ant-"), "A chave da Anthropic começa com sk-ant-");
      s.put(campo, cripto.cifrar(valor.trim()));
    }
    cfg.put(secao, s);
    db.executa("update crm_lojas set config = ?::jsonb, updated_at = now() where id = ?", cfg, loja);
    auditar("segredo_" + tipo, null);
    return Map.of("ok", true);
  }

  @POST
  @Path("/testar-email")
  public Map<String, Object> testarEmail(Map<String, Object> corpo) {
    sessao.exigir("admin");
    email.enviar(sessao.loja(), Json.s(corpo, "para", sessao.email()), "Teste do Gestão Plus CRM", "<p>Se você recebeu este e-mail, o envio está funcionando. ✅</p>");
    return Map.of("ok", true);
  }

  @GET
  @Path("/uso-ia")
  public Map<String, Object> usoIa(@QueryParam("dias") Integer dias) {
    sessao.exigir("admin");
    int d = dias == null ? 30 : dias;
    UUID loja = sessao.loja();
    return Json.de(
        "porTipo", db.lista("select tipo, count(*) as chamadas, sum(tokens_entrada) as entrada, sum(tokens_saida) as saida, sum(tokens_cache_leitura) as cache, sum(custo_micro_usd) as custo_micro_usd from crm_ia_uso where store_id = ? and created_at > now() - (? || ' days')::interval group by tipo order by 6 desc", loja, String.valueOf(d)),
        "porDia", db.lista("select created_at::date as dia, sum(custo_micro_usd) as custo_micro_usd, count(*) as chamadas from crm_ia_uso where store_id = ? and created_at > now() - (? || ' days')::interval group by 1 order by 1", loja, String.valueOf(d)),
        "erros", db.lista("select created_at, tipo, erro from crm_ia_uso where store_id = ? and erro is not null order by created_at desc limit 20", loja));
  }

  @GET
  @Path("/auditoria")
  public List<Map<String, Object>> auditoria() {
    sessao.exigir("admin");
    return db.lista("select a.*, u.nome as usuario_nome from crm_auditoria a left join crm_usuarios u on u.id = a.usuario_id where a.store_id = ? order by a.created_at desc limit 300", sessao.loja());
  }

  private void auditar(String acao, Map<String, Object> dados) {
    db.executa("insert into crm_auditoria (store_id, usuario_id, acao, dados) values (?, ?, ?, ?::jsonb)", sessao.loja(), sessao.usuario(), acao, dados);
  }
}
