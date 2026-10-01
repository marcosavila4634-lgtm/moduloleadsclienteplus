package br.com.clienteplus.crm.catalogo;

import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Gestão do catálogo: categorias, produtos (fotos/vídeos, variações), estoque, cupons, lista de espera; pedidos. */
@Path("/")
public class CatalogoResource {

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject Catalogo catalogo;
  @Inject Pedidos pedidos;

  // ---------------- categorias ----------------

  @GET
  @Path("catalogo/categorias")
  public List<Map<String, Object>> categorias() {
    return db.lista("select c.*, (select count(*) from crm_produtos p where p.categoria_id = c.id) as produtos from crm_categorias_produto c where c.store_id = ? order by c.ordem, c.nome", sessao.loja());
  }

  @POST
  @Path("catalogo/categorias")
  public Map<String, Object> novaCategoria(Map<String, Object> corpo) {
    String nome = Erro.obrigatorio(corpo, "nome", "Nome");
    return db.insere("crm_categorias_produto", Json.de("store_id", sessao.loja(), "nome", nome, "slug", slugUnico("crm_categorias_produto", Formatos.slug(nome), null),
        "ordem", Json.i(corpo, "ordem", 0)));
  }

  @PUT
  @Path("catalogo/categorias/{id}")
  public Map<String, Object> editarCategoria(@PathParam("id") UUID id, Map<String, Object> corpo) {
    return db.atualiza("crm_categorias_produto", id, sessao.loja(), Json.de("nome", Erro.obrigatorio(corpo, "nome", "Nome"), "ordem", Json.i(corpo, "ordem", 0), "ativo", Json.b(corpo, "ativo", true)));
  }

  @DELETE
  @Path("catalogo/categorias/{id}")
  public Map<String, Object> apagarCategoria(@PathParam("id") UUID id) {
    db.executa("delete from crm_categorias_produto where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  // ---------------- produtos ----------------

  @GET
  @Path("catalogo/produtos")
  public List<Map<String, Object>> produtos(@QueryParam("busca") String busca, @QueryParam("categoria") UUID categoria, @QueryParam("estoqueBaixo") boolean baixo) {
    List<Object> p = new ArrayList<>();
    p.add(sessao.loja());
    StringBuilder w = new StringBuilder(" where p.store_id = ?");
    if (busca != null && !busca.isBlank()) { w.append(" and (lower(p.nome) like ? or lower(coalesce(p.sku,'')) like ?)"); p.add("%" + busca.toLowerCase() + "%"); p.add("%" + busca.toLowerCase() + "%"); }
    if (categoria != null) { w.append(" and p.categoria_id = ?"); p.add(categoria); }
    if (baixo) w.append(" and p.controla_estoque and p.estoque <= greatest(p.estoque_minimo, 0)");
    List<Map<String, Object>> ps = db.lista("""
        select p.*, c.nome as categoria_nome, (select count(*) from crm_produto_variacoes v where v.produto_id = p.id) as variacoes,
          (select count(*) from crm_lista_espera le where le.produto_id = p.id and le.status = 'aguardando') as lista_espera,
          (select coalesce(sum(i.quantidade),0) from crm_pedido_itens i join crm_pedidos pe on pe.id = i.pedido_id where i.produto_id = p.id and pe.pago_em > now() - interval '30' day) as vendidos_30d
        from crm_produtos p left join crm_categorias_produto c on c.id = p.categoria_id""" + w + " order by p.ordem, p.nome", p.toArray());
    for (Map<String, Object> x : ps) {
      x.put("precoAtual", Catalogo.precoAtual(x, null));
      x.put("emPromocao", Catalogo.emPromocao(x));
    }
    return ps;
  }

  @GET
  @Path("catalogo/produtos/{id}")
  public Map<String, Object> produto(@PathParam("id") UUID id) {
    Map<String, Object> p = db.obrigatorio("Produto", "select * from crm_produtos where id = ? and store_id = ?", id, sessao.loja());
    p.put("variacoes", db.lista("select * from crm_produto_variacoes where produto_id = ? order by ordem, nome", id));
    p.put("movimentos", db.lista("select m.*, u.nome as usuario_nome, v.nome as variacao_nome from crm_estoque_movimentos m left join crm_usuarios u on u.id = m.usuario_id left join crm_produto_variacoes v on v.id = m.variacao_id where m.produto_id = ? order by m.created_at desc limit 100", id));
    p.put("listaEspera", db.lista("select le.*, ct.nome, ct.telefone from crm_lista_espera le join crm_contatos ct on ct.id = le.contato_id where le.produto_id = ? order by le.created_at desc", id));
    p.put("precoAtual", Catalogo.precoAtual(p, null));
    return p;
  }

  /**
   * Cria/atualiza produto. corpo: {nome, descricao, categoriaId, sku, preco, precoPromocional, promoInicio, promoFim,
   * midias:[{url,tipo,capa}], atributos:[], variacoes:[{id?, valores, nome, sku, preco, estoque, ativo}],
   * controlaEstoque, estoque (sem variações), estoqueMinimo, vendeSemEstoque, pesoGramas, ativo, publico, destaque,
   * iaPodeVender, tags, ordem, diasRecompra, mensagemRecompra}
   */
  @POST
  @Path("catalogo/produtos")
  @Transactional
  public Map<String, Object> criarProduto(Map<String, Object> corpo) {
    UUID loja = sessao.loja();
    String nome = Erro.obrigatorio(corpo, "nome", "Nome");
    Map<String, Object> dados = dadosProduto(corpo);
    dados.put("store_id", loja);
    dados.put("slug", slugUnico("crm_produtos", Formatos.slug(nome), null));
    dados.put("estoque", 0);
    Map<String, Object> p = db.insere("crm_produtos", dados);
    UUID id = UUID.fromString((String) p.get("id"));
    salvarVariacoes(loja, id, corpo);
    int inicial = Json.i(corpo, "estoque", 0);
    if (Json.l(corpo.get("variacoes")).isEmpty() && inicial != 0) catalogo.movimentar(loja, id, null, inicial, "entrada", null, "Estoque inicial", sessao.usuario());
    return produto(id);
  }

  @PUT
  @Path("catalogo/produtos/{id}")
  @Transactional
  public Map<String, Object> editarProduto(@PathParam("id") UUID id, Map<String, Object> corpo) {
    UUID loja = sessao.loja();
    Map<String, Object> atual = db.obrigatorio("Produto", "select * from crm_produtos where id = ? and store_id = ?", id, loja);
    Map<String, Object> dados = dadosProduto(corpo);
    if (!Json.s(corpo, "nome", "").equals(atual.get("nome"))) dados.put("slug", slugUnico("crm_produtos", Formatos.slug(Json.s(corpo, "nome", "")), id));
    dados.put("updated_at", Instant.now());
    db.atualiza("crm_produtos", id, loja, dados);
    if (corpo.containsKey("variacoes")) salvarVariacoes(loja, id, corpo);
    return produto(id);
  }

  private Map<String, Object> dadosProduto(Map<String, Object> c) {
    List<Object> midias = new ArrayList<>();
    for (Object o : Json.l(c.get("midias"))) {
      Map<String, Object> m = Json.m(o);
      String url = Json.s(m, "url", "");
      Erro.exigir(url.startsWith("/api/arquivos/") || url.startsWith("https://"), "Endereço de mídia inválido");
      midias.add(Json.de("url", url, "tipo", "video".equals(Json.s(m, "tipo")) ? "video" : "image", "capa", Json.b(m, "capa", false), "legenda", Json.s(m, "legenda")));
    }
    Double promo = c.get("precoPromocional") == null || String.valueOf(c.get("precoPromocional")).isBlank() ? null : Json.d(c, "precoPromocional", 0);
    return Json.de("nome", Erro.obrigatorio(c, "nome", "Nome"), "descricao", Json.s(c, "descricao"), "categoria_id", Formatos.uuid(c.get("categoriaId")),
        "sku", Json.s(c, "sku"), "preco", Math.max(0, Json.d(c, "preco", 0)), "preco_promocional", promo,
        "promo_inicio", Formatos.instante(c.get("promoInicio")), "promo_fim", Formatos.instante(c.get("promoFim")), "midias", midias,
        "atributos", Db.texto(Json.ls(c, "atributos")), "controla_estoque", Json.b(c, "controlaEstoque", true), "estoque_minimo", Json.i(c, "estoqueMinimo", 0),
        "vende_sem_estoque", Json.b(c, "vendeSemEstoque", false), "peso_gramas", c.get("pesoGramas") == null ? null : Json.i(c, "pesoGramas", 0),
        "ativo", Json.b(c, "ativo", true), "publico", Json.b(c, "publico", true), "destaque", Json.b(c, "destaque", false), "ia_pode_vender", Json.b(c, "iaPodeVender", true),
        "tags", Db.texto(Json.ls(c, "tags")), "ordem", Json.i(c, "ordem", 0),
        "dias_recompra", c.get("diasRecompra") == null || String.valueOf(c.get("diasRecompra")).isBlank() ? null : Json.i(c, "diasRecompra", 0),
        "mensagem_recompra", Json.s(c, "mensagemRecompra"));
  }

  private void salvarVariacoes(UUID loja, UUID produtoId, Map<String, Object> corpo) {
    List<String> manter = new ArrayList<>();
    int ordem = 0;
    for (Object o : Json.l(corpo.get("variacoes"))) {
      Map<String, Object> v = Json.m(o);
      UUID vid = Formatos.uuid(v.get("id"));
      Map<String, Object> dados = Json.de("valores", Json.m(v.get("valores")), "nome", Erro.obrigatorio(v, "nome", "Nome da variação"), "sku", Json.s(v, "sku"),
          "preco", v.get("preco") == null || String.valueOf(v.get("preco")).isBlank() ? null : Json.d(v, "preco", 0), "midia_url", Json.s(v, "midiaUrl"),
          "ativo", Json.b(v, "ativo", true), "ordem", ordem++);
      int estoqueDesejado = Json.i(v, "estoque", 0);
      if (vid != null && db.numero("select count(*) from crm_produto_variacoes where id = ? and produto_id = ?", vid, produtoId) > 0) {
        db.atualiza("crm_produto_variacoes", vid, loja, dados);
        int atual = (int) db.numero("select estoque from crm_produto_variacoes where id = ?", vid);
        if (estoqueDesejado != atual) catalogo.movimentar(loja, produtoId, vid, estoqueDesejado - atual, "ajuste", null, "Ajuste no cadastro", sessao.usuario());
      } else {
        dados.put("store_id", loja);
        dados.put("produto_id", produtoId);
        dados.put("estoque", 0);
        vid = UUID.fromString((String) db.insere("crm_produto_variacoes", dados).get("id"));
        if (estoqueDesejado != 0) catalogo.movimentar(loja, produtoId, vid, estoqueDesejado, "entrada", null, "Estoque inicial", sessao.usuario());
      }
      manter.add(vid.toString());
    }
    for (Map<String, Object> v : db.lista("select id from crm_produto_variacoes where produto_id = ?", produtoId))
      if (!manter.contains((String) v.get("id"))) db.executa("update crm_produto_variacoes set ativo = false where id = ?::uuid", v.get("id"));
    if (!manter.isEmpty()) db.executa("update crm_produtos set estoque = (select coalesce(sum(estoque),0) from crm_produto_variacoes where produto_id = ? and ativo) where id = ?", produtoId, produtoId);
  }

  @DELETE
  @Path("catalogo/produtos/{id}")
  public Map<String, Object> apagarProduto(@PathParam("id") UUID id) {
    sessao.exigir("admin");
    if (db.numero("select count(*) from crm_pedido_itens where produto_id = ?", id) > 0) {
      db.executa("update crm_produtos set ativo = false, publico = false where id = ? and store_id = ?", id, sessao.loja());
      return Map.of("ok", true, "arquivado", true);
    }
    db.executa("delete from crm_produtos where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  /** Entrada/saída/ajuste manual. corpo: {variacaoId?, quantidade (+/-), tipo, motivo} */
  @POST
  @Path("catalogo/produtos/{id}/estoque")
  public Map<String, Object> estoque(@PathParam("id") UUID id, Map<String, Object> corpo) {
    int q = Json.i(corpo, "quantidade", 0);
    Erro.exigir(q != 0, "Informe a quantidade");
    String tipo = Json.s(corpo, "tipo", q > 0 ? "entrada" : "saida");
    Erro.exigir(List.of("entrada", "saida", "ajuste", "devolucao").contains(tipo), "Tipo inválido");
    int saldo = catalogo.movimentar(sessao.loja(), id, Formatos.uuid(corpo.get("variacaoId")), q, tipo, null, Json.s(corpo, "motivo"), sessao.usuario());
    return Map.of("saldo", saldo);
  }

  @GET
  @Path("catalogo/estoque/movimentos")
  public List<Map<String, Object>> movimentos() {
    return db.lista("""
        select m.*, p.nome as produto_nome, v.nome as variacao_nome, u.nome as usuario_nome from crm_estoque_movimentos m join crm_produtos p on p.id = m.produto_id
        left join crm_produto_variacoes v on v.id = m.variacao_id left join crm_usuarios u on u.id = m.usuario_id where m.store_id = ? order by m.created_at desc limit 300""", sessao.loja());
  }

  @GET
  @Path("catalogo/lista-espera")
  public List<Map<String, Object>> listaEspera() {
    return db.lista("""
        select le.*, p.nome as produto_nome, v.nome as variacao_nome, ct.nome as contato_nome, ct.telefone from crm_lista_espera le
        join crm_produtos p on p.id = le.produto_id left join crm_produto_variacoes v on v.id = le.variacao_id join crm_contatos ct on ct.id = le.contato_id
        where le.store_id = ? order by le.created_at desc limit 500""", sessao.loja());
  }

  // ---------------- cupons ----------------

  @GET
  @Path("catalogo/cupons")
  public List<Map<String, Object>> cupons() {
    return db.lista("select c.*, (select coalesce(sum(desconto),0) from crm_pedidos p where p.cupom_id = c.id and p.status not in ('carrinho','cancelado')) as desconto_total from crm_cupons c where c.store_id = ? order by c.created_at desc", sessao.loja());
  }

  @POST
  @Path("catalogo/cupons")
  public Map<String, Object> novoCupom(Map<String, Object> corpo) {
    Map<String, Object> d = dadosCupom(corpo);
    d.put("store_id", sessao.loja());
    return db.insere("crm_cupons", d);
  }

  @PUT
  @Path("catalogo/cupons/{id}")
  public Map<String, Object> editarCupom(@PathParam("id") UUID id, Map<String, Object> corpo) {
    return db.atualiza("crm_cupons", id, sessao.loja(), dadosCupom(corpo));
  }

  private static Map<String, Object> dadosCupom(Map<String, Object> c) {
    String tipo = Json.s(c, "tipo", "percentual");
    Erro.exigir(List.of("percentual", "valor", "frete_gratis").contains(tipo), "Tipo inválido");
    double valor = Json.d(c, "valor", 0);
    if ("percentual".equals(tipo)) Erro.exigir(valor > 0 && valor <= 100, "Percentual entre 1 e 100");
    return Json.de("codigo", Erro.obrigatorio(c, "codigo", "Código").toUpperCase().replaceAll("\\s+", ""), "descricao", Json.s(c, "descricao"), "tipo", tipo, "valor", valor,
        "pedido_minimo", Json.d(c, "pedidoMinimo", 0), "inicio", Formatos.instante(c.get("inicio")), "fim", Formatos.instante(c.get("fim")),
        "usos_max", c.get("usosMax") == null || String.valueOf(c.get("usosMax")).isBlank() ? null : Json.i(c, "usosMax", 0),
        "um_por_cliente", Json.b(c, "umPorCliente", true), "primeira_compra", Json.b(c, "primeiraCompra", false),
        "ia_pode_oferecer", Json.b(c, "iaPodeOferecer", false), "ativo", Json.b(c, "ativo", true));
  }

  @DELETE
  @Path("catalogo/cupons/{id}")
  public Map<String, Object> apagarCupom(@PathParam("id") UUID id) {
    db.executa("update crm_cupons set ativo = false where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  // ---------------- pedidos ----------------

  @GET
  @Path("pedidos")
  public Map<String, Object> listarPedidos(@QueryParam("status") String status, @QueryParam("busca") String busca, @QueryParam("pagina") Integer pagina) {
    UUID loja = sessao.loja();
    List<Object> p = new ArrayList<>();
    p.add(loja);
    StringBuilder w = new StringBuilder(" where p.store_id = ?");
    if (status != null && !status.isBlank()) { w.append(" and p.status = ?"); p.add(status); }
    else w.append(" and p.status <> 'carrinho'");
    if (busca != null && !busca.isBlank()) {
      w.append(" and (cast(p.numero as text) = ? or lower(coalesce(p.nome_cliente,'')) like ? or coalesce(p.telefone_cliente,'') like ?)");
      p.add(busca.replace("#", "").trim()); p.add("%" + busca.toLowerCase() + "%"); p.add("%" + busca.replaceAll("\\D", "x") + "%");
    }
    long total = db.numero("select count(*) from crm_pedidos p" + w, p.toArray());
    int pg = Math.max(1, pagina == null ? 1 : pagina);
    p.add((pg - 1) * 50);
    Map<String, Object> resumo = db.um("""
        select count(*) filter (where status = 'aguardando_pagamento') as aguardando, count(*) filter (where status in ('pago','separando')) as preparar,
          count(*) filter (where status = 'enviado') as enviados, count(*) filter (where status = 'carrinho') as carrinhos,
          coalesce(sum(total) filter (where pago_em >= date_trunc('month', now())), 0) as receita_mes, count(*) filter (where pago_em >= date_trunc('month', now())) as pedidos_mes
        from crm_pedidos where store_id = ?""", loja);
    return Json.de("itens", db.lista("select p.*, (select count(*) from crm_pedido_itens i where i.pedido_id = p.id) as itens from crm_pedidos p" + w + " order by p.created_at desc limit 50 offset ?", p.toArray()),
        "total", total, "resumo", resumo);
  }

  @GET
  @Path("pedidos/{id}")
  public Map<String, Object> pedido(@PathParam("id") UUID id) {
    return pedidos.obter(sessao.loja(), id);
  }

  @POST
  @Path("pedidos")
  public Map<String, Object> criarPedido(Map<String, Object> corpo) {
    return pedidos.criar(sessao.loja(), corpo, "manual", sessao.usuario());
  }

  /** Simulação dos totais (tela de novo pedido e checkout). */
  @POST
  @Path("pedidos/calcular")
  public Map<String, Object> calcular(Map<String, Object> corpo) {
    Pedidos.Calculo c = pedidos.calcular(sessao.loja(), Json.l(corpo.get("itens")), Json.s(corpo, "cupom"), Formatos.uuid(corpo.get("contatoId")), Json.s(corpo, "entregaTipo", "entrega"));
    return Json.de("itens", c.itens(), "subtotal", c.subtotal(), "desconto", c.desconto(), "frete", c.frete(), "total", c.total(), "erroCupom", c.erroCupom());
  }

  /** corpo: {status, rastreioCodigo?, rastreioUrl?, motivo?, observacao?} */
  @POST
  @Path("pedidos/{id}/status")
  public Map<String, Object> status(@PathParam("id") UUID id, Map<String, Object> corpo) {
    return pedidos.mudarStatus(sessao.loja(), id, Erro.obrigatorio(corpo, "status", "Status"), corpo, sessao.usuario());
  }

  @PUT
  @Path("pedidos/{id}")
  public Map<String, Object> editarPedido(@PathParam("id") UUID id, Map<String, Object> corpo) {
    UUID loja = sessao.loja();
    db.atualiza("crm_pedidos", id, loja, Json.de("observacoes", Json.s(corpo, "observacoes"), "endereco", corpo.get("endereco") == null ? null : Json.m(corpo.get("endereco")),
        "rastreio_codigo", Json.s(corpo, "rastreioCodigo"), "rastreio_url", Json.s(corpo, "rastreioUrl"), "comprovante_url", Json.s(corpo, "comprovanteUrl"), "updated_at", Instant.now()));
    return pedidos.obter(loja, id);
  }

  private String slugUnico(String tabela, String base, UUID ignorar) {
    String s = base;
    for (int i = 2; db.numero("select count(*) from " + tabela + " where store_id = ? and slug = ? and (?::uuid is null or id <> ?)", sessao.loja(), s, ignorar, ignorar) > 0; i++) s = base + "-" + i;
    return s;
  }
}
