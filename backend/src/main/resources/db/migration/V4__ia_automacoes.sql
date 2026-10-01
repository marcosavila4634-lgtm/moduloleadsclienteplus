-- Agentes de IA, base de conhecimento, uso da IA, automações e execuções.

create table crm_agentes (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  nome text not null,
  -- vendas | sdr | suporte | atendimento | pos_venda | personalizado
  papel text not null default 'vendas',
  descricao text,
  cor text not null default '#a053fd',
  empresa text,
  -- active | paused
  status text not null default 'active',
  modelo text not null default 'claude-opus-5-5',
  -- todas as configurações de comportamento (AgenteConfig.java)
  config jsonb not null default '{}'::jsonb,
  -- versão anterior das instruções (para desfazer)
  instrucoes_anteriores text,
  instrucoes_anteriores_em timestamp with time zone,
  -- limite de gasto por mês em centavos (null = sem limite)
  limite_gasto_centavos integer,
  externo_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create index crm_agentes_store on crm_agentes(store_id);

alter table crm_conexoes add constraint crm_conexoes_agente foreign key (agente_id) references crm_agentes(id) on delete set null;
alter table crm_conversas add constraint crm_conversas_agente foreign key (agente_id) references crm_agentes(id) on delete set null;

-- Conexões em que o agente atende.
create table crm_agente_conexoes (
  agente_id uuid not null references crm_agentes(id) on delete cascade,
  conexao_id uuid not null references crm_conexoes(id) on delete cascade,
  primary key (agente_id, conexao_id)
);

create table crm_agente_conhecimento (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  agente_id uuid not null references crm_agentes(id) on delete cascade,
  -- texto | faq | produto | url | arquivo | midia
  tipo text not null default 'texto',
  titulo text,
  conteudo text,
  pergunta text,
  arquivo_url text,
  arquivo_mime text,
  -- mídia que a IA pode enviar ao cliente (ex.: catálogo), com quando usar
  quando_enviar text,
  ativo boolean not null default true,
  ordem integer not null default 0,
  externo_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create index crm_agente_conhecimento_agente on crm_agente_conhecimento(agente_id, ordem);

-- Mídias de follow-up (enviadas junto com a retomada).
create table crm_agente_midias_followup (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  agente_id uuid not null references crm_agentes(id) on delete cascade,
  etapa integer not null default 1,
  url text not null,
  mime text,
  legenda text,
  created_at timestamp with time zone not null default now()
);

-- Cada chamada à IA (para relatório de custo e limite de gasto).
create table crm_ia_uso (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  agente_id uuid references crm_agentes(id) on delete set null,
  conversa_id uuid references crm_conversas(id) on delete set null,
  -- resposta | followup | score | resumo | memoria | transcricao | proposta | coach | roleplay | teste
  tipo text not null,
  modelo text not null,
  tokens_entrada integer not null default 0,
  tokens_saida integer not null default 0,
  tokens_cache_leitura integer not null default 0,
  tokens_cache_escrita integer not null default 0,
  custo_micro_usd bigint not null default 0,
  duracao_ms integer,
  erro text,
  created_at timestamp with time zone not null default now()
);
create index crm_ia_uso_store on crm_ia_uso(store_id, created_at desc);

create table crm_automacao_pastas (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  nome text not null,
  created_at timestamp with time zone not null default now()
);

create table crm_automacoes (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  pasta_id uuid references crm_automacao_pastas(id) on delete set null,
  nome text not null,
  descricao text,
  -- active | inactive | draft
  status text not null default 'draft',
  gatilho_tipo text,
  gatilho_config jsonb not null default '{}'::jsonb,
  -- {"nodes":[{id,kind,type,name,config,position}], "edges":[{id,source,target,sourceHandle,label}]}
  grafo jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  -- não disparar de novo para o mesmo contato por N horas (0 = sempre)
  intervalo_repeticao_horas integer not null default 0,
  execucoes integer not null default 0,
  ultima_execucao_em timestamp with time zone,
  externo_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create index crm_automacoes_gatilho on crm_automacoes(store_id, status, gatilho_tipo);

create table crm_automacao_execucoes (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  automacao_id uuid not null references crm_automacoes(id) on delete cascade,
  contato_id uuid references crm_contatos(id) on delete cascade,
  conversa_id uuid references crm_conversas(id) on delete cascade,
  -- running | waiting | waiting_reply | done | error | canceled
  status text not null default 'running',
  no_atual text,
  retomar_em timestamp with time zone,
  -- variáveis do fluxo (mensagem que disparou, respostas, resultado de webhook...)
  contexto jsonb not null default '{}'::jsonb,
  -- passos executados [{no, tipo, ok, erro, em}]
  passos jsonb not null default '[]'::jsonb,
  erro text,
  created_at timestamp with time zone not null default now(),
  finalizada_em timestamp with time zone
);
create index crm_automacao_execucoes_retomar on crm_automacao_execucoes(retomar_em) where status = 'waiting';
create index crm_automacao_execucoes_resposta on crm_automacao_execucoes(conversa_id) where status = 'waiting_reply';
create index crm_automacao_execucoes_automacao on crm_automacao_execucoes(automacao_id, created_at desc);
