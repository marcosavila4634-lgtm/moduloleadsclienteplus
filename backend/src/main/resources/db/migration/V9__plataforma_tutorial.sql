-- Área de administração da plataforma (dono do sistema, que vende para as lojas)
-- e o tutorial guiado (passo a passo com botão "Próximo"), editável só pelo admin.

alter table crm_usuarios add column admin_plataforma boolean not null default false;

alter table crm_lojas add column status text not null default 'ativa' check (status in ('ativa', 'bloqueada', 'teste'));
alter table crm_lojas add column bloqueio_motivo text;
-- limites do plano da loja (null = sem limite): contatos, usuarios, agentes, conexoes, automacoes
alter table crm_lojas add column limites jsonb not null default '{}'::jsonb;
alter table crm_lojas add column plano text;

-- Configurações gerais da plataforma (uma linha): nome, cores, textos, padrões.
create table crm_plataforma (
  id integer primary key default 1 check (id = 1),
  config jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone not null default now()
);
insert into crm_plataforma (id) values (1);

-- Tutorial guiado. Cada passo aparece numa tela (rota) e pode destacar um
-- elemento (alvo = valor do atributo data-tour no painel).
create table crm_tutorial_passos (
  id uuid default gen_random_uuid() primary key,
  -- trilha: "inicio" (primeiro acesso) ou por assunto (conversas, crm, agentes...)
  trilha text not null default 'inicio',
  ordem integer not null default 0,
  titulo text not null,
  texto text not null,
  -- tela em que o passo aparece (ex.: /inbox); vazio = qualquer tela
  rota text,
  -- elemento destacado (data-tour="..."); vazio = balão no centro
  alvo text,
  -- top | bottom | left | right | center
  posicao text not null default 'bottom',
  imagem_url text,
  video_url text,
  -- emoji/ícone do passo
  icone text,
  -- papéis que veem o passo (vazio = todos)
  papeis text[] not null default '{}',
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create index crm_tutorial_passos_trilha on crm_tutorial_passos(trilha, ordem);

create table crm_tutorial_trilhas (
  chave text primary key,
  nome text not null,
  descricao text,
  icone text,
  ordem integer not null default 0,
  ativo boolean not null default true
);

-- Progresso de cada usuário (em qual passo parou, quais trilhas concluiu).
create table crm_tutorial_progresso (
  usuario_id uuid not null references crm_usuarios(id) on delete cascade,
  trilha text not null,
  passo integer not null default 0,
  concluido_em timestamp with time zone,
  pulou boolean not null default false,
  updated_at timestamp with time zone not null default now(),
  primary key (usuario_id, trilha)
);
