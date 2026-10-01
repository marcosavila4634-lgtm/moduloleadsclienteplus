package br.com.clienteplus.crm.relatorios;

import br.com.clienteplus.crm.atendimento.ContatosResource;
import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Json;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Response;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Dashboard e relatórios (tudo calculado dos dados, nada fixo). */
@Path("/")
public class RelatoriosResource {

  @Inject Db db;
  @Inject Sessao sessao;

  @GET
  @Path("dashboard")
  public Map<String, Object> dashboard(@QueryParam("periodo") String periodo) {
    UUID loja = sessao.loja();
    int dias = switch (periodo == null ? "30" : periodo) { case "hoje" -> 1; case "trimestre", "90" -> 90; case "7" -> 7; default -> 30; };
    String per = String.valueOf(dias);
    Map<String, Object> d = db.um("""
        select
          (select count(*) from crm_conversas where store_id = ? and ultima_mensagem_em > now() - (? || ' days')::interval) as conversas,
          (select count(*) from crm_conversas where store_id = ? and ultima_mensagem_em > now() - (? || ' days')::interval * 2 and ultima_mensagem_em <= now() - (? || ' days')::interval) as conversas_antes,
          (select count(*) from crm_conversas where store_id = ?) as conversas_total,
          (select count(*) from crm_conversas where store_id = ? and status in ('resolved','closed') and handoff_em is null and agente_id is not null) as resolvidas_ia,
          (select count(*) from crm_conversas where store_id = ? and status in ('resolved','closed') and ultima_mensagem_em > now() - (? || ' days')::interval) as resolvidas,
          (select count(*) from crm_contatos where store_id = ?) as contatos,
          (select count(*) from crm_negocios where store_id = ? and ganho_em is null and perdido_em is null) as negocios_abertos,
          (select count(*) from crm_negocios where store_id = ? and ganho_em is not null) as ganhos,
          (select count(*) from crm_negocios where store_id = ? and perdido_em is not null) as perdidos,
          (select count(*) from crm_negocios where store_id = ? and score_ia >= 70 and ganho_em is null and perdido_em is null) as score_alto,
          (select count(*) from crm_negocios where store_id = ? and ganho_em is null and perdido_em is null and (score_ia < 40 or ultima_atividade_em < now() - interval '7' day)) as esfriando,
          (select coalesce(avg(valor) filter (where valor > 0),0) from crm_negocios where store_id = ?) as ticket_medio,
          (select coalesce(avg(extract(epoch from ganho_em - created_at)/86400),0) from crm_negocios where store_id = ? and ganho_em is not null) as dias_ate_fechar,
          (select count(*) from crm_conversas where store_id = ? and aguardando_resposta and status in ('new','open','pending') and arquivada_em is null) as esperando,
          (select count(*) from crm_conversas where store_id = ? and aguardando_resposta and status in ('new','open','pending') and atribuida_a = 'ai' and ia_ativa) as esperando_ia,
          (select min(ultima_do_cliente_em) from crm_conversas where store_id = ? and aguardando_resposta and status in ('new','open','pending') and arquivada_em is null) as mais_antiga,
          (select percentile_cont(0.5) within group (order by primeira_resposta_ms) from crm_conversas c where c.store_id = ? and primeira_resposta_ms is not null and created_at > now() - (? || ' days')::interval
             and exists (select 1 from crm_mensagens m where m.conversa_id = c.id and m.remetente = 'ai')) as primeira_ia_ms,
          (select percentile_cont(0.5) within group (order by primeira_resposta_ms) from crm_conversas c where c.store_id = ? and primeira_resposta_ms is not null and created_at > now() - (? || ' days')::interval
             and not exists (select 1 from crm_mensagens m where m.conversa_id = c.id and m.remetente = 'ai')) as primeira_equipe_ms,
          (select coalesce(sum(valor),0) from crm_negocios where store_id = ? and ganho_em > now() - (? || ' days')::interval) as receita""",
        loja, per, loja, per, per, loja, loja, loja, per, loja, loja, loja, loja, loja, loja, loja, loja, loja, loja, loja, loja, per, loja, per, loja, per);
    long total = Json.i(d, "conversasTotal", 0);
    d.put("autonomiaIa", total == 0 ? 0 : Math.round(1000.0 * Json.i(d, "resolvidasIa", 0) / total) / 10.0);
    long g = Json.i(d, "ganhos", 0), p = Json.i(d, "perdidos", 0);
    d.put("conversao", g + p == 0 ? 0 : Math.round(1000.0 * g / (g + p)) / 10.0);
    long antes = Json.i(d, "conversasAntes", 0);
    d.put("variacao", antes == 0 ? null : Math.round(100.0 * (Json.i(d, "conversas", 0) - antes) / antes));
    UUID funil = br.com.clienteplus.crm.comum.Formatos.uuid(db.valor("select id from crm_funis where store_id = ? and ativo order by ordem limit 1", loja));
    d.put("funil", funil == null ? List.of() : db.lista("""
        select e.id, e.nome, e.cor, e.ganho, e.perda, count(n.id) as negocios, coalesce(sum(n.valor),0) as valor
        from crm_etapas e left join crm_negocios n on n.etapa_id = e.id where e.funil_id = ? group by e.id order by e.ordem""", funil));
    d.put("porDia", db.lista("""
        select gs::date as dia, (select count(distinct m.conversa_id) from crm_mensagens m where m.store_id = ? and m.remetente = 'customer' and m.enviada_em::date = gs::date) as conversas,
          (select count(*) from crm_mensagens m where m.store_id = ? and m.remetente = 'ai' and m.enviada_em::date = gs::date) as ia,
          (select count(*) from crm_mensagens m where m.store_id = ? and m.remetente = 'agent' and m.enviada_em::date = gs::date) as humano
        from generate_series(now() - (? || ' days')::interval, now(), interval '1' day) gs order by 1""", loja, loja, loja, String.valueOf(Math.max(7, dias))));
    d.put("primeiroQuemRespondeu", db.um("""
        select count(*) filter (where quem = 'ai') as ia, count(*) filter (where quem = 'agent') as equipe from (
          select (select m.remetente from crm_mensagens m where m.conversa_id = c.id and m.remetente in ('ai','agent') order by m.enviada_em limit 1) as quem
          from crm_conversas c where c.store_id = ? and c.created_at > now() - (? || ' days')::interval) x""", loja, per));
    d.put("agentes", db.lista("""
        select a.id, a.nome, a.papel, a.cor, count(distinct c.id) as conversas,
          count(distinct c.id) filter (where c.status in ('resolved','closed') and c.handoff_em is null) as sem_humano
        from crm_agentes a left join crm_conversas c on c.agente_id = a.id and c.ultima_mensagem_em > now() - (? || ' days')::interval
        where a.store_id = ? group by a.id order by 5 desc""", per, loja));
    d.put("emRisco", db.lista("""
        select n.id, n.titulo, n.valor, n.score_ia, e.nome as etapa from crm_negocios n join crm_etapas e on e.id = n.etapa_id
        where n.store_id = ? and n.ganho_em is null and n.perdido_em is null and n.metadados->>'risk_level' = 'high' order by n.valor desc limit 8""", loja));
    return d;
  }

  /** Lista de "Primeiros passos" do painel, calculada do que a loja já configurou. */
  @GET
  @Path("dashboard/primeiros-passos")
  public List<Map<String, Object>> primeirosPassos() {
    UUID loja = sessao.loja();
    Map<String, Object> c = db.um("""
        select (select count(*) from crm_conexoes where store_id = ? and status = 'conectado') as conexoes,
          (select count(*) from crm_agentes where store_id = ?) as agentes,
          (select count(*) from crm_agentes a where store_id = ? and status = 'active' and exists (select 1 from crm_agente_conexoes ac where ac.agente_id = a.id)) as agentes_ativos,
          (select count(*) from crm_agente_conhecimento where store_id = ?) as conhecimento,
          (select count(*) from crm_produtos where store_id = ?) as produtos,
          (select count(*) from crm_automacoes where store_id = ? and status = 'active') as automacoes,
          (select count(*) from crm_membros where store_id = ?) as membros,
          (select count(*) from crm_paginas where store_id = ? and publicada is not null) as pagina,
          (select jsonb_exists(config, 'janela_envio') from crm_lojas where id = ?) as janela,
          (select coalesce(jsonb_exists(config->'ia', 'chave_cripto'), false) from crm_lojas where id = ?) as chave_ia""",
        loja, loja, loja, loja, loja, loja, loja, loja, loja, loja);
    return List.of(
        Json.de("id", "whatsapp", "titulo", "Conecte seu WhatsApp", "texto", "Ligue o número oficial da empresa para as mensagens chegarem aqui.", "para", "/conexoes", "trilha", "conexoes", "feito", Json.i(c, "conexoes", 0) > 0),
        Json.de("id", "chave_ia", "titulo", "Ative a inteligência artificial", "texto", "Informe a chave da IA em Configurações para o robô poder responder.", "para", "/configuracoes", "trilha", "agentes", "feito", Json.b(c, "chaveIa", false) || Json.i(c, "agentesAtivos", 0) > 0),
        Json.de("id", "agente", "titulo", "Crie seu robô vendedor", "texto", "Escolha o tipo (vendas, suporte...) e dê um nome.", "para", "/agentes", "trilha", "agentes", "feito", Json.i(c, "agentes", 0) > 0),
        Json.de("id", "conhecimento", "titulo", "Ensine o robô", "texto", "Coloque as perguntas mais comuns e as respostas certas.", "para", "/agentes", "trilha", "agentes", "feito", Json.i(c, "conhecimento", 0) > 0),
        Json.de("id", "ativar", "titulo", "Ligue o robô no WhatsApp", "texto", "Escolha o número em que ele atende e ative.", "para", "/agentes", "trilha", "agentes", "feito", Json.i(c, "agentesAtivos", 0) > 0),
        Json.de("id", "janela", "titulo", "Defina o horário do robô", "texto", "Escolha quando as mensagens automáticas podem sair (ex.: só às 15h).", "para", "/configuracoes", "trilha", "automacoes", "feito", Json.b(c, "janela", false)),
        Json.de("id", "produtos", "titulo", "Cadastre seus produtos", "texto", "Com fotos, preço e estoque. O robô vende por eles.", "para", "/catalogo", "trilha", "catalogo", "feito", Json.i(c, "produtos", 0) > 0, "opcional", true),
        Json.de("id", "pagina", "titulo", "Publique a página da sua loja", "texto", "Seu catálogo online, com carrinho e pedido pelo WhatsApp.", "para", "/pagina", "trilha", "catalogo", "feito", Json.i(c, "pagina", 0) > 0, "opcional", true),
        Json.de("id", "automacao", "titulo", "Crie sua primeira automação", "texto", "Deixe o sistema fazer tarefas sozinho.", "para", "/automacoes", "trilha", "automacoes", "feito", Json.i(c, "automacoes", 0) > 0),
        Json.de("id", "equipe", "titulo", "Convide sua equipe", "texto", "Cada atendente com o próprio login.", "para", "/equipe", "trilha", "inicio", "feito", Json.i(c, "membros", 0) > 1, "opcional", true));
  }

  @GET
  @Path("relatorios")
  public Map<String, Object> relatorios(@QueryParam("dias") Integer dias) {
    UUID loja = sessao.loja();
    String per = String.valueOf(dias == null ? 7 : dias);
    Map<String, Object> r = db.um("""
        select count(distinct conversa_id) as conversas, count(*) filter (where remetente in ('ai','agent','system')) as enviadas,
          count(*) filter (where remetente = 'customer') as recebidas, count(*) filter (where remetente = 'ai') as ia, count(*) filter (where remetente = 'agent') as humano
        from crm_mensagens where store_id = ? and enviada_em > now() - (? || ' days')::interval and visibilidade = 'all'""", loja, per);
    r.put("tempoMedioIaMs", db.valor("select coalesce(avg(duracao_ms),0) from crm_ia_uso where store_id = ? and tipo = 'resposta' and created_at > now() - (? || ' days')::interval", loja, per));
    r.put("porDia", db.lista("""
        select enviada_em::date as dia, count(*) filter (where remetente = 'customer') as recebidas, count(*) filter (where remetente = 'ai') as ia, count(*) filter (where remetente = 'agent') as humano
        from crm_mensagens where store_id = ? and enviada_em > now() - (? || ' days')::interval group by 1 order by 1""", loja, per));
    r.put("porConexao", db.lista("""
        select cx.id, cx.nome, cx.tipo, cx.telefone, count(distinct m.conversa_id) as conversas, count(*) filter (where m.remetente <> 'customer') as enviadas,
          count(*) filter (where m.remetente = 'customer') as recebidas, max(m.enviada_em) as ultima
        from crm_conexoes cx left join crm_conversas c on c.conexao_id = cx.id left join crm_mensagens m on m.conversa_id = c.id and m.enviada_em > now() - (? || ' days')::interval
        where cx.store_id = ? group by cx.id order by 5 desc""", per, loja));
    r.put("porAgente", db.lista("""
        select a.id, a.nome, a.papel, count(distinct m.conversa_id) as conversas, count(m.id) as mensagens,
          (select coalesce(avg(duracao_ms),0) from crm_ia_uso u where u.agente_id = a.id and u.tipo = 'resposta' and u.created_at > now() - (? || ' days')::interval) as tempo_ms,
          (select count(*) from crm_conversas c where c.agente_id = a.id and c.handoff_em > now() - (? || ' days')::interval) as transferidas
        from crm_agentes a left join crm_mensagens m on m.agente_id = a.id and m.enviada_em > now() - (? || ' days')::interval
        where a.store_id = ? group by a.id""", per, per, per, loja));
    r.put("porAtendente", db.lista("""
        select u.id, u.nome, count(distinct m.conversa_id) as conversas, count(m.id) as mensagens
        from crm_membros mb join crm_usuarios u on u.id = mb.usuario_id left join crm_mensagens m on m.usuario_id = u.id and m.enviada_em > now() - (? || ' days')::interval
        where mb.store_id = ? group by u.id order by 3 desc""", per, loja));
    r.put("tags", db.lista("select t, count(*) as contatos from crm_contatos, unnest(tags) t where store_id = ? group by t order by 2 desc limit 20", loja));
    r.put("nps", db.um("""
        select count(*) as respostas, count(*) filter (where nota >= 9) as promotores, count(*) filter (where nota <= 6) as detratores, coalesce(avg(nota),0) as media
        from crm_nps where store_id = ? and status = 'respondida' and respondida_em > now() - (? || ' days')::interval""", loja, per));
    return r;
  }

  /** Exporta um relatório em CSV (conversas | mensagens-dia | vendas | negocios). */
  @GET
  @Path("relatorios/csv")
  @Produces("text/csv")
  public Response csv(@QueryParam("tipo") String tipo, @QueryParam("dias") Integer dias) {
    sessao.exigir("supervisor");
    UUID loja = sessao.loja();
    String per = String.valueOf(dias == null ? 30 : dias);
    List<Map<String, Object>> linhas;
    List<String> cols;
    switch (tipo == null ? "conversas" : tipo) {
      case "vendas" -> {
        cols = List.of("compradoEm", "plataforma", "pedidoId", "produto", "valor", "status", "influenciadaIa", "origem", "contatoNome");
        linhas = db.lista("select c.*, ct.nome as contato_nome from crm_compras c left join crm_contatos ct on ct.id = c.contato_id where c.store_id = ? and c.comprado_em > now() - (? || ' days')::interval order by c.comprado_em", loja, per);
      }
      case "negocios" -> {
        cols = List.of("createdAt", "titulo", "etapaNome", "valor", "scoreIa", "contatoNome", "contatoTelefone", "responsavelNome", "origem", "ganhoEm", "perdidoEm", "motivoPerda");
        linhas = db.lista(br.com.clienteplus.crm.crm.Negocios.VIEW + " where n.store_id = ? and n.created_at > now() - (? || ' days')::interval order by n.created_at", loja, per);
      }
      case "mensagens-dia" -> {
        cols = List.of("dia", "recebidas", "ia", "humano");
        linhas = db.lista("select enviada_em::date as dia, count(*) filter (where remetente = 'customer') as recebidas, count(*) filter (where remetente = 'ai') as ia, count(*) filter (where remetente = 'agent') as humano from crm_mensagens where store_id = ? and enviada_em > now() - (? || ' days')::interval group by 1 order by 1", loja, per);
      }
      default -> {
        cols = List.of("createdAt", "contatoNome", "contatoTelefone", "canal", "status", "atribuidaA", "agenteNome", "humanoNome", "origem", "primeiraRespostaMs", "ultimaMensagemEm");
        linhas = db.lista(br.com.clienteplus.crm.atendimento.Atendimento.VIEW + " where c.store_id = ? and c.created_at > now() - (? || ' days')::interval order by c.created_at", loja, per);
      }
    }
    StringBuilder sb = new StringBuilder("﻿").append(String.join(";", cols)).append('\n');
    for (Map<String, Object> l : linhas) {
      for (int i = 0; i < cols.size(); i++) sb.append(i == 0 ? "" : ";").append(ContatosResource.csv(l.get(cols.get(i))));
      sb.append('\n');
    }
    return Response.ok(sb.toString().getBytes(StandardCharsets.UTF_8)).header("Content-Disposition", "attachment; filename=\"" + (tipo == null ? "conversas" : tipo) + ".csv\"").build();
  }
}
