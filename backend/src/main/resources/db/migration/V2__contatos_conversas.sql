-- Contatos, tags, campos personalizados, conexões (canais), conversas e mensagens.

create table crm_conexoes (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  nome text not null,
  -- whatsapp_cloud | instagram | email | webchat
  tipo text not null,
  -- conectado | desconectado | erro | pendente
  status text not null default 'pendente',
  telefone text,
  -- WhatsApp Cloud API
  phone_number_id text,
  waba_id text,
  -- Instagram
  instagram_id text,
  instagram_usuario text,
  pagina_id text,
  -- credenciais criptografadas (AES-GCM, chave em CRM_CHAVE_CRIPTOGRAFIA)
  credenciais_cripto text,
  -- agente de IA padrão desta conexão
  agente_id uuid,
  config jsonb not null default '{}'::jsonb,
  ultimo_erro text,
  ultima_mensagem_em timestamp with time zone,
  externo_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create index crm_conexoes_store on crm_conexoes(store_id);
create unique index crm_conexoes_phone on crm_conexoes(phone_number_id) where phone_number_id is not null;
create unique index crm_conexoes_instagram on crm_conexoes(instagram_id) where instagram_id is not null;

create table crm_tags (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  nome text not null,
  cor text not null default '#a053fd',
  descricao text,
  created_at timestamp with time zone not null default now(),
  unique (store_id, nome)
);

create table crm_campos (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  -- contato | negocio
  entidade text not null default 'contato',
  chave text not null,
  nome text not null,
  -- texto | numero | data | selecao | multipla | booleano | telefone | email | url
  tipo text not null default 'texto',
  opcoes jsonb not null default '[]'::jsonb,
  grupo text,
  ordem integer not null default 0,
  obrigatorio boolean not null default false,
  created_at timestamp with time zone not null default now(),
  unique (store_id, entidade, chave)
);

create table crm_contatos (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  telefone text,
  nome text,
  email text,
  notas text,
  -- whatsapp | instagram | email | webchat | importacao | manual | integracao | nome da conexão
  origem text,
  conexao_id uuid references crm_conexoes(id) on delete set null,
  remote_jid text,
  foto_url text,
  instagram_id text,
  instagram_usuario text,
  instagram_dados jsonb,
  instagram_enriquecido_em timestamp with time zone,
  tags text[] not null default '{}',
  -- valores dos campos personalizados {"chave": valor}
  campos jsonb not null default '{}'::jsonb,
  total_mensagens integer not null default 0,
  primeiro_contato_em timestamp with time zone,
  ultimo_contato_em timestamp with time zone,
  -- não recebe disparos/automações de marketing
  opt_out boolean not null default false,
  bloqueado boolean not null default false,
  aniversario date,
  -- cliente correspondente no Cliente Plus (quando integrado)
  cliente_plus_cliente_id uuid,
  externo_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create unique index crm_contatos_telefone on crm_contatos(store_id, telefone) where telefone is not null;
create unique index crm_contatos_instagram on crm_contatos(store_id, instagram_id) where instagram_id is not null;
create index crm_contatos_store_ultimo on crm_contatos(store_id, ultimo_contato_em desc nulls last);
create index crm_contatos_tags on crm_contatos using gin(tags);
create index crm_contatos_busca on crm_contatos(store_id, lower(coalesce(nome, '')));
create unique index crm_contatos_externo on crm_contatos(store_id, externo_id) where externo_id is not null;

-- O que a IA aprendeu sobre o contato (preferências, sentimento, fatos).
create table crm_memorias (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  contato_id uuid not null references crm_contatos(id) on delete cascade,
  fato text not null,
  -- preferencia | sentimento | pessoal | compra | objecao | outro
  categoria text not null default 'outro',
  -- ia | humano | importacao
  fonte text not null default 'ia',
  confianca numeric(3, 2) not null default 0.8,
  externo_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create index crm_memorias_contato on crm_memorias(contato_id);

create table crm_conversas (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  contato_id uuid not null references crm_contatos(id) on delete cascade,
  conexao_id uuid references crm_conexoes(id) on delete set null,
  canal text not null default 'whatsapp',
  -- new | open | pending | resolved | closed
  status text not null default 'new',
  -- a IA responde nesta conversa
  ia_ativa boolean not null default true,
  agente_id uuid,
  -- ai | human
  atribuida_a text not null default 'ai',
  -- ai | queue | human
  handoff_status text not null default 'ai',
  handoff_motivo text,
  handoff_em timestamp with time zone,
  humano_id uuid references crm_usuarios(id) on delete set null,
  humano_encerrou_em timestamp with time zone,
  setor_id uuid references crm_setores(id) on delete set null,
  nao_lidas integer not null default 0,
  marcada_lida_manual boolean not null default false,
  ultima_mensagem text,
  ultima_mensagem_em timestamp with time zone,
  ultima_do_cliente_em timestamp with time zone,
  -- customer | ai | agent | system
  ultimo_remetente text,
  aguardando_resposta boolean not null default false,
  tags text[] not null default '{}',
  -- origem do lead (tracking): {"canal":"meta_ads","ad_id":...,"link_id":...}
  origem text,
  origem_dados jsonb,
  sla_prioridade text not null default 'medium',
  -- ok | warning | breached
  sla_status text not null default 'ok',
  sla_violado_em timestamp with time zone,
  primeira_resposta_em timestamp with time zone,
  primeira_resposta_ms bigint,
  resolvida_em timestamp with time zone,
  resolucao_ms bigint,
  alerta_inatividade boolean not null default false,
  resumo text,
  resumo_em timestamp with time zone,
  -- controle de follow-up automático da IA
  followups_enviados integer not null default 0,
  proximo_followup_em timestamp with time zone,
  -- assunto (canal e-mail)
  assunto text,
  -- whatsapp_cloud | importado
  provedor text,
  coexistencia boolean not null default false,
  arquivada_em timestamp with time zone,
  externo_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create index crm_conversas_lista on crm_conversas(store_id, ultima_mensagem_em desc nulls last);
create index crm_conversas_contato on crm_conversas(contato_id);
create index crm_conversas_followup on crm_conversas(proximo_followup_em) where proximo_followup_em is not null;
create unique index crm_conversas_externo on crm_conversas(store_id, externo_id) where externo_id is not null;

create table crm_mensagens (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  conversa_id uuid not null references crm_conversas(id) on delete cascade,
  conteudo text,
  -- customer | ai | agent | system
  remetente text not null,
  remetente_nome text,
  usuario_id uuid references crm_usuarios(id) on delete set null,
  agente_id uuid,
  -- text | image | audio | video | document | sticker | location | contacts | template | interactive | reaction | note
  tipo text not null default 'text',
  midia_url text,
  midia_mime text,
  arquivo_nome text,
  legenda text,
  transcricao text,
  metadados jsonb not null default '{}'::jsonb,
  -- pending | sent | delivered | read | failed
  status_entrega text,
  erro_entrega text,
  -- all | internal (nota interna, o cliente não vê)
  visibilidade text not null default 'all',
  -- id da mensagem no WhatsApp/Instagram (para status e respostas)
  canal_mensagem_id text,
  enviada_em timestamp with time zone not null default now(),
  externo_id text,
  created_at timestamp with time zone not null default now()
);
create index crm_mensagens_conversa on crm_mensagens(conversa_id, enviada_em);
create unique index crm_mensagens_canal on crm_mensagens(store_id, canal_mensagem_id) where canal_mensagem_id is not null;
create unique index crm_mensagens_externo on crm_mensagens(store_id, externo_id) where externo_id is not null;

-- Mensagens prontas (atalhos "/" no inbox).
create table crm_respostas_rapidas (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  atalho text not null,
  texto text not null,
  midia_url text,
  created_at timestamp with time zone not null default now(),
  unique (store_id, atalho)
);
