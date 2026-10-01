package br.com.clienteplus.crm.catalogo;

import br.com.clienteplus.crm.atendimento.Atendimento;
import br.com.clienteplus.crm.canais.Envio;
import br.com.clienteplus.crm.canais.Expedicao;
import br.com.clienteplus.crm.canais.Templates;
import br.com.clienteplus.crm.comum.Cripto;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Hub;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.comum.Pix;
import br.com.clienteplus.crm.crm.Negocios;
import br.com.clienteplus.crm.eventos.Eventos;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Event;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/** Fluxo de vendas: pedido, cupom, frete, Pix, estoque, status com aviso no WhatsApp. */
@ApplicationScoped
public class Pedidos {

  public static final List<String> STATUS = List.of("carrinho", "aguardando_pagamento", "pago", "separando", "enviado", "pronto_retirada", "entregue", "cancelado");
  public static final Map<String, String> NOMES = Map.of("carrinho", "Carrinho", "aguardando_pagamento", "Aguardando pagamento", "pago", "Pago",
      "separando", "Separando", "enviado", "Enviado", "pronto_retirada", "Pronto para retirar", "entregue", "Entregue", "cancelado", "Cancelado");

  @Inject Db db;
  @Inject Hub hub;
  @Inject Catalogo catalogo;
  @Inject Atendimento atendimento;
  @Inject Expedicao expedicao;
  @Inject Templates templates;
  @Inject Negocios negocios;
  @Inject Event<Object> eventos;
  @Inject br.com.clienteplus.crm.canais.Conexoes conexoes;
  @ConfigProperty(name = "crm.url-publica") String urlPublica;

  public record Calculo(List<Map<String, Object>> itens, double subtotal, double desconto, double frete, double total, UUID cupomId, String cupom, String erroCupom) {}

  /** Confere itens (preço atual, estoque), aplica cupom e frete. itens: [{produtoId, variacaoId, quantidade}] */
  public Calculo calcular(UUID storeId, List<Object> itensPedido, String cupom, UUID contatoId, String entregaTipo) {
    Erro.exigir(!itensPedido.isEmpty(), "O pedido está vazio");
    List<Map<String, Object>> itens = new ArrayList<>();
    double subtotal = 0;
    for (Object o : itensPedido) {
      Map<String, Object> i = Json.m(o);
      UUID pid = Formatos.uuid(i.get("produtoId"));
      UUID vid = Formatos.uuid(i.get("variacaoId"));
      int qtd = Math.max(1, Json.i(i, "quantidade", 1));
      Map<String, Object> p = db.obrigatorio("Produto", "select * from crm_produtos where id = ? and store_id = ? and ativo", pid, storeId);
      Map<String, Object> v = null;
      if (vid != null) v = db.obrigatorio("Variação", "select * from crm_produto_variacoes where id = ? and produto_id = ? and ativo", vid, pid);
      else Erro.exigir(db.numero("select count(*) from crm_produto_variacoes where produto_id = ? and ativo", pid) == 0, "Escolha a opção (tamanho/cor) de " + p.get("nome"));
      if (Json.b(p, "controlaEstoque", true) && !Json.b(p, "vendeSemEstoque", false) && catalogo.disponivel(pid, vid) < qtd)
        throw Erro.conflito("Sem estoque suficiente de " + p.get("nome") + (v == null ? "" : " (" + v.get("nome") + ")"));
      double preco = Catalogo.precoAtual(p, v);
      itens.add(Json.de("produtoId", pid, "variacaoId", vid, "nome", p.get("nome") + (v == null ? "" : " — " + v.get("nome")), "quantidade", qtd, "preco", preco, "total", preco * qtd));
      subtotal += preco * qtd;
    }
    Map<String, Object> entrega = Json.m(Json.m(db.valor("select config from crm_lojas where id = ?", storeId)).get("entrega"));
    double frete = "retirada".equals(entregaTipo) ? 0 : Json.d(entrega, "taxa", 0);
    double gratisAcima = Json.d(entrega, "gratis_acima", 0);
    if (gratisAcima > 0 && subtotal >= gratisAcima) frete = 0;
    double desconto = 0;
    UUID cupomId = null;
    String erroCupom = null;
    if (cupom != null && !cupom.isBlank()) {
      Map<String, Object> c = db.um("select * from crm_cupons where store_id = ? and upper(codigo) = upper(?) and ativo", storeId, cupom.trim());
      erroCupom = validarCupom(c, subtotal, contatoId);
      if (erroCupom == null) {
        cupomId = UUID.fromString((String) c.get("id"));
        switch (Json.s(c, "tipo", "percentual")) {
          case "valor" -> desconto = Math.min(subtotal, Json.d(c, "valor", 0));
          case "frete_gratis" -> frete = 0;
          default -> desconto = Math.round(subtotal * Json.d(c, "valor", 0)) / 100.0;
        }
      }
    }
    double total = Math.max(0, subtotal - desconto + frete);
    return new Calculo(itens, subtotal, desconto, frete, total, cupomId, cupom, erroCupom);
  }

  String validarCupom(Map<String, Object> c, double subtotal, UUID contatoId) {
    if (c == null) return "Cupom não encontrado";
    Instant agora = Instant.now();
    if (c.get("inicio") != null && Instant.parse((String) c.get("inicio")).isAfter(agora)) return "Este cupom ainda não começou";
    if (c.get("fim") != null && Instant.parse((String) c.get("fim")).isBefore(agora)) return "Este cupom expirou";
    if (c.get("usosMax") != null && Json.i(c, "usos", 0) >= Json.i(c, "usosMax", 0)) return "Este cupom esgotou";
    if (subtotal < Json.d(c, "pedidoMinimo", 0)) return "Pedido mínimo para este cupom: " + Formatos.reais(Json.d(c, "pedidoMinimo", 0));
    if (contatoId != null && Json.b(c, "umPorCliente", true)
        && db.numero("select count(*) from crm_pedidos where contato_id = ? and cupom_id = ?::uuid and status not in ('carrinho','cancelado')", contatoId, c.get("id")) > 0) return "Você já usou este cupom";
    if (contatoId != null && Json.b(c, "primeiraCompra", false)
        && db.numero("select count(*) from crm_pedidos where contato_id = ? and status not in ('carrinho','cancelado')", contatoId) > 0) return "Cupom válido só na primeira compra";
    return null;
  }

  /**
   * Cria o pedido. dados: {contatoId|telefone,nome, itens, cupom, formaPagamento, entregaTipo, endereco, observacoes, status?, conversaId?}
   */
  @Transactional
  public Map<String, Object> criar(UUID storeId, Map<String, Object> dados, String origem, UUID usuarioId) {
    UUID contato = Formatos.uuid(dados.get("contatoId"));
    if (contato == null) {
      String tel = Formatos.telefone(Json.s(dados, "telefone"));
      Erro.exigir(tel != null, "Informe o WhatsApp");
      contato = atendimento.contatoPorTelefone(storeId, tel, Json.s(dados, "nome"), null, "pagina".equals(origem) ? "loja" : origem).id();
      if (Json.s(dados, "email") != null) db.executa("update crm_contatos set email = coalesce(email, ?) where id = ?", Json.s(dados, "email"), contato);
    } else db.obrigatorio("Contato", "select id from crm_contatos where id = ? and store_id = ?", contato, storeId);
    String entregaTipo = Json.s(dados, "entregaTipo", "entrega");
    Calculo c = calcular(storeId, Json.l(dados.get("itens")), Json.s(dados, "cupom"), contato, entregaTipo);
    if (c.erroCupom() != null && Json.s(dados, "cupom") != null && !Json.s(dados, "cupom").isBlank()) throw Erro.requisicao(c.erroCupom());
    String status = Json.s(dados, "status", "aguardando_pagamento");
    Erro.exigir(STATUS.contains(status), "Status inválido");
    int numero = (int) db.numero("select coalesce(max(numero), 1000) + 1 from crm_pedidos where store_id = ?", storeId);
    String forma = Json.s(dados, "formaPagamento", "combinar");
    String pix = null;
    Map<String, Object> pixCfg = Json.m(Json.m(db.valor("select config from crm_lojas where id = ?", storeId)).get("pix"));
    if ("pix".equals(forma) && Json.s(pixCfg, "chave") != null && c.total() > 0)
      pix = Pix.copiaECola(Json.s(pixCfg, "chave"), db.valor("select nome from crm_lojas where id = ?", storeId), Json.s(pixCfg, "cidade", "BRASIL"), BigDecimal.valueOf(c.total()), "PED" + numero);
    Map<String, Object> ct = db.um("select nome, telefone from crm_contatos where id = ?", contato);
    UUID conversa = Formatos.uuid(dados.get("conversaId"));
    if (conversa == null) conversa = Formatos.uuid(db.valor("select id from crm_conversas where contato_id = ? order by ultima_mensagem_em desc nulls last limit 1", contato));
    Map<String, Object> ped = db.insere("crm_pedidos", Json.de("store_id", storeId, "numero", numero, "contato_id", contato, "conversa_id", conversa, "origem", origem, "status", status,
        "subtotal", c.subtotal(), "desconto", c.desconto(), "frete", c.frete(), "total", c.total(), "cupom_id", c.cupomId(), "cupom_codigo", c.cupomId() == null ? null : c.cupom().toUpperCase(),
        "forma_pagamento", forma, "pix_copia_cola", pix, "entrega_tipo", entregaTipo, "endereco", dados.get("endereco") == null ? null : Json.m(dados.get("endereco")),
        "observacoes", Json.s(dados, "observacoes"), "nome_cliente", Json.s(dados, "nome", Json.s(ct, "nome")), "telefone_cliente", Json.s(ct, "telefone"),
        "token", Cripto.tokenAleatorio(18), "criado_por", usuarioId));
    UUID pid = UUID.fromString((String) ped.get("id"));
    for (Map<String, Object> i : c.itens())
      db.executa("insert into crm_pedido_itens (store_id, pedido_id, produto_id, variacao_id, nome, quantidade, preco_unitario, total) values (?, ?, ?, ?, ?, ?, ?, ?)",
          storeId, pid, i.get("produtoId"), i.get("variacaoId"), i.get("nome"), i.get("quantidade"), i.get("preco"), i.get("total"));
    if (c.cupomId() != null && !"carrinho".equals(status)) db.executa("update crm_cupons set usos = usos + 1 where id = ?", c.cupomId());
    db.executa("insert into crm_pedido_eventos (store_id, pedido_id, status, texto, usuario_id) values (?, ?, ?, ?, ?)", storeId, pid, status, "Pedido criado (" + origem + ")", usuarioId);
    // negócio no funil com o valor do pedido
    Map<String, Object> n = negocios.garantir(storeId, contato, conversa, origem);
    if (n != null) {
      db.executa("update crm_pedidos set negocio_id = ?::uuid where id = ?", n.get("id"), pid);
      if (Json.d(n, "valor", 0) == 0) db.executa("update crm_negocios set valor = ? where id = ?::uuid", c.total(), n.get("id"));
    }
    if ("pago".equals(status)) aoPagar(storeId, pid, usuarioId);
    hub.emitir(storeId, "pedido", Map.of("id", pid));
    if (!"carrinho".equals(status)) atendimento.notificarEquipe(storeId, "pedido", "Novo pedido #" + numero, Formatos.reais(c.total()) + " — " + Json.s(ct, "nome", ""), "/pedidos/" + pid);
    return obter(storeId, pid);
  }

  public Map<String, Object> obter(UUID storeId, UUID id) {
    Map<String, Object> p = db.obrigatorio("Pedido", """
        select p.*, ct.nome as contato_nome, ct.telefone as contato_telefone from crm_pedidos p left join crm_contatos ct on ct.id = p.contato_id
        where p.id = ? and p.store_id = ?""", id, storeId);
    p.put("itens", db.lista("select * from crm_pedido_itens where pedido_id = ? order by nome", id));
    p.put("eventos", db.lista("select e.*, u.nome as usuario_nome from crm_pedido_eventos e left join crm_usuarios u on u.id = e.usuario_id where e.pedido_id = ? order by e.created_at", id));
    p.put("linkAcompanhar", linkPublico((String) p.get("token")));
    return p;
  }

  public String linkPublico(String token) {
    return urlPublica.replaceAll("/+$", "") + "/pedido/" + token;
  }

  /** Muda o status: baixa/devolve estoque, registra a venda e avisa o cliente pelo WhatsApp. */
  @Transactional
  public Map<String, Object> mudarStatus(UUID storeId, UUID id, String status, Map<String, Object> extra, UUID usuarioId) {
    Erro.exigir(STATUS.contains(status), "Status inválido");
    Map<String, Object> p = db.obrigatorio("Pedido", "select * from crm_pedidos where id = ? and store_id = ? for update", id, storeId);
    String de = (String) p.get("status");
    if (status.equals(de)) return obter(storeId, id);
    Erro.exigir(!"cancelado".equals(de), "Pedido cancelado não pode mudar de status");
    Map<String, Object> campos = new LinkedHashMap<>();
    campos.put("status", status);
    campos.put("updated_at", Instant.now());
    if (extra != null) {
      if (Json.s(extra, "rastreioCodigo") != null) campos.put("rastreio_codigo", Json.s(extra, "rastreioCodigo"));
      if (Json.s(extra, "rastreioUrl") != null) campos.put("rastreio_url", Json.s(extra, "rastreioUrl"));
      if (Json.s(extra, "motivo") != null && "cancelado".equals(status)) campos.put("cancelado_motivo", Json.s(extra, "motivo"));
    }
    db.atualiza("crm_pedidos", id, storeId, campos);
    if ("carrinho".equals(de) && p.get("cupomId") != null) db.executa("update crm_cupons set usos = usos + 1 where id = ?::uuid", p.get("cupomId"));
    boolean pagoAgora = List.of("pago", "separando", "enviado", "pronto_retirada", "entregue").contains(status) && p.get("pagoEm") == null;
    if (pagoAgora) aoPagar(storeId, id, usuarioId);
    if ("cancelado".equals(status)) aoCancelar(storeId, id, usuarioId);
    boolean avisado = avisarCliente(storeId, id, status);
    db.executa("insert into crm_pedido_eventos (store_id, pedido_id, status, texto, avisado, usuario_id) values (?, ?, ?, ?, ?, ?)",
        storeId, id, status, extra == null ? null : Json.s(extra, "observacao"), avisado, usuarioId);
    hub.emitir(storeId, "pedido", Map.of("id", id));
    return obter(storeId, id);
  }

  private void aoPagar(UUID storeId, UUID id, UUID usuarioId) {
    Map<String, Object> p = db.um("select * from crm_pedidos where id = ?", id);
    db.executa("update crm_pedidos set pago_em = coalesce(pago_em, now()) where id = ?", id);
    if (!Json.b(p, "estoqueBaixado", false)) {
      for (Map<String, Object> i : db.lista("select * from crm_pedido_itens where pedido_id = ?", id))
        if (i.get("produtoId") != null)
          catalogo.movimentar(storeId, UUID.fromString((String) i.get("produtoId")), Formatos.uuid(i.get("variacaoId")), -Json.i(i, "quantidade", 1), "venda", id, "Pedido #" + p.get("numero"), usuarioId);
      db.executa("update crm_pedidos set estoque_baixado = true where id = ?", id);
    }
    UUID contato = Formatos.uuid(p.get("contatoId"));
    String produtos = String.join(", ", db.lista("select nome from crm_pedido_itens where pedido_id = ?", id).stream().map(x -> (String) x.get("nome")).toList());
    boolean ia = contato != null && db.numero("select count(*) from crm_mensagens m join crm_conversas c on c.id = m.conversa_id where c.contato_id = ? and m.remetente = 'ai' and m.created_at > now() - interval '7' day", contato) > 0;
    Map<String, Object> compra = db.um("""
        insert into crm_compras (store_id, contato_id, conversa_id, negocio_id, plataforma, pedido_id, produto, valor, status, forma_pagamento, influenciada_ia, origem)
        values (?, ?, ?, ?, 'loja', ?, ?, ?, 'approved', ?, ?, ?) on conflict (store_id, plataforma, pedido_id) do nothing returning id""",
        storeId, contato, Formatos.uuid(p.get("conversaId")), Formatos.uuid(p.get("negocioId")), "PED" + p.get("numero"), produtos, Json.d(p, "total", 0),
        p.get("formaPagamento"), ia, p.get("origem"));
    if (p.get("negocioId") != null) {
      UUID nid = UUID.fromString((String) p.get("negocioId"));
      UUID funil = Formatos.uuid(db.valor("select funil_id from crm_negocios where id = ? and ganho_em is null", nid));
      if (funil != null) {
        db.executa("update crm_negocios set valor = ? where id = ?", Json.d(p, "total", 0), nid);
        UUID ganho = negocios.etapaGanho(funil);
        if (ganho != null) negocios.mover(storeId, nid, ganho, usuarioId == null ? "sistema" : "usuario", usuarioId, "Pedido #" + p.get("numero") + " pago");
      }
    }
    if (compra != null && contato != null)
      eventos.fireAsync(new Eventos.CompraRecebida(storeId, UUID.fromString((String) compra.get("id")), contato, "approved", Json.d(p, "total", 0), produtos));
    // cliente comprou: sai do "carrinho abandonado" e das cobranças de Pix
    db.executa("update crm_fila_envio set status = 'canceled' where contato_id = ?::uuid and status = 'pending' and origem in ('carrinho','pix')", p.get("contatoId"));
  }

  private void aoCancelar(UUID storeId, UUID id, UUID usuarioId) {
    Map<String, Object> p = db.um("select * from crm_pedidos where id = ?", id);
    if (Json.b(p, "estoqueBaixado", false)) {
      for (Map<String, Object> i : db.lista("select * from crm_pedido_itens where pedido_id = ?", id))
        if (i.get("produtoId") != null)
          catalogo.movimentar(storeId, UUID.fromString((String) i.get("produtoId")), Formatos.uuid(i.get("variacaoId")), Json.i(i, "quantidade", 1), "cancelamento", id, "Pedido #" + p.get("numero") + " cancelado", usuarioId);
      db.executa("update crm_pedidos set estoque_baixado = false where id = ?", id);
    }
    db.executa("update crm_compras set status = 'canceled' where store_id = ? and plataforma = 'loja' and pedido_id = ?", storeId, "PED" + p.get("numero"));
  }

  /** Mensagem de status (texto configurável; fora das 24 h usa o template reserva). */
  public boolean avisarCliente(UUID storeId, UUID id, String status) {
    Map<String, Object> cfg = Json.m(Json.m(db.valor("select config from crm_lojas where id = ?", storeId)).get("status_pedido"));
    if (!Json.b(cfg, "ativo", true)) return false;
    Map<String, Object> msgs = Json.m(cfg.get("mensagens"));
    String padrao = switch (status) {
      case "aguardando_pagamento" -> "Oi {nome}! Recebemos seu pedido *#{numero}* ({total}). Assim que o pagamento for confirmado, a gente te avisa. Acompanhe: {link}";
      case "pago" -> "Pagamento do pedido *#{numero}* confirmado! ✅ Já vamos separar tudo pra você.";
      case "separando" -> "Seu pedido *#{numero}* está sendo separado. 📦";
      case "enviado" -> "Seu pedido *#{numero}* foi enviado! 🚚{rastreio}";
      case "pronto_retirada" -> "Seu pedido *#{numero}* está pronto para retirada! 🛍️";
      case "entregue" -> "Pedido *#{numero}* entregue! Obrigado pela compra 💜";
      case "cancelado" -> "Seu pedido *#{numero}* foi cancelado. Se tiver dúvida, é só responder aqui.";
      default -> null;
    };
    String modelo = Json.s(msgs, status, padrao);
    if (modelo == null || modelo.isBlank()) return false;
    Map<String, Object> p = db.um("select p.*, ct.nome from crm_pedidos p left join crm_contatos ct on ct.id = p.contato_id where p.id = ?", id);
    if (p.get("contatoId") == null) return false;
    UUID conversa = Formatos.uuid(p.get("conversaId"));
    if (conversa == null) conversa = Formatos.uuid(db.valor("select id from crm_conversas where contato_id = ?::uuid order by ultima_mensagem_em desc nulls last limit 1", p.get("contatoId")));
    if (conversa == null) {
      var cx = conexoes.padrao(storeId, "whatsapp_cloud");
      if (cx == null) return false;
      conversa = atendimento.conversaPara(storeId, UUID.fromString((String) p.get("contatoId")), cx, "whatsapp").id();
      db.executa("update crm_pedidos set conversa_id = ? where id = ?", conversa, id);
    }
    String rastreio = p.get("rastreioCodigo") == null ? "" : "\nRastreio: " + p.get("rastreioCodigo") + (p.get("rastreioUrl") == null ? "" : " " + p.get("rastreioUrl"));
    String texto = modelo.replace("{nome}", Json.s(p, "nome", "")).replace("{numero}", String.valueOf(p.get("numero")))
        .replace("{total}", Formatos.reais(Json.d(p, "total", 0))).replace("{link}", linkPublico((String) p.get("token"))).replace("{rastreio}", rastreio)
        .replace("{status}", NOMES.getOrDefault(status, status));
    Map<String, Object> reserva = null;
    UUID t = Formatos.uuid(cfg.get("template_id"));
    if (t != null) {
      try {
        reserva = templates.montar(storeId, t, Json.de("1", Json.s(p, "nome", "cliente"), "2", String.valueOf(p.get("numero")), "3", NOMES.getOrDefault(status, status)), s -> s);
      } catch (Exception ignorado) {
        // sem template válido
      }
    }
    // aviso de pedido é transacional: não espera a janela de horário do robô
    Expedicao.Resultado r = expedicao.enviarJa(storeId, conversa, Envio.Pedido.texto(texto), reserva, Atendimento.Remetente.sistema("Loja"));
    if (r == Expedicao.Resultado.ENVIADA && "aguardando_pagamento".equals(status) && p.get("pixCopiaCola") != null && expedicao.janela24h(conversa))
      expedicao.enviarJa(storeId, conversa, Envio.Pedido.texto((String) p.get("pixCopiaCola")), null, Atendimento.Remetente.sistema("Loja"));
    return r == Expedicao.Resultado.ENVIADA;
  }
}
