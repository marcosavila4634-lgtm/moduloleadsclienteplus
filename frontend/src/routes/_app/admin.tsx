import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Building2, Copy, DatabaseZap, GraduationCap, Lock, Mail, Pencil, PlayCircle, Plus, Settings, ShieldCheck, Trash2, Upload, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AreaTexto, Botao, Campo, Entrada, Interruptor, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { MENU } from "../../components/layout/menu";
import { useTutorial } from "../../components/Tutorial";
import { Abas, CabecalhoPagina, Card, CardNumero, Carregando, Dica, Selo, TituloCard, Vazio, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { del, enviarArquivo, post, put, qs } from "../../lib/api";
import { useAtraso, useDados } from "../../lib/dados";
import { data, num, relativo } from "../../lib/formato";
import { useSessao } from "../../lib/sessao";

type Aba = "resumo" | "empresas" | "usuarios" | "tutorial" | "config" | "importar";
export const Route = createFileRoute("/_app/admin")({
  validateSearch: (s: Record<string, unknown>): { aba?: Aba } => ({ aba: typeof s.aba === "string" ? (s.aba as Aba) : undefined }),
  component: Admin,
});

const usd = (micro: number, cotacao = 5.5) => ((Number(micro) / 1e6) * cotacao).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Admin() {
  const { admin } = useSessao();
  const { aba = "resumo" } = Route.useSearch();
  const navegar = Route.useNavigate();
  if (!admin) return <Card><Vazio icone={Lock} titulo="Área restrita">Só o administrador da plataforma acessa esta área.</Vazio></Card>;
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Admin da plataforma" icone={ShieldCheck} descricao="Empresas clientes, usuários, tutorial e configurações gerais do Gestão Plus CRM." />
      <Abas valor={aba} aoMudar={(a) => navegar({ search: { aba: a } })} abas={[
        { valor: "resumo", rotulo: "Resumo" }, { valor: "empresas", rotulo: "Empresas" }, { valor: "usuarios", rotulo: "Usuários" },
        { valor: "tutorial", rotulo: "Tutorial" }, { valor: "config", rotulo: "Configurações" }, { valor: "importar", rotulo: "Importar do Meppy" },
      ]} />
      {aba === "resumo" && <Resumo />}
      {aba === "empresas" && <Empresas />}
      {aba === "usuarios" && <Usuarios />}
      {aba === "tutorial" && <EditorTutorial />}
      {aba === "config" && <ConfigPlataforma />}
      {aba === "importar" && <Importar />}
    </div>
  );
}

function Resumo() {
  const { dados } = useDados<any>("/plataforma/resumo");
  if (!dados) return <Carregando />;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardNumero icone={Building2} rotulo="Empresas" valor={num(dados.lojas)} detalhe={`${num(dados.lojasAtivas)} ativas`} />
        <CardNumero icone={Users} cor="laranja" rotulo="Usuários" valor={num(dados.usuarios)} detalhe={`${num(dados.contatos)} contatos no total`} />
        <CardNumero icone={Mail} cor="ambar" rotulo="Mensagens (30 dias)" valor={num(dados.mensagens30d)} detalhe={`${num(dados.conversas30d)} conversas · ${num(dados.conexoesAtivas)} números conectados`} />
        <CardNumero icone={DatabaseZap} cor={dados.errosIa24h > 0 ? "vermelho" : "verde"} rotulo="IA no mês" valor={usd(dados.iaMesMicroUsd)} detalhe={`${num(dados.errosIa24h)} erros nas últimas 24h`} />
      </div>
      <Card>
        <TituloCard>Novas empresas (60 dias)</TituloCard>
        <div className="mt-3 h-56">
          <ResponsiveContainer>
            <BarChart data={dados.novasPorDia.map((d: any) => ({ dia: d.dia.slice(5).split("-").reverse().join("/"), Empresas: Number(d.lojas) }))}>
              <XAxis dataKey="dia" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Bar dataKey="Empresas" fill="var(--color-laranja)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function Empresas() {
  const [busca, setBusca] = useState("");
  const b = useAtraso(busca);
  const { dados, recarregar } = useDados<any[]>(`/plataforma/lojas${qs({ busca: b || undefined })}`);
  const [nova, setNova] = useState(false);
  const [editar, setEditar] = useState<any>(null);
  const { executar } = useAcao();
  return (
    <Card className="!p-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <TituloCard icone={Building2}>Empresas clientes</TituloCard>
        <Entrada className="ml-auto !w-64" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa..." />
        <Botao icone={<Plus className="size-4" />} onClick={() => setNova(true)}>Nova empresa</Botao>
      </div>
      {!dados ? <Carregando /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Empresa</th><th>Dono</th><th>Plano</th><th>Status</th><th>Usuários</th><th>Contatos</th><th>Conversas 30d</th><th>IA no mês</th><th>Última atividade</th><th></th></tr></thead>
            <tbody>{dados.map((l) => (
              <tr key={l.id} className={linhaTabela}>
                <td className="px-4 py-2.5"><div className="font-semibold">{l.nome}</div><div className="text-[12px] text-suave">/{l.slug} · desde {data(l.createdAt)}</div></td>
                <td className="text-suave">{l.donoEmail ?? "convite pendente"}</td>
                <td className="capitalize">{l.plano ?? "—"}</td>
                <td>{l.status === "ativa" ? <Selo cor="verde">Ativa</Selo> : l.status === "teste" ? <Selo cor="ambar">Teste</Selo> : <Selo cor="vermelho" className="max-w-[10rem] truncate">Bloqueada{l.bloqueioMotivo ? `: ${l.bloqueioMotivo}` : ""}</Selo>}</td>
                <td>{num(l.usuarios)}</td><td>{num(l.contatos)}</td><td>{num(l.conversas30d)}</td><td>{usd(l.iaMesMicroUsd)}</td>
                <td className="text-suave">{l.ultimaAtividade ? relativo(l.ultimaAtividade) : "—"}</td>
                <td className="pr-3 text-right"><button type="button" onClick={() => setEditar({ ...l, limites: l.limites ?? {} })} className="rounded-lg p-1.5 text-suave hover:bg-fundo"><Pencil className="size-4" /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {nova && <NovaEmpresa aoFechar={(ok) => { setNova(false); if (ok) recarregar(); }} />}
      {editar && (
        <Modal titulo={editar.nome} aoFechar={() => setEditar(null)} rodape={<Botao onClick={() => executar(() => put(`/plataforma/lojas/${editar.id}`, editar), "Empresa atualizada").then((r) => { if (r) { setEditar(null); recarregar(); } })}>Salvar</Botao>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Status"><Selecao value={editar.status} onChange={(e) => setEditar({ ...editar, status: e.target.value })} opcoes={[{ valor: "ativa", rotulo: "Ativa" }, { valor: "teste", rotulo: "Em teste" }, { valor: "bloqueada", rotulo: "Bloqueada" }]} /></Campo>
            <Campo rotulo="Plano"><Entrada value={editar.plano ?? ""} onChange={(e) => setEditar({ ...editar, plano: e.target.value })} placeholder="básico, pro..." /></Campo>
            {editar.status === "bloqueada" && <Campo rotulo="Motivo do bloqueio (aparece para a empresa)" className="sm:col-span-2"><Entrada value={editar.bloqueioMotivo ?? ""} onChange={(e) => setEditar({ ...editar, bloqueioMotivo: e.target.value })} placeholder="Pagamento pendente" /></Campo>}
            <Limites valor={editar.limites} aoMudar={(l) => setEditar({ ...editar, limites: l })} />
          </div>
          {editar.status === "bloqueada" && <div className="mt-3"><Dica cor="vermelho">Bloquear impede o acesso de todos da empresa e pausa os robôs. Os dados ficam guardados.</Dica></div>}
        </Modal>
      )}
    </Card>
  );
}

function Limites({ valor, aoMudar }: { valor: any; aoMudar: (v: any) => void }) {
  const campo = (k: string, r: string) => (
    <Campo rotulo={r}><Entrada type="number" value={valor?.[k] ?? ""} placeholder="sem limite" onChange={(e) => aoMudar({ ...valor, [k]: e.target.value === "" ? undefined : Number(e.target.value) })} /></Campo>
  );
  return <>{campo("usuarios", "Máximo de usuários")}{campo("conexoes", "Máximo de números/contas")}{campo("agentes", "Máximo de robôs")}{campo("ia_mensal_centavos", "Teto de IA por mês (centavos de dólar)")}</>;
}

function NovaEmpresa({ aoFechar }: { aoFechar: (ok?: boolean) => void }) {
  const [f, setF] = useState<any>({ nome: "", emailDono: "", nomeDono: "", plano: "", limites: {} });
  const [convite, setConvite] = useState<string | null>(null);
  const { executar, carregando } = useAcao();
  const { avisar } = useAvisos();
  if (convite) {
    return (
      <Modal titulo="Empresa criada" aoFechar={() => aoFechar(true)}>
        <div className="flex flex-col gap-3 text-[13px]">
          <p>Mande este link para o dono. Ele cria a senha e já entra na empresa (vale 14 dias):</p>
          <div className="flex gap-2"><Entrada readOnly value={convite} /><Botao icone={<Copy className="size-4" />} onClick={() => { navigator.clipboard.writeText(convite); avisar("Copiado"); }}>Copiar</Botao></div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal titulo="Nova empresa cliente" aoFechar={() => aoFechar()} rodape={<Botao carregando={carregando} onClick={() => executar(() => post<any>("/plataforma/lojas", f), "Empresa criada").then((r) => r && setConvite(r.convite))}>Criar e gerar convite</Botao>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome da empresa" className="sm:col-span-2"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo rotulo="Nome do dono"><Entrada value={f.nomeDono} onChange={(e) => setF({ ...f, nomeDono: e.target.value })} /></Campo>
        <Campo rotulo="E-mail do dono"><Entrada type="email" value={f.emailDono} onChange={(e) => setF({ ...f, emailDono: e.target.value })} /></Campo>
        <Campo rotulo="Plano"><Entrada value={f.plano} onChange={(e) => setF({ ...f, plano: e.target.value })} /></Campo>
        <Campo rotulo="ID da loja no Cliente Plus (opcional)"><Entrada value={f.clientePlusStoreId ?? ""} onChange={(e) => setF({ ...f, clientePlusStoreId: e.target.value || undefined })} /></Campo>
        <Limites valor={f.limites} aoMudar={(l) => setF({ ...f, limites: l })} />
      </div>
    </Modal>
  );
}

function Usuarios() {
  const [busca, setBusca] = useState("");
  const b = useAtraso(busca);
  const { dados, recarregar } = useDados<any[]>(`/plataforma/usuarios${qs({ busca: b || undefined })}`);
  const { me } = useSessao();
  const { executar } = useAcao();
  return (
    <Card className="!p-0">
      <div className="flex items-center gap-2 px-4 py-3"><TituloCard icone={Users}>Usuários</TituloCard><Entrada className="ml-auto !w-64" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail..." /></div>
      {!dados ? <Carregando /> : (
        <table className="w-full text-[13px]">
          <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Usuário</th><th>Empresas</th><th>2 etapas</th><th>Desde</th><th>Ativo</th><th>Admin da plataforma</th></tr></thead>
          <tbody>{dados.map((u) => (
            <tr key={u.id} className={linhaTabela}>
              <td className="px-4 py-2.5"><div className="font-semibold">{u.nome}</div><div className="text-[12px] text-suave">{u.email}</div></td>
              <td className="max-w-xs truncate text-[12px] text-suave">{u.empresas ?? "—"}</td>
              <td>{u.totpAtivo ? <Selo cor="verde">Sim</Selo> : <Selo>Não</Selo>}</td>
              <td>{data(u.createdAt)}</td>
              <td><Interruptor ligado={u.ativo} desabilitado={u.id === me.usuario.id} aoMudar={(v) => executar(() => put(`/plataforma/usuarios/${u.id}`, { ativo: v, adminPlataforma: u.adminPlataforma }), v ? "Usuário ativado" : "Usuário desativado").then(recarregar)} /></td>
              <td><Interruptor ligado={u.adminPlataforma} desabilitado={u.id === me.usuario.id} aoMudar={(v) => executar(() => put(`/plataforma/usuarios/${u.id}`, { ativo: u.ativo, adminPlataforma: v }), "Permissão atualizada").then(recarregar)} /></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}

// ---------------- tutorial ----------------

const ALVOS: Record<string, string> = {
  "": "Nenhum (balão no meio da tela)", menu: "Menu lateral inteiro", "menu-painel": "Menu: Painel", "menu-conversas": "Menu: Conversas", "menu-crm": "Menu: Funil", "menu-contatos": "Menu: Contatos",
  "menu-agentes": "Menu: Robôs", "menu-automacoes": "Menu: Automações", "menu-catalogo": "Menu: Loja", "menu-pedidos": "Menu: Pedidos", "menu-conexoes": "Menu: Conexões",
  busca: "Barra de busca", notificacoes: "Sininho de avisos", ajuda: "Botão de ajuda", "lista-conversas": "Lista de conversas", "abas-conversas": "Abas das conversas",
  chat: "Área do chat", "caixa-mensagem": "Caixa de mensagem", "botao-ia": "Botão do robô na conversa", "painel-cliente": "Painel do cliente na conversa",
  kanban: "Quadro do funil", "cartao-negocio": "Primeiro cartão do funil", score: "Score do cartão", previsao: "Previsão do funil", "lista-agentes": "Lista de robôs",
  "novo-agente": "Botão novo robô", "nova-automacao": "Botão nova automação", "lista-produtos": "Lista de produtos", "novo-produto": "Botão novo produto",
  conexoes: "Lista de conexões", "nova-conexao": "Botão conectar WhatsApp",
};
const ROTAS = [{ valor: "", rotulo: "Tela atual (não muda de tela)" }, ...MENU.flatMap((m) => (m.filhos ? m.filhos.map((f) => ({ valor: f.para, rotulo: `${m.rotulo} › ${f.rotulo}` })) : [{ valor: m.para!, rotulo: m.rotulo }]))];
const PAPEIS = ["dono", "admin", "supervisor", "atendente"];

function EditorTutorial() {
  const { dados, recarregar } = useDados<any>("/plataforma/tutorial");
  const [trilha, setTrilha] = useState<string | null>(null);
  const [passo, setPasso] = useState<any>(null);
  const [novaTrilha, setNovaTrilha] = useState<any>(null);
  const { executar } = useAcao();
  const { confirmar } = useAvisos();
  const { iniciar } = useTutorial();
  useEffect(() => { if (dados && !trilha) setTrilha(dados.trilhas[0]?.chave ?? null); }, [dados]);
  if (!dados) return <Carregando />;
  const t = dados.trilhas.find((x: any) => x.chave === trilha);
  const passos = dados.passos.filter((p: any) => p.trilha === trilha).sort((a: any, b: any) => a.ordem - b.ordem);
  const mover = (i: number, d: number) => {
    const ids = passos.map((p: any) => p.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    executar(() => post(`/plataforma/tutorial/trilhas/${trilha}/ordem`, { ids })).then(recarregar);
  };
  return (
    <div className="flex flex-col gap-4">
      <Dica icone={GraduationCap}>Aqui você monta o tutorial que todos os clientes veem. Cada <b>trilha</b> é um assunto; cada <b>passo</b> é um balão com o botão "Próximo". A trilha <b>inicio</b> abre sozinha no primeiro acesso. Os clientes só assistem — não podem editar.</Dica>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="flex flex-col gap-2 !p-3">
          <div className="flex items-center justify-between px-1"><span className="text-[12px] font-bold text-suave uppercase">Trilhas</span><button type="button" onClick={() => setNovaTrilha({ chave: "", nome: "", descricao: "", icone: "📘", ordem: dados.trilhas.length, ativo: true })} className="text-[12.5px] font-semibold text-laranja">+ Nova</button></div>
          {dados.trilhas.map((x: any) => (
            <button key={x.chave} type="button" onClick={() => setTrilha(x.chave)} className={`flex items-center gap-2 rounded-xl p-2.5 text-left ${trilha === x.chave ? "bg-laranja-claro ring-1 ring-laranja/40" : "hover:bg-fundo"}`}>
              <span className="text-2xl">{x.icone ?? "📘"}</span>
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{x.nome}</div><div className="text-[11.5px] text-suave">{x.chave} · {dados.passos.filter((p: any) => p.trilha === x.chave).length} passos{!x.ativo && " · oculta"}</div></div>
            </button>
          ))}
        </Card>
        <Card className="flex flex-col gap-3">
          {!t ? <Vazio icone={GraduationCap} titulo="Crie uma trilha" /> : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-3xl">{t.icone}</span>
                <div className="flex-1"><div className="font-titulo text-[18px] font-bold">{t.nome}</div><div className="text-[12.5px] text-suave">{t.descricao}</div></div>
                <Botao variante="secundario" icone={<PlayCircle className="size-4" />} onClick={() => iniciar(t.chave)}>Testar</Botao>
                <Botao variante="secundario" icone={<Pencil className="size-4" />} onClick={() => setNovaTrilha({ ...t })}>Editar trilha</Botao>
                <Botao icone={<Plus className="size-4" />} onClick={() => setPasso({ trilha: t.chave, ordem: passos.length, titulo: "", texto: "", rota: "", alvo: "", posicao: "bottom", icone: "👉", papeis: [], ativo: true })}>Novo passo</Botao>
              </div>
              {passos.length === 0 ? <Vazio icone={GraduationCap} titulo="Nenhum passo nesta trilha" /> : (
                <ol className="flex flex-col gap-2">
                  {passos.map((p: any, i: number) => (
                    <li key={p.id} className={`flex items-start gap-3 rounded-2xl border border-linha p-3 ${p.ativo ? "" : "opacity-50"}`}>
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-laranja-gradiente font-titulo text-[13px] font-bold text-white">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{p.icone} {p.titulo}</div>
                        <div className="line-clamp-2 text-[12.5px] text-suave">{p.texto}</div>
                        <div className="mt-1 flex flex-wrap gap-1">{p.rota && <Selo>{p.rota}</Selo>}{p.alvo && <Selo cor="petroleo">destaca: {ALVOS[p.alvo] ?? p.alvo}</Selo>}{p.papeis?.length > 0 && <Selo cor="ambar">só {p.papeis.join(", ")}</Selo>}{p.imagemUrl && <Selo>🖼 imagem</Selo>}{p.videoUrl && <Selo>🎬 vídeo</Selo>}</div>
                      </div>
                      <div className="flex shrink-0 items-center">
                        <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} className="rounded-lg p-1.5 text-suave hover:bg-fundo disabled:opacity-30"><ArrowUp className="size-4" /></button>
                        <button type="button" disabled={i === passos.length - 1} onClick={() => mover(i, 1)} className="rounded-lg p-1.5 text-suave hover:bg-fundo disabled:opacity-30"><ArrowDown className="size-4" /></button>
                        <button type="button" onClick={() => setPasso({ ...p, rota: p.rota ?? "", alvo: p.alvo ?? "", papeis: p.papeis ?? [] })} className="rounded-lg p-1.5 text-suave hover:bg-fundo"><Pencil className="size-4" /></button>
                        <button type="button" onClick={async () => { if (await confirmar("Apagar este passo?", { perigo: true, botao: "Apagar" })) executar(() => del(`/plataforma/tutorial/passos/${p.id}`), "Passo apagado").then(recarregar); }} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </Card>
      </div>
      {passo && <EditorPasso inicial={passo} trilhas={dados.trilhas} aoFechar={(ok) => { setPasso(null); if (ok) recarregar(); }} />}
      {novaTrilha && (
        <Modal titulo={dados.trilhas.some((x: any) => x.chave === novaTrilha.chave) && novaTrilha.chave ? "Editar trilha" : "Nova trilha"} aoFechar={() => setNovaTrilha(null)} rodape={
          <>
            {dados.trilhas.some((x: any) => x.chave === novaTrilha.chave) && <Botao variante="fantasma" className="mr-auto !text-vermelho" onClick={async () => { if (await confirmar("Apagar a trilha e todos os passos dela?", { perigo: true, botao: "Apagar" })) executar(() => del(`/plataforma/tutorial/trilhas/${novaTrilha.chave}`), "Trilha apagada").then(() => { setNovaTrilha(null); setTrilha(null); recarregar(); }); }}>Apagar trilha</Botao>}
            <Botao onClick={() => executar(() => post<any>("/plataforma/tutorial/trilhas", novaTrilha), "Trilha salva").then((r) => { if (r) { setNovaTrilha(null); setTrilha(r.chave); recarregar(); } })}>Salvar</Botao>
          </>}>
          <div className="grid gap-3 sm:grid-cols-[80px_1fr]">
            <Campo rotulo="Ícone"><Entrada value={novaTrilha.icone ?? ""} onChange={(e) => setNovaTrilha({ ...novaTrilha, icone: e.target.value })} className="text-center text-xl" /></Campo>
            <Campo rotulo="Nome"><Entrada value={novaTrilha.nome} onChange={(e) => setNovaTrilha({ ...novaTrilha, nome: e.target.value })} placeholder="Como usar a agenda" /></Campo>
            <Campo rotulo="Chave (sem espaços)" className="sm:col-span-2" dica={'"inicio" = abre sozinha no primeiro acesso.'}><Entrada value={novaTrilha.chave} disabled={dados.trilhas.some((x: any) => x.chave === novaTrilha.chave) && !!novaTrilha.chave && novaTrilha.nome !== ""} onChange={(e) => setNovaTrilha({ ...novaTrilha, chave: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="agenda" /></Campo>
            <Campo rotulo="Descrição" className="sm:col-span-2"><Entrada value={novaTrilha.descricao ?? ""} onChange={(e) => setNovaTrilha({ ...novaTrilha, descricao: e.target.value })} /></Campo>
            <Campo rotulo="Ordem"><Entrada type="number" value={novaTrilha.ordem} onChange={(e) => setNovaTrilha({ ...novaTrilha, ordem: Number(e.target.value) })} /></Campo>
            <div className="flex items-end"><Interruptor ligado={novaTrilha.ativo} aoMudar={(v) => setNovaTrilha({ ...novaTrilha, ativo: v })} rotulo="Aparece na central de ajuda" /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EditorPasso({ inicial, trilhas, aoFechar }: { inicial: any; trilhas: any[]; aoFechar: (ok?: boolean) => void }) {
  const [p, setP] = useState(inicial);
  const [enviando, setEnviando] = useState(false);
  const { executar, carregando } = useAcao();
  return (
    <Modal titulo={p.id ? "Editar passo" : "Novo passo"} largura="max-w-2xl" aoFechar={() => aoFechar()} rodape={
      <Botao carregando={carregando} onClick={() => executar(() => (p.id ? put(`/plataforma/tutorial/passos/${p.id}`, p) : post("/plataforma/tutorial/passos", p)), "Passo salvo").then((r) => r && aoFechar(true))}>Salvar</Botao>}>
      <div className="grid gap-3 sm:grid-cols-[80px_1fr]">
        <Campo rotulo="Ícone"><Entrada value={p.icone ?? ""} onChange={(e) => setP({ ...p, icone: e.target.value })} className="text-center text-xl" /></Campo>
        <Campo rotulo="Título (curto)"><Entrada value={p.titulo} onChange={(e) => setP({ ...p, titulo: e.target.value })} placeholder="Aqui ficam suas conversas" /></Campo>
        <Campo rotulo="Explicação (simples, como para uma criança)" className="sm:col-span-2"><AreaTexto rows={4} value={p.texto} onChange={(e) => setP({ ...p, texto: e.target.value })} /></Campo>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Trilha"><Selecao value={p.trilha} onChange={(e) => setP({ ...p, trilha: e.target.value })} opcoes={trilhas.map((t) => ({ valor: t.chave, rotulo: t.nome }))} /></Campo>
        <Campo rotulo="Abrir a tela"><Selecao value={p.rota} onChange={(e) => setP({ ...p, rota: e.target.value })} opcoes={ROTAS} /></Campo>
        <Campo rotulo="Destacar na tela"><Selecao value={ALVOS[p.alvo] !== undefined ? p.alvo : "__outro"} onChange={(e) => setP({ ...p, alvo: e.target.value === "__outro" ? "" : e.target.value })} opcoes={[...Object.entries(ALVOS).map(([v, r]) => ({ valor: v, rotulo: r })), { valor: "__outro", rotulo: "Outro (digitar)" }]} /></Campo>
        {ALVOS[p.alvo] === undefined && <Campo rotulo="Alvo (data-tour)"><Entrada value={p.alvo} onChange={(e) => setP({ ...p, alvo: e.target.value })} /></Campo>}
        <Campo rotulo="Balão aparece"><Selecao value={p.posicao} onChange={(e) => setP({ ...p, posicao: e.target.value })} opcoes={[{ valor: "bottom", rotulo: "Embaixo" }, { valor: "top", rotulo: "Em cima" }, { valor: "right", rotulo: "À direita" }, { valor: "left", rotulo: "À esquerda" }, { valor: "center", rotulo: "No meio da tela" }]} /></Campo>
        <Campo rotulo="Imagem (opcional)">
          <div className="flex items-center gap-2">
            {p.imagemUrl && <img src={p.imagemUrl} alt="" className="size-10 rounded-lg object-cover" />}
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-linha-2 px-3 py-2 text-[12.5px]"><Upload className="size-4 text-laranja" />{enviando ? "Enviando..." : "Enviar"}
              <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setEnviando(true); const r = await enviarArquivo(f, true); setEnviando(false); setP({ ...p, imagemUrl: `/api/arquivos/p/${r.id}/${encodeURIComponent(r.nome)}` }); }} /></label>
            {p.imagemUrl && <button type="button" onClick={() => setP({ ...p, imagemUrl: null })} className="text-suave"><Trash2 className="size-4" /></button>}
          </div>
        </Campo>
        <Campo rotulo="Vídeo do YouTube (opcional)"><Entrada value={p.videoUrl ?? ""} onChange={(e) => setP({ ...p, videoUrl: e.target.value })} placeholder="https://youtube.com/..." /></Campo>
        <Campo rotulo="Quem vê (nenhum marcado = todos)" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">{PAPEIS.map((x) => <button key={x} type="button" onClick={() => setP({ ...p, papeis: p.papeis.includes(x) ? p.papeis.filter((y: string) => y !== x) : [...p.papeis, x] })} className={`rounded-full px-3 py-1 text-[12.5px] font-semibold capitalize ring-1 ${p.papeis.includes(x) ? "bg-laranja-gradiente text-white ring-transparent" : "ring-linha"}`}>{x}</button>)}</div>
        </Campo>
        <Interruptor ligado={p.ativo} aoMudar={(v) => setP({ ...p, ativo: v })} rotulo="Ativo" />
      </div>
    </Modal>
  );
}

// ---------------- configurações da plataforma ----------------

function ConfigPlataforma() {
  const { dados, recarregar } = useDados<any>("/plataforma/config");
  const [f, setF] = useState<any>(null);
  const [senha, setSenha] = useState("");
  const [para, setPara] = useState("");
  const { executar, carregando } = useAcao();
  useEffect(() => { if (dados) setF({ ...dados, smtp: dados.smtp ?? {} }); }, [dados]);
  if (!f) return <Carregando />;
  const s = f.smtp;
  const setS = (k: string, v: any) => setF({ ...f, smtp: { ...s, [k]: v } });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-3">
        <TituloCard icone={Settings}>Marca e cadastro</TituloCard>
        <Campo rotulo="Nome do sistema"><Entrada value={f.nome ?? ""} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Gestão Plus CRM" /></Campo>
        <Campo rotulo="Link do logo (opcional)"><Entrada value={f.logo ?? ""} onChange={(e) => setF({ ...f, logo: e.target.value })} /></Campo>
        <Campo rotulo="WhatsApp do suporte (aparece na ajuda)"><Entrada value={f.suporte_whatsapp ?? ""} onChange={(e) => setF({ ...f, suporte_whatsapp: e.target.value })} placeholder="5511999999999" /></Campo>
        <Interruptor ligado={f.cadastro_aberto !== false} aoMudar={(v) => setF({ ...f, cadastro_aberto: v })} rotulo="Qualquer pessoa pode criar conta" descricao="Desligado: só entra quem for convidado ou criado aqui no Admin." />
      </Card>
      <Card className="flex flex-col gap-3">
        <TituloCard icone={Mail}>E-mail do sistema (SMTP)</TituloCard>
        <p className="text-[12.5px] text-suave">Usado para "esqueci minha senha" e avisos do sistema, para todas as empresas.</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Servidor"><Entrada value={s.host ?? ""} onChange={(e) => setS("host", e.target.value)} placeholder="smtp.gmail.com" /></Campo>
          <Campo rotulo="Porta"><Entrada type="number" value={s.porta ?? 587} onChange={(e) => setS("porta", Number(e.target.value))} /></Campo>
          <Campo rotulo="Usuário"><Entrada value={s.usuario ?? ""} onChange={(e) => setS("usuario", e.target.value)} /></Campo>
          <Campo rotulo="Remetente"><Entrada value={s.remetente ?? ""} onChange={(e) => setS("remetente", e.target.value)} /></Campo>
          <Campo rotulo="Nome do remetente" className="col-span-2"><Entrada value={s.nome_remetente ?? ""} onChange={(e) => setS("nome_remetente", e.target.value)} /></Campo>
        </div>
        <div className="flex items-end gap-2">
          <Campo rotulo={s.senha_configurada ? "Senha (configurada)" : "Senha"} className="flex-1"><Entrada type="password" value={senha} onChange={(e) => setSenha(e.target.value)} /></Campo>
          <Botao variante="secundario" disabled={!senha} onClick={() => executar(() => put("/plataforma/smtp-senha", { valor: senha }), "Senha salva").then(() => { setSenha(""); recarregar(); })}>Salvar senha</Botao>
        </div>
        <div className="flex items-end gap-2 border-t border-linha pt-3">
          <Campo rotulo="Enviar teste para" className="flex-1"><Entrada value={para} onChange={(e) => setPara(e.target.value)} /></Campo>
          <Botao variante="secundario" carregando={carregando} onClick={() => executar(() => post("/plataforma/testar-email", { para: para || undefined }), "E-mail de teste enviado")}>Testar</Botao>
        </div>
      </Card>
      <div className="lg:col-span-2"><Botao carregando={carregando} onClick={() => executar(() => put("/plataforma/config", f), "Configurações salvas").then(recarregar)}>Salvar configurações</Botao></div>
    </div>
  );
}

function Importar() {
  const [r, setR] = useState<any>(null);
  const { executar, carregando } = useAcao();
  const { confirmar } = useAvisos();
  return (
    <Card className="flex max-w-3xl flex-col gap-3">
      <TituloCard icone={DatabaseZap}>Importar dados do Meppy</TituloCard>
      <p className="text-[13px]">Traz a cópia exportada do Meppy (pasta <code>dados-meppy</code> no servidor): empresa, equipe, contatos, conversas com mídias e áudios, funil e negócios, robô e conhecimento, automações, agenda, propostas, etiquetas e campos.</p>
      <Dica>Pode rodar quantas vezes quiser: o que já foi importado é atualizado, nada é duplicado. Por segurança, o robô vem <b>pausado</b>, as automações <b>desligadas</b> e o WhatsApp <b>desconectado</b> — assim nada é enviado para os clientes até você decidir virar a chave.</Dica>
      <Botao className="self-start" carregando={carregando} icone={<DatabaseZap className="size-4" />} onClick={async () => { if (await confirmar("Importar/atualizar os dados do Meppy agora? Pode levar alguns minutos.", { botao: "Importar" })) executar(() => post<any>("/plataforma/importar-meppy", {}), "Importação concluída").then((x) => x && setR(x)); }}>Importar agora</Botao>
      {r && <pre className="max-h-96 overflow-auto rounded-xl bg-fundo p-3 text-[12px]">{JSON.stringify(r, null, 2)}</pre>}
    </Card>
  );
}
