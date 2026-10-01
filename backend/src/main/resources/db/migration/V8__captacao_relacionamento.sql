-- Captação e relacionamento: comentário no Instagram → Direct, formulários de
-- anúncio da Meta (Lead Ads), lista de espera de estoque, recompra, aniversário
-- e avisos no celular da equipe (app/PWA com push).

-- Comentou a palavra no post/reels → responde o comentário e manda Direct.
create table crm_instagram_gatilhos (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  conexao_id uuid not null references crm_conexoes(id) on delete cascade,
  nome text not null,
  -- vazio = qualquer post; senão, ids das publicações
  midias text[] not null default '{}',
  -- palavras que disparam (vazio = qualquer comentário)
  palavras text[] not null default '{}',
  resposta_comentario text,
  mensagem_direct text not null,
  -- botão/link opcional no Direct
  link_url text,
  link_texto text,
  tag text,
  -- a IA assume a conversa depois do Direct
  ia_assume boolean not null default true,
  ativo boolean not null default true,
  disparos integer not null default 0,
  created_at timestamp with time zone not null default now()
);

create table crm_instagram_comentarios (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  gatilho_id uuid references crm_instagram_gatilhos(id) on delete set null,
  comentario_id text not null,
  midia_id text,
  usuario_id text,
  usuario text,
  texto text,
  respondido boolean not null default false,
  direct_enviado boolean not null default false,
  erro text,
  created_at timestamp with time zone not null default now(),
  unique (store_id, comentario_id)
);

-- Formulários de anúncio (Lead Ads): de qual formulário, para qual funil/tag/mensagem.
create table crm_meta_formularios (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  pagina_id text not null,
  formulario_id text,
  nome text not null,
  -- token da página (criptografado) para ler os dados do lead
  token_cripto text,
  funil_id uuid references crm_funis(id) on delete set null,
  tag text,
  -- primeira mensagem no WhatsApp (template aprovado, pois o lead ainda não falou com a loja)
  conexao_id uuid references crm_conexoes(id) on delete set null,
  template_id uuid references crm_templates_whatsapp(id) on delete set null,
  template_variaveis jsonb not null default '{}'::jsonb,
  ia_assume boolean not null default true,
  ativo boolean not null default true,
  leads integer not null default 0,
  created_at timestamp with time zone not null default now()
);

create table crm_meta_leads (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  formulario_id uuid references crm_meta_formularios(id) on delete set null,
  leadgen_id text not null,
  contato_id uuid references crm_contatos(id) on delete set null,
  dados jsonb,
  anuncio_id text,
  campanha text,
  mensagem_enviada boolean not null default false,
  erro text,
  created_at timestamp with time zone not null default now(),
  unique (store_id, leadgen_id)
);

-- "Avise-me quando chegar"
create table crm_lista_espera (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  produto_id uuid not null references crm_produtos(id) on delete cascade,
  variacao_id uuid references crm_produto_variacoes(id) on delete cascade,
  contato_id uuid not null references crm_contatos(id) on delete cascade,
  -- aguardando | avisado | cancelado
  status text not null default 'aguardando',
  avisado_em timestamp with time zone,
  created_at timestamp with time zone not null default now()
);
create unique index crm_lista_espera_unica on crm_lista_espera(produto_id, coalesce(variacao_id, '00000000-0000-0000-0000-000000000000'::uuid), contato_id) where status = 'aguardando';

-- Recompra: o produto dura N dias; perto de acabar, o cliente é lembrado.
alter table crm_produtos add column dias_recompra integer;
alter table crm_produtos add column mensagem_recompra text;

create table crm_lembretes_enviados (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  contato_id uuid not null references crm_contatos(id) on delete cascade,
  -- aniversario | recompra | pix_pendente | carrinho | nps | estoque | promessa
  tipo text not null,
  referencia text,
  created_at timestamp with time zone not null default now()
);
create index crm_lembretes_enviados_busca on crm_lembretes_enviados(store_id, contato_id, tipo, referencia);

-- Mensagens automáticas que ficaram para a janela de horário da loja (ex.: só às 15h).
create table crm_fila_envio (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  conversa_id uuid references crm_conversas(id) on delete cascade,
  contato_id uuid references crm_contatos(id) on delete cascade,
  -- mensagem pronta: {"tipo","texto","midiaUrl","template":{...},"interativo":{...}}
  pedido jsonb not null,
  -- template para usar se a janela de 24 h do WhatsApp já tiver fechado
  template_reserva jsonb,
  remetente text not null default 'system',
  agente_id uuid,
  origem text,
  enviar_em timestamp with time zone not null,
  -- pending | sent | failed | canceled
  status text not null default 'pending',
  erro text,
  created_at timestamp with time zone not null default now()
);
create index crm_fila_envio_pendentes on crm_fila_envio(enviar_em) where status = 'pending';

-- Avisos no celular/computador da equipe (Web Push do app instalado).
create table crm_push_inscricoes (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  usuario_id uuid not null references crm_usuarios(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  created_at timestamp with time zone not null default now()
);
