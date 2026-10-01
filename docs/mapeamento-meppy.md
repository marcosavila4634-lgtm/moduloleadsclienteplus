# Mapeamento do Meppy AI (30/09/2026)

Levantado com o login do dono (conta "Embaixador das Marcas", plano Starter),
só lendo telas e a API. Prints e textos de cada tela ficaram na pasta
temporária da sessão; a cópia dos dados está em `dados-meppy/` (NÃO vai para
o GitHub: tem dados pessoais de clientes).

## Tecnologia deles (para referência)

- Front: React SPA (Vite), app.meppyai.com. API própria em api.meppyai.com
  (`/api/...`), login por cookie de sessão (`/auth/get-session`).
- WhatsApp: API oficial da Meta (Cloud API) em modo **coexistência** (o número
  continua no app WhatsApp Business do celular), também aceita Evolution/Z-API.
- Multiempresa: tudo tem `organizationId` (tenant). "Holding" = várias empresas.

## Menu e telas

| Grupo | Tela | O que faz |
|---|---|---|
| — | Dashboard | Conversas, autonomia da IA, 1ª resposta, negócios abertos, contatos, funil, conversas/dia, quem respondeu (IA × equipe), desempenho por agente, esperando agora, saúde da carteira |
| Atendimento | Conversas (inbox) | Omnichannel (WhatsApp, Instagram, e-mail). Filtros: todas, não lidas, IA, humano, fila, canal, tag, conexão. Resumo da IA, origem (tracking), transferência IA→humano, SLA, alerta de inatividade |
| Atendimento | CRM | Funis (pipelines) e etapas; Kanban, Lista, Dashboard, SLA, Decisões, Promessas. Score de IA por negócio (pesos configuráveis), previsão, tendência, dias na etapa, risco, "quentes", "parados +7d", leads sem dono e distribuição |
| Atendimento | Contatos | Lista (4.757), importar/exportar, tags, origem, campos personalizados, memórias da IA por contato, compras |
| Atendimento | Agenda | Calendário (dia/semana/mês), tipos de evento, colaboradores, bloqueios, disponibilidade, comissões, anamnese/consentimento, prontuário, Google Agenda, link público `/agendar/<slug>` |
| Automação | Agentes de IA | Agentes por tipo (vendas, SDR, suporte, atendimento, pós-venda, personalizado): identidade, instruções, conhecimento (base de conhecimento), comportamento, avançado, conexões, métricas |
| Automação | Automações | Editor visual de fluxos (nós + ligações), pastas, execuções (guardadas 6 meses) |
| Crescimento | Central de Vendas | Vendas vindas das integrações, receita via IA, atribuição, funil de conversão, top produtos |
| Crescimento | Revenue Intelligence | Forecast 30/60/90, waterfall, inteligência, coach, roleplay |
| Crescimento | Propostas | Propostas comerciais + modelos, "Gerar com IA", link público `/p/<token>` com aceite |
| Crescimento | Trackeamento (beta) | Origem de cada conversa/venda (Meta Ads clique-para-WhatsApp, links rastreados), campanhas, jornadas, saúde |
| Infraestrutura | Conexões | WhatsApp oficial (Cloud API / cadastro incorporado da Meta) e não oficial (Evolution QR code) |
| Infraestrutura | Disparos | Envio em massa (WhatsApp) |
| Infraestrutura | Painel Meta | Templates HSM do WhatsApp (criar, aprovados/pendentes/rejeitados) |
| Infraestrutura | Instagram (beta) | DMs no inbox, IA nas DMs, boas-vindas, respostas a stories, fluxos do Instagram |
| Infraestrutura | Marketplace | Hotmart, Kiwify, Eduzz, Guru, Hubla, Monetizze, Shopify, Nuvemshop, WooCommerce, Mercado Pago, Asaas, Stripe... (webhooks de vendas) |
| Infraestrutura | Relatórios | Conversas, mensagens, tempo médio, autonomia; por agente e conexão; CSV; relatório semanal via WhatsApp |
| Configurações | Configurações | Plano/créditos de IA, equipe e permissões, setores, 2FA, assinatura do atendente, e mais |
| — | Equipe | Organograma, metas, leaderboard, supervisão |
| — | Perfil, Tutoriais, Faturamento (plano do próprio Meppy) | |
| "Em breve" (não existe de verdade) | E-mail marketing, Conteúdo, Concorrentes, Anúncios, Stories, Reels, Relatórios HUB, Créditos HUB, Calendário HUB | |

## Agente de IA — configurações (campos da API)

nome, tipo (`vendas`...), empresa, gênero (muda o estilo), gírias (lista +
texto livre), descrição, cor, persona/instruções (`customInstructions`, guarda
a versão anterior), personalidade, objetivo, tom, emojis, capitalização,
mensagem de saudação, temperatura, máx. tokens, treinamento (texto e P&R),
base de conhecimento (itens), horário comercial, **transferência para humano**
(sem resposta, frustração, pergunta repetida N vezes, modo de distribuição,
regras em texto), reabrir janela de 24 h com template, estilo de voz e
exemplos, visão (lê imagens), agenda nativa/Calendly, **follow-up** (liga,
atrasos em horas, máximo, janela de horário, instrução, mídia), estilo de
venda, **dividir mensagens** (máx. blocos, máx. caracteres, estilo), promessas
(cancela ao responder), limite de gasto, conexões permitidas. Só confirma
venda com comprovante. Transcreve áudio e mede sentimento.

## Automações — catálogo

Formato: grafo com `nodes` (kind trigger/condition/action, type, config,
position) e `edges` (source, target, sourceHandle yes/no).

- **Gatilhos:** nova mensagem (canal, palavra-chave, conexão), cliente
  interagir, botão clicado, tag adicionada, tag removida, mudança de status,
  e-mail recebido, agendamento, webhook recebido, disparo API, iniciar
  conversa (proativo), próxima resposta.
- **Condições:** tem tag, canal é, status é, mensagem contém, lead existente,
  switch, randomizador, fallback; operadores igual, diferente, contém, não
  contém, começa/termina com, regex, vazio/não vazio, verdadeiro/falso, tem
  chave.
- **Ações:** enviar mensagem (texto, imagem, áudio, arquivo), lista
  interativa, template HSM, enviar Instagram, enviar e-mail, bloco de IA,
  atribuir agente, adicionar/remover tags, alterar status, editar campos /
  operações de campos, criar lead, criar deal, deletar lead, gerar PIX,
  chamar webhook / requisição HTTP, JavaScript, espera (delay).

## CRM — score de IA

Pesos por funil (`settings.score_weights`): base 30, urgência alta +18 / média
+8, resposta rápida +12 / moderada +6, engajamento alto +10 / moderado +5,
valor confirmado +15, compra confirmada +15, interesse +5, mídia enviada +5,
perfil completo +5, concorrente −10, objeção de preço −8, "vou pensar" −15,
objeção repetida −12, sumiço leve −12 / grave −25. Negócio guarda histórico do
score, fatores, sentimento do último áudio, tendência, probabilidade, data
estimada, categoria de forecast, risco. Etapas com ganho/perda e motivos de
perda. Movimento automático de etapa (`last_auto_move`).

## Dados que existem na conta

4.757 contatos, 965 conversas (WhatsApp, inclui histórico importado pela
coexistência), 1 funil "Vendas" (Novo Lead, Em Contato, Qualificado,
Fechado, Perdido) com 47 negócios, 1 agente ("André", vendas) com 15 itens de
conhecimento, 8 automações (por tag e nova mensagem), 2 usuários, 1 conexão
WhatsApp Cloud API.
