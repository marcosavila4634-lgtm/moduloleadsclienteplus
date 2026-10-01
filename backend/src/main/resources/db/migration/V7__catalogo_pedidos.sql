-- Catálogo (produtos com fotos/vídeos e variações), estoque, pedidos (fluxo de
-- vendas), cupons, pesquisa de satisfação (NPS) e página pública da loja.

create table crm_categorias_produto (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  nome text not null,
  slug text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  unique (store_id, slug)
);

create table crm_produtos (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  categoria_id uuid references crm_categorias_produto(id) on delete set null,
  nome text not null,
  slug text not null,
  descricao text,
  sku text,
  preco numeric(12, 2) not null default 0,
  -- promoção com data (vale entre promo_inicio e promo_fim)
  preco_promocional numeric(12, 2),
  promo_inicio timestamp with time zone,
  promo_fim timestamp with time zone,
  -- [{"url","tipo":"image|video","capa":true}]
  midias jsonb not null default '[]'::jsonb,
  -- nomes dos atributos das variações, ex.: ["Tamanho","Cor"]
  atributos text[] not null default '{}',
  controla_estoque boolean not null default true,
  -- estoque do produto sem variações
  estoque integer not null default 0,
  estoque_minimo integer not null default 0,
  -- aceita vender sem estoque (sob encomenda)
  vende_sem_estoque boolean not null default false,
  peso_gramas integer,
  ativo boolean not null default true,
  -- aparece na página pública
  publico boolean not null default true,
  destaque boolean not null default false,
  -- a IA pode oferecer
  ia_pode_vender boolean not null default true,
  tags text[] not null default '{}',
  ordem integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (store_id, slug)
);
create index crm_produtos_store on crm_produtos(store_id, ativo, ordem);

create table crm_produto_variacoes (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  produto_id uuid not null references crm_produtos(id) on delete cascade,
  -- {"Tamanho":"M","Cor":"Preto"}
  valores jsonb not null default '{}'::jsonb,
  nome text not null,
  sku text,
  -- vazio = preço do produto
  preco numeric(12, 2),
  estoque integer not null default 0,
  midia_url text,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamp with time zone not null default now()
);
create index crm_produto_variacoes_produto on crm_produto_variacoes(produto_id, ordem);

create table crm_estoque_movimentos (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  produto_id uuid not null references crm_produtos(id) on delete cascade,
  variacao_id uuid references crm_produto_variacoes(id) on delete cascade,
  -- entrada | saida | ajuste | venda | devolucao | cancelamento
  tipo text not null,
  -- positivo entra, negativo sai
  quantidade integer not null,
  saldo integer not null,
  pedido_id uuid,
  motivo text,
  usuario_id uuid references crm_usuarios(id) on delete set null,
  created_at timestamp with time zone not null default now()
);
create index crm_estoque_movimentos_produto on crm_estoque_movimentos(produto_id, created_at desc);

create table crm_cupons (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  codigo text not null,
  descricao text,
  -- percentual | valor | frete_gratis
  tipo text not null default 'percentual',
  valor numeric(12, 2) not null default 0,
  pedido_minimo numeric(12, 2) not null default 0,
  inicio timestamp with time zone,
  fim timestamp with time zone,
  usos_max integer,
  usos integer not null default 0,
  um_por_cliente boolean not null default true,
  primeira_compra boolean not null default false,
  -- a IA pode oferecer este cupom para fechar a venda
  ia_pode_oferecer boolean not null default false,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  unique (store_id, codigo)
);

create table crm_pedidos (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  numero integer not null,
  contato_id uuid references crm_contatos(id) on delete set null,
  conversa_id uuid references crm_conversas(id) on delete set null,
  negocio_id uuid references crm_negocios(id) on delete set null,
  -- pagina | whatsapp | ia | manual
  origem text not null default 'manual',
  -- carrinho | aguardando_pagamento | pago | separando | enviado | pronto_retirada | entregue | cancelado
  status text not null default 'aguardando_pagamento',
  subtotal numeric(12, 2) not null default 0,
  desconto numeric(12, 2) not null default 0,
  frete numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  cupom_id uuid references crm_cupons(id) on delete set null,
  cupom_codigo text,
  -- pix | cartao | dinheiro | boleto | na_entrega | combinar
  forma_pagamento text,
  pago_em timestamp with time zone,
  pix_copia_cola text,
  comprovante_url text,
  -- entrega | retirada
  entrega_tipo text not null default 'entrega',
  -- {"nome","telefone","cep","rua","numero","complemento","bairro","cidade","uf"}
  endereco jsonb,
  rastreio_codigo text,
  rastreio_url text,
  observacoes text,
  nome_cliente text,
  telefone_cliente text,
  -- link público para o cliente acompanhar
  token text not null unique,
  estoque_baixado boolean not null default false,
  carrinho_aviso_em timestamp with time zone,
  carrinho_avisos integer not null default 0,
  nps_enviado_em timestamp with time zone,
  cancelado_motivo text,
  criado_por uuid references crm_usuarios(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (store_id, numero)
);
create index crm_pedidos_store on crm_pedidos(store_id, status, created_at desc);
create index crm_pedidos_contato on crm_pedidos(contato_id);

create table crm_pedido_itens (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  pedido_id uuid not null references crm_pedidos(id) on delete cascade,
  produto_id uuid references crm_produtos(id) on delete set null,
  variacao_id uuid references crm_produto_variacoes(id) on delete set null,
  nome text not null,
  quantidade integer not null check (quantidade > 0),
  preco_unitario numeric(12, 2) not null,
  total numeric(12, 2) not null
);
create index crm_pedido_itens_pedido on crm_pedido_itens(pedido_id);

create table crm_pedido_eventos (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  pedido_id uuid not null references crm_pedidos(id) on delete cascade,
  status text not null,
  texto text,
  -- o cliente foi avisado pelo WhatsApp
  avisado boolean not null default false,
  usuario_id uuid references crm_usuarios(id) on delete set null,
  created_at timestamp with time zone not null default now()
);

create table crm_nps (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  contato_id uuid references crm_contatos(id) on delete cascade,
  pedido_id uuid references crm_pedidos(id) on delete set null,
  conversa_id uuid references crm_conversas(id) on delete set null,
  nota integer check (nota between 0 and 10),
  comentario text,
  -- aguardando | respondida | expirada
  status text not null default 'aguardando',
  enviada_em timestamp with time zone not null default now(),
  respondida_em timestamp with time zone
);
create index crm_nps_aguardando on crm_nps(conversa_id) where status = 'aguardando';

-- Página pública da loja (mesmo formato do editor de páginas do Cliente Plus):
-- tema + seções em JSON; rascunho e publicada; histórico das publicações.
create table crm_paginas (
  store_id uuid primary key references crm_lojas(id) on delete cascade,
  rascunho text not null,
  publicada text,
  publicada_em timestamp with time zone,
  updated_at timestamp with time zone not null default now()
);

create table crm_pagina_versoes (
  id uuid default gen_random_uuid() primary key,
  store_id uuid not null references crm_lojas(id) on delete cascade,
  conteudo text not null,
  publicada_por uuid references crm_usuarios(id) on delete set null,
  created_at timestamp with time zone not null default now()
);
create index crm_pagina_versoes_store on crm_pagina_versoes(store_id, created_at desc);
