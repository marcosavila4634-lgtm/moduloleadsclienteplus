package br.com.clienteplus.crm.catalogo;

import br.com.clienteplus.crm.atendimento.Atendimento;
import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.comum.Limitador;
import io.vertx.core.http.HttpServerRequest;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Context;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Loja pública: página personalizável + catálogo + carrinho/checkout +
 * acompanhamento do pedido. Também o editor da página (área logada).
 */
@Path("/")
public class LojaPublicaResource {

  private static final Pattern PERIGOSO = Pattern.compile("(?i)\"\\s*(javascript|data|vbscript):");
  private static final int MAX_PAGINA = 400_000;

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject Pedidos pedidos;
  @Inject Atendimento atendimento;
  @Inject Limitador limitador;
  @Context HttpServerRequest req;

  private String ip() {
    return req == null || req.remoteAddress() == null ? "?" : req.remoteAddress().hostAddress();
  }

  private Map<String, Object> loja(String slug) {
    Map<String, Object> l = db.um("select id, nome, slug, fuso, horario_comercial, config, status from crm_lojas where slug = ?", slug);
    if (l == null || "bloqueada".equals(l.get("status"))) throw Erro.naoEncontrado("Loja não encontrada");
    return l;
  }

  // ---------------- público ----------------

  @GET
  @Path("publico/lojas/{slug}")
  public Map<String, Object> vitrine(@PathParam("slug") String slug) {
    Map<String, Object> l = loja(slug);
    UUID id = UUID.fromString((String) l.get("id"));
    Map<String, Object> cfg = Json.m(l.get("config"));
    String telefone = db.valor("select telefone from crm_conexoes where store_id = ? and tipo = 'whatsapp_cloud' and status = 'conectado' order by created_at limit 1", id);
    List<Map<String, Object>> produtos = db.lista("""
        select p.id, p.nome, p.slug, p.descricao, p.preco, p.preco_promocional, p.promo_inicio, p.promo_fim, p.midias, p.atributos, p.destaque, p.categoria_id,
          p.controla_estoque, p.vende_sem_estoque, p.estoque, p.tags
        from crm_produtos p where p.store_id = ? and p.ativo and p.publico order by p.destaque desc, p.ordem, p.nome""", id);
    for (Map<String, Object> p : produtos) {
      p.put("precoAtual", Catalogo.precoAtual(p, null));
      p.put("emPromocao", Catalogo.emPromocao(p));
      List<Map<String, Object>> vs = db.lista("select id, nome, valores, preco, estoque, midia_url from crm_produto_variacoes where produto_id = ?::uuid and ativo order by ordem", p.get("id"));
      for (Map<String, Object> v : vs) {
        v.put("disponivel", !Json.b(p, "controlaEstoque", true) || Json.b(p, "vendeSemEstoque", false) || Json.i(v, "estoque", 0) > 0);
        v.put("precoAtual", Catalogo.precoAtual(p, v));
        v.remove("estoque");
      }
      p.put("variacoes", vs);
      p.put("disponivel", !Json.b(p, "controlaEstoque", true) || Json.b(p, "vendeSemEstoque", false) || Json.i(p, "estoque", 0) > 0);
      p.remove("estoque");
    }
    Map<String, Object> pix = Json.m(cfg.get("pix"));
    return Json.de("loja", Json.de("id", id, "nome", l.get("nome"), "slug", l.get("slug"), "whatsapp", telefone, "horario", l.get("horarioComercial")),
        "pagina", paginaPublicada(id), "categorias", db.lista("select id, nome, slug from crm_categorias_produto where store_id = ? and ativo order by ordem, nome", id),
        "produtos", produtos, "entrega", Json.m(cfg.get("entrega")), "pagamentos", Json.de("pix", Json.s(pix, "chave") != null,
            "formas", Json.ls(Json.m(cfg.get("entrega")), "formas_pagamento").isEmpty() ? List.of("pix", "combinar") : Json.ls(Json.m(cfg.get("entrega")), "formas_pagamento")));
  }

  @POST
  @Path("publico/lojas/{slug}/calcular")
  public Map<String, Object> calcular(@PathParam("slug") String slug, Map<String, Object> corpo) {
    limitador.conferir("loja-calc:" + ip(), 120, 60);
    UUID id = UUID.fromString((String) loja(slug).get("id"));
    Pedidos.Calculo c = pedidos.calcular(id, Json.l(corpo.get("itens")), Json.s(corpo, "cupom"), null, Json.s(corpo, "entregaTipo", "entrega"));
    return Json.de("itens", c.itens(), "subtotal", c.subtotal(), "desconto", c.desconto(), "frete", c.frete(), "total", c.total(), "erroCupom", c.erroCupom());
  }

  /**
   * Guarda o carrinho assim que o cliente informa o WhatsApp (base do "carrinho
   * abandonado"). corpo: {nome, telefone, itens, pedidoToken?}
   */
  @POST
  @Path("publico/lojas/{slug}/carrinho")
  public Map<String, Object> carrinho(@PathParam("slug") String slug, Map<String, Object> corpo) {
    limitador.conferir("loja-carrinho:" + ip(), 30, 600);
    UUID id = UUID.fromString((String) loja(slug).get("id"));
    String token = Json.s(corpo, "pedidoToken");
    if (token != null) db.executa("delete from crm_pedidos where token = ? and store_id = ? and status = 'carrinho'", token, id);
    Map<String, Object> dados = Json.de("nome", Json.s(corpo, "nome"), "telefone", Erro.obrigatorio(corpo, "telefone", "WhatsApp"), "itens", corpo.get("itens"), "status", "carrinho", "formaPagamento", "combinar");
    Map<String, Object> p = pedidos.criar(id, dados, "pagina", null);
    return Json.de("pedidoToken", p.get("token"));
  }

  /** Recupera o carrinho salvo (link do lembrete de carrinho abandonado). */
  @GET
  @Path("publico/lojas/{slug}/carrinho/{token}")
  public Map<String, Object> recuperarCarrinho(@PathParam("slug") String slug, @PathParam("token") String token) {
    limitador.conferir("loja-carrinho-get:" + ip(), 60, 600);
    UUID id = UUID.fromString((String) loja(slug).get("id"));
    Map<String, Object> p = db.obrigatorio("Carrinho", "select id, nome_cliente, telefone_cliente from crm_pedidos where token = ? and store_id = ? and status = 'carrinho'", token, id);
    List<Map<String, Object>> itens = db.lista("select produto_id, variacao_id, quantidade from crm_pedido_itens where pedido_id = ?::uuid", p.get("id"));
    return Json.de("pedidoToken", token, "nome", p.get("nomeCliente"), "telefone", p.get("telefoneCliente"), "itens", itens);
  }

  /** Finaliza o pedido. corpo: {nome, telefone, email, itens, cupom, formaPagamento, entregaTipo, endereco, observacoes, pedidoToken?} */
  @POST
  @Path("publico/lojas/{slug}/pedidos")
  public Map<String, Object> finalizar(@PathParam("slug") String slug, Map<String, Object> corpo) {
    limitador.conferir("loja-pedido:" + ip(), 15, 600);
    Map<String, Object> l = loja(slug);
    UUID id = UUID.fromString((String) l.get("id"));
    String token = Json.s(corpo, "pedidoToken");
    if (token != null) db.executa("delete from crm_pedidos where token = ? and store_id = ? and status = 'carrinho'", token, id);
    Map<String, Object> dados = new java.util.LinkedHashMap<>(corpo);
    dados.put("status", "aguardando_pagamento");
    dados.remove("contatoId");
    dados.remove("conversaId");
    Map<String, Object> p = pedidos.criar(id, dados, "pagina", null);
    String tel = db.valor("select telefone from crm_conexoes where store_id = ? and tipo = 'whatsapp_cloud' and status = 'conectado' order by created_at limit 1", id);
    String wa = tel == null ? null : "https://wa.me/" + tel + "?text=" + URLEncoder.encode("Olá! Acabei de fazer o pedido #" + p.get("numero") + " no site.", StandardCharsets.UTF_8);
    // se o cliente já conversa com a loja (janela aberta), a confirmação vai direto pelo WhatsApp
    try {
      pedidos.avisarCliente(id, UUID.fromString((String) p.get("id")), "aguardando_pagamento");
    } catch (Exception ignorado) {
      // sem conexão: o cliente usa o botão do WhatsApp
    }
    return Json.de("token", p.get("token"), "numero", p.get("numero"), "total", p.get("total"), "pix", p.get("pixCopiaCola"), "whatsapp", wa);
  }

  @GET
  @Path("publico/pedidos/{token}")
  public Map<String, Object> acompanhar(@PathParam("token") String token) {
    Map<String, Object> p = db.obrigatorio("Pedido", """
        select p.id, p.numero, p.status, p.subtotal, p.desconto, p.frete, p.total, p.forma_pagamento, p.pix_copia_cola, p.entrega_tipo, p.rastreio_codigo, p.rastreio_url,
          p.nome_cliente, p.created_at, p.pago_em, l.nome as loja_nome, l.slug as loja_slug
        from crm_pedidos p join crm_lojas l on l.id = p.store_id where p.token = ? and p.status <> 'carrinho'""", token);
    UUID id = UUID.fromString((String) p.remove("id"));
    p.put("itens", db.lista("select nome, quantidade, preco_unitario, total from crm_pedido_itens where pedido_id = ?", id));
    p.put("historico", db.lista("select status, created_at from crm_pedido_eventos where pedido_id = ? order by created_at", id));
    return p;
  }

  /** "Avise-me quando chegar". corpo: {produtoId, variacaoId?, nome, telefone} */
  @POST
  @Path("publico/lojas/{slug}/avise-me")
  public Map<String, Object> aviseMe(@PathParam("slug") String slug, Map<String, Object> corpo) {
    limitador.conferir("loja-avise:" + ip(), 20, 600);
    UUID id = UUID.fromString((String) loja(slug).get("id"));
    UUID produto = Formatos.uuid(corpo.get("produtoId"));
    db.obrigatorio("Produto", "select id from crm_produtos where id = ? and store_id = ? and ativo and publico", produto, id);
    UUID contato = atendimento.contatoPorTelefone(id, Erro.obrigatorio(corpo, "telefone", "WhatsApp"), Json.s(corpo, "nome"), null, "loja").id();
    db.executa("insert into crm_lista_espera (store_id, produto_id, variacao_id, contato_id) values (?, ?, ?, ?) on conflict do nothing", id, produto, Formatos.uuid(corpo.get("variacaoId")), contato);
    atendimento.adicionarTag(id, contato, null, "LISTA DE ESPERA");
    return Map.of("ok", true);
  }

  // ---------------- editor da página (logado) ----------------

  @GET
  @Path("pagina")
  public Map<String, Object> rascunho() {
    UUID id = sessao.loja();
    Map<String, Object> p = db.um("select rascunho, publicada, publicada_em, updated_at from crm_paginas where store_id = ?", id);
    String slug = db.valor("select slug from crm_lojas where id = ?", id);
    return Json.de("rascunho", p == null ? null : Json.ler((String) p.get("rascunho"), Object.class), "publicadaEm", p == null ? null : p.get("publicadaEm"),
        "temAlteracoes", p != null && !String.valueOf(p.get("rascunho")).equals(String.valueOf(p.get("publicada"))), "slug", slug);
  }

  @PUT
  @Path("pagina")
  public Map<String, Object> salvarRascunho(Map<String, Object> corpo) {
    sessao.exigir("admin");
    String json = validarPagina(corpo.get("pagina"));
    db.executa("""
        insert into crm_paginas (store_id, rascunho) values (?, ?)
        on conflict (store_id) do update set rascunho = excluded.rascunho, updated_at = now()""", sessao.loja(), json);
    return Map.of("ok", true);
  }

  @POST
  @Path("pagina/publicar")
  public Map<String, Object> publicar() {
    sessao.exigir("admin");
    UUID id = sessao.loja();
    String r = db.valor("select rascunho from crm_paginas where store_id = ?", id);
    Erro.exigir(r != null, "Monte a página antes de publicar");
    db.executa("update crm_paginas set publicada = rascunho, publicada_em = now() where store_id = ?", id);
    db.executa("insert into crm_pagina_versoes (store_id, conteudo, publicada_por) values (?, ?, ?)", id, r, sessao.usuario());
    db.executa("delete from crm_pagina_versoes where store_id = ? and id not in (select id from crm_pagina_versoes where store_id = ? order by created_at desc limit 20)", id, id);
    return Map.of("ok", true);
  }

  @POST
  @Path("pagina/descartar")
  public Map<String, Object> descartar() {
    sessao.exigir("admin");
    db.executa("update crm_paginas set rascunho = publicada where store_id = ? and publicada is not null", sessao.loja());
    return Map.of("ok", true);
  }

  @GET
  @Path("pagina/versoes")
  public List<Map<String, Object>> versoes() {
    return db.lista("select v.id, v.created_at, u.nome as publicada_por from crm_pagina_versoes v left join crm_usuarios u on u.id = v.publicada_por where v.store_id = ? order by v.created_at desc", sessao.loja());
  }

  @POST
  @Path("pagina/versoes/{id}/restaurar")
  public Map<String, Object> restaurar(@PathParam("id") UUID versao) {
    sessao.exigir("admin");
    String c = db.valor("select conteudo from crm_pagina_versoes where id = ? and store_id = ?", versao, sessao.loja());
    Erro.exigir(c != null, "Versão não encontrada");
    db.executa("update crm_paginas set rascunho = ? where store_id = ?", c, sessao.loja());
    return Map.of("ok", true);
  }

  private Object paginaPublicada(UUID storeId) {
    String p = db.valor("select publicada from crm_paginas where store_id = ?", storeId);
    return p == null ? null : Json.ler(p, Object.class);
  }

  /** O servidor não interpreta as seções: só confere forma, tamanho e links perigosos. */
  static String validarPagina(Object pagina) {
    Erro.exigir(pagina instanceof Map, "Página inválida");
    Map<String, Object> m = Json.m(pagina);
    Erro.exigir(m.get("secoes") instanceof List, "Página sem seções");
    String json = Json.texto(pagina);
    Erro.exigir(json.length() <= MAX_PAGINA, "Página grande demais");
    Erro.exigir(!PERIGOSO.matcher(json).find(), "Link não permitido na página");
    return json;
  }
}
