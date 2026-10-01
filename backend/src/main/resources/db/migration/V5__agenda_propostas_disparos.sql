-- Agenda (serviços, profissionais, horários, lembretes, página pública),
-- formulários (anamnese/consentimento/modelos de nota), prontuário,
-- propostas comerciais, templates do WhatsApp e disparos em massa.

create table crm_agenda_config (
  store_id uuid primary key references crm_lojas(id) on delete cascade,
  fuso text not null default 'America/Sao_Paulo',
  pagina_ativa boolean not null default false,
  pagina_slug text unique,
  pagina_titulo text,
  pagina_descricao text,
  lembrete_24h boolean not null default true,
  lembrete_2h boolean not null default true,
  mensagem_24h text not null default 'Olá {nome}! Lembrando que você tem {servico} amanhã às {hora}. Caso precise cancelar ou reagendar, responda esta mensagem.',
  mensagem_2h text not null default 'Olá {nome}! Seu {servico} é daqui a 2 horas, às {hora}. Te esperamos!',
  antecedencia_minima_horas integer not null default 2,
  dias_maximos_frente integer not null default 30,
  -- general (agenda única) | per_collaborator
  modo text not null default 'general',
  -- espelhar eventos num Google Agenda (iCal público/privado)
  google_ical_url text,
  updated_at timestamp with time zone not null default now()
);

create table crm_agenda_categorias (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  nome text not null,
  cor text not null default '#a053fd',
  created_at timestamp with time zone not null default now()
);

create table crm_agenda_colaboradores (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  usuario_id uuid references crm_usuarios(id) on delete set null,
  nome text not null,
  email text,
  telefone text,
  cor text not null default '#a053fd',
  foto_url text,
  -- % de comissão padrão sobre os atendimentos pagos
  comissao_percentual numeric(5, 2) not null default 0,
  -- {"seg":[["09:00","18:00"]], ...}; vazio = usa o horário da loja
  horarios jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create table crm_agenda_tipos (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  categoria_id uuid references crm_agenda_categorias(id) on delete set null,
  nome text not null,
  descricao text,
  duracao_min integer not null default 60,
  intervalo_min integer not null default 0,
  preco numeric(12, 2) not null default 0,
  cor text not null default '#a053fd',
  -- presencial | online | telefone
  local_tipo text not null default 'presencial',
  local text,
  ativo boolean not null default true,
  -- aparece na página pública de agendamento
  publico boolean not null default true,
  -- a IA pode agendar este serviço
  ia_pode_agendar boolean not null default true,
  -- formulário enviado ao agendar (anamnese/consentimento)
  formulario_id uuid,
  colaboradores uuid[] not null default '{}',
  created_at timestamp with time zone not null default now()
);

create table crm_agenda_bloqueios (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  colaborador_id uuid references crm_agenda_colaboradores(id) on delete cascade,
  inicio timestamp with time zone not null,
  fim timestamp with time zone not null,
  motivo text,
  created_at timestamp with time zone not null default now()
);

create table crm_agenda_eventos (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  tipo_id uuid references crm_agenda_tipos(id) on delete set null,
  colaborador_id uuid references crm_agenda_colaboradores(id) on delete set null,
  contato_id uuid references crm_contatos(id) on delete set null,
  conversa_id uuid references crm_conversas(id) on delete set null,
  negocio_id uuid references crm_negocios(id) on delete set null,
  titulo text not null,
  descricao text,
  inicio timestamp with time zone not null,
  fim timestamp with time zone not null,
  -- scheduled | confirmed | done | canceled | no_show
  status text not null default 'scheduled',
  valor numeric(12, 2) not null default 0,
  pago boolean not null default false,
  forma_pagamento text,
  comissao_percentual numeric(5, 2),
  comissao_paga_em timestamp with time zone,
  -- manual | ia | publico | automacao
  origem text not null default 'manual',
  notas text,
  lembrete_24h_em timestamp with time zone,
  lembrete_2h_em timestamp with time zone,
  cancelado_motivo text,
  externo_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create index crm_agenda_eventos_periodo on crm_agenda_eventos(store_id, inicio);

-- Modelos de anamnese, termo de consentimento e modelos de nota do atendimento.
create table crm_formularios (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  -- anamnese | consentimento | nota
  tipo text not null,
  nome text not null,
  -- anamnese: [{id, rotulo, tipo, opcoes, obrigatorio}]; consentimento/nota: {"texto": "..."}
  conteudo jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create table crm_formulario_respostas (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  formulario_id uuid not null references crm_formularios(id) on delete cascade,
  contato_id uuid references crm_contatos(id) on delete cascade,
  evento_id uuid references crm_agenda_eventos(id) on delete set null,
  token text not null unique,
  respostas jsonb,
  assinatura_nome text,
  assinado_em timestamp with time zone,
  ip text,
  created_at timestamp with time zone not null default now()
);

-- Prontuário / histórico do atendimento (texto e fotos antes/depois).
create table crm_prontuarios (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  contato_id uuid not null references crm_contatos(id) on delete cascade,
  evento_id uuid references crm_agenda_eventos(id) on delete set null,
  colaborador_id uuid references crm_agenda_colaboradores(id) on delete set null,
  texto text,
  fotos jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table crm_proposta_modelos (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  nome text not null,
  -- {"introducao","itens":[{nome,descricao,quantidade,valor}],"condicoes","validade_dias","cores"}
  conteudo jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table crm_propostas (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  contato_id uuid references crm_contatos(id) on delete set null,
  negocio_id uuid references crm_negocios(id) on delete set null,
  modelo_id uuid references crm_proposta_modelos(id) on delete set null,
  titulo text not null,
  conteudo jsonb not null default '{}'::jsonb,
  desconto numeric(12, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  validade date,
  -- draft | sent | viewed | accepted | rejected | expired
  status text not null default 'draft',
  token text not null unique,
  enviada_em timestamp with time zone,
  vista_em timestamp with time zone,
  visualizacoes integer not null default 0,
  respondida_em timestamp with time zone,
  resposta_nome text,
  resposta_comentario text,
  criada_por uuid references crm_usuarios(id) on delete set null,
  gerada_por_ia boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table crm_templates_whatsapp (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  conexao_id uuid not null references crm_conexoes(id) on delete cascade,
  meta_id text,
  nome text not null,
  idioma text not null default 'pt_BR',
  -- MARKETING | UTILITY | AUTHENTICATION
  categoria text not null default 'MARKETING',
  -- APPROVED | PENDING | REJECTED | PAUSED | DISABLED
  status text not null default 'PENDING',
  motivo_rejeicao text,
  componentes jsonb not null default '[]'::jsonb,
  enviados integer not null default 0,
  entregues integer not null default 0,
  lidos integer not null default 0,
  respondidos integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (conexao_id, nome, idioma)
);

create table crm_disparos (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  conexao_id uuid not null references crm_conexoes(id) on delete cascade,
  nome text not null,
  -- template (fora da janela de 24 h) | texto (só dentro da janela)
  modo text not null default 'template',
  template_id uuid references crm_templates_whatsapp(id) on delete set null,
  -- valores das variáveis: {"1": "{nome}", "2": "texto fixo"}
  variaveis jsonb not null default '{}'::jsonb,
  texto text,
  midia_url text,
  -- filtro do público: {"tags":[], "sem_tags":[], "etapas":[], "origem":..., "contatos":[ids]}
  publico jsonb not null default '{}'::jsonb,
  -- draft | scheduled | running | paused | done | canceled
  status text not null default 'draft',
  agendado_para timestamp with time zone,
  intervalo_segundos integer not null default 5,
  -- a IA assume quem responder
  ia_responde boolean not null default true,
  tag_ao_responder text,
  total integer not null default 0,
  enviados integer not null default 0,
  entregues integer not null default 0,
  lidos integer not null default 0,
  respondidos integer not null default 0,
  falhas integer not null default 0,
  iniciado_em timestamp with time zone,
  concluido_em timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table crm_disparo_envios (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  disparo_id uuid not null references crm_disparos(id) on delete cascade,
  contato_id uuid not null references crm_contatos(id) on delete cascade,
  -- pending | sent | delivered | read | replied | failed | skipped
  status text not null default 'pending',
  canal_mensagem_id text,
  erro text,
  enviado_em timestamp with time zone,
  unique (disparo_id, contato_id)
);
create index crm_disparo_envios_pendentes on crm_disparo_envios(disparo_id, status);
