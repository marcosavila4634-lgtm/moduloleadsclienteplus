-- Vendas (integrações com plataformas via webhook), compras dos contatos,
-- links rastreados e origem dos leads (tracking).

create table crm_integracoes (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  -- hotmart | kiwify | eduzz | guru | hubla | monetizze | shopify | nuvemshop |
  -- woocommerce | mercadopago | asaas | stripe | cliente_plus | webhook
  plataforma text not null,
  nome text not null,
  -- segredo que vai no endereço do webhook
  token text not null unique,
  -- chave de assinatura da plataforma (quando ela assina o webhook), criptografada
  segredo_cripto text,
  ativo boolean not null default true,
  -- ações ao receber venda: {"tag_compra":"CLIENTE","mover_etapa_ganho":true,"funil_id":...}
  config jsonb not null default '{}'::jsonb,
  eventos_recebidos integer not null default 0,
  ultimo_evento_em timestamp with time zone,
  ultimo_erro text,
  created_at timestamp with time zone not null default now()
);

create table crm_integracao_eventos (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  integracao_id uuid not null references crm_integracoes(id) on delete cascade,
  tipo text,
  corpo jsonb,
  processado boolean not null default false,
  erro text,
  created_at timestamp with time zone not null default now()
);
create index crm_integracao_eventos_integracao on crm_integracao_eventos(integracao_id, created_at desc);

create table crm_compras (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  contato_id uuid references crm_contatos(id) on delete set null,
  integracao_id uuid references crm_integracoes(id) on delete set null,
  conversa_id uuid references crm_conversas(id) on delete set null,
  negocio_id uuid references crm_negocios(id) on delete set null,
  plataforma text not null,
  pedido_id text,
  produto text,
  valor numeric(14, 2) not null default 0,
  moeda text not null default 'BRL',
  -- approved | pending | refunded | canceled | chargeback
  status text not null,
  forma_pagamento text,
  -- a IA conversou com o cliente antes da compra (janela de atribuição)
  influenciada_ia boolean not null default false,
  minutos_ate_venda integer,
  -- origem de marketing atribuída (primeiro/último toque)
  origem text,
  dados jsonb,
  externo_id text,
  comprado_em timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  unique (store_id, plataforma, pedido_id)
);
create index crm_compras_contato on crm_compras(contato_id);
create index crm_compras_store on crm_compras(store_id, comprado_em desc);

-- Links rastreados (wa.me com mensagem pronta, UTM).
create table crm_links (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  conexao_id uuid references crm_conexoes(id) on delete set null,
  codigo text not null unique,
  nome text not null,
  -- mensagem inicial; o código vai junto para identificar a origem
  mensagem text,
  -- endereço de destino alternativo (site) em vez do WhatsApp
  destino_url text,
  campanha text,
  origem text,
  midia text,
  cliques integer not null default 0,
  conversas integer not null default 0,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create table crm_link_cliques (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  link_id uuid not null references crm_links(id) on delete cascade,
  ip_hash text,
  user_agent text,
  referer text,
  created_at timestamp with time zone not null default now()
);

-- Anúncios de clique-para-WhatsApp vistos nas conversas (referral da Meta).
create table crm_anuncios (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  ad_id text not null,
  titulo text,
  texto text,
  midia_url text,
  url_origem text,
  campanha text,
  conjunto text,
  gasto numeric(14, 2),
  gasto_atualizado_em timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  unique (store_id, ad_id)
);

-- Arquivos enviados (mídias do chat, base de conhecimento, fotos).
create table crm_arquivos (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  nome text not null,
  mime text,
  tamanho bigint,
  caminho text not null,
  -- privado exige login para abrir; publico abre por link (ex.: mídia enviada ao WhatsApp)
  publico boolean not null default false,
  created_at timestamp with time zone not null default now()
);
