import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Copy, Crown, Eye, Medal, Pencil, Plus, Target, Trash2, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { Botao, Campo, Entrada, Interruptor, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { Abas, Avatar, Barra, CabecalhoPagina, Card, Carregando, Dica, Selo, TituloCard, Vazio, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { del, post, put, qs } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { data, duracao, num, reais, telefone } from "../../lib/formato";
import { useEvento, useSessao } from "../../lib/sessao";

type Aba = "membros" | "metas" | "supervisao" | "setores";
export const Route = createFileRoute("/_app/equipe")({
  validateSearch: (s: Record<string, unknown>): { aba?: Aba } => ({ aba: typeof s.aba === "string" ? (s.aba as Aba) : undefined }),
  component: Equipe,
});

const PAPEIS: Record<string, string> = { dono: "Dono", admin: "Administrador", supervisor: "Supervisor", atendente: "Atendente" };
const TIPOS_META: Record<string, string> = { vendas_valor: "Valor vendido (R$)", vendas_qtd: "Vendas (quantidade)", negocios_ganhos: "Negócios ganhos", conversas: "Conversas atendidas" };

function Equipe() {
  const { aba = "membros" } = Route.useSearch();
  const navegar = Route.useNavigate();
  const [dias, setDias] = useState(30);
  const { dados, recarregar } = useDados<any>(`/equipe${qs({ dias })}`);
  const { pode } = useSessao();
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Equipe" icone={Users} descricao="Quem atende, quem recebe os leads e como cada um está indo." />
      <Abas valor={aba} aoMudar={(a) => navegar({ search: { aba: a } })} abas={[
        { valor: "membros", rotulo: "Pessoas e ranking" }, { valor: "metas", rotulo: "Metas" },
        ...(pode("supervisor") ? [{ valor: "supervisao" as Aba, rotulo: "Supervisão ao vivo" }] : []), { valor: "setores", rotulo: "Setores" },
      ]} />
      {!dados ? <Carregando /> : (
        <>
          {aba === "membros" && <Membros dados={dados} dias={dias} setDias={setDias} recarregar={recarregar} />}
          {aba === "metas" && <Metas membros={dados.membros} />}
          {aba === "supervisao" && <Supervisao />}
          {aba === "setores" && <Setores setores={dados.setores} recarregar={recarregar} />}
        </>
      )}
    </div>
  );
}

function Membros({ dados, dias, setDias, recarregar }: { dados: any; dias: number; setDias: (d: number) => void; recarregar: () => void }) {
  const [convidar, setConvidar] = useState(false);
  const [editar, setEditar] = useState<any>(null);
  const { me, pode } = useSessao();
  const { executar } = useAcao();
  const { confirmar } = useAvisos();
  const ranking = [...dados.membros].sort((a, b) => b.pontos - a.pontos);
  const admin = pode("admin");
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Card className="!p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <TituloCard icone={Users}>Pessoas</TituloCard>
          <div className="flex gap-2">
            <Selecao className="!w-32" value={String(dias)} onChange={(e) => setDias(Number(e.target.value))} opcoes={[{ valor: "7", rotulo: "7 dias" }, { valor: "30", rotulo: "30 dias" }, { valor: "90", rotulo: "90 dias" }]} />
            {admin && <Botao icone={<UserPlus className="size-4" />} onClick={() => setConvidar(true)}>Convidar</Botao>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Pessoa</th><th>Papel</th><th>Setor</th><th>Ativas agora</th><th>Atendidas</th><th>Vendas</th><th>1ª resposta</th><th>Recebe leads</th><th></th></tr></thead>
            <tbody>{dados.membros.map((m: any) => (
              <tr key={m.id} className={linhaTabela}>
                <td className="px-4 py-2.5"><div className="flex items-center gap-2"><Avatar nome={m.nome} foto={m.fotoUrl} tamanho={32} /><div><div className="font-semibold">{m.nome}{m.id === me.usuario.id && <span className="text-suave"> (você)</span>}</div><div className="text-[12px] text-suave">{m.cargo || m.email}</div></div></div></td>
                <td><Selo cor={m.papel === "dono" ? "laranja" : m.papel === "admin" ? "petroleo" : "cinza"}>{PAPEIS[m.papel]}</Selo></td>
                <td className="text-suave">{m.setorNome ?? "—"}</td>
                <td>{m.conversasAtivas}{m.limiteConversas > 0 && <span className="text-suave"> / {m.limiteConversas}</span>}</td>
                <td>{num(m.atendidas)}</td>
                <td>{m.vendas} <span className="text-suave">· {reais(m.receita)}</span></td>
                <td>{m.primeiraRespostaMs > 0 ? duracao(m.primeiraRespostaMs) : "—"}</td>
                <td>{m.recebeLeads ? <Selo cor="verde">Sim</Selo> : <Selo>Não</Selo>}</td>
                <td className="pr-3 text-right">{admin && <>
                  <button type="button" onClick={() => setEditar({ ...m })} className="rounded-lg p-1.5 text-suave hover:bg-fundo"><Pencil className="size-4" /></button>
                  {m.papel !== "dono" && m.id !== me.usuario.id && <button type="button" onClick={async () => { if (await confirmar(`Remover ${m.nome} da equipe? As conversas dele voltam para a fila.`, { perigo: true, botao: "Remover" })) executar(() => del(`/equipe/membros/${m.id}`), "Removido").then(recarregar); }} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button>}
                </>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {dados.agentes.length > 0 && (
          <div className="border-t border-linha px-4 py-3">
            <div className="mb-2 text-[12px] font-semibold text-suave uppercase">Robôs de IA</div>
            <div className="flex flex-wrap gap-2">{dados.agentes.map((a: any) => (
              <Link key={a.id} to="/agentes/$id" params={{ id: a.id }} className="flex items-center gap-2 rounded-xl bg-fundo px-3 py-2 text-[13px]"><Bot className="size-4 text-laranja" /><b>{a.nome}</b><span className="text-suave">{a.conversasAtivas} ativas · {num(a.atendidas)} atendidas</span></Link>
            ))}</div>
          </div>
        )}
        {dados.convites.length > 0 && (
          <div className="border-t border-linha px-4 py-3">
            <div className="mb-2 text-[12px] font-semibold text-suave uppercase">Convites pendentes</div>
            {dados.convites.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 py-1 text-[13px]"><span className="font-semibold">{c.nome ?? c.email}</span><span className="text-suave">{c.email} · {PAPEIS[c.papel]} · vence {data(c.expiraEm)}</span>
                {admin && <button type="button" onClick={() => executar(() => del(`/equipe/convites/${c.id}`), "Convite cancelado").then(recarregar)} className="ml-auto text-[12px] font-semibold text-vermelho">Cancelar</button>}</div>
            ))}
          </div>
        )}
      </Card>
      <Card>
        <TituloCard icone={Medal}>Ranking</TituloCard>
        <p className="mb-3 text-[12px] text-suave">Pontos: 10 por conversa atendida, 50 por venda e 1 a cada R$10 vendidos.</p>
        <ol className="flex flex-col gap-2">
          {ranking.map((m, i) => (
            <li key={m.id} className={`flex items-center gap-3 rounded-2xl p-2.5 ${i === 0 ? "bg-laranja-claro" : "bg-fundo"}`}>
              <span className={`grid size-7 place-items-center rounded-full font-titulo text-[13px] font-bold ${i === 0 ? "bg-laranja-gradiente text-white" : i < 3 ? "bg-ambar text-white" : "bg-white text-suave"}`}>{i === 0 ? <Crown className="size-4" /> : i + 1}</span>
              <Avatar nome={m.nome} foto={m.fotoUrl} tamanho={30} />
              <span className="flex-1 truncate font-semibold">{m.nome}</span>
              <span className="font-titulo font-bold text-laranja">{num(m.pontos)}</span>
            </li>
          ))}
        </ol>
      </Card>
      {convidar && <Convidar setores={dados.setores} aoFechar={(ok) => { setConvidar(false); if (ok) recarregar(); }} />}
      {editar && (
        <Modal titulo={`Editar ${editar.nome}`} aoFechar={() => setEditar(null)} rodape={<Botao onClick={() => executar(() => put(`/equipe/membros/${editar.id}`, editar), "Salvo").then((r) => { if (r) { setEditar(null); recarregar(); } })}>Salvar</Botao>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Papel"><Selecao value={editar.papel} onChange={(e) => setEditar({ ...editar, papel: e.target.value })} opcoes={Object.entries(PAPEIS).filter(([k]) => k !== "dono" || pode("dono")).map(([v, r]) => ({ valor: v, rotulo: r }))} /></Campo>
            <Campo rotulo="Setor"><Selecao value={editar.setorId ?? ""} onChange={(e) => setEditar({ ...editar, setorId: e.target.value || null })} vazio="Nenhum" opcoes={dados.setores.map((s: any) => ({ valor: s.id, rotulo: s.nome }))} /></Campo>
            <Campo rotulo="Cargo"><Entrada value={editar.cargo ?? ""} onChange={(e) => setEditar({ ...editar, cargo: e.target.value })} placeholder="Vendedora, SDR..." /></Campo>
            <Campo rotulo="Gestor"><Selecao value={editar.gestorId ?? ""} onChange={(e) => setEditar({ ...editar, gestorId: e.target.value || null })} vazio="Nenhum" opcoes={dados.membros.filter((x: any) => x.id !== editar.id).map((x: any) => ({ valor: x.id, rotulo: x.nome }))} /></Campo>
            <Campo rotulo="Limite de conversas ao mesmo tempo (0 = sem limite)"><Entrada type="number" value={editar.limiteConversas} onChange={(e) => setEditar({ ...editar, limiteConversas: Number(e.target.value) })} /></Campo>
            <div className="flex items-end"><Interruptor ligado={editar.recebeLeads} aoMudar={(v) => setEditar({ ...editar, recebeLeads: v })} rotulo="Recebe leads automaticamente" /></div>
          </div>
          <div className="mt-3"><Dica>Atendente vê as próprias conversas e a fila. Supervisor vê tudo e acompanha a equipe. Administrador também mexe nas configurações.</Dica></div>
        </Modal>
      )}
    </div>
  );
}

function Convidar({ setores, aoFechar }: { setores: any[]; aoFechar: (ok?: boolean) => void }) {
  const [f, setF] = useState({ email: "", nome: "", papel: "atendente", setorId: "" });
  const [r, setR] = useState<any>(null);
  const { executar, carregando } = useAcao();
  const { avisar } = useAvisos();
  if (r) {
    return (
      <Modal titulo="Convite criado" aoFechar={() => aoFechar(true)}>
        <div className="flex flex-col gap-3 text-[13px]">
          <p>{r.emailEnviado ? "Enviamos o convite por e-mail. Se preferir, mande também este link pelo WhatsApp:" : "Envie este link para a pessoa (vale 7 dias):"}</p>
          <div className="flex gap-2"><Entrada readOnly value={r.link} /><Botao icone={<Copy className="size-4" />} onClick={() => { navigator.clipboard.writeText(r.link); avisar("Link copiado"); }}>Copiar</Botao></div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal titulo="Convidar para a equipe" aoFechar={() => aoFechar()} rodape={<Botao carregando={carregando} onClick={() => executar(() => post("/equipe/convites", { ...f, setorId: f.setorId || null })).then((x) => x && setR(x))}>Gerar convite</Botao>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo rotulo="E-mail"><Entrada type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
        <Campo rotulo="Papel"><Selecao value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value })} opcoes={["atendente", "supervisor", "admin"].map((p) => ({ valor: p, rotulo: PAPEIS[p] }))} /></Campo>
        <Campo rotulo="Setor"><Selecao value={f.setorId} onChange={(e) => setF({ ...f, setorId: e.target.value })} vazio="Nenhum" opcoes={setores.map((s) => ({ valor: s.id, rotulo: s.nome }))} /></Campo>
      </div>
    </Modal>
  );
}

function Metas({ membros }: { membros: any[] }) {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const { dados, recarregar } = useDados<any[]>(`/equipe/metas${qs({ mes })}`);
  const [nova, setNova] = useState<any>(null);
  const { executar } = useAcao();
  const { pode } = useSessao();
  const formatar = (t: string, v: number) => (t === "vendas_valor" ? reais(v) : num(v));
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between"><TituloCard icone={Target}>Metas do mês</TituloCard>
        <div className="flex gap-2"><Entrada type="month" className="!w-44" value={mes} onChange={(e) => setMes(e.target.value)} />{pode("supervisor") && <Botao icone={<Plus className="size-4" />} onClick={() => setNova({ usuarioId: "", tipo: "vendas_valor", valor: 0 })}>Nova meta</Botao>}</div></div>
      {!dados ? <Carregando /> : dados.length === 0 ? <Vazio icone={Target} titulo="Sem metas neste mês">Defina metas para a equipe toda ou por pessoa.</Vazio> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dados.map((m) => {
            const pct = m.valor > 0 ? Math.round((Number(m.realizado) / Number(m.valor)) * 100) : 0;
            return (
              <div key={m.id} className="rounded-2xl border border-linha p-4">
                <div className="flex items-start justify-between"><div><div className="font-semibold">{m.usuarioNome ?? "Equipe toda"}</div><div className="text-[12px] text-suave">{TIPOS_META[m.tipo]}</div></div>
                  {pode("supervisor") && <button type="button" onClick={() => executar(() => del(`/equipe/metas/${m.id}`), "Meta removida").then(recarregar)} className="text-suave hover:text-vermelho"><Trash2 className="size-4" /></button>}</div>
                <div className="mt-3 flex items-baseline justify-between"><span className="font-titulo text-[20px] font-bold">{formatar(m.tipo, m.realizado)}</span><span className="text-[12px] text-suave">de {formatar(m.tipo, m.valor)}</span></div>
                <div className="mt-2"><Barra valor={Number(m.realizado)} total={Number(m.valor)} cor={pct >= 100 ? "bg-verde" : "bg-laranja-gradiente"} /></div>
                <div className={`mt-1 text-right text-[12px] font-semibold ${pct >= 100 ? "text-verde" : "text-suave"}`}>{pct}%{pct >= 100 && " 🎉"}</div>
              </div>
            );
          })}
        </div>
      )}
      {nova && (
        <Modal titulo="Nova meta" aoFechar={() => setNova(null)} rodape={<Botao onClick={() => executar(() => post("/equipe/metas", { ...nova, mes, usuarioId: nova.usuarioId || null }), "Meta salva").then((r) => { if (r) { setNova(null); recarregar(); } })}>Salvar</Botao>}>
          <div className="grid gap-3">
            <Campo rotulo="Para quem"><Selecao value={nova.usuarioId} onChange={(e) => setNova({ ...nova, usuarioId: e.target.value })} vazio="Equipe toda" opcoes={membros.map((m) => ({ valor: m.id, rotulo: m.nome }))} /></Campo>
            <Campo rotulo="O que medir"><Selecao value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value })} opcoes={Object.entries(TIPOS_META).map(([v, r]) => ({ valor: v, rotulo: r }))} /></Campo>
            <Campo rotulo="Meta"><Entrada type="number" value={nova.valor} onChange={(e) => setNova({ ...nova, valor: Number(e.target.value) })} /></Campo>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function Supervisao() {
  const { dados, recarregar } = useDados<any[]>("/equipe/supervisao");
  useEvento("conversa", recarregar);
  useEvento("mensagem", recarregar);
  if (!dados) return <Carregando />;
  const grupos = new Map<string, any[]>();
  for (const c of dados) { const k = c.humanoNome ?? (c.agenteNome ? `🤖 ${c.agenteNome}` : "Fila (sem ninguém)"); grupos.set(k, [...(grupos.get(k) ?? []), c]); }
  return (
    <div className="flex flex-col gap-3">
      <Dica icone={Eye}>Conversas em andamento agora. Em vermelho: cliente esperando resposta há mais de 15 minutos.</Dica>
      {dados.length === 0 ? <Card><Vazio icone={Eye} titulo="Nenhuma conversa em andamento" /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...grupos.entries()].map(([nome, lista]) => (
            <Card key={nome} className="flex flex-col gap-2">
              <div className="flex items-center justify-between"><div className="font-titulo font-bold">{nome}</div><Selo>{lista.length}</Selo></div>
              {lista.map((c) => {
                const esperando = c.aguardandoResposta ? Math.round(Number(c.minutosEsperando)) : 0;
                return (
                  <Link key={c.id} to="/conversas" search={{ c: c.id }} className={`rounded-xl px-3 py-2 text-[12.5px] ${esperando > 15 ? "bg-red-50 ring-1 ring-vermelho/30" : "bg-fundo"}`}>
                    <div className="flex justify-between"><b className="truncate">{c.contatoNome ?? telefone(c.contatoTelefone)}</b>{c.aguardandoResposta && <span className={esperando > 15 ? "font-semibold text-vermelho" : "text-suave"}>esperando {esperando} min</span>}</div>
                    <div className="truncate text-suave">{c.ultimaMensagem}</div>
                  </Link>
                );
              })}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Setores({ setores, recarregar }: { setores: any[]; recarregar: () => void }) {
  const [editar, setEditar] = useState<any>(null);
  const { executar } = useAcao();
  const { pode } = useSessao();
  return (
    <Card className="!p-0">
      <div className="flex items-center justify-between px-4 py-3"><TituloCard>Setores</TituloCard>{pode("admin") && <Botao tamanho="sm" icone={<Plus className="size-4" />} onClick={() => setEditar({ nome: "", cor: "#145f6e", descricao: "" })}>Novo setor</Botao>}</div>
      <div className="px-4 pb-3"><Dica>Setores separam a fila (ex.: Vendas, Suporte, Financeiro). O robô pode transferir para um setor específico.</Dica></div>
      {setores.length === 0 ? <Vazio icone={Users} titulo="Nenhum setor" /> : (
        <table className="w-full text-[13px]"><tbody>{setores.map((s) => (
          <tr key={s.id} className={linhaTabela}>
            <td className="px-4 py-2.5"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: s.cor }} /><b>{s.nome}</b></td><td className="text-suave">{s.descricao}</td><td>{s.membros} pessoas</td>
            <td className="pr-3 text-right">{pode("admin") && <><button type="button" onClick={() => setEditar({ ...s })} className="rounded-lg p-1.5 text-suave hover:bg-fundo"><Pencil className="size-4" /></button>
              <button type="button" onClick={() => executar(() => del(`/equipe/setores/${s.id}`), "Setor apagado").then(recarregar)} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button></>}</td>
          </tr>
        ))}</tbody></table>
      )}
      {editar && (
        <Modal titulo={editar.id ? "Editar setor" : "Novo setor"} aoFechar={() => setEditar(null)} rodape={<Botao onClick={() => executar(() => (editar.id ? put(`/equipe/setores/${editar.id}`, editar) : post("/equipe/setores", editar)), "Setor salvo").then((r) => { if (r) { setEditar(null); recarregar(); } })}>Salvar</Botao>}>
          <div className="grid gap-3">
            <Campo rotulo="Nome"><Entrada value={editar.nome} onChange={(e) => setEditar({ ...editar, nome: e.target.value })} /></Campo>
            <Campo rotulo="Cor"><input type="color" value={editar.cor} onChange={(e) => setEditar({ ...editar, cor: e.target.value })} className="h-9 w-full rounded-lg" /></Campo>
            <Campo rotulo="Descrição (o robô lê para saber quando transferir)"><Entrada value={editar.descricao ?? ""} onChange={(e) => setEditar({ ...editar, descricao: e.target.value })} /></Campo>
          </div>
        </Modal>
      )}
    </Card>
  );
}
