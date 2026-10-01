package br.com.clienteplus.crm.ia;

import br.com.clienteplus.crm.agenda.Agenda;
import br.com.clienteplus.crm.atendimento.Atendimento;
import br.com.clienteplus.crm.canais.Envio;
import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.comum.Pix;
import br.com.clienteplus.crm.crm.Negocios;
import com.anthropic.core.JsonValue;
import com.anthropic.models.messages.Tool;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jboss.logging.Logger;

/**
 * Ferramentas que o agente pode usar durante a conversa. As opções (tags,
 * etapas, serviços, arquivos) vêm da loja; toda entrada é conferida aqui
 * antes de mexer em qualquer dado.
 */
@ApplicationScoped
public class FerramentasAgente {

  private static final Logger LOG = Logger.getLogger(FerramentasAgente.class);

  @Inject Db db;
  @Inject Atendimento atendimento;
  @Inject Negocios negocios;
  @Inject Agenda agenda;
  @Inject br.com.clienteplus.crm.catalogo.Catalogo catalogo;
  @Inject br.com.clienteplus.crm.catalogo.Pedidos pedidos;

  /** Estado de uma resposta em andamento. */
  public static class Ctx {
    public final UUID storeId, conversaId, contatoId, agenteId;
    public final String agenteNome, papel;
    public final AgenteConfig cfg;
    public boolean transferiu;
    public final List<String> acoes = new ArrayList<>();

    public Ctx(UUID storeId, UUID conversaId, UUID contatoId, UUID agenteId, String agenteNome, String papel, AgenteConfig cfg) {
      this.storeId = storeId;
      this.conversaId = conversaId;
      this.contatoId = contatoId;
      this.agenteId = agenteId;
      this.agenteNome = agenteNome;
      this.papel = papel;
      this.cfg = cfg;
    }
  }

  public List<Tool> definicoes(Ctx c) {
    List<Tool> t = new ArrayList<>();
    List<String> tags = db.lista("select nome from crm_tags where store_id = ? order by nome", c.storeId).stream().map(m -> (String) m.get("nome")).toList();
    List<String> etapas = db.lista("""
        select e.nome from crm_etapas e join crm_funis f on f.id = e.funil_id where f.store_id = ? and f.ativo and not e.ganho and not e.perda
        order by f.ordem, e.ordem""", c.storeId).stream().map(m -> (String) m.get("nome")).distinct().toList();
    List<String> setores = db.lista("select nome from crm_setores where store_id = ? order by nome", c.storeId).stream().map(m -> (String) m.get("nome")).toList();

    if (c.cfg.marcarTags() && !tags.isEmpty()) {
      t.add(tool("adicionar_tag", "Marca uma tag no cliente conforme as regras de tags.", props("tag", enumStr(tags, "Nome exato da tag"), "motivo", str("Por que marcou")), List.of("tag")));
      t.add(tool("remover_tag", "Remove uma tag do cliente quando ela deixou de valer.", props("tag", enumStr(tags, "Nome exato da tag")), List.of("tag")));
    }
    if (c.cfg.moverEtapas() && !etapas.isEmpty())
      t.add(tool("mover_etapa", "Move o negócio do cliente para outra etapa do funil quando ele avança (não use para venda fechada ou perdida).",
          props("etapa", enumStr(etapas, "Etapa de destino"), "motivo", str("O que aconteceu na conversa")), List.of("etapa", "motivo")));
    t.add(tool("atualizar_negocio", "Atualiza o valor estimado e/ou o produto de interesse do negócio.",
        props("valor", num("Valor total estimado em reais"), "produto", str("Produto/serviço de interesse"), "fechamento_previsto", str("Data prevista de fechamento AAAA-MM-DD")), List.of()));
    t.add(tool("registrar_venda", "Registra a venda fechada. Use só quando o pagamento estiver confirmado (comprovante visto ou pagamento na entrega combinado).",
        props("valor", num("Valor pago em reais"), "produto", str("O que foi vendido"), "forma_pagamento", str("pix, cartão, dinheiro, na entrega..."),
            "comprovante_confirmado", bool("true se você viu o comprovante de pagamento")), List.of("valor", "produto", "comprovante_confirmado")));
    t.add(tool("marcar_perdido", "Marca o negócio como perdido quando o cliente desiste claramente.", props("motivo", str("Motivo da perda")), List.of("motivo")));
    t.add(tool("transferir_humano", "Passa a conversa para um atendente humano e para de responder.",
        setores.isEmpty() ? props("motivo", str("Motivo da transferência")) : props("motivo", str("Motivo da transferência"), "setor", enumStr(setores, "Setor que deve atender")), List.of("motivo")));
    t.add(tool("registrar_memoria", "Guarda um fato importante e duradouro sobre o cliente (preferência, tamanho, orçamento, data especial).",
        props("fato", str("O fato, em uma frase"), "categoria", enumStr(List.of("preferencia", "pessoal", "compra", "objecao", "outro"), "Tipo")), List.of("fato", "categoria")));
    t.add(tool("registrar_promessa", "Registra algo prometido com prazo, pelo cliente ou pela empresa.",
        props("descricao", str("O que foi prometido"), "quem", enumStr(List.of("cliente", "empresa"), "Quem prometeu"), "vence_em", str("Prazo em ISO 8601 com fuso, ex.: 2026-10-02T10:00:00-03:00")), List.of("descricao", "quem")));
    t.add(tool("atualizar_contato", "Atualiza dados do cliente informados por ele.",
        props("nome", str("Nome completo"), "email", str("E-mail"), "aniversario", str("AAAA-MM-DD")), List.of()));
    t.add(tool("enviar_opcoes", "Envia uma pergunta com botões/lista de opções para o cliente tocar (até 10 opções).",
        props("texto", str("Pergunta"), "opcoes", Json.de("type", "array", "items", Json.de("type", "string"), "description", "Opções curtas (até 24 letras)")), List.of("texto", "opcoes")));

    List<Map<String, Object>> arquivos = db.lista("select id, titulo from crm_agente_conhecimento where agente_id = ? and ativo and arquivo_url is not null", c.agenteId);
    if (!arquivos.isEmpty())
      t.add(tool("enviar_arquivo", "Envia ao cliente um arquivo/foto da base de conhecimento.",
          props("arquivo_id", enumStr(arquivos.stream().map(a -> (String) a.get("id")).toList(), "id do arquivo"), "legenda", str("Texto junto (opcional)")), List.of("arquivo_id")));
    if (db.numero("select count(*) from crm_produtos where store_id = ? and ativo and ia_pode_vender", c.storeId) > 0) {
      t.add(tool("buscar_produtos", "Busca produtos do catálogo com preço atual, opções (tamanho/cor) e disponibilidade. Use antes de falar de preço ou estoque.",
          props("busca", str("O que o cliente procura (vazio = destaques)")), List.of()));
      t.add(tool("enviar_produto", "Envia a foto do produto com nome e preço para o cliente.",
          props("produto_id", str("id do produto (de buscar_produtos)"), "legenda", str("Texto junto com a foto")), List.of("produto_id")));
      Map<String, Object> item = Json.de("type", "object", "properties", Json.de("produto_id", str("id do produto"), "variacao_id", str("id da opção, se houver"),
          "quantidade", Json.de("type", "integer")), "required", List.of("produto_id", "quantidade"));
      t.add(tool("criar_pedido", "Cria o pedido quando o cliente confirmou o que vai levar. O cliente recebe o resumo e, se for Pix, o código para pagar.",
          props("itens", Json.de("type", "array", "items", item),
              "forma_pagamento", enumStr(List.of("pix", "cartao", "dinheiro", "na_entrega", "combinar"), "Forma de pagamento"),
              "entrega_tipo", enumStr(List.of("entrega", "retirada"), "Entrega ou retirada"), "endereco", str("Endereço completo se for entrega"),
              "cupom", str("Código do cupom, se houver")),
          List.of("itens", "forma_pagamento", "entrega_tipo")));
      t.add(tool("avisar_quando_chegar", "Coloca o cliente na lista de espera de um produto sem estoque; ele recebe mensagem quando chegar.",
          props("produto_id", str("id do produto"), "variacao_id", str("id da opção, se houver")), List.of("produto_id")));
    }
    if (!c.cfg.pixChave().isBlank())
      t.add(tool("gerar_pix", "Gera um código Pix copia e cola com o valor para o cliente pagar.", props("valor", num("Valor em reais"), "descricao", str("Referente a")), List.of("valor")));
    if (c.cfg.agenda()) {
      List<String> servicos = db.lista("select nome from crm_agenda_tipos where store_id = ? and ativo and ia_pode_agendar order by nome", c.storeId).stream().map(m -> (String) m.get("nome")).toList();
      if (!servicos.isEmpty()) {
        t.add(tool("ver_horarios", "Lista horários livres de um serviço em uma data.", props("servico", enumStr(servicos, "Serviço"), "data", str("AAAA-MM-DD"), "profissional", str("Nome do profissional (opcional)")), List.of("servico", "data")));
        t.add(tool("agendar", "Marca o horário escolhido pelo cliente (confirme antes com ele).", props("servico", enumStr(servicos, "Serviço"), "inicio", str("Início em ISO 8601 com fuso, igual ao devolvido por ver_horarios"), "profissional", str("Nome do profissional (opcional)"), "observacao", str("Observação")), List.of("servico", "inicio")));
        t.add(tool("cancelar_agendamento", "Cancela um agendamento do cliente.", props("agendamento_id", str("id do agendamento"), "motivo", str("Motivo")), List.of("agendamento_id")));
      }
    }
    return t;
  }

  /** Executa a ferramenta; o texto devolvido vai para a IA como resultado. */
  public String executar(Ctx c, String nome, Map<String, Object> in) {
    try {
      String r = switch (nome) {
        case "adicionar_tag" -> {
          String tag = tagExistente(c, Json.s(in, "tag"));
          if (tag == null) yield "Tag não existe.";
          atendimento.adicionarTag(c.storeId, c.contatoId, c.conversaId, tag);
          decisao(c, "adicionar_tag", Json.s(in, "motivo"), Json.de("tag", tag), null);
          yield "Tag " + tag + " marcada.";
        }
        case "remover_tag" -> {
          String tag = tagExistente(c, Json.s(in, "tag"));
          if (tag == null) yield "Tag não existe.";
          atendimento.removerTag(c.storeId, c.contatoId, c.conversaId, tag);
          decisao(c, "remover_tag", null, Json.de("tag", tag), null);
          yield "Tag " + tag + " removida.";
        }
        case "mover_etapa" -> {
          Map<String, Object> n = negocios.garantir(c.storeId, c.contatoId, c.conversaId, "ia");
          if (n == null) yield "Não há funil configurado.";
          UUID etapa = negocios.etapaPorNome(c.storeId, UUID.fromString((String) n.get("funilId")), Json.s(in, "etapa"));
          if (etapa == null) yield "Etapa não encontrada.";
          UUID nid = UUID.fromString((String) n.get("id"));
          negocios.mover(c.storeId, nid, etapa, "ia", c.agenteId, Json.s(in, "motivo"));
          decisao(c, "mover_etapa", Json.s(in, "motivo"), Json.de("etapa", Json.s(in, "etapa")), nid);
          yield "Negócio movido para " + Json.s(in, "etapa") + ".";
        }
        case "atualizar_negocio" -> {
          Map<String, Object> n = negocios.garantir(c.storeId, c.contatoId, c.conversaId, "ia");
          if (n == null) yield "Não há funil configurado.";
          UUID nid = UUID.fromString((String) n.get("id"));
          Map<String, Object> campos = new LinkedHashMap<>();
          if (in.get("valor") != null) campos.put("valor", Math.max(0, Json.d(in, "valor", 0)));
          if (Json.s(in, "produto") != null) {
            Map<String, Object> cp = Json.m(n.get("campos"));
            cp.put("produto", Json.s(in, "produto"));
            campos.put("campos", cp);
          }
          if (Json.s(in, "fechamento_previsto") != null) campos.put("fechamento_previsto", data(Json.s(in, "fechamento_previsto")));
          campos.put("ultima_atividade_em", Instant.now());
          db.atualiza("crm_negocios", nid, c.storeId, campos);
          if (in.get("valor") != null) negocios.evento(c.storeId, nid, "valor", String.valueOf(n.get("valor")), String.valueOf(campos.get("valor")), "ia", c.agenteId, null, null);
          negocios.emitir(c.storeId, nid);
          yield "Negócio atualizado.";
        }
        case "registrar_venda" -> {
          boolean comprovante = Json.b(in, "comprovante_confirmado", false);
          String forma = Json.s(in, "forma_pagamento", "");
          if ("vendas".equals(c.papel) && !comprovante && !forma.toLowerCase().contains("entrega"))
            yield "Venda NÃO registrada: peça o comprovante de pagamento ao cliente antes de confirmar.";
          Map<String, Object> n = negocios.garantir(c.storeId, c.contatoId, c.conversaId, "ia");
          double valor = Math.max(0, Json.d(in, "valor", 0));
          UUID nid = n == null ? null : UUID.fromString((String) n.get("id"));
          db.executa("""
              insert into crm_compras (store_id, contato_id, conversa_id, negocio_id, plataforma, pedido_id, produto, valor, status, forma_pagamento, influenciada_ia)
              values (?, ?, ?, ?, 'whatsapp', ?, ?, ?, 'approved', ?, true)""",
              c.storeId, c.contatoId, c.conversaId, nid, "ia-" + UUID.randomUUID(), Json.s(in, "produto"), valor, forma);
          if (nid != null) {
            db.executa("update crm_negocios set valor = ? where id = ?", valor, nid);
            UUID ganho = negocios.etapaGanho(UUID.fromString((String) n.get("funilId")));
            if (ganho != null) negocios.mover(c.storeId, nid, ganho, "ia", c.agenteId, "Venda: " + Json.s(in, "produto"));
          }
          decisao(c, "registrar_venda", Json.s(in, "produto"), in, nid);
          atendimento.notificarEquipe(c.storeId, "venda", "Venda fechada pela IA", Formatos.reais(valor) + " — " + Json.s(in, "produto"), "/conversas?c=" + c.conversaId);
          yield "Venda registrada.";
        }
        case "marcar_perdido" -> {
          Map<String, Object> n = negocios.garantir(c.storeId, c.contatoId, c.conversaId, "ia");
          if (n == null) yield "Sem negócio.";
          UUID nid = UUID.fromString((String) n.get("id"));
          UUID perda = negocios.etapaPerda(UUID.fromString((String) n.get("funilId")));
          if (perda != null) negocios.mover(c.storeId, nid, perda, "ia", c.agenteId, Json.s(in, "motivo"));
          decisao(c, "marcar_perdido", Json.s(in, "motivo"), null, nid);
          yield "Negócio marcado como perdido.";
        }
        case "transferir_humano" -> {
          UUID setor = Json.s(in, "setor") == null ? null : Formatos.uuid(db.valor("select id from crm_setores where store_id = ? and nome = ?", c.storeId, Json.s(in, "setor")));
          UUID pessoa = Formatos.uuid(Json.s(c.cfg.transferencia(), "assigned_user_id"));
          atendimento.transferirHumano(c.storeId, c.conversaId, pessoa, setor, Json.s(in, "motivo"));
          decisao(c, "transferir_humano", Json.s(in, "motivo"), null, null);
          c.transferiu = true;
          yield "Conversa transferida. Avise o cliente e não prometa prazos exatos.";
        }
        case "registrar_memoria" -> {
          String fato = Json.s(in, "fato");
          if (fato == null || fato.isBlank()) yield "Fato vazio.";
          if (db.numero("select count(*) from crm_memorias where contato_id = ? and lower(fato) = lower(?)", c.contatoId, fato) == 0)
            db.executa("insert into crm_memorias (store_id, contato_id, fato, categoria, fonte) values (?, ?, ?, ?, 'ia')", c.storeId, c.contatoId, Formatos.curto(fato, 500), Json.s(in, "categoria", "outro"));
          yield "Memória guardada.";
        }
        case "registrar_promessa" -> {
          Instant vence = null;
          try {
            vence = Formatos.instante(Json.s(in, "vence_em"));
          } catch (Exception ignorado) {
            // prazo em formato inesperado: grava sem prazo
          }
          UUID nid = Formatos.uuid(db.valor("select id from crm_negocios where contato_id = ? and ganho_em is null and perdido_em is null order by updated_at desc limit 1", c.contatoId));
          db.executa("insert into crm_promessas (store_id, conversa_id, negocio_id, contato_id, descricao, quem, vence_em) values (?, ?, ?, ?, ?, ?, ?)",
              c.storeId, c.conversaId, nid, c.contatoId, Json.s(in, "descricao"), Json.s(in, "quem", "cliente"), vence);
          yield "Promessa registrada.";
        }
        case "atualizar_contato" -> {
          Map<String, Object> campos = new LinkedHashMap<>();
          if (Json.s(in, "nome") != null) campos.put("nome", Formatos.curto(Json.s(in, "nome"), 120));
          if (Json.s(in, "email") != null && Json.s(in, "email").contains("@")) campos.put("email", Json.s(in, "email"));
          if (Json.s(in, "aniversario") != null) campos.put("aniversario", data(Json.s(in, "aniversario")));
          if (!campos.isEmpty()) db.atualiza("crm_contatos", c.contatoId, c.storeId, campos);
          yield "Contato atualizado.";
        }
        case "enviar_opcoes" -> {
          List<String> ops = Json.ls(in, "opcoes");
          if (ops.isEmpty()) yield "Sem opções.";
          List<Map<String, Object>> lista = new ArrayList<>();
          int i = 0;
          for (String o : ops.subList(0, Math.min(10, ops.size()))) lista.add(Json.de("id", "op" + (++i), "titulo", o));
          String tipo = lista.size() <= 3 ? "buttons" : "list";
          Map<String, Object> inter = tipo.equals("buttons") ? Json.de("opcoes", lista) : Json.de("botao", "Ver opções", "secoes", List.of(Json.de("titulo", "Opções", "opcoes", lista)));
          atendimento.enviar(c.storeId, c.conversaId, new Envio.Pedido(tipo, Json.s(in, "texto"), null, null, null, null, null, inter, null), Atendimento.Remetente.ia(c.agenteId, c.agenteNome));
          yield "Opções enviadas ao cliente. Não repita a pergunta no texto.";
        }
        case "enviar_arquivo" -> {
          Map<String, Object> a = db.um("select titulo, arquivo_url, arquivo_mime from crm_agente_conhecimento where id = ?::uuid and agente_id = ?", Json.s(in, "arquivo_id"), c.agenteId);
          if (a == null) yield "Arquivo não encontrado.";
          String mime = Json.s(a, "arquivoMime", "application/pdf");
          String tipo = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";
          atendimento.enviar(c.storeId, c.conversaId, Envio.Pedido.midia(tipo, (String) a.get("arquivoUrl"), mime, Json.s(a, "titulo", "arquivo"), Json.s(in, "legenda")), Atendimento.Remetente.ia(c.agenteId, c.agenteNome));
          yield "Arquivo enviado.";
        }
        case "buscar_produtos" -> {
          List<Map<String, Object>> ps = catalogo.paraIa(c.storeId, Json.s(in, "busca"));
          if (ps.isEmpty()) yield "Nenhum produto encontrado com essa busca.";
          StringBuilder sb = new StringBuilder();
          for (Map<String, Object> p : ps) {
            boolean controla = Json.b(p, "controlaEstoque", true) && !Json.b(p, "vendeSemEstoque", false);
            sb.append("- ").append(p.get("nome")).append(" (id ").append(p.get("id")).append(") — ").append(Formatos.reais(Json.d(p, "precoAtual", 0)));
            if (Json.d(p, "precoAtual", 0) < Json.d(p, "preco", 0)) sb.append(" (promoção; de ").append(Formatos.reais(Json.d(p, "preco", 0))).append(")");
            if (p.get("categoria") != null) sb.append(" [").append(p.get("categoria")).append("]");
            List<Object> vs = Json.l(p.get("variacoes"));
            if (vs.isEmpty()) sb.append(controla ? (Json.i(p, "estoque", 0) > 0 ? " · disponível (" + p.get("estoque") + ")" : " · SEM ESTOQUE") : " · disponível");
            if (p.get("descricao") != null) sb.append("\n  ").append(Formatos.curto((String) p.get("descricao"), 300));
            for (Object vo : vs) {
              Map<String, Object> v = Json.m(vo);
              sb.append("\n  · ").append(v.get("nome")).append(" (variacao_id ").append(v.get("id")).append(")")
                  .append(v.get("preco") != null ? " " + Formatos.reais(Json.d(v, "preco", 0)) : "")
                  .append(controla ? (Json.i(v, "estoque", 0) > 0 ? " disponível" : " SEM ESTOQUE") : "");
            }
            sb.append("\n");
          }
          List<Map<String, Object>> cupons = db.lista("select codigo, tipo, valor from crm_cupons where store_id = ? and ativo and ia_pode_oferecer and (fim is null or fim > now()) and (usos_max is null or usos < usos_max)", c.storeId);
          if (!cupons.isEmpty()) {
            sb.append("Cupons que você pode oferecer para fechar a venda: ");
            for (Map<String, Object> cp : cupons)
              sb.append(cp.get("codigo")).append(" (").append("percentual".equals(cp.get("tipo")) ? cp.get("valor") + "%" : "frete_gratis".equals(cp.get("tipo")) ? "frete grátis" : Formatos.reais(Json.d(cp, "valor", 0))).append(") ");
          }
          yield sb.toString();
        }
        case "enviar_produto" -> {
          Map<String, Object> p = db.um("select * from crm_produtos where id = ?::uuid and store_id = ? and ativo", Json.s(in, "produto_id"), c.storeId);
          if (p == null) yield "Produto não encontrado.";
          String url = null;
          for (Object mo : Json.l(p.get("midias"))) {
            Map<String, Object> m = Json.m(mo);
            if ("image".equals(Json.s(m, "tipo", "image")) && (url == null || Json.b(m, "capa", false))) url = Json.s(m, "url");
          }
          String legenda = Json.s(in, "legenda", "*" + p.get("nome") + "* — " + Formatos.reais(br.com.clienteplus.crm.catalogo.Catalogo.precoAtual(p, null)));
          if (url == null) atendimento.enviar(c.storeId, c.conversaId, Envio.Pedido.texto(legenda), Atendimento.Remetente.ia(c.agenteId, c.agenteNome));
          else atendimento.enviar(c.storeId, c.conversaId, Envio.Pedido.midia("image", url, null, p.get("slug") + ".jpg", legenda), Atendimento.Remetente.ia(c.agenteId, c.agenteNome));
          yield "Foto do produto enviada.";
        }
        case "criar_pedido" -> {
          List<Object> itens = new ArrayList<>();
          for (Object io : Json.l(in.get("itens"))) {
            Map<String, Object> i = Json.m(io);
            String vid = Json.s(i, "variacao_id");
            itens.add(Json.de("produtoId", Json.s(i, "produto_id"), "variacaoId", vid == null || vid.isBlank() ? null : vid, "quantidade", Json.i(i, "quantidade", 1)));
          }
          Map<String, Object> ped = pedidos.criar(c.storeId, Json.de("contatoId", c.contatoId.toString(), "conversaId", c.conversaId.toString(), "itens", itens,
              "formaPagamento", Json.s(in, "forma_pagamento", "combinar"), "entregaTipo", Json.s(in, "entrega_tipo", "entrega"),
              "endereco", Json.s(in, "endereco") == null ? null : Json.de("texto", Json.s(in, "endereco")), "cupom", Json.s(in, "cupom")), "ia", null);
          pedidos.avisarCliente(c.storeId, UUID.fromString((String) ped.get("id")), "aguardando_pagamento");
          decisao(c, "criar_pedido", "Pedido #" + ped.get("numero"), Json.de("total", ped.get("total")), null);
          yield "Pedido #" + ped.get("numero") + " criado, total " + Formatos.reais(Json.d(ped, "total", 0)) + ". O cliente já recebeu o resumo"
              + (ped.get("pixCopiaCola") != null ? " e o código Pix" : "") + ". Peça o comprovante depois do pagamento.";
        }
        case "avisar_quando_chegar" -> {
          String vid = Json.s(in, "variacao_id");
          db.executa("insert into crm_lista_espera (store_id, produto_id, variacao_id, contato_id) values (?, ?::uuid, ?::uuid, ?) on conflict do nothing",
              c.storeId, Json.s(in, "produto_id"), vid == null || vid.isBlank() ? null : vid, c.contatoId);
          yield "Cliente na lista de espera. Ele será avisado quando chegar.";
        }
        case "gerar_pix" -> {
          double valor = Json.d(in, "valor", 0);
          if (valor <= 0) yield "Valor inválido.";
          String loja = db.valor("select nome from crm_lojas where id = ?", c.storeId);
          String codigo = Pix.copiaECola(c.cfg.pixChave(), loja, Json.s(c.cfg.mapa(), "pixCity", "BRASIL"), BigDecimal.valueOf(valor), "CRM" + System.currentTimeMillis());
          atendimento.enviar(c.storeId, c.conversaId, Envio.Pedido.texto(codigo), Atendimento.Remetente.ia(c.agenteId, c.agenteNome));
          yield "Código Pix de " + Formatos.reais(valor) + " enviado em uma mensagem separada (o cliente toca para copiar). Peça o comprovante depois do pagamento.";
        }
        case "ver_horarios" -> {
          UUID tipo = Formatos.uuid(db.valor("select id from crm_agenda_tipos where store_id = ? and nome = ? and ativo", c.storeId, Json.s(in, "servico")));
          if (tipo == null) yield "Serviço não encontrado.";
          UUID prof = Json.s(in, "profissional") == null ? null : Formatos.uuid(db.valor("select id from crm_agenda_colaboradores where store_id = ? and lower(nome) like lower(?) limit 1", c.storeId, "%" + Json.s(in, "profissional") + "%"));
          List<Map<String, Object>> vagas = agenda.vagas(c.storeId, tipo, prof, data(Json.s(in, "data")));
          if (vagas.isEmpty()) yield "Sem horários livres nesta data.";
          StringBuilder sb = new StringBuilder("Horários livres (use o valor de 'inicio' para agendar):\n");
          var tz = agenda.fuso(c.storeId);
          for (Map<String, Object> v : vagas.subList(0, Math.min(20, vagas.size())))
            sb.append("- ").append(Instant.parse((String) v.get("inicio")).atZone(tz).toOffsetDateTime()).append(v.get("colaborador") == null ? "" : " com " + v.get("colaborador")).append("\n");
          yield sb.toString();
        }
        case "agendar" -> {
          UUID tipo = Formatos.uuid(db.valor("select id from crm_agenda_tipos where store_id = ? and nome = ? and ativo", c.storeId, Json.s(in, "servico")));
          if (tipo == null) yield "Serviço não encontrado.";
          UUID prof = Json.s(in, "profissional") == null ? null : Formatos.uuid(db.valor("select id from crm_agenda_colaboradores where store_id = ? and lower(nome) like lower(?) limit 1", c.storeId, "%" + Json.s(in, "profissional") + "%"));
          Map<String, Object> e = agenda.marcar(c.storeId, Json.de("tipoId", tipo, "inicio", Json.s(in, "inicio"), "colaboradorId", prof, "contatoId", c.contatoId,
              "conversaId", c.conversaId, "notas", Json.s(in, "observacao")), "ia");
          decisao(c, "agendar", Json.s(in, "servico"), Json.de("evento", e.get("id"), "inicio", e.get("inicio")), null);
          yield "Agendado (id " + e.get("id") + ") para " + Formatos.dataHora(Instant.parse((String) e.get("inicio"))) + ".";
        }
        case "cancelar_agendamento" -> {
          UUID id = Formatos.uuid(Json.s(in, "agendamento_id"));
          if (db.numero("select count(*) from crm_agenda_eventos where id = ? and contato_id = ?", id, c.contatoId) == 0) yield "Agendamento não encontrado para este cliente.";
          agenda.cancelar(c.storeId, id, Json.s(in, "motivo", "Cancelado pelo cliente"));
          yield "Agendamento cancelado.";
        }
        default -> "Ferramenta desconhecida.";
      };
      c.acoes.add(nome);
      return r;
    } catch (br.com.clienteplus.crm.comum.Erro e) {
      return "Não foi possível: " + e.getMessage();
    } catch (Exception e) {
      LOG.warnf(e, "Ferramenta %s falhou", nome);
      return "Erro ao executar. Continue a conversa sem esta ação.";
    }
  }

  private String tagExistente(Ctx c, String tag) {
    return tag == null ? null : db.valor("select nome from crm_tags where store_id = ? and lower(nome) = lower(?)", c.storeId, tag.trim());
  }

  private void decisao(Ctx c, String acao, String motivo, Map<String, Object> dados, UUID negocioId) {
    db.executa("insert into crm_decisoes (store_id, conversa_id, negocio_id, agente_id, acao, motivo, dados) values (?, ?, ?, ?, ?, ?, ?::jsonb)",
        c.storeId, c.conversaId, negocioId, c.agenteId, acao, motivo, dados);
  }

  private static LocalDate data(String s) {
    try {
      return s == null ? null : LocalDate.parse(s.trim().substring(0, 10));
    } catch (Exception e) {
      throw br.com.clienteplus.crm.comum.Erro.requisicao("Data inválida");
    }
  }

  // ---------------- montagem de esquema ----------------

  private static Tool tool(String nome, String descricao, Map<String, Object> props, List<String> obrigatorios) {
    Tool.InputSchema.Properties.Builder pb = Tool.InputSchema.Properties.builder();
    props.forEach((k, v) -> pb.putAdditionalProperty(k, JsonValue.from(v)));
    return Tool.builder().name(nome).description(descricao)
        .inputSchema(Tool.InputSchema.builder().properties(pb.build()).required(obrigatorios).build()).build();
  }

  private static Map<String, Object> props(Object... kv) {
    return Json.de(kv);
  }

  private static Map<String, Object> str(String d) {
    return Json.de("type", "string", "description", d);
  }

  private static Map<String, Object> num(String d) {
    return Json.de("type", "number", "description", d);
  }

  private static Map<String, Object> bool(String d) {
    return Json.de("type", "boolean", "description", d);
  }

  private static Map<String, Object> enumStr(List<String> valores, String d) {
    return Json.de("type", "string", "enum", valores, "description", d);
  }
}
