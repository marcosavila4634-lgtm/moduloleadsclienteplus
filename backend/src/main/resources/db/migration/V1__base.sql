-- Gestão Plus CRM — base: lojas, usuários, equipe, setores, notificações.
-- Todas as tabelas do módulo têm prefixo crm_ e store_id (a loja dona dos dados).
-- No Cliente Plus: store_id = stores.id. RLS (Supabase), quando for para lá:
--   using (store_id in (select store_id from crm_membros where usuario_id = auth.uid()))

create extension if not exists pgcrypto;

create table crm_lojas (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  slug text not null unique,
  fuso text not null default 'America/Sao_Paulo',
  -- horário comercial: {"seg":[["09:00","18:00"]], ...}
  horario_comercial jsonb not null default '{}'::jsonb,
  -- preferências gerais: assinatura do atendente, distribuição de leads, SLA,
  -- relatório semanal, alertas de inatividade etc. (formato em LojaConfig.java)
  config jsonb not null default '{}'::jsonb,
  cliente_plus_store_id uuid,
  externo_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table crm_usuarios (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  email text not null unique,
  senha_hash text,
  -- usuário do Supabase Auth do Cliente Plus (login integrado)
  supabase_user_id uuid unique,
  foto_url text,
  totp_segredo text,
  totp_ativo boolean not null default false,
  ativo boolean not null default true,
  externo_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table crm_setores (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  nome text not null,
  cor text not null default '#a053fd',
  descricao text,
  externo_id text,
  created_at timestamp with time zone not null default now()
);
create index crm_setores_store on crm_setores(store_id);

-- Quem pode entrar em cada loja e com qual papel.
create table crm_membros (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  usuario_id uuid not null references crm_usuarios(id) on delete cascade,
  -- dono | admin | supervisor | atendente
  papel text not null default 'atendente' check (papel in ('dono', 'admin', 'supervisor', 'atendente')),
  setor_id uuid references crm_setores(id) on delete set null,
  -- recebe leads na distribuição automática (rodízio)
  recebe_leads boolean not null default true,
  -- limite de conversas abertas ao mesmo tempo (0 = sem limite)
  limite_conversas integer not null default 0,
  cargo text,
  gestor_id uuid references crm_usuarios(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  unique (store_id, usuario_id)
);
create index crm_membros_usuario on crm_membros(usuario_id);

create table crm_convites (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  email text not null,
  nome text,
  papel text not null default 'atendente',
  setor_id uuid references crm_setores(id) on delete set null,
  token text not null unique,
  expira_em timestamp with time zone not null,
  aceito_em timestamp with time zone,
  criado_por uuid references crm_usuarios(id) on delete set null,
  created_at timestamp with time zone not null default now()
);

create table crm_metas (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  usuario_id uuid references crm_usuarios(id) on delete cascade,
  -- vendas_valor | vendas_qtd | conversas | negocios_ganhos
  tipo text not null,
  valor numeric(14, 2) not null,
  -- mês de referência (primeiro dia)
  mes date not null,
  created_at timestamp with time zone not null default now(),
  unique (store_id, usuario_id, tipo, mes)
);

create table crm_notificacoes (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  usuario_id uuid references crm_usuarios(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  texto text,
  link text,
  lida_em timestamp with time zone,
  created_at timestamp with time zone not null default now()
);
create index crm_notificacoes_usuario on crm_notificacoes(store_id, usuario_id, created_at desc);

-- Histórico de ações importantes (quem fez o quê), para auditoria.
create table crm_auditoria (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  usuario_id uuid references crm_usuarios(id) on delete set null,
  acao text not null,
  entidade text,
  entidade_id text,
  dados jsonb,
  ip text,
  created_at timestamp with time zone not null default now()
);
create index crm_auditoria_store on crm_auditoria(store_id, created_at desc);
