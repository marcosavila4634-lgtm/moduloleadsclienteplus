package br.com.clienteplus.crm.catalogo;

import br.com.clienteplus.crm.atendimento.Atendimento;
import br.com.clienteplus.crm.canais.Envio;
import br.com.clienteplus.crm.canais.Expedicao;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Hub;
import br.com.clienteplus.crm.comum.Json;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/** Regras do catálogo: preço com promoção, estoque (movimentos e saldo) e lista de espera. */
@ApplicationScoped
public class Catalogo {

  @Inject Db db;
  @Inject Hub hub;
  @Inject Atendimento atendimento;
  @Inject Expedicao expedicao;
  @Inject br.com.clienteplus.crm.canais.Templates templates;
  @ConfigProperty(name = "crm.url-publica") String urlPublica;

  /** Preço que vale agora (promocional se estiver dentro do período). */
  public static double precoAtual(Map<String, Object> p, Map<String, Object> variacao) {
    double base = variacao != null && variacao.get("preco") != null ? Json.d(variacao, "preco", 0) : Json.d(p, "preco", 0);
    if (p.get("precoPromocional") == null) return base;
    Instant agora = Instant.now();
    if (p.get("promoInicio") != null && Instant.parse((String) p.get("promoInicio")).isAfter(agora)) return base;
    if (p.get("promoFim") != null && Instant.parse((String) p.get("promoFim")).isBefore(agora)) return base;
    double promo = Json.d(p, "precoPromocional", base);
    return variacao != null && variacao.get("preco") != null ? Math.min(base, promo) : promo;
  }

  public static boolean emPromocao(Map<String, Object> p) {
    return p.get("precoPromocional") != null && precoAtual(p, null) < Json.d(p, "preco", 0);
  }

  public int disponivel(UUID produtoId, UUID variacaoId) {
    if (variacaoId != null) return (int) db.numero("select estoque from crm_produto_variacoes where id = ?", variacaoId);
    return (int) db.numero("select estoque from crm_produtos where id = ?", produtoId);
  }

  /**
   * Movimenta o estoque (positivo entra, negativo sai) e registra o movimento.
   * Quando volta a ter estoque, avisa a lista de espera.
   */
  public int movimentar(UUID storeId, UUID produtoId, UUID variacaoId, int quantidade, String tipo, UUID pedidoId, String motivo, UUID usuarioId) {
    Map<String, Object> p = db.obrigatorio("Produto", "select id, controla_estoque, vende_sem_estoque, nome from crm_produtos where id = ? and store_id = ?", produtoId, storeId);
    if (!Json.b(p, "controlaEstoque", true)) return 0;
    int antes, depois;
    if (variacaoId != null) {
      Map<String, Object> v = db.obrigatorio("Variação", "select estoque from crm_produto_variacoes where id = ? and produto_id = ? for update", variacaoId, produtoId);
      antes = Json.i(v, "estoque", 0);
      depois = antes + quantidade;
      if (depois < 0 && quantidade < 0 && !Json.b(p, "vendeSemEstoque", false) && !"ajuste".equals(tipo)) throw Erro.conflito("Estoque insuficiente de " + p.get("nome"));
      db.executa("update crm_produto_variacoes set estoque = ? where id = ?", depois, variacaoId);
      db.executa("update crm_produtos set estoque = (select coalesce(sum(estoque),0) from crm_produto_variacoes where produto_id = ? and ativo), updated_at = now() where id = ?", produtoId, produtoId);
    } else {
      antes = (int) db.numero("select estoque from crm_produtos where id = ? for update", produtoId);
      depois = antes + quantidade;
      if (depois < 0 && quantidade < 0 && !Json.b(p, "vendeSemEstoque", false) && !"ajuste".equals(tipo)) throw Erro.conflito("Estoque insuficiente de " + p.get("nome"));
      db.executa("update crm_produtos set estoque = ?, updated_at = now() where id = ?", depois, produtoId);
    }
    db.executa("insert into crm_estoque_movimentos (store_id, produto_id, variacao_id, tipo, quantidade, saldo, pedido_id, motivo, usuario_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        storeId, produtoId, variacaoId, tipo, quantidade, depois, pedidoId, motivo, usuarioId);
    hub.emitir(storeId, "estoque", Map.of("produtoId", produtoId, "variacaoId", variacaoId == null ? "" : variacaoId.toString(), "saldo", depois));
    if (antes <= 0 && depois > 0) avisarListaEspera(storeId, produtoId, variacaoId);
    int minimo = (int) db.numero("select estoque_minimo from crm_produtos where id = ?", produtoId);
    if (minimo > 0 && depois <= minimo && antes > minimo)
      atendimento.notificarEquipe(storeId, "estoque", "Estoque baixo: " + p.get("nome"), "Restam " + depois + " unidade(s).", "/catalogo/" + produtoId);
    return depois;
  }

  /** "Avise-me quando chegar": manda mensagem para quem pediu (respeita a janela de horário). */
  public void avisarListaEspera(UUID storeId, UUID produtoId, UUID variacaoId) {
    Map<String, Object> p = db.um("select nome, slug from crm_produtos where id = ?", produtoId);
    String slug = db.valor("select slug from crm_lojas where id = ?", storeId);
    String link = urlPublica.replaceAll("/+$", "") + "/loja/" + slug + "/p/" + p.get("slug");
    Map<String, Object> cfg = Json.m(Json.m(db.valor("select config from crm_lojas where id = ?", storeId)).get("estoque"));
    String modelo = Json.s(cfg, "mensagem_chegou", "Oi {nome}! 🎉 O produto *{produto}* que você pediu para avisar chegou. Garanta o seu: {link}");
    for (Map<String, Object> l : db.lista("""
        select le.id, le.contato_id, ct.nome from crm_lista_espera le join crm_contatos ct on ct.id = le.contato_id
        where le.produto_id = ? and (?::uuid is null or le.variacao_id is null or le.variacao_id = ?) and le.status = 'aguardando'""", produtoId, variacaoId, variacaoId)) {
      UUID contato = UUID.fromString((String) l.get("contatoId"));
      UUID conversa = Formatos.uuid(db.valor("select id from crm_conversas where contato_id = ? order by ultima_mensagem_em desc nulls last limit 1", contato));
      if (conversa == null) continue;
      String texto = modelo.replace("{nome}", Json.s(l, "nome", "")).replace("{produto}", (String) p.get("nome")).replace("{link}", link);
      Map<String, Object> reserva = templateReserva(storeId, cfg, Json.s(l, "nome", ""), (String) p.get("nome"), link);
      expedicao.enviarAutomatico(storeId, conversa, Envio.Pedido.texto(texto), reserva, Atendimento.Remetente.sistema("Loja"), "estoque");
      db.executa("update crm_lista_espera set status = 'avisado', avisado_em = now() where id = ?::uuid", l.get("id"));
    }
  }

  private Map<String, Object> templateReserva(UUID storeId, Map<String, Object> cfg, String nome, String produto, String link) {
    UUID t = Formatos.uuid(cfg.get("template_id"));
    if (t == null) return null;
    try {
      return templates.montar(storeId, t, Json.de("1", nome, "2", produto, "3", link), s -> s);
    } catch (Exception e) {
      return null;
    }
  }

  /** Lista para a IA vender: produtos ativos com preço atual e disponibilidade. */
  public List<Map<String, Object>> paraIa(UUID storeId, String busca) {
    String b = busca == null || busca.isBlank() ? null : "%" + Formatos.semAcento(busca).toLowerCase() + "%";
    List<Map<String, Object>> ps = db.lista("""
        select p.*, c.nome as categoria from crm_produtos p left join crm_categorias_produto c on c.id = p.categoria_id
        where p.store_id = ? and p.ativo and p.ia_pode_vender
          and (?::text is null or translate(lower(p.nome || ' ' || coalesce(p.descricao,'') || ' ' || coalesce(c.nome,'') || ' ' || array_to_string(p.tags,' ')),
               'áàâãéêíóôõúç','aaaaeeiooouc') like ?)
        order by p.destaque desc, p.ordem, p.nome limit 40""", storeId, b, b);
    for (Map<String, Object> p : ps) {
      p.put("precoAtual", precoAtual(p, null));
      p.put("variacoes", db.lista("select id, nome, preco, estoque from crm_produto_variacoes where produto_id = ?::uuid and ativo order by ordem", p.get("id")));
    }
    return ps;
  }
}
