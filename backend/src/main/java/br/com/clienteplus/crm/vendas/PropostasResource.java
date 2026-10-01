package br.com.clienteplus.crm.vendas;

import br.com.clienteplus.crm.atendimento.Atendimento;
import br.com.clienteplus.crm.auth.Sessao;
import br.com.clienteplus.crm.canais.Envio;
import br.com.clienteplus.crm.comum.Cripto;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.comum.Limitador;
import br.com.clienteplus.crm.crm.Negocios;
import br.com.clienteplus.crm.ia.ClaudeIA;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.OutputConfig;
import com.fasterxml.jackson.annotation.JsonPropertyDescription;
import jakarta.inject.Inject;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/** Propostas comerciais: modelos, geração com IA, envio e aceite pelo link público. */
@Path("/")
public class PropostasResource {

  @Inject Db db;
  @Inject Sessao sessao;
  @Inject Negocios negocios;
  @Inject Atendimento atendimento;
  @Inject ClaudeIA ia;
  @Inject Limitador limitador;
  @ConfigProperty(name = "crm.url-publica") String urlPublica;

  @GET
  @Path("propostas")
  public List<Map<String, Object>> listar() {
    return db.lista("select p.*, ct.nome as contato_nome from crm_propostas p left join crm_contatos ct on ct.id = p.contato_id where p.store_id = ? order by p.created_at desc", sessao.loja());
  }

  @GET
  @Path("propostas/{id}")
  public Map<String, Object> obter(@PathParam("id") UUID id) {
    Map<String, Object> p = db.obrigatorio("Proposta", "select * from crm_propostas where id = ? and store_id = ?", id, sessao.loja());
    p.put("link", link((String) p.get("token")));
    return p;
  }

  /** corpo: {titulo, contatoId, negocioId, modeloId, conteudo:{introducao, itens:[{nome,descricao,quantidade,valor}], condicoes}, desconto, validade} */
  @POST
  @Path("propostas")
  public Map<String, Object> criar(Map<String, Object> c) {
    Map<String, Object> d = dados(c);
    d.put("store_id", sessao.loja());
    d.put("token", Cripto.tokenAleatorio(18));
    d.put("criada_por", sessao.usuario());
    d.put("gerada_por_ia", Json.b(c, "geradaPorIa", false));
    return db.insere("crm_propostas", d);
  }

  @PUT
  @Path("propostas/{id}")
  public Map<String, Object> editar(@PathParam("id") UUID id, Map<String, Object> c) {
    Map<String, Object> d = dados(c);
    d.put("updated_at", Instant.now());
    return db.atualiza("crm_propostas", id, sessao.loja(), d);
  }

  private Map<String, Object> dados(Map<String, Object> c) {
    Map<String, Object> conteudo = Json.m(c.get("conteudo"));
    double total = 0;
    for (Object o : Json.l(conteudo.get("itens"))) {
      Map<String, Object> i = Json.m(o);
      total += Json.d(i, "valor", 0) * Math.max(1, Json.d(i, "quantidade", 1));
    }
    double desconto = Json.d(c, "desconto", 0);
    String v = Json.s(c, "validade");
    return Json.de("titulo", Erro.obrigatorio(c, "titulo", "Título"), "contato_id", Formatos.uuid(c.get("contatoId")), "negocio_id", Formatos.uuid(c.get("negocioId")),
        "modelo_id", Formatos.uuid(c.get("modeloId")), "conteudo", conteudo, "desconto", desconto, "total", Math.max(0, total - desconto),
        "validade", v == null || v.isBlank() ? LocalDate.now().plusDays(7) : LocalDate.parse(v));
  }

  @DELETE
  @Path("propostas/{id}")
  public Map<String, Object> apagar(@PathParam("id") UUID id) {
    db.executa("delete from crm_propostas where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  /** Envia o link pelo WhatsApp da conversa do contato. */
  @POST
  @Path("propostas/{id}/enviar")
  public Map<String, Object> enviar(@PathParam("id") UUID id) {
    UUID loja = sessao.loja();
    Map<String, Object> p = db.obrigatorio("Proposta", "select * from crm_propostas where id = ? and store_id = ?", id, loja);
    Erro.exigir(p.get("contatoId") != null, "Escolha o contato da proposta");
    UUID conversa = Formatos.uuid(db.valor("select id from crm_conversas where contato_id = ?::uuid order by ultima_mensagem_em desc nulls last limit 1", p.get("contatoId")));
    Erro.exigir(conversa != null, "Este contato ainda não tem conversa no WhatsApp");
    atendimento.enviar(loja, conversa, Envio.Pedido.texto("Preparei sua proposta: *" + p.get("titulo") + "* (" + Formatos.reais(Json.d(p, "total", 0)) + ").\nVeja e aprove aqui: " + link((String) p.get("token"))),
        Atendimento.Remetente.humano(sessao.usuario(), sessao.nome()));
    db.executa("update crm_propostas set status = case when status = 'draft' then 'sent' else status end, enviada_em = coalesce(enviada_em, now()) where id = ?", id);
    return Map.of("ok", true);
  }

  public record ItemIA(String nome, String descricao, double quantidade, double valor) {}

  public record PropostaIA(@JsonPropertyDescription("Título curto") String titulo, @JsonPropertyDescription("Parágrafo de abertura personalizado") String introducao,
      List<ItemIA> itens, @JsonPropertyDescription("Condições de pagamento, prazo e garantia") String condicoes) {}

  /** Gera a proposta com IA a partir da conversa/negócio e de um pedido do vendedor. corpo: {contatoId, negocioId?, instrucao} */
  @POST
  @Path("propostas/gerar")
  public Map<String, Object> gerar(Map<String, Object> c) {
    UUID loja = sessao.loja();
    UUID contato = Formatos.uuid(c.get("contatoId"));
    Erro.exigir(contato != null, "Escolha o contato");
    Map<String, Object> ct = db.obrigatorio("Contato", "select nome from crm_contatos where id = ? and store_id = ?", contato, loja);
    String resumo = db.valor("select resumo from crm_conversas where contato_id = ? and resumo is not null order by resumo_em desc limit 1", contato);
    List<Map<String, Object>> produtos = db.lista("select nome, preco, descricao from crm_produtos where store_id = ? and ativo order by destaque desc limit 60", loja);
    String prompt = "Monte uma proposta comercial em português para o cliente " + Json.s(ct, "nome", "") + " da empresa " + db.valor("select nome from crm_lojas where id = ?", loja) + ".\n"
        + "Pedido do vendedor: " + Json.s(c, "instrucao", "proposta com os produtos de interesse") + "\n"
        + (resumo == null ? "" : "Resumo da conversa: " + resumo + "\n")
        + (produtos.isEmpty() ? "" : "Produtos e preços da loja (use só estes preços): " + Json.texto(produtos) + "\n")
        + "Não invente preços que não estejam na lista; se não houver preço, use 0 e o vendedor completa.";
    MessageCreateParams.Builder b = MessageCreateParams.builder().model(ia.modeloPadrao()).maxTokens(4000L)
        .outputConfig(OutputConfig.builder().effort(OutputConfig.Effort.LOW).build()).addUserMessage(prompt);
    PropostaIA r = ia.estruturado(new ClaudeIA.Contexto(loja, null, null, "proposta"), b, PropostaIA.class);
    return criar(Json.de("titulo", r.titulo(), "contatoId", contato.toString(), "negocioId", c.get("negocioId"), "geradaPorIa", true,
        "conteudo", Json.de("introducao", r.introducao(), "itens", r.itens(), "condicoes", r.condicoes())));
  }

  // ---------------- modelos ----------------

  @GET
  @Path("propostas-modelos")
  public List<Map<String, Object>> modelos() {
    return db.lista("select * from crm_proposta_modelos where store_id = ? order by nome", sessao.loja());
  }

  @POST
  @Path("propostas-modelos")
  public Map<String, Object> novoModelo(Map<String, Object> c) {
    return db.insere("crm_proposta_modelos", Json.de("store_id", sessao.loja(), "nome", Erro.obrigatorio(c, "nome", "Nome"), "conteudo", Json.m(c.get("conteudo"))));
  }

  @DELETE
  @Path("propostas-modelos/{id}")
  public Map<String, Object> apagarModelo(@PathParam("id") UUID id) {
    db.executa("delete from crm_proposta_modelos where id = ? and store_id = ?", id, sessao.loja());
    return Map.of("ok", true);
  }

  // ---------------- público ----------------

  @GET
  @Path("publico/propostas/{token}")
  public Map<String, Object> publica(@PathParam("token") String token) {
    Map<String, Object> p = db.obrigatorio("Proposta", """
        select p.id, p.titulo, p.conteudo, p.desconto, p.total, p.validade, p.status, p.respondida_em, p.resposta_nome, l.nome as loja, ct.nome as cliente
        from crm_propostas p join crm_lojas l on l.id = p.store_id left join crm_contatos ct on ct.id = p.contato_id where p.token = ?""", token);
    db.executa("update crm_propostas set visualizacoes = visualizacoes + 1, vista_em = coalesce(vista_em, now()), status = case when status = 'sent' then 'viewed' else status end where token = ?", token);
    p.remove("id");
    return p;
  }

  /** corpo: {aceitar: true|false, nome, comentario} */
  @POST
  @Path("publico/propostas/{token}")
  public Map<String, Object> responder(@PathParam("token") String token, Map<String, Object> c) {
    limitador.conferir("proposta:" + token, 10, 3600);
    Map<String, Object> p = db.obrigatorio("Proposta", "select * from crm_propostas where token = ?", token);
    Erro.exigir(p.get("respondidaEm") == null, "Esta proposta já foi respondida");
    Erro.exigir(p.get("validade") == null || !LocalDate.parse((String) p.get("validade")).isBefore(LocalDate.now()), "Esta proposta expirou");
    boolean aceitar = Json.b(c, "aceitar", false);
    UUID loja = UUID.fromString((String) p.get("storeId"));
    db.executa("update crm_propostas set status = ?, respondida_em = now(), resposta_nome = ?, resposta_comentario = ? where token = ?",
        aceitar ? "accepted" : "rejected", Erro.obrigatorio(c, "nome", "Nome"), Json.s(c, "comentario"), token);
    if (aceitar && p.get("negocioId") != null) {
      UUID nid = UUID.fromString((String) p.get("negocioId"));
      db.executa("update crm_negocios set valor = ? where id = ?", Json.d(p, "total", 0), nid);
      negocios.evento(loja, nid, "nota", null, null, "sistema", null, "Proposta \"" + p.get("titulo") + "\" aceita pelo cliente", null);
    }
    atendimento.notificarEquipe(loja, "proposta", "Proposta " + (aceitar ? "ACEITA ✅" : "recusada"), p.get("titulo") + " — " + Formatos.reais(Json.d(p, "total", 0)), "/propostas");
    return Map.of("ok", true);
  }

  private String link(String token) {
    return urlPublica.replaceAll("/+$", "") + "/p/" + token;
  }
}
