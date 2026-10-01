# LeadsPlus

CRM com IA para pequenos negócios, feito para virar um módulo do **Cliente Plus**:
atendimento WhatsApp/Instagram em uma caixa só, robôs de venda com Claude, funil
com score de IA, automações visuais, loja pública com catálogo e pedidos, agenda,
propostas, disparos, tracking de anúncios, relatórios e área de admin da plataforma.

```
backend/    Java 21 + Quarkus 3 (API REST em /api, porta 3002) + PostgreSQL 17 (Flyway V1–V11)
frontend/   React 19 + Vite + TanStack Router + Tailwind 4 (porta 5174)
scripts/    mvnw.mjs (roda o Maven wrapper em qualquer sistema)
docs/       mapeamento-meppy.md (tudo o que o Meppy tinha e onde ficou aqui)
dados-meppy/  cópia exportada do Meppy — DADOS PESSOAIS (LGPD), nunca vai para o git
```

## Rodar no computador

Pré-requisitos: Java 21, Node 20+, PostgreSQL 17 com o banco `gestao_crm`.

```bash
npm install
npm run dev          # sobe backend (3002) e frontend (5174) juntos
```

Abra http://localhost:5174. Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run dev:backend` | só a API (Quarkus em modo dev, recarrega sozinho) |
| `npm run dev -w frontend` | só a tela |
| `npm run typecheck` | compila o Java e confere o TypeScript |
| `npm run build` | gera o pacote do backend (`backend/target/quarkus-app`) e o `frontend/dist` |
| `npm run importar-meppy` | importa `dados-meppy/` (também dá para rodar em Admin → Importar do Meppy) |

## Configuração (`backend/.env`)

| Variável | Para quê | Obrigatória |
|---|---|---|
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | banco PostgreSQL | sim |
| `CRM_JWT_SEGREDO` | assina o login (texto aleatório longo) | sim |
| `CRM_CHAVE_CRIPTOGRAFIA` | cifra tokens da Meta, chaves de IA e senhas SMTP (AES-GCM) | sim — **não trocar depois**, senão os segredos guardados ficam ilegíveis |
| `CRM_URL_PUBLICA` | endereço público do sistema (links de loja, pedido, proposta, convite) | em produção |
| `CRM_ORIGENS` | origens liberadas no CORS (ex.: o domínio do Cliente Plus) | em produção |
| `CRM_ADMIN_EMAIL` | quem vira admin da plataforma ao ligar | sim |
| `ANTHROPIC_API_KEY` | chave do Claude para todas as empresas (cada empresa pode pôr a sua em Configurações) | para a IA funcionar |
| `WHATSAPP_VERIFY_TOKEN` | token de verificação do webhook da Meta | para receber mensagens |
| `META_APP_ID`, `META_APP_SECRET` | app da Meta (o segredo valida a assinatura de cada webhook) | para receber mensagens |
| `META_CONFIG_ID` | configuração do "Cadastro incorporado" (botão "Entrar com o Facebook") | opcional |
| `TRANSCRICAO_URL`, `TRANSCRICAO_CHAVE`, `TRANSCRICAO_MODELO` | transcrição de áudios (API compatível com Whisper) | opcional |
| `SUPABASE_URL` | aceita o login do Cliente Plus (JWT do Supabase via JWKS) | na integração |
| `CRM_ARQUIVOS_DIR` | pasta das mídias enviadas | opcional (padrão `data/arquivos`) |

## Publicar (produção)

1. Banco PostgreSQL gerenciado; as migrações rodam sozinhas ao ligar.
2. `npm run build`; rodar `java -jar backend/target/quarkus-app/quarkus-run.jar` com as variáveis acima.
3. Servir `frontend/dist` e encaminhar `/api/*` para o backend (mesmo domínio, HTTPS obrigatório para push e PWA).
4. No app da Meta: webhook `https://SEU_DOMINIO/api/webhooks/meta` com o `WHATSAPP_VERIFY_TOKEN`; assinar
   `messages`, `message_template_status_update`, `smb_message_echoes`, `history` (WhatsApp), `messages` e `comments` (Instagram) e `leadgen` (Página).
5. Guardar `data/arquivos` em disco persistente (ou volume) e fazer backup junto com o banco.

## Integração com o Cliente Plus

- **Login:** o filtro aceita o JWT próprio (HS256) e o JWT do Supabase do Cliente Plus (`SUPABASE_URL`); o usuário é
  ligado pelo e-mail. A empresa vem do cabeçalho `X-Loja` e só passa se a pessoa for membro dela.
- **Empresas:** `crm_lojas.cliente_plus_store_id` liga cada empresa à loja do Cliente Plus (Admin → Nova empresa).
- **Vendas:** a plataforma `cliente_plus` em Vendas → Integrações recebe as compras por webhook.
- **Tela:** o frontend é independente (rotas próprias); pode ser servido num subdomínio ou embutido no menu do Cliente Plus.

## Segurança

Senhas com bcrypt, 2 etapas (TOTP), limite de tentativas no login/recuperação, segredos cifrados (AES-GCM),
webhooks da Meta validados por HMAC (`X-Hub-Signature-256`), proteção contra SSRF nas automações, isolamento
por empresa em todas as consultas, auditoria das configurações e bloqueio de empresas pelo admin.

## Corte do Meppy (quando for trocar)

Os dados importados chegam com o robô **pausado**, automações **desligadas** e o WhatsApp **desconectado**.
Para virar a chave: conectar o número em Conexões (ele sai do Meppy nesse momento), conferir templates,
ativar o robô e as automações. Antes disso, nada é enviado aos clientes.
