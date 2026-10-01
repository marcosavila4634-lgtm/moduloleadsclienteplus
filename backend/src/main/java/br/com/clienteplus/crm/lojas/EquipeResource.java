package br.com.clienteplus.crm.lojas;

import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.comum.Cripto;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Email;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import jakarta.inject.Inject;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/** Equipe: membros, convites, setores, metas, ranking e supervisão; notificações do usuário. */
@Path("/")
public class EquipeResource {

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject Email email;
  @ConfigProperty(name = "crm.url-publica") String urlPublica;

  @GET
  @Path("equipe")
  public Map<String, Object> equipe(@QueryParam("dias") Integer dias) {
    UUID loja = sessao.loja();
    int d = dias == null ? 30 : dias;
    List<Map<String, Object>> membros = db.lista("""
        select m.id as membro_id, m.papel, m.setor_id, m.recebe_leads, m.limite_conversas, m.cargo, m.gestor_id, u.id, u.nome, u.email, u.foto_url, u.ativo,
          s.nome as setor_nome,
          (select count(*) from crm_conversas c where c.humano_id = u.id and c.store_id = m.store_id and c.status in ('new','open','pending')) as conversas_ativas,
          (select count(distinct msg.conversa_id) from crm_mensagens msg where msg.usuario_id = u.id and msg.store_id = m.store_id and msg.created_at > now() - (? || ' days')::interval) as atendidas,
          (select count(*) from crm_negocios n where n.responsavel_id = u.id and n.ganho_em > now() - (? || ' days')::interval) as vendas,
          (select coalesce(sum(n.valor),0) from crm_negocios n where n.responsavel_id = u.id and n.ganho_em > now() - (? || ' days')::interval) as receita,
          (select coalesce(avg(c.primeira_resposta_ms),0) from crm_conversas c where c.humano_id = u.id and c.primeira_resposta_ms is not null and c.created_at > now() - (? || ' days')::interval) as primeira_resposta_ms
        from crm_membros m join crm_usuarios u on u.id = m.usuario_id left join crm_setores s on s.id = m.setor_id
        where m.store_id = ? order by u.nome""", String.valueOf(d), String.valueOf(d), String.valueOf(d), String.valueOf(d), loja);
    for (Map<String, Object> m : membros) {
      long score = Json.i(m, "atendidas", 0) * 10L + Json.i(m, "vendas", 0) * 50L + Math.round(Json.d(m, "receita", 0) / 10);
      m.put("pontos", score);
    }
    return Json.de("membros", membros,
        "agentes", db.lista("select a.id, a.nome, a.cor, a.status, (select count(*) from crm_conversas c where c.agente_id = a.id and c.status in ('new','open','pending') and c.ia_ativa) as conversas_ativas, (select count(distinct m.conversa_id) from crm_mensagens m where m.agente_id = a.id and m.created_at > now() - (? || ' days')::interval) as atendidas from crm_agentes a where a.store_id = ?", String.valueOf(d), loja),
        "convites", db.lista("select id, email, nome, papel, expira_em, created_at from crm_convites where store_id = ? and aceito_em is null and expira_em > now() order by created_at desc", loja),
        "setores", db.lista("select s.*, (select count(*) from crm_membros m where m.setor_id = s.id) as membros from crm_setores s where s.store_id = ? order by s.nome", loja));
  }

  /** corpo: {email, nome, papel, setorId} — gera link de convite (e envia por e-mail se configurado). */
  @POST
  @Path("equipe/convites")
  public Map<String, Object> convidar(Map<String, Object> corpo) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    Object lim = Json.m(db.valor("select limites from crm_lojas where id = ?", loja)).get("usuarios");
    if (lim instanceof Number n && db.numero("select count(*) from crm_membros where store_id = ?", loja) >= n.longValue()) throw Erro.proibido("Limite de usuários do plano atingido");
    String em = Erro.obrigatorio(corpo, "email", "E-mail").toLowerCase();
    String papel = Json.s(corpo, "papel", "atendente");
    Erro.exigir(List.of("atendente", "supervisor", "admin").contains(papel) || ("dono".equals(papel) && sessao.peloMenos("dono")), "Papel inválido");
    String token = Cripto.tokenAleatorio(24);
    db.insere("crm_convites", Json.de("store_id", loja, "email", em, "nome", Json.s(corpo, "nome"), "papel", papel, "setor_id", Formatos.uuid(corpo.get("setorId")),
        "token", token, "expira_em", Instant.now().plus(7, ChronoUnit.DAYS), "criado_por", sessao.usuario()));
    String link = urlPublica.replaceAll("/+$", "") + "/convite/" + token;
    boolean enviado = false;
    if (email.configurado(loja)) {
      try {
        String loja2 = db.valor("select nome from crm_lojas where id = ?", loja);
        email.enviar(loja, em, "Convite para a equipe " + loja2, "<p>Olá! Você foi convidado(a) para a equipe <b>" + loja2 + "</b>.</p><p><a href=\"" + link + "\">Clique aqui para entrar</a> (o link vale 7 dias).</p>");
        enviado = true;
      } catch (Exception ignorado) {
        // sem e-mail: o dono copia o link
      }
    }
    return Json.de("link", link, "emailEnviado", enviado);
  }

  @DELETE
  @Path("equipe/convites/{id}")
  public Map<String, Object> cancelarConvite(@PathParam("id") UUID id) {
    sessao.exigir("admin");
    db.executa("delete from crm_convites where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  @PUT
  @Path("equipe/membros/{usuarioId}")
  public Map<String, Object> editarMembro(@PathParam("usuarioId") UUID usuarioId, Map<String, Object> corpo) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    Map<String, Object> m = db.obrigatorio("Membro", "select * from crm_membros where store_id = ? and usuario_id = ?", loja, usuarioId);
    String papel = Json.s(corpo, "papel", (String) m.get("papel"));
    if ("dono".equals(m.get("papel")) && !"dono".equals(papel) && db.numero("select count(*) from crm_membros where store_id = ? and papel = 'dono'", loja) <= 1)
      throw Erro.requisicao("A empresa precisa ter pelo menos um dono");
    if ("dono".equals(papel) && !sessao.peloMenos("dono")) throw Erro.proibido("Só o dono pode passar a propriedade");
    db.executa("update crm_membros set papel = ?, setor_id = ?, recebe_leads = ?, limite_conversas = ?, cargo = ?, gestor_id = ? where id = ?::uuid",
        papel, Formatos.uuid(corpo.get("setorId")), Json.b(corpo, "recebeLeads", Json.b(m, "recebeLeads", true)), Json.i(corpo, "limiteConversas", Json.i(m, "limiteConversas", 0)),
        Json.s(corpo, "cargo"), Formatos.uuid(corpo.get("gestorId")), m.get("id"));
    return Map.of("ok", true);
  }

  @DELETE
  @Path("equipe/membros/{usuarioId}")
  public Map<String, Object> remover(@PathParam("usuarioId") UUID usuarioId) {
    sessao.exigir("admin");
    UUID loja = sessao.loja();
    Erro.exigir(!usuarioId.equals(sessao.usuario()), "Você não pode remover a si mesmo");
    Map<String, Object> m = db.obrigatorio("Membro", "select papel from crm_membros where store_id = ? and usuario_id = ?", loja, usuarioId);
    if ("dono".equals(m.get("papel"))) throw Erro.requisicao("Não é possível remover o dono");
    db.executa("update crm_conversas set humano_id = null, handoff_status = 'queue' where store_id = ? and humano_id = ? and status in ('new','open','pending')", loja, usuarioId);
    db.executa("delete from crm_membros where store_id = ? and usuario_id = ?", loja, usuarioId);
    return Map.of("ok", true);
  }

  // ---------------- setores ----------------

  @POST
  @Path("equipe/setores")
  public Map<String, Object> novoSetor(Map<String, Object> corpo) {
    sessao.exigir("admin");
    return db.insere("crm_setores", Json.de("store_id", sessao.loja(), "nome", Erro.obrigatorio(corpo, "nome", "Nome"), "cor", Json.s(corpo, "cor", "#a053fd"), "descricao", Json.s(corpo, "descricao")));
  }

  @PUT
  @Path("equipe/setores/{id}")
  public Map<String, Object> editarSetor(@PathParam("id") UUID id, Map<String, Object> corpo) {
    sessao.exigir("admin");
    return db.atualiza("crm_setores", id, sessao.loja(), Json.de("nome", Erro.obrigatorio(corpo, "nome", "Nome"), "cor", Json.s(corpo, "cor", "#a053fd"), "descricao", Json.s(corpo, "descricao")));
  }

  @DELETE
  @Path("equipe/setores/{id}")
  public Map<String, Object> apagarSetor(@PathParam("id") UUID id) {
    sessao.exigir("admin");
    db.executa("delete from crm_setores where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  // ---------------- metas ----------------

  @GET
  @Path("equipe/metas")
  public List<Map<String, Object>> metas(@QueryParam("mes") String mes) {
    LocalDate m = mes == null ? LocalDate.now().withDayOfMonth(1) : LocalDate.parse(mes + (mes.length() == 7 ? "-01" : ""));
    return db.lista("""
        select mt.*, u.nome as usuario_nome,
          case mt.tipo
            when 'vendas_valor' then (select coalesce(sum(valor),0) from crm_negocios n where n.store_id = mt.store_id and (mt.usuario_id is null or n.responsavel_id = mt.usuario_id) and n.ganho_em >= mt.mes and n.ganho_em < mt.mes + interval '1' month)
            when 'vendas_qtd' then (select count(*) from crm_negocios n where n.store_id = mt.store_id and (mt.usuario_id is null or n.responsavel_id = mt.usuario_id) and n.ganho_em >= mt.mes and n.ganho_em < mt.mes + interval '1' month)
            when 'conversas' then (select count(distinct msg.conversa_id) from crm_mensagens msg where msg.store_id = mt.store_id and (mt.usuario_id is null or msg.usuario_id = mt.usuario_id) and msg.created_at >= mt.mes and msg.created_at < mt.mes + interval '1' month)
            else 0 end as realizado
        from crm_metas mt left join crm_usuarios u on u.id = mt.usuario_id where mt.store_id = ? and mt.mes = ? order by u.nome nulls first""", sessao.loja(), m);
  }

  @POST
  @Path("equipe/metas")
  public Map<String, Object> salvarMeta(Map<String, Object> corpo) {
    sessao.exigir("supervisor");
    String mes = Erro.obrigatorio(corpo, "mes", "Mês");
    LocalDate m = LocalDate.parse(mes + (mes.length() == 7 ? "-01" : ""));
    return db.um("""
        insert into crm_metas (store_id, usuario_id, tipo, valor, mes) values (?, ?, ?, ?, ?)
        on conflict (store_id, usuario_id, tipo, mes) do update set valor = excluded.valor returning *""",
        sessao.loja(), Formatos.uuid(corpo.get("usuarioId")), Json.s(corpo, "tipo", "vendas_valor"), Json.d(corpo, "valor", 0), m);
  }

  @DELETE
  @Path("equipe/metas/{id}")
  public Map<String, Object> apagarMeta(@PathParam("id") UUID id) {
    sessao.exigir("supervisor");
    db.executa("delete from crm_metas where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  /** Supervisão: conversas em andamento de cada atendente, com tempo de espera. */
  @GET
  @Path("equipe/supervisao")
  public List<Map<String, Object>> supervisao() {
    sessao.exigir("supervisor");
    return db.lista("""
        select c.id, c.status, c.ultima_mensagem, c.ultima_mensagem_em, c.aguardando_resposta, c.ultima_do_cliente_em, c.atribuida_a,
          ct.nome as contato_nome, ct.telefone as contato_telefone, u.nome as humano_nome, a.nome as agente_nome,
          extract(epoch from now() - c.ultima_do_cliente_em) / 60 as minutos_esperando
        from crm_conversas c join crm_contatos ct on ct.id = c.contato_id left join crm_usuarios u on u.id = c.humano_id left join crm_agentes a on a.id = c.agente_id
        where c.store_id = ? and c.status in ('new','open','pending') and c.arquivada_em is null
        order by c.aguardando_resposta desc, c.ultima_do_cliente_em nulls last limit 300""", sessao.loja());
  }

  // ---------------- notificações ----------------

  @GET
  @Path("notificacoes")
  public Map<String, Object> notificacoes() {
    UUID loja = sessao.loja();
    return Json.de("itens", db.lista("select * from crm_notificacoes where store_id = ? and (usuario_id = ? or usuario_id is null) order by created_at desc limit 50", loja, sessao.usuario()),
        "naoLidas", db.numero("select count(*) from crm_notificacoes where store_id = ? and (usuario_id = ? or usuario_id is null) and lida_em is null", loja, sessao.usuario()));
  }

  @POST
  @Path("notificacoes/lidas")
  public Map<String, Object> lidas() {
    db.executa("update crm_notificacoes set lida_em = now() where store_id = ? and (usuario_id = ? or usuario_id is null) and lida_em is null", sessao.loja(), sessao.usuario());
    return Map.of("ok", true);
  }
}
