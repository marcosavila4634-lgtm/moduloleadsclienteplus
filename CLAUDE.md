# Gestão Plus CRM — instruções do projeto

Leia o README.md para a visão geral. Regras deste repositório:

- **Nunca** commitar `dados-meppy/`, `backend/.env*`, `backend/data/` (dados pessoais e segredos).
- **Não mexer no Meppy** (o dono ainda usa) nem no Lovable; do Cliente Plus só se usa a forma de integrar, nunca dados.
- Publicar em produção só com ok explícito do dono.
- Textos da interface em português simples ("para uma criança entender"); nomes de código em português.
- Backend: JDBC puro pelo helper `Db` (mapas em camelCase; `Db.atualiza` exige coluna `store_id` — para
  `crm_lojas`, `crm_usuarios` e `crm_plataforma` use `db.executa`). Toda consulta filtra por `store_id` da `Sessao`.
- Mensagens automáticas passam por `Expedicao` (respeita a janela de envio da loja e a regra das 24h do WhatsApp).
- Novas tabelas = nova migração `V<n>__*.sql`; nunca editar migração já aplicada.
- Frontend: rotas por arquivo em `frontend/src/routes` (`_app/` = área logada); componentes base em
  `components/ui.tsx` e `components/form.tsx`; cores só pelos tokens do `index.css`.
- Conferir antes de entregar: `node scripts/mvnw.mjs -q -ntp compile` e `npx tsc -b` (em `frontend/`).
- No Git Bash, rodar scripts com caminhos que começam com "/" usando `MSYS_NO_PATHCONV=1`.
