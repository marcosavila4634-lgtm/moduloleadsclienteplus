import {
  Bell,
  Bot,
  Braces,
  Calendar,
  CircleDot,
  Clock,
  Filter,
  GitBranch,
  Globe,
  Hand,
  Hourglass,
  KanbanSquare,
  List,
  Mail,
  MessageSquare,
  MessageSquareReply,
  MousePointerClick,
  PenLine,
  QrCode,
  Shuffle,
  ShoppingCart,
  Square,
  Tag,
  Tags,
  Trash2,
  UserPlus,
  Webhook,
  Zap,
  type LucideIcon,
} from "lucide-react";

// Catálogo dos blocos do editor de automações (mesmos tipos do Meppy).
// "campos" descreve o formulário de configuração de cada bloco.

export type TipoCampo =
  | "texto" | "area" | "numero" | "tag" | "tags" | "selecao" | "etapa" | "funil" | "agente" | "template" | "usuario" | "setor"
  | "mensagens" | "opcoes" | "casos" | "ramos" | "cabecalhos" | "hora" | "dias" | "booleano" | "conexao" | "campo";
export type CampoBloco = { chave: string; rotulo: string; tipo: TipoCampo; dica?: string; opcoes?: { valor: string; rotulo: string }[]; padrao?: unknown };
export type Bloco = { tipo: string; kind: "trigger" | "condition" | "action"; nome: string; descricao: string; icone: LucideIcon; cor: string; campos: CampoBloco[]; saidas?: "sim_nao" | "casos" | "ramos" | "resposta" };

const canais = [{ valor: "", rotulo: "Qualquer canal" }, { valor: "whatsapp", rotulo: "WhatsApp" }, { valor: "instagram", rotulo: "Instagram" }];
const statusConv = [{ valor: "new", rotulo: "Nova" }, { valor: "open", rotulo: "Aberta" }, { valor: "pending", rotulo: "Pendente" }, { valor: "resolved", rotulo: "Resolvida" }, { valor: "closed", rotulo: "Fechada" }];
const operadores = [
  { valor: "equals", rotulo: "É igual a" }, { valor: "not_equals", rotulo: "É diferente de" }, { valor: "contains", rotulo: "Contém" }, { valor: "not_contains", rotulo: "Não contém" },
  { valor: "starts_with", rotulo: "Começa com" }, { valor: "ends_with", rotulo: "Termina com" }, { valor: "regex", rotulo: "Corresponde à expressão" }, { valor: "is_empty", rotulo: "Está vazio" },
  { valor: "not_empty", rotulo: "Não está vazio" }, { valor: "greater_than", rotulo: "Maior que" }, { valor: "less_than", rotulo: "Menor que" }, { valor: "is_true", rotulo: "É verdadeiro" }, { valor: "is_false", rotulo: "É falso" },
];
const DICA_VARS = "Use {nome}, {primeiro_nome}, {telefone}, {email}, {mensagem}, {resposta}, {campo.chave}.";
const JANELA = { chave: "ignorar_janela", rotulo: "Enviar na hora (ignorar a janela de horário)", tipo: "booleano" as const, dica: "Deixe desligado para respeitar o horário de envio configurado (ex.: só às 15h)." };
const RESERVA = { chave: "template_reserva_id", rotulo: "Template se passar de 24 h (opcional)", tipo: "template" as const, dica: "O WhatsApp só deixa mandar template aprovado depois de 24 h sem o cliente falar." };

export const BLOCOS: Bloco[] = [
  // ---------- gatilhos ----------
  { tipo: "new_message", kind: "trigger", nome: "Nova mensagem", descricao: "Quando o cliente mandar mensagem", icone: MessageSquare, cor: "#145f6e",
    campos: [{ chave: "channel", rotulo: "Canal", tipo: "selecao", opcoes: canais }, { chave: "connectionId", rotulo: "Número / conta", tipo: "conexao" },
      { chave: "matchMode", rotulo: "Quando", tipo: "selecao", opcoes: [{ valor: "any", rotulo: "Qualquer mensagem" }, { valor: "contains", rotulo: "Contém a palavra" }, { valor: "equals", rotulo: "É exatamente" }, { valor: "starts_with", rotulo: "Começa com" }] },
      { chave: "keyword", rotulo: "Palavras (separe por vírgula)", tipo: "texto" }, { chave: "somenteNovaConversa", rotulo: "Só na primeira mensagem da conversa", tipo: "booleano" }] },
  { tipo: "tag_added", kind: "trigger", nome: "Tag adicionada", descricao: "Quando o contato ganhar uma tag", icone: Tag, cor: "#145f6e", campos: [{ chave: "tag", rotulo: "Tag", tipo: "tag" }] },
  { tipo: "tag_removed", kind: "trigger", nome: "Tag removida", descricao: "Quando uma tag sair do contato", icone: Tags, cor: "#145f6e", campos: [{ chave: "tag", rotulo: "Tag", tipo: "tag" }] },
  { tipo: "button_reply", kind: "trigger", nome: "Botão clicado", descricao: "Quando o cliente tocar num botão/opção", icone: MousePointerClick, cor: "#145f6e", campos: [{ chave: "botao", rotulo: "Texto ou id do botão (vazio = qualquer)", tipo: "texto" }] },
  { tipo: "status_changed", kind: "trigger", nome: "Status mudou", descricao: "Quando a conversa mudar de status", icone: CircleDot, cor: "#145f6e",
    campos: [{ chave: "de", rotulo: "De (opcional)", tipo: "selecao", opcoes: [{ valor: "", rotulo: "Qualquer" }, ...statusConv] }, { chave: "para", rotulo: "Para", tipo: "selecao", opcoes: [{ valor: "", rotulo: "Qualquer" }, ...statusConv] }] },
  { tipo: "stage_changed", kind: "trigger", nome: "Mudou de etapa", descricao: "Quando o negócio entrar numa etapa do funil", icone: KanbanSquare, cor: "#145f6e", campos: [{ chave: "etapa_id", rotulo: "Etapa", tipo: "etapa" }] },
  { tipo: "contact_created", kind: "trigger", nome: "Novo contato", descricao: "Quando um cliente novo chegar", icone: UserPlus, cor: "#145f6e", campos: [] },
  { tipo: "purchase", kind: "trigger", nome: "Compra", descricao: "Quando chegar uma compra (loja ou integração)", icone: ShoppingCart, cor: "#145f6e",
    campos: [{ chave: "status", rotulo: "Situação", tipo: "selecao", opcoes: [{ valor: "approved", rotulo: "Aprovada" }, { valor: "refunded", rotulo: "Reembolsada" }, { valor: "canceled", rotulo: "Cancelada" }, { valor: "", rotulo: "Qualquer" }] }] },
  { tipo: "email_received", kind: "trigger", nome: "E-mail recebido", descricao: "Quando chegar um e-mail", icone: Mail, cor: "#145f6e", campos: [] },
  { tipo: "schedule", kind: "trigger", nome: "Agendamento", descricao: "Em dia e hora marcados, para um público", icone: Calendar, cor: "#145f6e",
    campos: [{ chave: "hora", rotulo: "Hora", tipo: "hora", padrao: "09:00" }, { chave: "dias", rotulo: "Dias da semana (vazio = todos)", tipo: "dias" }, { chave: "data", rotulo: "Só nesta data (opcional, AAAA-MM-DD)", tipo: "texto" }, { chave: "tags", rotulo: "Público: contatos com as tags (vazio = todos)", tipo: "tags" }] },
  { tipo: "http_request", kind: "trigger", nome: "Webhook recebido", descricao: "Quando outro sistema chamar o endereço", icone: Webhook, cor: "#145f6e", campos: [] },

  // ---------- condições ----------
  { tipo: "customer_has_tag", kind: "condition", nome: "Tem tag?", descricao: "Verifica se o contato tem a tag", icone: Tag, cor: "#d97706", saidas: "sim_nao", campos: [{ chave: "tag", rotulo: "Tag", tipo: "tag" }] },
  { tipo: "contains_keyword", kind: "condition", nome: "Mensagem contém?", descricao: "Verifica palavras na última mensagem/resposta", icone: Filter, cor: "#d97706", saidas: "sim_nao",
    campos: [{ chave: "keyword", rotulo: "Palavras (vírgula)", tipo: "texto" }, { chave: "matchMode", rotulo: "Modo", tipo: "selecao", opcoes: [{ valor: "contains", rotulo: "Contém" }, { valor: "equals", rotulo: "É exatamente" }, { valor: "starts_with", rotulo: "Começa com" }] }] },
  { tipo: "channel_is", kind: "condition", nome: "Canal é?", descricao: "WhatsApp ou Instagram", icone: MessageSquare, cor: "#d97706", saidas: "sim_nao", campos: [{ chave: "channel", rotulo: "Canal", tipo: "selecao", opcoes: canais.slice(1) }] },
  { tipo: "status_is", kind: "condition", nome: "Status é?", descricao: "Status da conversa", icone: CircleDot, cor: "#d97706", saidas: "sim_nao", campos: [{ chave: "status", rotulo: "Status", tipo: "selecao", opcoes: statusConv }] },
  { tipo: "stage_is", kind: "condition", nome: "Está na etapa?", descricao: "Negócio está na etapa", icone: KanbanSquare, cor: "#d97706", saidas: "sim_nao", campos: [{ chave: "etapa_id", rotulo: "Etapa", tipo: "etapa" }] },
  { tipo: "lead_exists", kind: "condition", nome: "Tem negócio aberto?", descricao: "O contato já está no funil", icone: KanbanSquare, cor: "#d97706", saidas: "sim_nao", campos: [] },
  { tipo: "business_hours", kind: "condition", nome: "Horário comercial?", descricao: "Agora está dentro do horário", icone: Clock, cor: "#d97706", saidas: "sim_nao", campos: [] },
  { tipo: "compare", kind: "condition", nome: "Comparar valor", descricao: "Compara um campo/variável", icone: Braces, cor: "#d97706", saidas: "sim_nao",
    campos: [{ chave: "variavel", rotulo: "Variável", tipo: "campo" }, { chave: "operador", rotulo: "Operador", tipo: "selecao", opcoes: operadores }, { chave: "valor", rotulo: "Valor", tipo: "texto", dica: DICA_VARS }] },
  { tipo: "switch", kind: "condition", nome: "Switch", descricao: "Vários caminhos conforme o valor", icone: GitBranch, cor: "#d97706", saidas: "casos",
    campos: [{ chave: "variavel", rotulo: "Variável", tipo: "campo" }, { chave: "casos", rotulo: "Casos", tipo: "casos" }] },
  { tipo: "randomizer", kind: "condition", nome: "Randomizador", descricao: "Divide em caminhos por % (teste A/B)", icone: Shuffle, cor: "#d97706", saidas: "ramos", campos: [{ chave: "ramos", rotulo: "Caminhos", tipo: "ramos" }] },

  // ---------- ações ----------
  { tipo: "send_message", kind: "action", nome: "Enviar mensagem", descricao: "Texto, imagem, áudio, vídeo ou arquivo", icone: MessageSquare, cor: "#f47b20", campos: [{ chave: "mensagens", rotulo: "Mensagens", tipo: "mensagens" }, JANELA, RESERVA] },
  { tipo: "send_list", kind: "action", nome: "Enviar opções", descricao: "Botões (até 3) ou lista (até 10)", icone: List, cor: "#f47b20",
    campos: [{ chave: "texto", rotulo: "Pergunta", tipo: "area" }, { chave: "opcoes", rotulo: "Opções", tipo: "opcoes" }, { chave: "botao", rotulo: "Texto do botão da lista", tipo: "texto", padrao: "Ver opções" }, JANELA, RESERVA] },
  { tipo: "send_hsm_template", kind: "action", nome: "Enviar template", descricao: "Modelo aprovado pela Meta (fora das 24 h)", icone: Zap, cor: "#f47b20", campos: [{ chave: "template_id", rotulo: "Template", tipo: "template" }, JANELA] },
  { tipo: "ai_message", kind: "action", nome: "Bloco de IA", descricao: "A IA escreve a mensagem com uma instrução", icone: Bot, cor: "#f47b20",
    campos: [{ chave: "agente_id", rotulo: "Robô (voz e conhecimento)", tipo: "agente" }, { chave: "instrucao", rotulo: "O que escrever", tipo: "area", dica: "Ex.: Retome a conversa oferecendo 10% de desconto no Pix." }, { chave: "enviar", rotulo: "Enviar ao cliente", tipo: "booleano", padrao: true }, JANELA, RESERVA] },
  { tipo: "send_email", kind: "action", nome: "Enviar e-mail", descricao: "Pelo e-mail da loja", icone: Mail, cor: "#f47b20",
    campos: [{ chave: "para", rotulo: "Para", tipo: "texto", padrao: "{email}" }, { chave: "assunto", rotulo: "Assunto", tipo: "texto" }, { chave: "corpo", rotulo: "Mensagem", tipo: "area", dica: DICA_VARS }] },
  { tipo: "add_tags", kind: "action", nome: "Adicionar tags", descricao: "Marca tags no contato", icone: Tag, cor: "#7c3aed", campos: [{ chave: "tags", rotulo: "Tags", tipo: "tags" }] },
  { tipo: "remove_tags", kind: "action", nome: "Remover tags", descricao: "Tira tags do contato", icone: Tags, cor: "#7c3aed", campos: [{ chave: "tags", rotulo: "Tags", tipo: "tags" }] },
  { tipo: "set_status", kind: "action", nome: "Alterar status", descricao: "Muda o status da conversa", icone: CircleDot, cor: "#7c3aed", campos: [{ chave: "status", rotulo: "Novo status", tipo: "selecao", opcoes: statusConv }] },
  { tipo: "assign_agent", kind: "action", nome: "Atribuir robô", descricao: "Liga um robô de IA na conversa", icone: Bot, cor: "#7c3aed", campos: [{ chave: "agente_id", rotulo: "Robô", tipo: "agente" }, { chave: "responder_agora", rotulo: "Responder já", tipo: "booleano" }] },
  { tipo: "transfer_human", kind: "action", nome: "Passar para humano", descricao: "Para a IA e chama a equipe", icone: Hand, cor: "#7c3aed",
    campos: [{ chave: "setor_id", rotulo: "Setor (opcional)", tipo: "setor" }, { chave: "usuario_id", rotulo: "Pessoa (opcional)", tipo: "usuario" }, { chave: "motivo", rotulo: "Motivo", tipo: "texto" }] },
  { tipo: "set_field", kind: "action", nome: "Operações de campos", descricao: "Grava/soma valores em campos e variáveis", icone: PenLine, cor: "#7c3aed",
    campos: [{ chave: "campo", rotulo: "Campo", tipo: "campo" }, { chave: "operacao", rotulo: "Operação", tipo: "selecao", opcoes: [{ valor: "set", rotulo: "Definir" }, { valor: "increment", rotulo: "Somar" }, { valor: "decrement", rotulo: "Subtrair" }, { valor: "append", rotulo: "Acrescentar texto" }, { valor: "clear", rotulo: "Limpar" }] }, { chave: "valor", rotulo: "Valor", tipo: "texto", dica: DICA_VARS }] },
  { tipo: "create_deal", kind: "action", nome: "Criar negócio", descricao: "Coloca o contato no funil", icone: KanbanSquare, cor: "#7c3aed",
    campos: [{ chave: "funil_id", rotulo: "Funil", tipo: "funil" }, { chave: "etapa_id", rotulo: "Etapa", tipo: "etapa" }, { chave: "titulo", rotulo: "Título", tipo: "texto", padrao: "{nome}" }, { chave: "valor", rotulo: "Valor", tipo: "numero" }] },
  { tipo: "move_deal", kind: "action", nome: "Mover no funil", descricao: "Muda o negócio de etapa", icone: KanbanSquare, cor: "#7c3aed", campos: [{ chave: "etapa_id", rotulo: "Etapa", tipo: "etapa" }] },
  { tipo: "create_lead", kind: "action", nome: "Criar lead", descricao: "Cria contato a partir do webhook", icone: UserPlus, cor: "#7c3aed", campos: [{ chave: "telefone", rotulo: "Telefone", tipo: "texto", padrao: "{webhook.telefone}" }, { chave: "nome", rotulo: "Nome", tipo: "texto", padrao: "{webhook.nome}" }] },
  { tipo: "delete_lead", kind: "action", nome: "Apagar lead", descricao: "Apaga o contato (cuidado)", icone: Trash2, cor: "#e5484d", campos: [] },
  { tipo: "generate_pix", kind: "action", nome: "Gerar Pix", descricao: "Manda o código Pix copia e cola", icone: QrCode, cor: "#7c3aed",
    campos: [{ chave: "valor", rotulo: "Valor (R$)", tipo: "texto" }, { chave: "texto", rotulo: "Mensagem antes do código", tipo: "area" }, JANELA] },
  { tipo: "http_request", kind: "action", nome: "Chamar webhook", descricao: "Envia dados para outro sistema", icone: Globe, cor: "#7c3aed",
    campos: [{ chave: "url", rotulo: "Endereço (https://...)", tipo: "texto" }, { chave: "metodo", rotulo: "Método", tipo: "selecao", opcoes: ["POST", "GET", "PUT", "PATCH"].map((v) => ({ valor: v, rotulo: v })) },
      { chave: "headers", rotulo: "Cabeçalhos", tipo: "cabecalhos" }, { chave: "corpo", rotulo: "Corpo (JSON; vazio = dados do contato)", tipo: "area" }] },
  { tipo: "notify_team", kind: "action", nome: "Avisar equipe", descricao: "Notificação para supervisores", icone: Bell, cor: "#7c3aed", campos: [{ chave: "titulo", rotulo: "Título", tipo: "texto" }, { chave: "texto", rotulo: "Texto", tipo: "area" }] },
  { tipo: "delay", kind: "action", nome: "Esperar", descricao: "Aguarda antes do próximo passo", icone: Hourglass, cor: "#0ea5e9",
    campos: [{ chave: "quantidade", rotulo: "Quanto", tipo: "numero", padrao: 1 }, { chave: "unidade", rotulo: "Unidade", tipo: "selecao", opcoes: [{ valor: "minutos", rotulo: "Minutos" }, { valor: "horas", rotulo: "Horas" }, { valor: "dias", rotulo: "Dias" }] },
      { chave: "hora_fixa", rotulo: "E enviar às (opcional)", tipo: "hora", dica: "Ex.: 15:00 — depois de esperar, só continua nesse horário." }, JANELA] },
  { tipo: "wait_reply", kind: "action", nome: "Esperar resposta", descricao: "Continua quando o cliente responder", icone: MessageSquareReply, cor: "#0ea5e9", saidas: "resposta",
    campos: [{ chave: "tempo_limite_horas", rotulo: "Desistir depois de (horas)", tipo: "numero", padrao: 24 }] },
  { tipo: "end", kind: "action", nome: "Fim", descricao: "Encerra o fluxo", icone: Square, cor: "#6b7a80", campos: [] },
];

export const blocoDe = (tipo: string, kind?: string): Bloco | undefined =>
  BLOCOS.find((b) => b.tipo === tipo && (!kind || b.kind === kind)) ?? BLOCOS.find((b) => b.tipo === tipo)
  ?? (tipo === "call_webhook" ? BLOCOS.find((b) => b.tipo === "http_request" && b.kind === "action") : undefined)
  ?? (tipo === "add_tag" ? BLOCOS.find((b) => b.tipo === "add_tags") : tipo === "remove_tag" ? BLOCOS.find((b) => b.tipo === "remove_tags") : undefined)
  ?? (tipo === "next_reply" ? BLOCOS.find((b) => b.tipo === "wait_reply") : undefined);

/** Resumo curto da configuração (aparece dentro do bloco). */
export function resumoBloco(tipo: string, c: any): string {
  if (!c) return "";
  switch (tipo) {
    case "tag_added": case "tag_removed": case "customer_has_tag": return c.tag ? `Tag: ${c.tag}` : "Escolha a tag";
    case "new_message": return c.keyword ? `Contém: ${c.keyword}` : "Qualquer mensagem";
    case "add_tags": case "remove_tags": case "add_tag": case "remove_tag": return (c.tags ?? [c.tag]).filter(Boolean).join(", ") || (c.actionLabel ?? "Escolha as tags");
    case "send_message": return (c.mensagens?.[0]?.texto ?? c.texto ?? c.message ?? "").slice(0, 60) || "Escreva a mensagem";
    case "delay": return `${c.quantidade ?? c.amount ?? 1} ${c.unidade ?? c.unit ?? "minutos"}${c.hora_fixa ? ` · às ${c.hora_fixa}` : ""}`;
    case "ai_message": return (c.instrucao ?? "").slice(0, 60);
    case "schedule": return `${c.hora ?? "09:00"}${c.dias?.length ? ` · ${c.dias.join(", ")}` : " · todos os dias"}`;
    case "call_webhook": return c.actionLabel ? `${c.actionLabel}${c.tags?.length ? `: ${c.tags.join(", ")}` : ""}` : c.url ?? "";
    case "http_request": return c.url ?? "";
    case "set_status": return c.status ?? "";
    case "wait_reply": return `até ${c.tempo_limite_horas ?? 24} h`;
    default: return "";
  }
}
