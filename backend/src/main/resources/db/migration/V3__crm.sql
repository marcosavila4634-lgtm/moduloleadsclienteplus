-- CRM: funis, etapas, negócios, histórico, motivos de perda, promessas, decisões da IA.

create table crm_funis (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  nome text not null,
  descricao text,
  cor text not null default '#a053fd',
  icone text not null default 'handshake',
  ativo boolean not null default true,
  -- {"score_weights": {...}, "auto_criar": {...}}  (FunilConfig.java)
  config jsonb not null default '{}'::jsonb,
  ordem integer not null default 0,
  externo_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create index crm_funis_store on crm_funis(store_id);

create table crm_etapas (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  funil_id uuid not null references crm_funis(id) on delete cascade,
  nome text not null,
  cor text not null default '#6366f1',
  ordem integer not null default 0,
  ganho boolean not null default false,
  perda boolean not null default false,
  -- probabilidade padrão da etapa (0-100) para o forecast
  probabilidade integer not null default 0,
  -- regras de entrada/saída automáticas, SLA da etapa (EtapaConfig.java)
  config jsonb not null default '{}'::jsonb,
  externo_id text,
  created_at timestamp with time zone not null default now()
);
create index crm_etapas_funil on crm_etapas(funil_id, ordem);

create table crm_motivos_perda (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create table crm_negocios (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  funil_id uuid not null references crm_funis(id) on delete cascade,
  etapa_id uuid not null references crm_etapas(id) on delete restrict,
  contato_id uuid references crm_contatos(id) on delete set null,
  conversa_id uuid references crm_conversas(id) on delete set null,
  titulo text not null,
  valor numeric(14, 2) not null default 0,
  moeda text not null default 'BRL',
  responsavel_id uuid references crm_usuarios(id) on delete set null,
  -- low | medium | high
  prioridade text not null default 'medium',
  fechamento_previsto date,
  ganho_em timestamp with time zone,
  perdido_em timestamp with time zone,
  motivo_perda text,
  motivo_perda_id uuid references crm_motivos_perda(id) on delete set null,
  origem text,
  tags text[] not null default '{}',
  campos jsonb not null default '{}'::jsonb,
  -- histórico do score, fatores, sentimento, riscos (NegocioMetadados)
  metadados jsonb not null default '{}'::jsonb,
  score_ia integer,
  -- pipeline | best_case | commit | closed | omitted
  categoria_forecast text not null default 'pipeline',
  ultima_atividade_em timestamp with time zone,
  etapa_desde timestamp with time zone not null default now(),
  externo_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create index crm_negocios_funil on crm_negocios(store_id, funil_id, etapa_id);
create index crm_negocios_contato on crm_negocios(contato_id);
create unique index crm_negocios_externo on crm_negocios(store_id, externo_id) where externo_id is not null;

create table crm_negocio_eventos (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  negocio_id uuid not null references crm_negocios(id) on delete cascade,
  -- criado | etapa | valor | score | nota | ganho | perdido | responsavel | reaberto
  tipo text not null,
  de text,
  para text,
  -- usuario | ia | automacao | sistema
  autor_tipo text not null default 'sistema',
  autor_id uuid,
  texto text,
  dados jsonb,
  created_at timestamp with time zone not null default now()
);
create index crm_negocio_eventos_negocio on crm_negocio_eventos(negocio_id, created_at);

-- Promessas do cliente detectadas pela IA ("pago amanhã", "te chamo segunda").
create table crm_promessas (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  conversa_id uuid references crm_conversas(id) on delete cascade,
  negocio_id uuid references crm_negocios(id) on delete cascade,
  contato_id uuid references crm_contatos(id) on delete cascade,
  descricao text not null,
  -- cliente | empresa (quem prometeu)
  quem text not null default 'cliente',
  vence_em timestamp with time zone,
  -- pendente | cumprida | vencida | cancelada
  status text not null default 'pendente',
  lembrete_enviado_em timestamp with time zone,
  created_at timestamp with time zone not null default now()
);
create index crm_promessas_store on crm_promessas(store_id, status, vence_em);

-- Tudo que a IA decidiu sozinha (mover etapa, marcar tag, transferir...), com motivo.
create table crm_decisoes (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  conversa_id uuid references crm_conversas(id) on delete cascade,
  negocio_id uuid references crm_negocios(id) on delete cascade,
  agente_id uuid,
  acao text not null,
  motivo text,
  dados jsonb,
  -- aplicada | revertida | sugerida
  status text not null default 'aplicada',
  revisada_por uuid references crm_usuarios(id) on delete set null,
  created_at timestamp with time zone not null default now()
);
create index crm_decisoes_store on crm_decisoes(store_id, created_at desc);
