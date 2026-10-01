package br.com.clienteplus.crm.vendas;

import br.com.clienteplus.crm.atendimento.Atendimento;
import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.comum.Cripto;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.comum.Limitador;
import br.com.clienteplus.crm.crm.Negocios;
import br.com.clienteplus.crm.eventos.Eventos;
import io.vertx.core.http.HttpServerRequest;
import jakarta.enterprise.event.Event;
import jakarta.inject.Inject;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/** Central de vendas: integrações (webhook das plataformas), compras, atribuição; tracking (links e origem). */
@Path("/")
public class VendasResource {

  private static final Logger LOG = Logger.getLogger(VendasResource.class);
  public static final List<String> PLATAFORMAS = List.of("hotmart", "kiwify", "eduzz", "guru", "hubla", "monetizze", "shopify", "nuvemshop", "woocommerce",
      "mercadopago", "asaas", "stripe", "cliente_plus", "webhook");

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject Atendimento atendimento;
  @Inject Negocios negocios;
  @Inject Limitador limitador;
  @Inject Event<Object> eventos;
  @Context HttpServerRequest req;
  @ConfigProperty(name = "crm.url-publica") String urlPublica;

  // ---------------- integrações ----------------

  @GET
  @Path("vendas/integracoes")
  public List<Map<String, Object>> integracoes() {
    List<Map<String, Object>> l = db.lista("select id, plataforma, nome, ativo, config, eventos_recebidos, ultimo_evento_em, ultimo_erro, token, created_at from crm_integracoes where store_id = ? order by created_at", sessao.loja());
    for (Map<String, Object> i : l) i.put("webhook", urlPublica.replaceAll("/+$", "") + "/api/webhooks/integracoes/" + i.remove("token"));
    return l;
  }

  @POST
  @Path("vendas/integracoes")
  public Map<String, Object> novaIntegracao(Map<String, Object> c) {
    sessao.exigir("admin");
    String p = Erro.obrigatorio(c, "plataforma", "Plataforma");
    Erro.exigir(PLATAFORMAS.contains(p), "Plataforma não suportada");
    Map<String, Object> i = db.insere("crm_integracoes", Json.de("store_id", sessao.loja(), "plataforma", p, "nome", Json.s(c, "nome", p), "token", Cripto.tokenAleatorio(24),
        "config", Json.m(c.get("config"))));
    i.put("webhook", urlPublica.replaceAll("/+$", "") + "/api/webhooks/integracoes/" + i.remove("token"));
    return i;
  }

  @PUT
  @Path("vendas/integracoes/{id}")
  public Map<String, Object> editarIntegracao(@PathParam("id") UUID id, Map<String, Object> c) {
    sessao.exigir("admin");
    return db.atualiza("crm_integracoes", id, sessao.loja(), Json.de("nome", Json.s(c, "nome"), "ativo", Json.b(c, "ativo", true), "config", Json.m(c.get("config"))));
  }

  @DELETE
  @Path("vendas/integracoes/{id}")
  public Map<String, Object> apagarIntegracao(@PathParam("id") UUID id) {
    sessao.exigir("admin");
    db.executa("delete from crm_integracoes where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  @GET
  @Path("vendas/integracoes/{id}/eventos")
  public List<Map<String, Object>> eventosIntegracao(@PathParam("id") UUID id) {
    return db.lista("select * from crm_integracao_eventos where integracao_id = ? and store_id = ? order by created_at desc limit 100", id, sessao.loja());
  }

  /** Recebe o webhook da plataforma (o token no endereço identifica a integração). */
  @POST
  @Path("webhooks/integracoes/{token}")
  public Map<String, Object> webhook(@PathParam("token") String token, Map<String, Object> corpo) {
    limitador.conferir("webhook-int:" + token, 1200, 60);
    Map<String, Object> i = db.um("select * from crm_integracoes where token = ? and ativo", token);
    if (i == null) throw Erro.naoEncontrado("Integração não encontrada");
    UUID loja = UUID.fromString((String) i.get("storeId"));
    UUID integ = UUID.fromString((String) i.get("id"));
    Map<String, Object> ev = db.insere("crm_integracao_eventos", Json.de("store_id", loja, "integracao_id", integ, "tipo", evento(corpo), "corpo", corpo == null ? Map.of() : corpo));
    db.executa("update crm_integracoes set eventos_recebidos = eventos_recebidos + 1, ultimo_evento_em = now() where id = ?", integ);
    try {
      processar(loja, i, corpo == null ? Map.of() : corpo);
      db.executa("update crm_integracao_eventos set processado = true where id = ?::uuid", ev.get("id"));
      db.executa("update crm_integracoes set ultimo_erro = null where id = ?", integ);
    } catch (Exception e) {
      db.executa("update crm_integracao_eventos set erro = ? where id = ?::uuid", Formatos.curto(e.getMessage(), 500), ev.get("id"));
      db.executa("update crm_integracoes set ultimo_erro = ? where id = ?", Formatos.curto(e.getMessage(), 500), integ);
      LOG.warnf("Integração %s: %s", i.get("plataforma"), e.getMessage());
    }
    return Map.of("ok", true);
  }

  /** Dados normalizados de uma venda, venham de qual plataforma vierem. */
  record Venda(String pedido, String status, double valor, String produto, String nome, String email, String telefone, String forma) {}

  static Venda normalizar(String plataforma, Map<String, Object> c) {
    Map<String, Object> d = c.get("data") instanceof Map ? Json.m(c.get("data")) : c;
    String status = achar(c, "order_status", "trans_status", "financial_status", "status", "event", "type");
    String pedido = achar(d, "transaction", "order_id", "trans_cod", "codigo", "id");
    double valor = numero(achar(d, "value", "total_price", "trans_value", "total", "valor", "price", "amount_total", "charge_amount", "amount"));
    if ("stripe".equals(plataforma) || (c.containsKey("Commissions") && valor > 1000)) valor = valor / 100.0;
    String produto = achar(d, "product_name", "produto_nome", "title", "name_product");
    Object prod = d.get("product") != null ? d.get("product") : d.get("Product") != null ? d.get("Product") : d.get("produto");
    if (prod instanceof Map<?, ?> pm) produto = achar(Json.m(pm), "name", "product_name", "nome", "title");
    if (produto == null && d.get("line_items") instanceof List<?> li && !li.isEmpty()) produto = achar(Json.m(li.get(0)), "title", "name");
    Map<String, Object> cli = Json.m(d.get("buyer") != null ? d.get("buyer") : d.get("Customer") != null ? d.get("Customer") : d.get("customer") != null ? d.get("customer")
        : d.get("comprador") != null ? d.get("comprador") : d.get("contact") != null ? d.get("contact") : d.get("billing") != null ? d.get("billing")
        : d.get("customer_details") != null ? d.get("customer_details") : d.get("user") != null ? d.get("user") : d);
    String nome = achar(cli, "full_name", "name", "nome", "cus_name");
    if (nome == null && cli.get("first_name") != null) nome = (cli.get("first_name") + " " + Json.s(cli, "last_name", "")).trim();
    String email = achar(cli, "email", "cus_email");
    String tel = achar(cli, "checkout_phone", "mobile", "phone", "phone_number", "telefone", "cus_cel", "cellphone");
    if (tel != null && cli.get("phone_local_code") != null) tel = cli.get("phone_local_code") + tel;
    return new Venda(pedido, status(status), valor, produto, nome, email, tel, achar(d, "payment_type", "payment_method", "billingType", "forma_pagamento"));
  }

  static String status(String s) {
    if (s == null) return "approved";
    String x = s.toLowerCase();
    if (x.contains("refund") || x.contains("reembols") || x.contains("estorn")) return "refunded";
    if (x.contains("chargeback") || x.contains("charged")) return "chargeback";
    if (x.contains("cancel") || x.contains("expired") || x.contains("recus") || x.equals("7")) return "canceled";
    if (x.contains("wait") || x.contains("pending") || x.contains("aguard") || x.contains("billet_printed") || x.contains("created") || x.equals("1")) return "pending";
    return "approved";
  }

  private static String achar(Map<String, Object> m, String... chaves) {
    for (String k : chaves) {
      Object v = m.get(k);
      if (v != null && !(v instanceof Map) && !(v instanceof List) && !String.valueOf(v).isBlank()) return String.valueOf(v);
      if (v instanceof Map<?, ?> mm && mm.get("value") != null) return String.valueOf(mm.get("value"));
    }
    return null;
  }

  private static double numero(String s) {
    if (s == null) return 0;
    try {
      return Double.parseDouble(s.replace(",", "."));
    } catch (Exception e) {
      return 0;
    }
  }

  private static String evento(Map<String, Object> c) {
    if (c == null) return null;
    String e = achar(c, "event", "type", "webhook_event_type", "order_status", "status");
    return e == null ? null : Formatos.curto(e, 80);
  }

  void processar(UUID loja, Map<String, Object> integ, Map<String, Object> corpo) {
    Venda v = normalizar((String) integ.get("plataforma"), corpo);
    Erro.exigir(v.pedido() != null, "Evento sem identificação do pedido");
    UUID contato = null;
    if (v.telefone() != null && Formatos.telefone(v.telefone()) != null) contato = atendimento.contatoPorTelefone(loja, v.telefone(), v.nome(), null, (String) integ.get("plataforma")).id();
    else if (v.email() != null) contato = Formatos.uuid(db.valor("select id from crm_contatos where store_id = ? and lower(email) = lower(?) limit 1", loja, v.email()));
    if (contato != null && v.email() != null) db.executa("update crm_contatos set email = coalesce(email, ?) where id = ?", v.email(), contato);
    UUID conversa = contato == null ? null : Formatos.uuid(db.valor("select id from crm_conversas where contato_id = ? order by ultima_mensagem_em desc nulls last limit 1", contato));
    Map<String, Object> cfgLoja = Json.m(db.valor("select config from crm_lojas where id = ?", loja));
    int janela = Json.i(cfgLoja, "janela_atribuicao_dias", 7);
    Instant ultimaIa = conversa == null ? null : Formatos.instante(db.valor("select max(created_at)::text from crm_mensagens where conversa_id = ? and remetente = 'ai'", conversa));
    boolean ia = ultimaIa != null && ultimaIa.isAfter(Instant.now().minus(Duration.ofDays(janela)));
    Integer minutos = ultimaIa == null ? null : (int) Duration.between(ultimaIa, Instant.now()).toMinutes();
    String origem = conversa == null ? null : db.valor("select origem from crm_conversas where id = ?", conversa);
    Map<String, Object> compra = db.um("""
        insert into crm_compras (store_id, contato_id, integracao_id, conversa_id, plataforma, pedido_id, produto, valor, status, forma_pagamento, influenciada_ia, minutos_ate_venda, origem, dados)
        values (?, ?, ?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
        on conflict (store_id, plataforma, pedido_id) do update set status = excluded.status, valor = case when excluded.valor > 0 then excluded.valor else crm_compras.valor end,
          contato_id = coalesce(crm_compras.contato_id, excluded.contato_id)
        returning id, (xmax = 0) as nova""",
        loja, contato, integ.get("id"), conversa, integ.get("plataforma"), v.pedido(), v.produto(), v.valor(), v.status(), v.forma(), ia, minutos, origem, corpo);
    UUID compraId = UUID.fromString((String) compra.get("id"));
    Map<String, Object> cfg = Json.m(integ.get("config"));
    if (contato != null && "approved".equals(v.status())) {
      String tag = Json.s(cfg, "tag_compra", "CLIENTE");
      if (!tag.isBlank()) atendimento.adicionarTag(loja, contato, conversa, tag);
      if (Json.b(cfg, "mover_ganho", true)) {
        Map<String, Object> n = db.um("select * from crm_negocios where contato_id = ? and ganho_em is null and perdido_em is null order by updated_at desc limit 1", contato);
        if (n != null) {
          db.executa("update crm_negocios set valor = greatest(valor, ?) where id = ?::uuid", v.valor(), n.get("id"));
          UUID ganho = negocios.etapaGanho(UUID.fromString((String) n.get("funilId")));
          if (ganho != null) negocios.mover(loja, UUID.fromString((String) n.get("id")), ganho, "sistema", null, "Compra na " + integ.get("plataforma"));
        }
      }
    }
    if (contato != null && List.of("refunded", "chargeback").contains(v.status())) atendimento.adicionarTag(loja, contato, conversa, "REEMBOLSO");
    if (contato != null) eventos.fireAsync(new Eventos.CompraRecebida(loja, compraId, contato, v.status(), v.valor(), v.produto()));
    if (Json.b(compra, "nova", false) && "approved".equals(v.status()))
      atendimento.notificarEquipe(loja, "venda", "Venda na " + integ.get("plataforma") + (ia ? " (influenciada pela IA)" : ""), Formatos.reais(v.valor()) + " — " + Json.s(Json.de("p", v.produto()), "p", ""), "/vendas");
  }

  // ---------------- central de vendas ----------------

  @GET
  @Path("vendas/resumo")
  public Map<String, Object> resumo(@QueryParam("dias") Integer dias) {
    int d = dias == null ? 30 : dias;
    UUID loja = sessao.loja();
    String per = String.valueOf(d);
    Map<String, Object> r = db.um("""
        select count(*) filter (where status = 'approved') as vendas, coalesce(sum(valor) filter (where status = 'approved'),0) as receita,
          count(*) filter (where status = 'approved' and influenciada_ia) as vendas_ia, coalesce(sum(valor) filter (where status = 'approved' and influenciada_ia),0) as receita_ia,
          coalesce(avg(minutos_ate_venda) filter (where status = 'approved' and influenciada_ia),0) as minutos_medio,
          count(*) filter (where status in ('refunded','chargeback')) as reembolsos
        from crm_compras where store_id = ? and comprado_em > now() - (? || ' days')::interval""", loja, per);
    long vendas = Json.i(r, "vendas", 0);
    r.put("taxaIa", vendas == 0 ? 0 : Math.round(1000.0 * Json.i(r, "vendasIa", 0) / vendas) / 10.0);
    r.put("porDia", db.lista("select comprado_em::date as dia, count(*) filter (where status='approved') as vendas, coalesce(sum(valor) filter (where status='approved'),0) as receita, coalesce(sum(valor) filter (where status='approved' and influenciada_ia),0) as receita_ia from crm_compras where store_id = ? and comprado_em > now() - (? || ' days')::interval group by 1 order by 1", loja, per));
    r.put("produtos", db.lista("select coalesce(produto,'(sem nome)') as produto, count(*) as vendas, coalesce(sum(valor),0) as receita from crm_compras where store_id = ? and status = 'approved' and comprado_em > now() - (? || ' days')::interval group by 1 order by 3 desc limit 10", loja, per));
    r.put("plataformas", db.lista("select plataforma, count(*) as vendas, coalesce(sum(valor),0) as receita from crm_compras where store_id = ? and status = 'approved' and comprado_em > now() - (? || ' days')::interval group by 1 order by 3 desc", loja, per));
    r.put("funil", db.um("""
        select (select count(*) from crm_conversas where store_id = ? and created_at > now() - (? || ' days')::interval) as conversas,
          (select count(distinct conversa_id) from crm_mensagens where store_id = ? and remetente = 'ai' and created_at > now() - (? || ' days')::interval) as interacoes_ia,
          (select count(*) from crm_compras where store_id = ? and status = 'approved' and comprado_em > now() - (? || ' days')::interval) as vendas""", loja, per, loja, per, loja, per));
    r.put("ultimas", db.lista("select c.*, ct.nome as contato_nome from crm_compras c left join crm_contatos ct on ct.id = c.contato_id where c.store_id = ? order by c.comprado_em desc limit 30", loja));
    return r;
  }

  // ---------------- tracking ----------------

  @GET
  @Path("tracking/resumo")
  public Map<String, Object> tracking(@QueryParam("dias") Integer dias, @QueryParam("modelo") String modelo) {
    int d = dias == null ? 30 : dias;
    UUID loja = sessao.loja();
    String per = String.valueOf(d);
    Map<String, Object> r = db.um("""
        select count(*) as conversas, count(*) filter (where origem is not null) as com_origem,
          (select coalesce(sum(cliques),0) from crm_links where store_id = ?) as cliques
        from crm_conversas where store_id = ? and created_at > now() - (? || ' days')::interval""", loja, loja, per);
    r.put("porCanal", db.lista("""
        select coalesce(c.origem, 'sem_origem') as canal, count(distinct c.id) as conversas,
          count(distinct cp.id) filter (where cp.status = 'approved') as vendas, coalesce(sum(cp.valor) filter (where cp.status = 'approved'),0) as receita
        from crm_conversas c left join crm_compras cp on cp.contato_id = c.contato_id and cp.comprado_em >= c.created_at
        where c.store_id = ? and c.created_at > now() - (? || ' days')::interval group by 1 order by 2 desc""", loja, per));
    r.put("anuncios", db.lista("""
        select a.*, (select count(*) from crm_conversas c where c.store_id = a.store_id and c.origem_dados->>'ad_id' = a.ad_id) as conversas,
          (select count(*) from crm_compras cp join crm_conversas c on c.contato_id = cp.contato_id where c.store_id = a.store_id and c.origem_dados->>'ad_id' = a.ad_id and cp.status = 'approved') as vendas,
          (select coalesce(sum(cp.valor),0) from crm_compras cp join crm_conversas c on c.contato_id = cp.contato_id where c.store_id = a.store_id and c.origem_dados->>'ad_id' = a.ad_id and cp.status = 'approved') as receita
        from crm_anuncios a where a.store_id = ? order by a.created_at desc limit 100""", loja));
    List<Map<String, Object>> links = db.lista("select * from crm_links where store_id = ? order by created_at desc", loja);
    links.forEach(l -> l.put("url", urlPublica.replaceAll("/+$", "") + "/api/l/" + l.get("codigo")));
    r.put("links", links);
    r.put("porDia", db.lista("select created_at::date as dia, count(*) filter (where origem is not null) as com_origem, count(*) filter (where origem is null) as sem_origem from crm_conversas where store_id = ? and created_at > now() - (? || ' days')::interval group by 1 order by 1", loja, per));
    return r;
  }

  /** Gasto e campanha do anúncio (para calcular o retorno). corpo: {gasto, campanha, titulo} */
  @PUT
  @Path("tracking/anuncios/{id}")
  public Map<String, Object> editarAnuncio(@PathParam("id") UUID id, Map<String, Object> c) {
    return db.atualiza("crm_anuncios", id, sessao.loja(), Json.de("gasto", c.get("gasto") == null ? null : Json.d(c, "gasto", 0), "gasto_atualizado_em", Instant.now(),
        "campanha", Json.s(c, "campanha"), "titulo", Json.s(c, "titulo")));
  }

  @POST
  @Path("tracking/links")
  public Map<String, Object> novoLink(Map<String, Object> c) {
    String codigo = Formatos.slug(Json.s(c, "codigo", Cripto.tokenAleatorio(5))).replace("-", "");
    if (codigo.length() < 4) codigo = codigo + Cripto.tokenAleatorio(3).replaceAll("[^a-zA-Z0-9]", "");
    Map<String, Object> l = db.insere("crm_links", Json.de("store_id", sessao.loja(), "conexao_id", Formatos.uuid(c.get("conexaoId")), "codigo", codigo, "nome", Erro.obrigatorio(c, "nome", "Nome"),
        "mensagem", Json.s(c, "mensagem", "Olá! Quero saber mais."), "destino_url", Json.s(c, "destinoUrl"), "campanha", Json.s(c, "campanha"), "origem", Json.s(c, "origem", "link"), "midia", Json.s(c, "midia")));
    l.put("url", urlPublica.replaceAll("/+$", "") + "/api/l/" + codigo);
    return l;
  }

  @DELETE
  @Path("tracking/links/{id}")
  public Map<String, Object> apagarLink(@PathParam("id") UUID id) {
    db.executa("delete from crm_links where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  /** Link rastreado: conta o clique e abre o WhatsApp com a mensagem (com o código de origem). */
  @GET
  @Path("l/{codigo}")
  public Response redirecionar(@PathParam("codigo") String codigo) {
    Map<String, Object> l = db.um("select * from crm_links where codigo = ? and ativo", codigo);
    if (l == null) throw Erro.naoEncontrado("Link não encontrado");
    String ip = req == null || req.remoteAddress() == null ? "" : req.remoteAddress().hostAddress();
    db.executa("update crm_links set cliques = cliques + 1 where id = ?::uuid", l.get("id"));
    db.executa("insert into crm_link_cliques (store_id, link_id, ip_hash, user_agent, referer) values (?::uuid, ?::uuid, ?, ?, ?)", l.get("storeId"), l.get("id"),
        Cripto.sha256(ip).substring(0, 16), req == null ? null : Formatos.curto(req.getHeader("User-Agent"), 300), req == null ? null : Formatos.curto(req.getHeader("Referer"), 300));
    if (l.get("destinoUrl") != null) return Response.status(302).location(URI.create((String) l.get("destinoUrl"))).build();
    String tel = l.get("conexaoId") != null ? db.valor("select telefone from crm_conexoes where id = ?::uuid", l.get("conexaoId"))
        : db.valor("select telefone from crm_conexoes where store_id = ?::uuid and tipo = 'whatsapp_cloud' order by created_at limit 1", l.get("storeId"));
    if (tel == null) throw Erro.naoEncontrado("Loja sem WhatsApp conectado");
    String msg = Json.s(l, "mensagem", "Olá!") + " [ref:" + codigo + "]";
    return Response.status(302).location(URI.create("https://wa.me/" + tel + "?text=" + URLEncoder.encode(msg, StandardCharsets.UTF_8).replace("+", "%20"))).build();
  }
}
