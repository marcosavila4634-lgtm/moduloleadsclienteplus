import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, ChevronRight, Copy, ExternalLink, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { BuscaContato, type ContatoMin } from "../../components/BuscaContato";
import { AreaTexto, Botao, Campo, Entrada, Interruptor, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { EditorHorarios } from "../../components/Horarios";
import { Abas, CabecalhoPagina, Card, CardNumero, Carregando, Dica, Selo, TituloCard, Vazio, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { del, post, put, qs } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { dataHora, hora, reais, telefone } from "../../lib/formato";
import { perguntaNova, TIPOS_FORMULARIO, TIPOS_PERGUNTA, type Pergunta } from "../../lib/formularios";
import { useEvento } from "../../lib/sessao";

type Aba = "calendario" | "servicos" | "profissionais" | "bloqueios" | "formularios" | "comissoes" | "relatorio" | "config";
export const Route = createFileRoute("/_app/agenda")({
  validateSearch: (s: Record<string, unknown>): { aba?: Aba } => ({ aba: typeof s.aba === "string" ? (s.aba as Aba) : undefined }),
  component: Agenda,
});

export const STATUS_EVENTO: Record<string, { rotulo: string; cor: "cinza" | "verde" | "laranja" | "vermelho" | "petroleo" | "ambar" }> = {
  scheduled: { rotulo: "Agendado", cor: "petroleo" }, confirmed: { rotulo: "Confirmado", cor: "verde" }, done: { rotulo: "Realizado", cor: "cinza" },
  canceled: { rotulo: "Cancelado", cor: "vermelho" }, no_show: { rotulo: "Faltou", cor: "ambar" },
};

function Agenda() {
  const { aba = "calendario" } = Route.useSearch();
  const navegar = Route.useNavigate();
  const { dados: cad, recarregar } = useDados<any>("/agenda/cadastros");
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Agenda" icone={CalendarDays} descricao="Agendamentos feitos pela equipe, pelo robô e pela página de agendamento." />
      <Abas valor={aba} aoMudar={(a) => navegar({ search: { aba: a } })} abas={[
        { valor: "calendario", rotulo: "Calendário" }, { valor: "servicos", rotulo: "Serviços" }, { valor: "profissionais", rotulo: "Profissionais" },
        { valor: "bloqueios", rotulo: "Bloqueios" }, { valor: "formularios", rotulo: "Formulários" }, { valor: "comissoes", rotulo: "Comissões" },
        { valor: "relatorio", rotulo: "Relatório" }, { valor: "config", rotulo: "Página e lembretes" },
      ]} />
      {!cad ? <Carregando /> : (
        <>
          {aba === "calendario" && <Calendario cad={cad} />}
          {aba === "servicos" && <Servicos cad={cad} recarregar={recarregar} />}
          {aba === "profissionais" && <Profissionais cad={cad} recarregar={recarregar} />}
          {aba === "bloqueios" && <Bloqueios cad={cad} />}
          {aba === "formularios" && <Formularios cad={cad} recarregar={recarregar} />}
          {aba === "comissoes" && <Comissoes />}
          {aba === "relatorio" && <Relatorio />}
          {aba === "config" && <Config />}
        </>
      )}
    </div>
  );
}

// ---------------- calendário semanal ----------------

const HORA_INI = 7, HORA_FIM = 22, ALTURA = 48;
const inicioSemana = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const somaDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function Calendario({ cad }: { cad: any }) {
  const [semana, setSemana] = useState(() => inicioSemana(new Date()));
  const [colab, setColab] = useState("");
  const [novo, setNovo] = useState<any>(null);
  const [aberto, setAberto] = useState<any>(null);
  const fim = somaDias(semana, 7);
  const { dados, recarregar } = useDados<any[]>(`/agenda/eventos${qs({ de: semana.toISOString(), ate: fim.toISOString(), colaborador: colab || undefined })}`);
  useEvento("agenda", recarregar);
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(semana, i));
  const hoje = new Date().toDateString();
  const porDia = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const e of dados ?? []) { const k = new Date(e.inicio).toDateString(); m.set(k, [...(m.get(k) ?? []), e]); }
    return m;
  }, [dados]);
  return (
    <Card className="!p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-linha px-4 py-3">
        <Botao variante="secundario" tamanho="sm" onClick={() => setSemana(inicioSemana(new Date()))}>Hoje</Botao>
        <button type="button" onClick={() => setSemana(somaDias(semana, -7))} className="rounded-lg p-1.5 hover:bg-fundo"><ChevronLeft className="size-4" /></button>
        <button type="button" onClick={() => setSemana(somaDias(semana, 7))} className="rounded-lg p-1.5 hover:bg-fundo"><ChevronRight className="size-4" /></button>
        <div className="font-titulo font-bold first-letter:uppercase">{semana.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</div>
        <div className="ml-auto flex items-center gap-2">
          <Selecao className="!w-44" value={colab} onChange={(e) => setColab(e.target.value)} vazio="Todos os profissionais" opcoes={cad.colaboradores.filter((c: any) => c.ativo).map((c: any) => ({ valor: c.id, rotulo: c.nome }))} />
          <Botao tamanho="sm" icone={<Plus className="size-4" />} onClick={() => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); setNovo({ inicio: local(d) }); }}>Agendar</Botao>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[860px] grid-cols-[56px_repeat(7,1fr)]">
          <div />
          {dias.map((d) => (
            <div key={d.toISOString()} className={`border-b border-l border-linha py-2 text-center ${d.toDateString() === hoje ? "bg-laranja-claro" : ""}`}>
              <div className="text-[11px] text-suave uppercase">{d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</div>
              <div className={`font-titulo text-[18px] font-bold ${d.toDateString() === hoje ? "text-laranja" : ""}`}>{d.getDate()}</div>
            </div>
          ))}
          <div className="relative" style={{ height: (HORA_FIM - HORA_INI) * ALTURA }}>
            {Array.from({ length: HORA_FIM - HORA_INI }, (_, i) => <div key={i} className="absolute right-2 text-[11px] text-suave" style={{ top: i * ALTURA - 7 }}>{i > 0 && `${HORA_INI + i}h`}</div>)}
          </div>
          {dias.map((d) => (
            <div key={d.toISOString()} className="relative border-l border-linha" style={{ height: (HORA_FIM - HORA_INI) * ALTURA }}
              onClick={(ev) => {
                const y = ev.clientY - (ev.currentTarget as HTMLElement).getBoundingClientRect().top;
                const x = new Date(d); x.setHours(HORA_INI, Math.floor((y / ALTURA) * 2) * 30, 0, 0);
                setNovo({ inicio: local(x), colaboradorId: colab || undefined });
              }}>
              {Array.from({ length: HORA_FIM - HORA_INI }, (_, i) => <div key={i} className="absolute inset-x-0 border-t border-linha/60" style={{ top: i * ALTURA }} />)}
              {(porDia.get(d.toDateString()) ?? []).map((e) => {
                const a = new Date(e.inicio), b = new Date(e.fim);
                const top = ((a.getHours() + a.getMinutes() / 60) - HORA_INI) * ALTURA;
                const alt = Math.max(22, ((b.getTime() - a.getTime()) / 3600000) * ALTURA - 2);
                const cor = e.colaboradorCor ?? e.tipoCor ?? "#145f6e";
                return (
                  <button key={e.id} type="button" onClick={(ev) => { ev.stopPropagation(); setAberto(e); }} style={{ top, height: alt, background: `${cor}1f`, borderColor: cor }}
                    className={`absolute inset-x-1 overflow-hidden rounded-lg border-l-4 px-1.5 py-1 text-left text-[11.5px] leading-tight ${e.status === "canceled" ? "line-through opacity-50" : ""}`}>
                    <div className="font-semibold">{hora(e.inicio)} {e.contatoNome ?? e.titulo}</div>
                    <div className="truncate text-suave">{e.tipoNome ?? e.titulo}{e.colaboradorNome && ` · ${e.colaboradorNome}`}</div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {novo && <NovoEvento cad={cad} inicial={novo} aoFechar={(ok) => { setNovo(null); if (ok) recarregar(); }} />}
      {aberto && <DetalheEvento e={aberto} cad={cad} aoFechar={() => { setAberto(null); recarregar(); }} />}
    </Card>
  );
}

function NovoEvento({ cad, inicial, aoFechar }: { cad: any; inicial: any; aoFechar: (ok?: boolean) => void }) {
  const [f, setF] = useState<any>({ tipoId: "", colaboradorId: "", titulo: "", notas: "", valor: "", ...inicial });
  const [contato, setContato] = useState<ContatoMin | null>(null);
  const [novoContato, setNovoContato] = useState({ nome: "", telefone: "" });
  const { executar, carregando } = useAcao();
  const tipo = cad.tipos.find((t: any) => t.id === f.tipoId);
  return (
    <Modal titulo="Novo agendamento" aoFechar={() => aoFechar()} rodape={
      <Botao carregando={carregando} onClick={() => {
        const ini = new Date(f.inicio);
        const corpo: any = { tipoId: f.tipoId || undefined, colaboradorId: f.colaboradorId || undefined, inicio: ini.toISOString(), titulo: f.titulo || undefined, notas: f.notas || undefined, valor: f.valor === "" ? undefined : Number(f.valor) };
        if (!tipo) corpo.fim = new Date(ini.getTime() + Number(f.duracao || 60) * 60000).toISOString();
        if (contato) corpo.contatoId = contato.id; else if (novoContato.telefone) Object.assign(corpo, novoContato);
        executar(() => post("/agenda/eventos", corpo), "Agendado! O cliente recebe a confirmação no WhatsApp.").then((r) => r && aoFechar(true));
      }}>Agendar</Botao>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Cliente" className="sm:col-span-2">
          <BuscaContato valor={contato} aoEscolher={setContato} />
          {!contato && <div className="mt-2 grid grid-cols-2 gap-2"><Entrada placeholder="ou novo: nome" value={novoContato.nome} onChange={(e) => setNovoContato({ ...novoContato, nome: e.target.value })} /><Entrada placeholder="WhatsApp" value={novoContato.telefone} onChange={(e) => setNovoContato({ ...novoContato, telefone: e.target.value })} /></div>}
        </Campo>
        <Campo rotulo="Serviço"><Selecao value={f.tipoId} onChange={(e) => setF({ ...f, tipoId: e.target.value })} vazio="Outro (livre)" opcoes={cad.tipos.filter((t: any) => t.ativo).map((t: any) => ({ valor: t.id, rotulo: `${t.nome} (${t.duracaoMin} min)` }))} /></Campo>
        <Campo rotulo="Profissional"><Selecao value={f.colaboradorId ?? ""} onChange={(e) => setF({ ...f, colaboradorId: e.target.value })} vazio="Qualquer / nenhum" opcoes={cad.colaboradores.filter((c: any) => c.ativo).map((c: any) => ({ valor: c.id, rotulo: c.nome }))} /></Campo>
        <Campo rotulo="Início"><Entrada type="datetime-local" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></Campo>
        {!tipo ? <Campo rotulo="Duração (min)"><Entrada type="number" value={f.duracao ?? 60} onChange={(e) => setF({ ...f, duracao: e.target.value })} /></Campo>
          : <Campo rotulo="Valor (R$)"><Entrada type="number" value={f.valor} placeholder={String(tipo.preco)} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Campo>}
        {!tipo && <Campo rotulo="Título" className="sm:col-span-2"><Entrada value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Reunião, Visita" /></Campo>}
        <Campo rotulo="Observações" className="sm:col-span-2"><AreaTexto rows={2} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></Campo>
      </div>
    </Modal>
  );
}

function DetalheEvento({ e, cad, aoFechar }: { e: any; cad: any; aoFechar: () => void }) {
  const [f, setF] = useState({ status: e.status, valor: e.valor, pago: e.pago, formaPagamento: e.formaPagamento ?? "", notas: e.notas ?? "", inicio: local(new Date(e.inicio)), colaboradorId: e.colaboradorId ?? "" });
  const [form, setForm] = useState("");
  const { executar, carregando } = useAcao();
  const { avisar, confirmar } = useAvisos();
  const dur = new Date(e.fim).getTime() - new Date(e.inicio).getTime();
  return (
    <Modal titulo={e.titulo} aoFechar={aoFechar} largura="max-w-xl" rodape={
      <>
        {e.status !== "canceled" && <Botao variante="fantasma" className="mr-auto !text-vermelho" onClick={async () => { if (await confirmar("Cancelar este agendamento? O cliente é avisado.", { perigo: true, botao: "Cancelar agendamento" })) executar(() => del(`/agenda/eventos/${e.id}`), "Cancelado").then(aoFechar); }}>Cancelar agendamento</Botao>}
        <Botao carregando={carregando} onClick={() => {
          const ini = new Date(f.inicio);
          executar(() => put(`/agenda/eventos/${e.id}`, { ...f, colaboradorId: f.colaboradorId || null, inicio: ini.toISOString(), fim: new Date(ini.getTime() + dur).toISOString(), valor: Number(f.valor) }), "Salvo").then((r) => r && aoFechar());
        }}>Salvar</Botao>
      </>}>
      <div className="flex flex-col gap-3 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <Selo cor={STATUS_EVENTO[e.status]?.cor}>{STATUS_EVENTO[e.status]?.rotulo}</Selo>
          {e.origem && <Selo>{e.origem === "ia" ? "🤖 pelo robô" : e.origem === "publico" ? "pela página" : "manual"}</Selo>}
          <span className="text-suave">{dataHora(e.inicio)} → {hora(e.fim)}</span>
        </div>
        {e.contatoId && (
          <div className="flex items-center justify-between rounded-xl bg-fundo px-3 py-2">
            <span><b>{e.contatoNome}</b> <span className="text-suave">{telefone(e.contatoTelefone)}</span></span>
            <Link to="/contatos/$id" params={{ id: e.contatoId }} className="font-semibold text-laranja">Ficha e prontuário →</Link>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(STATUS_EVENTO).filter(([k]) => k !== "canceled").map(([k, s]) => (
            <button key={k} type="button" onClick={() => setF({ ...f, status: k })} className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 ${f.status === k ? "bg-laranja-gradiente text-white ring-transparent" : "ring-linha"}`}>{s.rotulo}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Remarcar para"><Entrada type="datetime-local" value={f.inicio} onChange={(ev) => setF({ ...f, inicio: ev.target.value })} /></Campo>
          <Campo rotulo="Profissional"><Selecao value={f.colaboradorId} onChange={(ev) => setF({ ...f, colaboradorId: ev.target.value })} vazio="Nenhum" opcoes={cad.colaboradores.map((c: any) => ({ valor: c.id, rotulo: c.nome }))} /></Campo>
          <Campo rotulo="Valor (R$)"><Entrada type="number" value={f.valor} onChange={(ev) => setF({ ...f, valor: ev.target.value })} /></Campo>
          <Campo rotulo="Forma de pagamento"><Selecao value={f.formaPagamento} onChange={(ev) => setF({ ...f, formaPagamento: ev.target.value })} vazio="—" opcoes={["pix", "dinheiro", "cartao_credito", "cartao_debito", "transferencia"].map((x) => ({ valor: x, rotulo: x.replace("_", " ") }))} /></Campo>
        </div>
        <Interruptor ligado={f.pago} aoMudar={(v) => setF({ ...f, pago: v })} rotulo="Pago" descricao="Vira uma compra no histórico do cliente e conta nas comissões." />
        <Campo rotulo="Notas"><AreaTexto rows={2} value={f.notas} onChange={(ev) => setF({ ...f, notas: ev.target.value })} /></Campo>
        {e.contatoId && cad.formularios.some((x: any) => x.ativo && x.tipo !== "nota") && (
          <div className="flex items-end gap-2 rounded-xl border border-linha p-3">
            <Campo rotulo="Enviar formulário para o cliente preencher e assinar" className="flex-1">
              <Selecao value={form} onChange={(ev) => setForm(ev.target.value)} vazio="Escolha..." opcoes={cad.formularios.filter((x: any) => x.ativo && x.tipo !== "nota").map((x: any) => ({ valor: x.id, rotulo: x.nome }))} />
            </Campo>
            <Botao variante="secundario" disabled={!form} icone={<Copy className="size-4" />} onClick={async () => {
              const r = await executar(() => post<any>("/agenda/formularios/enviar", { formularioId: form, contatoId: e.contatoId, eventoId: e.id }));
              if (r) { navigator.clipboard.writeText(r.link); avisar("Link copiado! Cole na conversa com o cliente."); }
            }}>Gerar link</Botao>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------- serviços ----------------

function Servicos({ cad, recarregar }: { cad: any; recarregar: () => void }) {
  const [editar, setEditar] = useState<any>(null);
  const { executar, carregando } = useAcao();
  const ativos = cad.tipos.filter((t: any) => t.ativo);
  return (
    <Card className="!p-0">
      <div className="flex items-center justify-between px-4 py-3"><TituloCard>Serviços</TituloCard><Botao tamanho="sm" icone={<Plus className="size-4" />} onClick={() => setEditar({ nome: "", duracaoMin: 60, intervaloMin: 0, preco: 0, cor: "#f47b20", localTipo: "presencial", publico: true, iaPodeAgendar: true, colaboradores: [] })}>Novo serviço</Botao></div>
      {ativos.length === 0 ? <Vazio icone={CalendarDays} titulo="Nenhum serviço">Cadastre o que você atende (ex.: Consulta, Corte, Avaliação).</Vazio> : (
        <table className="w-full text-[13px]">
          <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Serviço</th><th>Duração</th><th>Preço</th><th>Profissionais</th><th>Onde aparece</th><th></th></tr></thead>
          <tbody>{ativos.map((t: any) => (
            <tr key={t.id} className={linhaTabela}>
              <td className="px-4 py-2.5"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: t.cor }} /><b>{t.nome}</b></td>
              <td>{t.duracaoMin} min{t.intervaloMin > 0 && ` + ${t.intervaloMin}`}</td><td>{reais(t.preco)}</td>
              <td className="text-suave">{t.colaboradores?.length ? t.colaboradores.map((id: string) => cad.colaboradores.find((c: any) => c.id === id)?.nome).filter(Boolean).join(", ") : "Todos"}</td>
              <td className="text-[12px]">{[t.publico && "Página", t.iaPodeAgendar && "🤖 Robô"].filter(Boolean).join(" · ") || "Só equipe"}</td>
              <td className="pr-3 text-right"><button type="button" onClick={() => setEditar({ ...t, colaboradores: t.colaboradores ?? [] })} className="rounded-lg p-1.5 text-suave hover:bg-fundo"><Pencil className="size-4" /></button>
                <button type="button" onClick={() => executar(() => del(`/agenda/tipos/${t.id}`), "Serviço removido").then(recarregar)} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {editar && (
        <Modal titulo={editar.id ? "Editar serviço" : "Novo serviço"} aoFechar={() => setEditar(null)} rodape={<Botao carregando={carregando} onClick={() => executar(() => (editar.id ? put(`/agenda/tipos/${editar.id}`, editar) : post("/agenda/tipos", editar)), "Serviço salvo").then((r) => { if (r) { setEditar(null); recarregar(); } })}>Salvar</Botao>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome" className="sm:col-span-2"><Entrada value={editar.nome} onChange={(e) => setEditar({ ...editar, nome: e.target.value })} /></Campo>
            <Campo rotulo="Duração (min)"><Entrada type="number" value={editar.duracaoMin} onChange={(e) => setEditar({ ...editar, duracaoMin: Number(e.target.value) })} /></Campo>
            <Campo rotulo="Intervalo depois (min)"><Entrada type="number" value={editar.intervaloMin} onChange={(e) => setEditar({ ...editar, intervaloMin: Number(e.target.value) })} /></Campo>
            <Campo rotulo="Preço (R$)"><Entrada type="number" value={editar.preco} onChange={(e) => setEditar({ ...editar, preco: Number(e.target.value) })} /></Campo>
            <Campo rotulo="Cor"><input type="color" value={editar.cor} onChange={(e) => setEditar({ ...editar, cor: e.target.value })} className="h-9 w-full rounded-lg" /></Campo>
            <Campo rotulo="Onde"><Selecao value={editar.localTipo} onChange={(e) => setEditar({ ...editar, localTipo: e.target.value })} opcoes={[{ valor: "presencial", rotulo: "Presencial" }, { valor: "online", rotulo: "Online" }, { valor: "telefone", rotulo: "Por telefone" }]} /></Campo>
            <Campo rotulo="Endereço ou link"><Entrada value={editar.local ?? ""} onChange={(e) => setEditar({ ...editar, local: e.target.value })} /></Campo>
            <Campo rotulo="Categoria"><Selecao value={editar.categoriaId ?? ""} onChange={(e) => setEditar({ ...editar, categoriaId: e.target.value || null })} vazio="Sem categoria" opcoes={cad.categorias.map((c: any) => ({ valor: c.id, rotulo: c.nome }))} /></Campo>
            <Campo rotulo="Formulário ao agendar"><Selecao value={editar.formularioId ?? ""} onChange={(e) => setEditar({ ...editar, formularioId: e.target.value || null })} vazio="Nenhum" opcoes={cad.formularios.filter((f: any) => f.ativo && f.tipo !== "nota").map((f: any) => ({ valor: f.id, rotulo: f.nome }))} /></Campo>
            <Campo rotulo="Descrição" className="sm:col-span-2"><AreaTexto rows={2} value={editar.descricao ?? ""} onChange={(e) => setEditar({ ...editar, descricao: e.target.value })} /></Campo>
            <Campo rotulo="Quem atende (vazio = todos)" className="sm:col-span-2">
              <div className="flex flex-wrap gap-2">{cad.colaboradores.filter((c: any) => c.ativo).map((c: any) => {
                const on = editar.colaboradores.includes(c.id);
                return <button key={c.id} type="button" onClick={() => setEditar({ ...editar, colaboradores: on ? editar.colaboradores.filter((x: string) => x !== c.id) : [...editar.colaboradores, c.id] })} className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 ${on ? "bg-laranja-gradiente text-white ring-transparent" : "ring-linha"}`}>{c.nome}</button>;
              })}</div>
            </Campo>
            <div className="flex flex-col gap-3 sm:col-span-2">
              <Interruptor ligado={editar.publico} aoMudar={(v) => setEditar({ ...editar, publico: v })} rotulo="Aparece na página de agendamento" />
              <Interruptor ligado={editar.iaPodeAgendar} aoMudar={(v) => setEditar({ ...editar, iaPodeAgendar: v })} rotulo="O robô pode agendar" />
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}

// ---------------- profissionais ----------------

function Profissionais({ cad, recarregar }: { cad: any; recarregar: () => void }) {
  const [editar, setEditar] = useState<any>(null);
  const { executar, carregando } = useAcao();
  const { dados: equipe } = useDados<any>("/equipe");
  const ativos = cad.colaboradores.filter((c: any) => c.ativo);
  return (
    <Card className="!p-0">
      <div className="flex items-center justify-between px-4 py-3"><TituloCard>Profissionais</TituloCard><Botao tamanho="sm" icone={<Plus className="size-4" />} onClick={() => setEditar({ nome: "", cor: "#145f6e", comissaoPercentual: 0, horarios: {} })}>Novo profissional</Botao></div>
      {ativos.length === 0 ? <Vazio icone={CalendarDays} titulo="Nenhum profissional">Sem profissionais, a agenda é única e usa o horário da loja.</Vazio> : (
        <table className="w-full text-[13px]">
          <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Nome</th><th>Contato</th><th>Comissão</th><th>Horário</th><th></th></tr></thead>
          <tbody>{ativos.map((c: any) => (
            <tr key={c.id} className={linhaTabela}>
              <td className="px-4 py-2.5"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: c.cor }} /><b>{c.nome}</b></td>
              <td className="text-suave">{telefone(c.telefone) || c.email}</td><td>{c.comissaoPercentual}%</td>
              <td className="text-[12px] text-suave">{Object.keys(c.horarios ?? {}).length ? "Próprio" : "Da loja"}</td>
              <td className="pr-3 text-right"><button type="button" onClick={() => setEditar({ ...c })} className="rounded-lg p-1.5 text-suave hover:bg-fundo"><Pencil className="size-4" /></button>
                <button type="button" onClick={() => executar(() => del(`/agenda/colaboradores/${c.id}`), "Removido").then(recarregar)} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {editar && (
        <Modal titulo={editar.id ? "Editar profissional" : "Novo profissional"} largura="max-w-2xl" aoFechar={() => setEditar(null)} rodape={<Botao carregando={carregando} onClick={() => executar(() => (editar.id ? put(`/agenda/colaboradores/${editar.id}`, editar) : post("/agenda/colaboradores", editar)), "Salvo").then((r) => { if (r) { setEditar(null); recarregar(); } })}>Salvar</Botao>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome"><Entrada value={editar.nome} onChange={(e) => setEditar({ ...editar, nome: e.target.value })} /></Campo>
            <Campo rotulo="Usuário do sistema (opcional)"><Selecao value={editar.usuarioId ?? ""} onChange={(e) => setEditar({ ...editar, usuarioId: e.target.value || null })} vazio="Nenhum" opcoes={(equipe?.membros ?? []).map((m: any) => ({ valor: m.id, rotulo: m.nome }))} /></Campo>
            <Campo rotulo="WhatsApp"><Entrada value={editar.telefone ?? ""} onChange={(e) => setEditar({ ...editar, telefone: e.target.value })} /></Campo>
            <Campo rotulo="E-mail"><Entrada value={editar.email ?? ""} onChange={(e) => setEditar({ ...editar, email: e.target.value })} /></Campo>
            <Campo rotulo="Comissão (%)"><Entrada type="number" value={editar.comissaoPercentual} onChange={(e) => setEditar({ ...editar, comissaoPercentual: Number(e.target.value) })} /></Campo>
            <Campo rotulo="Cor"><input type="color" value={editar.cor} onChange={(e) => setEditar({ ...editar, cor: e.target.value })} className="h-9 w-full rounded-lg" /></Campo>
            <div className="sm:col-span-2">
              <Interruptor ligado={Object.keys(editar.horarios ?? {}).length > 0} aoMudar={(v) => setEditar({ ...editar, horarios: v ? { seg: [["09:00", "18:00"]], ter: [["09:00", "18:00"]], qua: [["09:00", "18:00"]], qui: [["09:00", "18:00"]], sex: [["09:00", "18:00"]], sab: [], dom: [] } : {} })} rotulo="Horário próprio" descricao="Desligado = usa o horário de funcionamento da loja." />
              {Object.keys(editar.horarios ?? {}).length > 0 && <div className="mt-3"><EditorHorarios valor={editar.horarios} aoMudar={(h) => setEditar({ ...editar, horarios: h })} /></div>}
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}

// ---------------- bloqueios ----------------

function Bloqueios({ cad }: { cad: any }) {
  const { dados, recarregar } = useDados<any[]>("/agenda/bloqueios");
  const [f, setF] = useState({ inicio: "", fim: "", colaboradorId: "", motivo: "" });
  const { executar, carregando } = useAcao();
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card className="!p-0">
        <div className="px-4 py-3"><TituloCard>Folgas, férias e feriados</TituloCard></div>
        {!dados ? <Carregando /> : dados.length === 0 ? <Vazio icone={CalendarDays} titulo="Nenhum bloqueio" /> : (
          <table className="w-full text-[13px]">
            <tbody>{dados.map((b) => (
              <tr key={b.id} className={linhaTabela}>
                <td className="px-4 py-2.5">{dataHora(b.inicio)} → {dataHora(b.fim)}</td><td>{b.colaboradorNome ?? "Toda a agenda"}</td><td className="text-suave">{b.motivo}</td>
                <td className="pr-3 text-right"><button type="button" onClick={() => executar(() => del(`/agenda/bloqueios/${b.id}`), "Removido").then(recarregar)} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      <Card className="flex flex-col gap-3">
        <TituloCard>Novo bloqueio</TituloCard>
        <Campo rotulo="De"><Entrada type="datetime-local" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></Campo>
        <Campo rotulo="Até"><Entrada type="datetime-local" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} /></Campo>
        <Campo rotulo="Quem"><Selecao value={f.colaboradorId} onChange={(e) => setF({ ...f, colaboradorId: e.target.value })} vazio="Toda a agenda" opcoes={cad.colaboradores.filter((c: any) => c.ativo).map((c: any) => ({ valor: c.id, rotulo: c.nome }))} /></Campo>
        <Campo rotulo="Motivo"><Entrada value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Férias, feriado..." /></Campo>
        <Botao carregando={carregando} disabled={!f.inicio || !f.fim} onClick={() => executar(() => post("/agenda/bloqueios", { ...f, inicio: new Date(f.inicio).toISOString(), fim: new Date(f.fim).toISOString(), colaboradorId: f.colaboradorId || null }), "Bloqueio criado").then((r) => { if (r) { setF({ inicio: "", fim: "", colaboradorId: "", motivo: "" }); recarregar(); } })}>Bloquear</Botao>
      </Card>
    </div>
  );
}

// ---------------- formulários ----------------

function Formularios({ cad, recarregar }: { cad: any; recarregar: () => void }) {
  const [editar, setEditar] = useState<any>(null);
  const { executar, carregando } = useAcao();
  const lista = cad.formularios.filter((f: any) => f.ativo);
  const perguntas: Pergunta[] = editar?.conteudo?.perguntas ?? [];
  const setPerguntas = (p: Pergunta[]) => setEditar({ ...editar, conteudo: { ...editar.conteudo, perguntas: p } });
  return (
    <Card className="!p-0">
      <div className="flex items-center justify-between px-4 py-3"><TituloCard>Formulários e termos</TituloCard>
        <Botao tamanho="sm" icone={<Plus className="size-4" />} onClick={() => setEditar({ tipo: "anamnese", nome: "", conteudo: { texto: "", perguntas: [perguntaNova()] } })}>Novo formulário</Botao></div>
      <div className="px-4 pb-3"><Dica>O cliente recebe um link, responde pelo celular e assina com o nome. As respostas ficam no prontuário do contato.</Dica></div>
      {lista.length === 0 ? <Vazio icone={CalendarDays} titulo="Nenhum formulário" /> : (
        <table className="w-full text-[13px]">
          <tbody>{lista.map((f: any) => (
            <tr key={f.id} className={linhaTabela}>
              <td className="px-4 py-2.5 font-semibold">{f.nome}</td><td><Selo>{TIPOS_FORMULARIO[f.tipo] ?? f.tipo}</Selo></td>
              <td className="text-suave">{Array.isArray(f.conteudo?.perguntas) ? `${f.conteudo.perguntas.length} perguntas` : "Texto"}</td>
              <td className="pr-3 text-right"><button type="button" onClick={() => setEditar({ ...f, conteudo: { texto: "", perguntas: [], ...f.conteudo } })} className="rounded-lg p-1.5 text-suave hover:bg-fundo"><Pencil className="size-4" /></button>
                <button type="button" onClick={() => executar(() => del(`/agenda/formularios/${f.id}`), "Removido").then(recarregar)} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {editar && (
        <Modal titulo={editar.id ? "Editar formulário" : "Novo formulário"} largura="max-w-2xl" aoFechar={() => setEditar(null)} rodape={
          <Botao carregando={carregando} onClick={() => executar(() => (editar.id ? put(`/agenda/formularios/${editar.id}`, editar) : post("/agenda/formularios", editar)), "Formulário salvo").then((r) => { if (r) { setEditar(null); recarregar(); } })}>Salvar</Botao>}>
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Nome"><Entrada value={editar.nome} onChange={(e) => setEditar({ ...editar, nome: e.target.value })} /></Campo>
              <Campo rotulo="Tipo"><Selecao disabled={!!editar.id} value={editar.tipo} onChange={(e) => setEditar({ ...editar, tipo: e.target.value })} opcoes={Object.entries(TIPOS_FORMULARIO).map(([v, r]) => ({ valor: v, rotulo: r }))} /></Campo>
            </div>
            <Campo rotulo={editar.tipo === "anamnese" ? "Texto de abertura (opcional)" : "Texto"}><AreaTexto rows={editar.tipo === "anamnese" ? 2 : 8} value={editar.conteudo.texto ?? ""} onChange={(e) => setEditar({ ...editar, conteudo: { ...editar.conteudo, texto: e.target.value } })} /></Campo>
            {editar.tipo !== "nota" && (
              <div className="flex flex-col gap-2">
                <div className="text-[12px] font-semibold text-suave uppercase">Perguntas</div>
                {perguntas.map((p, i) => (
                  <div key={p.id} className="grid gap-2 rounded-xl border border-linha p-2.5 sm:grid-cols-[1fr_170px_auto]">
                    <Entrada placeholder="Pergunta" value={p.rotulo} onChange={(e) => setPerguntas(perguntas.map((x, j) => (j === i ? { ...x, rotulo: e.target.value } : x)))} />
                    <Selecao value={p.tipo} onChange={(e) => setPerguntas(perguntas.map((x, j) => (j === i ? { ...x, tipo: e.target.value as Pergunta["tipo"] } : x)))} opcoes={TIPOS_PERGUNTA} />
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={!!p.obrigatoria} onChange={(e) => setPerguntas(perguntas.map((x, j) => (j === i ? { ...x, obrigatoria: e.target.checked } : x)))} />Obrigatória</label>
                      <button type="button" onClick={() => setPerguntas(perguntas.filter((_, j) => j !== i))} className="text-suave hover:text-vermelho"><Trash2 className="size-4" /></button>
                    </div>
                    {p.tipo === "opcoes" && <Entrada className="sm:col-span-3" placeholder="Opções separadas por vírgula" value={(p.opcoes ?? []).join(", ")} onChange={(e) => setPerguntas(perguntas.map((x, j) => (j === i ? { ...x, opcoes: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) } : x)))} />}
                  </div>
                ))}
                <Botao variante="secundario" tamanho="sm" icone={<Plus className="size-3.5" />} onClick={() => setPerguntas([...perguntas, perguntaNova()])}>Adicionar pergunta</Botao>
              </div>
            )}
          </div>
        </Modal>
      )}
    </Card>
  );
}

// ---------------- comissões e relatório ----------------

function Comissoes() {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const { dados, recarregar } = useDados<any[]>(`/agenda/comissoes${qs({ mes })}`);
  const { executar } = useAcao();
  return (
    <Card className="!p-0">
      <div className="flex items-center justify-between px-4 py-3"><TituloCard>Comissões</TituloCard><Entrada type="month" className="!w-44" value={mes} onChange={(e) => setMes(e.target.value)} /></div>
      {!dados ? <Carregando /> : dados.length === 0 ? <Vazio icone={CalendarDays} titulo="Sem profissionais" /> : (
        <table className="w-full text-[13px]">
          <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Profissional</th><th>Atendimentos pagos</th><th>Faturado</th><th>Comissão</th><th>Já paga</th><th></th></tr></thead>
          <tbody>{dados.map((c) => (
            <tr key={c.id} className={linhaTabela}>
              <td className="px-4 py-2.5 font-semibold">{c.nome}</td><td>{c.atendimentos}</td><td>{reais(c.faturado)}</td><td className="font-semibold">{reais(c.comissao)}</td><td>{reais(c.paga)}</td>
              <td className="pr-3 text-right">{Number(c.comissao) > Number(c.paga) && <Botao tamanho="sm" variante="secundario" onClick={() => executar(() => post(`/agenda/comissoes/${c.id}/pagar`, { mes }), "Comissão marcada como paga").then(recarregar)}>Marcar como paga</Botao>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}

function Relatorio() {
  const [dias, setDias] = useState(30);
  const { dados } = useDados<any>(`/agenda/relatorio${qs({ dias })}`);
  if (!dados) return <Carregando />;
  const r = dados.resumo;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end"><Selecao className="!w-40" value={String(dias)} onChange={(e) => setDias(Number(e.target.value))} opcoes={[{ valor: "7", rotulo: "7 dias" }, { valor: "30", rotulo: "30 dias" }, { valor: "90", rotulo: "90 dias" }]} /></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <CardNumero icone={CalendarDays} rotulo="Agendamentos" valor={r.total} />
        <CardNumero icone={CalendarDays} cor="verde" rotulo="Realizados" valor={r.realizados} />
        <CardNumero icone={CalendarDays} cor="ambar" rotulo="Faltas" valor={r.faltas} detalhe={r.total ? `${Math.round((r.faltas / r.total) * 100)}%` : undefined} />
        <CardNumero icone={CalendarDays} cor="vermelho" rotulo="Cancelados" valor={r.cancelados} />
        <CardNumero icone={CalendarDays} cor="laranja" rotulo="Faturado" valor={reais(r.faturado)} detalhe={`${r.pelaIa} pelo robô`} />
      </div>
      <Card className="!p-0">
        <div className="px-4 py-3"><TituloCard>Por serviço</TituloCard></div>
        <table className="w-full text-[13px]"><tbody>{dados.porServico.map((s: any) => <tr key={s.servico} className={linhaTabela}><td className="px-4 py-2.5">{s.servico}</td><td>{s.total} agendamentos</td><td className="pr-4 text-right font-semibold">{reais(s.faturado)}</td></tr>)}</tbody></table>
      </Card>
    </div>
  );
}

// ---------------- página pública e lembretes ----------------

function Config() {
  const { dados, recarregar } = useDados<any>("/agenda/config");
  const [f, setF] = useState<any>(null);
  const { executar, carregando } = useAcao();
  const { avisar } = useAvisos();
  if (!dados) return <Carregando />;
  const c = f ?? dados;
  const set = (k: string, v: any) => setF({ ...c, [k]: v });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-3">
        <TituloCard>Página de agendamento</TituloCard>
        <Interruptor ligado={c.paginaAtiva} aoMudar={(v) => set("paginaAtiva", v)} rotulo="Página ativa" descricao="Os clientes escolhem o serviço e o horário sozinhos." />
        <Campo rotulo="Endereço"><div className="flex items-center gap-1 text-[13px]"><span className="text-suave">{location.origin}/agendar/</span><Entrada value={c.paginaSlug ?? ""} onChange={(e) => set("paginaSlug", e.target.value)} /></div></Campo>
        {dados.linkPublico && dados.paginaAtiva && <a href={dados.linkPublico} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[13px] font-semibold text-laranja">{dados.linkPublico} <ExternalLink className="size-3.5" /></a>}
        <Campo rotulo="Título"><Entrada value={c.paginaTitulo ?? ""} onChange={(e) => set("paginaTitulo", e.target.value)} /></Campo>
        <Campo rotulo="Descrição"><AreaTexto rows={2} value={c.paginaDescricao ?? ""} onChange={(e) => set("paginaDescricao", e.target.value)} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Antecedência mínima (horas)"><Entrada type="number" value={c.antecedenciaMinimaHoras} onChange={(e) => set("antecedenciaMinimaHoras", Number(e.target.value))} /></Campo>
          <Campo rotulo="Agendar até (dias à frente)"><Entrada type="number" value={c.diasMaximosFrente} onChange={(e) => set("diasMaximosFrente", Number(e.target.value))} /></Campo>
        </div>
        <Campo rotulo="Modo"><Selecao value={c.modo} onChange={(e) => set("modo", e.target.value)} opcoes={[{ valor: "general", rotulo: "Agenda única" }, { valor: "per_collaborator", rotulo: "Uma agenda por profissional" }]} /></Campo>
        <Campo rotulo="Link iCal do Google Agenda (opcional)" dica="Para ver os eventos do Google e evitar conflitos."><Entrada value={c.googleIcalUrl ?? ""} onChange={(e) => set("googleIcalUrl", e.target.value)} /></Campo>
      </Card>
      <Card className="flex flex-col gap-3">
        <TituloCard icone={Send}>Lembretes no WhatsApp</TituloCard>
        <Dica>Use {"{nome}"}, {"{servico}"}, {"{hora}"} e {"{data}"}. Respeitam a janela de envio configurada.</Dica>
        <Interruptor ligado={c.lembrete24h} aoMudar={(v) => set("lembrete24h", v)} rotulo="Lembrete 1 dia antes" />
        {c.lembrete24h && <AreaTexto rows={3} value={c.mensagem24h} onChange={(e) => set("mensagem24h", e.target.value)} />}
        <Interruptor ligado={c.lembrete2h} aoMudar={(v) => set("lembrete2h", v)} rotulo="Lembrete 2 horas antes" />
        {c.lembrete2h && <AreaTexto rows={3} value={c.mensagem2h} onChange={(e) => set("mensagem2h", e.target.value)} />}
        <Botao className="mt-auto" carregando={carregando} disabled={!f} onClick={() => executar(() => put("/agenda/config", c), "Configuração salva").then((r) => { if (r) { setF(null); recarregar(); } else avisar("Confira os campos", "erro"); })}>Salvar</Botao>
      </Card>
    </div>
  );
}
