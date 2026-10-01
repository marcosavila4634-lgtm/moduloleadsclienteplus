package br.com.clienteplus.crm.ia;

import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Formatos;
import br.com.clienteplus.crm.comum.Json;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Monta as instruções do agente em duas partes:
 * - estável (persona, conhecimento, regras): igual em toda conversa → fica em cache;
 * - variável (data/hora, dados do contato, negócio, memórias): muda a cada vez.
 */
@ApplicationScoped
public class PromptAgente {

  @Inject Db db;

  public record Prompt(String estavel, String variavel) {}

  private static final Map<String, String> PAPEIS = Map.of(
      "vendas", "vendedor(a): entende a necessidade, apresenta os produtos, contorna objeções ('tá caro', 'vou pensar') e conduz até o fechamento. Manda o link/forma de pagamento quando o cliente está pronto. Só confirma a venda vendo o COMPROVANTE — nunca apenas porque o cliente disse 'já paguei'.",
      "sdr", "pré-vendas (SDR): qualifica o lead (necessidade, orçamento, prazo, decisor), responde dúvidas iniciais e passa para um vendedor humano quando o lead estiver qualificado.",
      "suporte", "suporte: resolve dúvidas e problemas com paciência, passo a passo, e transfere para humano quando não conseguir resolver.",
      "atendimento", "atendimento: recepciona, tira dúvidas gerais, direciona para o setor certo e agenda quando necessário.",
      "pos_venda", "pós-venda: acompanha a satisfação do cliente depois da compra, ajuda com trocas/entregas e incentiva nova compra e indicação.",
      "personalizado", "assistente da empresa, seguindo as instruções abaixo.");

  public Prompt montar(Map<String, Object> agente, UUID storeId, UUID conversaId) {
    AgenteConfig cfg = new AgenteConfig(agente.get("config"));
    UUID agenteId = UUID.fromString((String) agente.get("id"));
    return new Prompt(estavel(agente, cfg, storeId, agenteId), variavel(cfg, storeId, conversaId));
  }

  private String estavel(Map<String, Object> agente, AgenteConfig cfg, UUID storeId, UUID agenteId) {
    StringBuilder p = new StringBuilder();
    String nome = (String) agente.get("nome");
    String empresa = Json.s(agente, "empresa", (String) db.valor("select nome from crm_lojas where id = ?", storeId));
    String papel = PAPEIS.getOrDefault((String) agente.get("papel"), PAPEIS.get("personalizado"));
    p.append("Você é ").append(nome).append(", que atende os clientes da empresa ").append(empresa)
        .append(" pelo WhatsApp/Instagram. Seu papel é de ").append(papel).append("\n\n");
    p.append("""
        Você conversa com clientes reais em nome da empresa. Seja verdadeiro(a): não invente produtos, preços, prazos, \
        estoque ou políticas que não estejam nas informações abaixo — se não souber, diga que vai confirmar ou transfira \
        para um humano. Se o cliente perguntar diretamente se está falando com uma pessoa ou com uma IA, não negue que é \
        um assistente virtual da empresa.

        """);

    p.append("# Como escrever\n");
    p.append("- Idioma: ").append("pt-br".equals(cfg.idioma()) ? "português do Brasil" : cfg.idioma()).append(".\n");
    p.append("- Tom: ").append(switch (cfg.tom()) {
      case "formal" -> "formal e educado";
      case "neutro", "neutral" -> "neutro e profissional";
      default -> "informal, próximo e natural, como uma conversa real de WhatsApp";
    }).append(".\n");
    p.append("- Gênero ao falar de si: ").append(switch (cfg.genero()) {
      case "male" -> "masculino (direto, descontraído)";
      case "female" -> "feminino (acolhedora, empática)";
      default -> "neutro";
    }).append(".\n");
    p.append(cfg.emojis() ? "- Pode usar emojis com moderação (no máximo 1 ou 2 por mensagem).\n" : "- Não use emojis.\n");
    if (cfg.girias()) {
      p.append("- Pode usar gírias leves quando fizer sentido");
      List<String> g = cfg.giriasLista();
      if (!g.isEmpty()) p.append(": ").append(String.join("; ", g));
      p.append(". Não repita a mesma gíria em mensagens seguidas.\n");
    } else p.append("- Não use gírias.\n");
    p.append(switch (cfg.capitalizacao()) {
      case "lower" -> "- Escreva tudo em letras minúsculas, como no celular.\n";
      case "mixed" -> "- Escreva como uma pessoa no celular: às vezes começa frase em minúscula, sem exagerar na formalidade.\n";
      default -> "";
    });
    p.append("- Formatação do WhatsApp: *negrito* com um asterisco, _itálico_. Não use títulos (#), tabelas nem links em markdown.\n");
    if (cfg.dividir()) {
      p.append("- Responda em mensagens curtas, como uma pessoa digitando: separe em até ").append(cfg.dividirBlocos())
          .append(" mensagens usando UMA LINHA EM BRANCO entre elas; cada mensagem com até cerca de ").append(cfg.dividirCaracteres())
          .append(" caracteres. Nem sempre precisa usar todas.\n");
    } else p.append("- Responda em uma única mensagem, curta e objetiva.\n");
    p.append("- Estilo de venda: ").append(switch (cfg.estiloVenda()) {
      case "soft", "suave" -> "consultivo e sem pressão";
      case "aggressive", "agressivo" -> "proativo, sempre puxando para o fechamento";
      default -> "equilibrado: ajuda primeiro e conduz para o próximo passo";
    }).append(".\n");
    p.append("- Faça uma pergunta de cada vez. Não repita informações que já deu na conversa.\n\n");

    if (!cfg.personalidade().isBlank()) p.append("# Personalidade\n").append(cfg.personalidade()).append("\n\n");
    if (!cfg.objetivo().isBlank()) p.append("# Objetivo\n").append(cfg.objetivo()).append("\n\n");
    if (!cfg.estiloVoz().isBlank()) p.append("# Estilo de voz\n").append(cfg.estiloVoz()).append("\n\n");
    if (!cfg.exemplosVoz().isBlank()) p.append("# Exemplos de conversa (siga o estilo, não copie literalmente)\n").append(cfg.exemplosVoz()).append("\n\n");
    if (!cfg.saudacao().isBlank()) p.append("# Primeira mensagem\nNo primeiro contato, cumprimente seguindo esta ideia: ").append(cfg.saudacao()).append("\n\n");
    if (!cfg.instrucoes().isBlank()) p.append("# Instruções da empresa\n").append(cfg.instrucoes()).append("\n\n");
    if (!cfg.treinoTexto().isBlank()) p.append("# Informações adicionais\n").append(cfg.treinoTexto()).append("\n\n");
    if (!cfg.treinoQa().isEmpty()) {
      p.append("# Perguntas e respostas treinadas\n");
      for (Object o : cfg.treinoQa()) {
        Map<String, Object> q = Json.m(o);
        p.append("P: ").append(Json.s(q, "question", Json.s(q, "pergunta", ""))).append("\nR: ").append(Json.s(q, "answer", Json.s(q, "resposta", ""))).append("\n");
      }
      p.append("\n");
    }

    List<Map<String, Object>> kb = db.lista("select id, tipo, titulo, conteudo, pergunta, arquivo_url, arquivo_mime, quando_enviar from crm_agente_conhecimento where agente_id = ? and ativo order by ordem, created_at", agenteId);
    StringBuilder midias = new StringBuilder();
    if (!kb.isEmpty()) {
      p.append("# Base de conhecimento\n");
      for (Map<String, Object> k : kb) {
        String tipo = (String) k.get("tipo");
        if (k.get("arquivoUrl") != null && ("midia".equals(tipo) || "arquivo".equals(tipo) || "produto".equals(tipo))) {
          midias.append("- id ").append(k.get("id")).append(": ").append(Json.s(k, "titulo", "arquivo"))
              .append(k.get("quandoEnviar") == null ? "" : " — enviar quando: " + k.get("quandoEnviar")).append("\n");
        }
        if ("faq".equals(tipo)) p.append("## Pergunta: ").append(Json.s(k, "pergunta", Json.s(k, "titulo", ""))).append("\nResposta: ").append(Json.s(k, "conteudo", "")).append("\n\n");
        else if (k.get("conteudo") != null) p.append("## ").append(Json.s(k, "titulo", "Informação")).append("\n").append(k.get("conteudo")).append("\n\n");
      }
    }
    if (midias.length() > 0) p.append("# Arquivos que você pode enviar (ferramenta enviar_arquivo)\n").append(midias).append("\n");

    List<Map<String, Object>> tags = db.lista("select nome, descricao from crm_tags where store_id = ? order by nome", storeId);
    if (cfg.marcarTags() && !tags.isEmpty()) {
      p.append("# Tags (marque com adicionar_tag quando a situação acontecer)\n");
      for (Map<String, Object> t : tags) p.append("- ").append(t.get("nome")).append(t.get("descricao") == null || ((String) t.get("descricao")).isBlank() ? "" : ": " + t.get("descricao")).append("\n");
      p.append("\n");
    }
    List<Map<String, Object>> etapas = db.lista("""
        select e.nome, e.ganho, e.perda from crm_etapas e join crm_funis f on f.id = e.funil_id
        where f.store_id = ? and f.ativo order by f.ordem, e.ordem""", storeId);
    if (cfg.moverEtapas() && !etapas.isEmpty()) {
      p.append("# Etapas do funil de vendas (use mover_etapa quando o cliente avançar)\n");
      for (Map<String, Object> e : etapas)
        p.append("- ").append(e.get("nome")).append(Json.b(e, "ganho", false) ? " (venda fechada — só com comprovante/confirmação)" : Json.b(e, "perda", false) ? " (perdido — só se o cliente desistir claramente)" : "").append("\n");
      p.append("\n");
    }

    if (db.numero("select count(*) from crm_produtos where store_id = ? and ativo and ia_pode_vender", storeId) > 0)
      p.append("# Catálogo\nA loja tem catálogo de produtos. Use buscar_produtos para consultar preço, opções e estoque (nunca invente), ")
          .append("enviar_produto para mandar a foto, criar_pedido quando o cliente confirmar e avisar_quando_chegar se estiver sem estoque.\n\n");
    p.append("# Quando transferir para um humano (ferramenta transferir_humano)\n");
    Map<String, Object> h = cfg.transferencia();
    if (Json.b(h, "on_frustration", true)) p.append("- O cliente demonstra irritação/frustração com o atendimento.\n");
    if (Json.b(h, "on_repeated_question", true)) p.append("- O cliente repete a mesma pergunta ").append(Json.i(h, "max_repeated_questions", 3)).append(" vezes sem ficar satisfeito.\n");
    if (Json.b(h, "on_no_answer", true)) p.append("- Você não tem a informação para responder com segurança.\n");
    p.append("- O cliente pede para falar com uma pessoa.\n");
    if (!cfg.regrasTransferencia().isBlank()) p.append(cfg.regrasTransferencia()).append("\n");
    p.append("Ao transferir, avise o cliente de forma natural que alguém da equipe vai continuar o atendimento.\n\n");

    p.append("""
        # Ferramentas
        Use as ferramentas quando fizer sentido, sem avisar o cliente sobre elas. Registre memórias sobre preferências \
        importantes (tamanho, cor, orçamento, datas especiais) e promessas com prazo ("te pago amanhã", "me chama sexta"). \
        Depois de usar ferramentas, escreva a resposta para o cliente normalmente. Se não houver nada a dizer ao cliente \
        (ex.: ele só mandou "ok" depois de a conversa ter sido encerrada), responda exatamente [SEM_RESPOSTA].
        """);
    return p.toString();
  }

  private String variavel(AgenteConfig cfg, UUID storeId, UUID conversaId) {
    StringBuilder p = new StringBuilder("# Contexto desta conversa\n");
    Map<String, Object> loja = db.um("select fuso, horario_comercial from crm_lojas where id = ?", storeId);
    ZoneId tz = ZoneId.of(Json.s(loja, "fuso", "America/Sao_Paulo"));
    ZonedDateTime agora = ZonedDateTime.now(tz);
    p.append("Agora: ").append(agora.format(DateTimeFormatter.ofPattern("EEEE, dd/MM/yyyy HH:mm", new Locale("pt", "BR")))).append(" (").append(tz).append(")\n");
    Map<String, Object> horario = cfg.horario().isEmpty() ? Json.m(loja.get("horarioComercial")) : cfg.horario();
    if (!horario.isEmpty()) p.append("Estamos ").append(Horarios.aberto(horario, agora) ? "DENTRO" : "FORA").append(" do horário comercial.\n");

    Map<String, Object> cv = db.um("""
        select c.contato_id, c.resumo, c.canal, ct.nome, ct.telefone, ct.email, ct.tags, ct.campos, ct.instagram_usuario, ct.aniversario
        from crm_conversas c join crm_contatos ct on ct.id = c.contato_id where c.id = ?""", conversaId);
    if (cv == null) return p.toString();
    UUID contatoId = UUID.fromString((String) cv.get("contatoId"));
    p.append("\n## Cliente\n");
    p.append("Nome: ").append(Json.s(cv, "nome", "(não informado — pergunte de forma natural se precisar)")).append("\n");
    if (cv.get("telefone") != null) p.append("Telefone: ").append(cv.get("telefone")).append("\n");
    if (cv.get("email") != null) p.append("E-mail: ").append(cv.get("email")).append("\n");
    if (cv.get("instagramUsuario") != null) p.append("Instagram: @").append(cv.get("instagramUsuario")).append("\n");
    if (cv.get("aniversario") != null) p.append("Aniversário: ").append(cv.get("aniversario")).append("\n");
    List<String> tags = Json.ls(cv, "tags");
    if (!tags.isEmpty()) p.append("Tags atuais: ").append(String.join(", ", tags)).append("\n");
    Map<String, Object> campos = Json.m(cv.get("campos"));
    for (var e : campos.entrySet()) if (e.getValue() != null && !String.valueOf(e.getValue()).isBlank()) p.append(e.getKey()).append(": ").append(e.getValue()).append("\n");

    List<Map<String, Object>> mem = db.lista("select fato, categoria from crm_memorias where contato_id = ? order by updated_at desc limit 30", contatoId);
    if (!mem.isEmpty()) {
      p.append("\n## O que já sabemos sobre este cliente\n");
      for (Map<String, Object> m : mem) p.append("- ").append(m.get("fato")).append("\n");
    }
    List<Map<String, Object>> compras = db.lista("select produto, valor, status, comprado_em from crm_compras where contato_id = ? order by comprado_em desc limit 10", contatoId);
    if (!compras.isEmpty()) {
      p.append("\n## Compras anteriores\n");
      for (Map<String, Object> c : compras) p.append("- ").append(Json.s(c, "produto", "Compra")).append(" — ").append(Formatos.reais(Json.d(c, "valor", 0))).append(" (").append(c.get("status")).append(", ").append(String.valueOf(c.get("compradoEm")).substring(0, 10)).append(")\n");
    }
    Map<String, Object> neg = db.um("""
        select n.titulo, n.valor, n.score_ia, e.nome as etapa from crm_negocios n join crm_etapas e on e.id = n.etapa_id
        where n.contato_id = ? and n.ganho_em is null and n.perdido_em is null order by n.updated_at desc limit 1""", contatoId);
    if (neg != null) p.append("\n## Negócio em andamento\nEtapa: ").append(neg.get("etapa")).append(Json.d(neg, "valor", 0) > 0 ? " · Valor: " + Formatos.reais(Json.d(neg, "valor", 0)) : "").append("\n");
    List<Map<String, Object>> prom = db.lista("select descricao, vence_em, quem from crm_promessas where contato_id = ? and status = 'pendente' order by vence_em", contatoId);
    if (!prom.isEmpty()) {
      p.append("\n## Promessas pendentes\n");
      for (Map<String, Object> pr : prom) p.append("- (").append(pr.get("quem")).append(") ").append(pr.get("descricao")).append(pr.get("venceEm") == null ? "" : " — até " + Formatos.dataHora(java.time.Instant.parse((String) pr.get("venceEm")))).append("\n");
    }
    if (cfg.agenda()) {
      List<Map<String, Object>> ev = db.lista("""
          select e.id, e.titulo, e.inicio, e.status from crm_agenda_eventos e where e.contato_id = ? and e.inicio > now() - interval '1' day
            and e.status in ('scheduled','confirmed') order by e.inicio limit 5""", contatoId);
      if (!ev.isEmpty()) {
        p.append("\n## Agendamentos do cliente\n");
        for (Map<String, Object> e : ev) p.append("- ").append(e.get("titulo")).append(" em ").append(Formatos.dataHora(java.time.Instant.parse((String) e.get("inicio")))).append(" (id ").append(e.get("id")).append(")\n");
      }
    }
    if (cv.get("resumo") != null) p.append("\n## Resumo do que aconteceu antes nesta conversa\n").append(cv.get("resumo")).append("\n");
    return p.toString();
  }
}
