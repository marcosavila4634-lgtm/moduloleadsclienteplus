import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  DollarSign,
  Flame,
  KanbanSquare,
  List,
  MessageSquare,
  Minus,
  Plus,
  Settings2,
  Snowflake,
  Trash2,
  TrendingUp,
  TriangleAlert,
  User,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AreaTexto, Botao, Campo, Entrada, Interruptor, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { Abas, Avatar, Barra, CabecalhoPagina, Card, CardNumero, Carregando, Selo, Vazio, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { del, get, post, put, qs } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { dataHora, reais, relativo, telefone } from "../../lib/formato";
import { useEvento, useSessao } from "../../lib/sessao";

export const Route = createFileRoute("/_app/crm")({
  validateSearch: (s: Record<string, unknown>): { novo?: string; funil?: string; n?: string } => ({ novo: s.novo ? "1" : undefined, funil: typeof s.funil === "string" ? s.funil : undefined, n: typeof s.n === "string" ? s.n : undefined }),
  component: Crm,
});

type Negocio = any;
type Etapa = { id: string; nome: string; cor: string; ordem: number; ganho: boolean; perda: boolean; probabilidade: number; negocios: Negocio[]; total: number; valorTotal: number; config?: any };

function Crm() {
  const { novo, funil: funilUrl, n: negocioUrl } = Route.useSearch();
  const { dados: funis, recarregar: recarregarFunis } = useDados<any[]>("/crm/funis");
  const [funil, setFunil] = useState<string | null>(funilUrl ?? null);
  const [visao, setVisao] = useState<"kanban" | "lista" | "decisoes" | "promessas">("kanban");
  const [filtros, setFiltros] = useState({ meus: false, quentes: false, parados: false, busca: "" });
  const [novoAberto, setNovoAberto] = useState(!!novo);
  const [config, setConfig] = useState(false);
  const [detalhe, setDetalhe] = useState<string | null>(negocioUrl ?? null);
  useEffect(() => {
    if (!funil && funis?.length) setFunil(funis[0].id);
  }, [funis]);
  const { dados: resumo } = useDados<any>(funil ? `/crm/resumo?funil=${funil}` : null);

  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Funil de vendas" icone={KanbanSquare} descricao="Cada cartão é um cliente. Arraste para a próxima etapa quando a venda avançar.">
        {funis && funis.length > 1 && (
          <Selecao value={funil ?? ""} onChange={(e) => setFunil(e.target.value)} opcoes={funis.map((f) => ({ valor: f.id, rotulo: f.nome }))} className="!w-48" />
        )}
        <Botao variante="secundario" icone={<Settings2 className="size-4" />} onClick={() => setConfig(true)}>Configurar funil</Botao>
        <Botao icone={<Plus className="size-4" />} onClick={() => setNovoAberto(true)}>Novo negócio</Botao>
      </CabecalhoPagina>

      {resumo && (
        <div data-tour="previsao" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CardNumero icone={KanbanSquare} cor="petroleo" rotulo="Negócios abertos" valor={resumo.abertos} detalhe={`${reais(resumo.pipeline)} em negociação`} />
          <CardNumero icone={TrendingUp} cor="verde" rotulo="Conversão" valor={`${String(resumo.conversao).replace(".", ",")}%`} detalhe={`${resumo.ganhos} ganhos · ${resumo.perdidos} perdidos (30 dias)`} />
          <CardNumero icone={DollarSign} cor="laranja" rotulo="Ticket médio" valor={reais(resumo.ticket)} detalhe={`${Math.round(resumo.diasAteFechar)} dias em média para fechar`} />
          <CardNumero icone={Flame} cor="vermelho" rotulo="Quentes / esfriando" valor={`${resumo.quentes} / ${resumo.esfriando}`} detalhe="score ≥ 70 · score < 40 ou 7 dias parado" />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Abas valor={visao} aoMudar={setVisao} abas={[{ valor: "kanban", rotulo: "Kanban" }, { valor: "lista", rotulo: "Lista" }, { valor: "decisoes", rotulo: "Decisões da IA" }, { valor: "promessas", rotulo: "Promessas" }]} />
        {visao === "kanban" && (
          <div className="flex flex-wrap items-center gap-2">
            <Entrada value={filtros.busca} onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} placeholder="Buscar negócio..." className="!w-52 !py-1.5" />
            {[["meus", "Meus"], ["quentes", "🔥 Quentes"], ["parados", "Parados +7d"]].map(([k, r]) => (
              <button key={k} type="button" onClick={() => setFiltros({ ...filtros, [k]: !(filtros as any)[k] })}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 ${(filtros as any)[k] ? "bg-petroleo text-white ring-petroleo" : "bg-white text-suave ring-linha"}`}>{r}</button>
            ))}
          </div>
        )}
      </div>

      {!funil ? <Carregando /> : visao === "kanban" ? <Kanban funil={funil} filtros={filtros} aoAbrir={setDetalhe} />
        : visao === "lista" ? <ListaNegocios funil={funil} aoAbrir={setDetalhe} />
        : visao === "decisoes" ? <Decisoes /> : <Promessas />}

      {novoAberto && funil && <NovoNegocio funil={funis!.find((f) => f.id === funil)} aoFechar={() => setNovoAberto(false)} />}
      {config && funil && <ConfigFunil funil={funis!.find((f) => f.id === funil)} aoFechar={() => { setConfig(false); recarregarFunis(); }} />}
      {detalhe && <DetalheNegocio id={detalhe} etapas={funis?.find((f) => f.id === funil)?.etapas ?? []} aoFechar={() => setDetalhe(null)} />}
    </div>
  );
}

function Kanban({ funil, filtros, aoAbrir }: { funil: string; filtros: any; aoAbrir: (id: string) => void }) {
  const { avisar } = useAvisos();
  const [dados, setDados] = useState<any>(null);
  const [perda, setPerda] = useState<{ negocio: string; etapa: string } | null>(null);
  const caminho = `/crm/funis/${funil}/kanban${qs({ meus: filtros.meus, quentes: filtros.quentes, parados: filtros.parados, busca: filtros.busca })}`;
  const carregar = () => get<any>(caminho).then(setDados);
  useEffect(() => {
    carregar();
  }, [caminho]);
  useEvento("negocio", (n: Negocio) => n.funilId === funil && carregar());
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const mover = async (negocio: string, etapa: string, motivoPerdaId?: string) => {
    const e: Etapa = dados.etapas.find((x: Etapa) => x.id === etapa);
    if (e.perda && !motivoPerdaId) {
      setPerda({ negocio, etapa });
      return;
    }
    // otimista: move na tela antes de o servidor confirmar
    setDados((d: any) => {
      const n = d.etapas.flatMap((x: Etapa) => x.negocios).find((x: Negocio) => x.id === negocio);
      return { ...d, etapas: d.etapas.map((x: Etapa) => ({ ...x, negocios: x.id === etapa ? [{ ...n, etapaId: etapa }, ...x.negocios.filter((y: Negocio) => y.id !== negocio)] : x.negocios.filter((y: Negocio) => y.id !== negocio) })) };
    });
    try {
      await post(`/crm/negocios/${negocio}/mover`, { etapaId: etapa, motivoPerdaId });
      if (e.ganho) avisar("🎉 Venda fechada!");
    } catch (err) {
      avisar(err instanceof Error ? err.message : "Não moveu", "erro");
    }
    carregar();
  };
  const aoSoltar = (ev: DragEndEvent) => {
    if (ev.over && ev.active.data.current?.etapa !== ev.over.id) mover(String(ev.active.id), String(ev.over.id));
  };

  if (!dados) return <Carregando />;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-suave">
        <span>Previsão ponderada: <b className="text-texto">{reais(dados.previsao.ponderado)}</b></span>
        <span>Pipeline: <b className="text-texto">{reais(dados.previsao.pipeline)}</b></span>
        <span><b className="text-texto">{dados.previsao.abertos}</b> ativos</span>
        <span className="text-vermelho"><b>{dados.previsao.risco}</b> em risco</span>
        <span className="text-verde"><b>{dados.previsao.saude}%</b> saudável</span>
      </div>
      <DndContext sensors={sensores} onDragEnd={aoSoltar}>
        <div data-tour="kanban" className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6">
          {dados.etapas.map((e: Etapa) => {
            const calor = dados.calor.find((c: any) => c.etapaId === e.id);
            return <Coluna key={e.id} etapa={e} calor={calor} aoAbrir={aoAbrir} />;
          })}
        </div>
      </DndContext>
      {perda && <MotivoPerda aoFechar={() => setPerda(null)} aoEscolher={(m) => { mover(perda.negocio, perda.etapa, m); setPerda(null); }} />}
    </>
  );
}

function Coluna({ etapa, calor, aoAbrir }: { etapa: Etapa; calor: any; aoAbrir: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
  const [ordem, setOrdem] = useState<"recente" | "score" | "valor" | "tempo">("recente");
  const lista = useMemo(() => {
    const l = [...etapa.negocios];
    if (ordem === "score") l.sort((a, b) => (b.scoreIa ?? 0) - (a.scoreIa ?? 0));
    if (ordem === "valor") l.sort((a, b) => b.valor - a.valor);
    if (ordem === "tempo") l.sort((a, b) => b.diasNaEtapa - a.diasNaEtapa);
    return l;
  }, [etapa.negocios, ordem]);
  const nivel = calor?.nivel === "hot" ? "🔥" : calor?.nivel === "warm" ? "🟠" : "🟢";
  return (
    <div ref={setNodeRef} className={`flex w-[290px] shrink-0 flex-col rounded-2xl border bg-fundo-2/60 transition ${isOver ? "border-laranja bg-orange-50" : "border-linha"}`}>
      <div className="rounded-t-2xl border-b border-linha bg-cartao px-3 py-2.5" style={{ borderTop: `4px solid ${etapa.cor}` }}>
        <div className="flex items-center justify-between">
          <span className="font-titulo text-[14px] font-semibold">{etapa.nome}</span>
          <span className="rounded-full bg-fundo-2 px-2 text-[12px] font-bold">{etapa.negocios.length}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11.5px] text-suave">
          <span>{nivel} {reais(etapa.valorTotal)}</span>
          <span>~{Math.round(calor?.mediaDias ?? 0)}d na etapa</span>
        </div>
        <select value={ordem} onChange={(e) => setOrdem(e.target.value as any)} className="mt-1.5 w-full rounded-lg border border-linha bg-white px-1.5 py-0.5 text-[11px]">
          <option value="recente">Mais recentes</option><option value="score">Maior score</option><option value="valor">Maior valor</option><option value="tempo">Mais tempo parado</option>
        </select>
      </div>
      <div className="flex max-h-[calc(100vh-380px)] min-h-[200px] flex-col gap-2 overflow-y-auto p-2">
        {lista.map((n, i) => <Cartao key={n.id} n={n} etapa={etapa.id} aoAbrir={aoAbrir} tour={i === 0 ? "cartao-negocio" : undefined} />)}
        {lista.length === 0 && <div className="py-8 text-center text-[12px] text-suave">Solte um cartão aqui</div>}
      </div>
    </div>
  );
}

function Cartao({ n, etapa, aoAbrir, tour }: { n: Negocio; etapa: string; aoAbrir: (id: string) => void; tour?: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: n.id, data: { etapa } });
  const t = n.previsao?.tendencia;
  const score = n.scoreIa;
  const risco = n.metadados?.risk_level === "high";
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} data-tour={tour}
      style={{ transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined }}
      onClick={() => !isDragging && aoAbrir(n.id)}
      className={`cursor-grab rounded-xl border bg-cartao p-3 shadow-sm transition active:cursor-grabbing ${isDragging ? "z-50 rotate-2 shadow-xl" : "hover:border-laranja/50"} ${risco ? "border-red-200" : "border-linha"}`}>
      <div className="flex items-start gap-2">
        <Avatar nome={n.contatoNome ?? n.titulo} foto={n.contatoFoto} tamanho={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{n.titulo}</div>
          <div className="truncate text-[11.5px] text-suave">{n.responsavelNome ?? "Sem responsável"}</div>
        </div>
        {score != null && (
          <span data-tour={tour ? "score" : undefined} className={`flex shrink-0 items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-[11.5px] font-bold ${score >= 70 ? "bg-orange-100 text-laranja" : score < 40 ? "bg-sky-100 text-sky-700" : "bg-fundo-2 text-texto"}`}>
            {score >= 70 ? <Flame className="size-3" /> : score < 40 ? <Snowflake className="size-3" /> : null}{score}%
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11.5px]">
        <span className="font-semibold text-texto">{n.valor > 0 ? reais(n.valor) : <span className="font-normal text-suave">Sem valor</span>}</span>
        <span className={`flex items-center gap-1 ${n.previsao?.atrasado ? "font-semibold text-vermelho" : "text-suave"}`}>
          <Clock className="size-3" />{n.previsao?.diasNaEtapa ?? 0}d
          {t === "rising" ? <ArrowUpRight className="size-3.5 text-verde" /> : t === "falling" ? <ArrowDownRight className="size-3.5 text-vermelho" /> : <Minus className="size-3.5" />}
        </span>
      </div>
      {n.metadados?.next_step && <div className="mt-1.5 line-clamp-2 rounded-lg bg-fundo px-2 py-1 text-[11px] text-texto/80">➡️ {n.metadados.next_step}</div>}
      {risco && <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-vermelho"><TriangleAlert className="size-3" /> Em risco</div>}
    </div>
  );
}

function MotivoPerda({ aoFechar, aoEscolher }: { aoFechar: () => void; aoEscolher: (id: string) => void }) {
  const { dados } = useDados<any[]>("/crm/motivos-perda");
  return (
    <Modal titulo="Por que perdeu?" aoFechar={aoFechar}>
      <p className="mb-3 text-sm text-suave">Saber o motivo ajuda a vender mais da próxima vez.</p>
      <div className="flex flex-col gap-2">
        {(dados ?? []).filter((m) => m.ativo).map((m) => (
          <button key={m.id} type="button" onClick={() => aoEscolher(m.id)} className="rounded-xl border border-linha px-3 py-2.5 text-left text-[13.5px] font-medium hover:border-laranja">{m.nome}</button>
        ))}
      </div>
    </Modal>
  );
}

function ListaNegocios({ funil, aoAbrir }: { funil: string; aoAbrir: (id: string) => void }) {
  const [status, setStatus] = useState("abertos");
  const [pagina, setPagina] = useState(1);
  const { dados } = useDados<any>(`/crm/negocios${qs({ funil, status, pagina })}`);
  return (
    <Card className="!p-0">
      <div className="flex items-center justify-between border-b border-linha p-3">
        <Abas valor={status} aoMudar={(v) => { setStatus(v); setPagina(1); }} abas={[{ valor: "abertos", rotulo: "Abertos" }, { valor: "ganhos", rotulo: "Ganhos" }, { valor: "perdidos", rotulo: "Perdidos" }, { valor: "", rotulo: "Todos" }]} />
        <span className="text-[12.5px] text-suave">{dados?.total ?? 0} negócios</span>
      </div>
      {!dados ? <Carregando /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2.5">Negócio</th><th>Etapa</th><th>Valor</th><th>Score</th><th>Responsável</th><th>Atualizado</th></tr></thead>
            <tbody>
              {dados.itens.map((n: Negocio) => (
                <tr key={n.id} className={`${linhaTabela} cursor-pointer`} onClick={() => aoAbrir(n.id)}>
                  <td className="px-4 py-2.5"><div className="font-semibold">{n.titulo}</div><div className="text-[11.5px] text-suave">{telefone(n.contatoTelefone)}</div></td>
                  <td><Selo><span className="size-2 rounded-full" style={{ background: n.etapaCor }} />{n.etapaNome}</Selo></td>
                  <td className="font-semibold">{reais(n.valor)}</td>
                  <td>{n.scoreIa ?? "—"}</td>
                  <td>{n.responsavelNome ?? "—"}</td>
                  <td className="text-suave">{relativo(n.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dados && dados.total > 50 && (
        <div className="flex justify-end gap-2 p-3">
          <Botao variante="secundario" tamanho="sm" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</Botao>
          <Botao variante="secundario" tamanho="sm" disabled={pagina * 50 >= dados.total} onClick={() => setPagina(pagina + 1)}>Próxima</Botao>
        </div>
      )}
    </Card>
  );
}

function Decisoes() {
  const { dados, recarregar } = useDados<any[]>("/crm/decisoes");
  const { executar } = useAcao();
  const nomes: Record<string, string> = { mover_etapa: "Moveu de etapa", adicionar_tag: "Marcou tag", remover_tag: "Tirou tag", transferir_humano: "Transferiu para humano", registrar_venda: "Registrou venda", marcar_perdido: "Marcou perdido", agendar: "Agendou", criar_pedido: "Criou pedido" };
  return (
    <Card className="!p-0">
      <div className="border-b border-linha p-4 text-[13px] text-suave">Tudo o que a IA decidiu sozinha, com o motivo. Se algo não fez sentido, marque como "revertida" para acompanhar.</div>
      {!dados ? <Carregando /> : dados.length === 0 ? <Vazio icone={KanbanSquare} titulo="Nenhuma decisão ainda" /> : (
        <ul>
          {dados.map((d) => (
            <li key={d.id} className="flex items-start gap-3 border-b border-linha/70 px-4 py-3 last:border-0">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-petroleo/10 text-petroleo">🤖</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px]"><b>{nomes[d.acao] ?? d.acao}</b>{d.dados?.etapa ? ` → ${d.dados.etapa}` : d.dados?.tag ? ` ${d.dados.tag}` : ""} · <span className="text-suave">{d.contatoNome ?? d.negocioTitulo ?? ""}</span></div>
                {d.motivo && <div className="text-[12.5px] text-suave">“{d.motivo}”</div>}
                <div className="text-[11.5px] text-suave">{d.agenteNome ?? "IA"} · {dataHora(d.createdAt)}</div>
              </div>
              {d.status === "revertida" ? <Selo cor="vermelho">Revertida</Selo> : (
                <button type="button" onClick={() => executar(() => put(`/crm/decisoes/${d.id}`, { status: "revertida" })).then(recarregar)} className="text-[12px] font-semibold text-suave hover:text-vermelho">Marcar como errada</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Promessas() {
  const [status, setStatus] = useState("pendente");
  const { dados, recarregar } = useDados<any[]>(`/crm/promessas?status=${status}`);
  const { executar } = useAcao();
  return (
    <Card className="!p-0">
      <div className="flex items-center justify-between border-b border-linha p-3">
        <Abas valor={status} aoMudar={setStatus} abas={[{ valor: "pendente", rotulo: "Pendentes" }, { valor: "vencida", rotulo: "Vencidas" }, { valor: "cumprida", rotulo: "Cumpridas" }]} />
      </div>
      {!dados ? <Carregando /> : dados.length === 0 ? <Vazio icone={Clock} titulo="Nenhuma promessa aqui">A IA registra sozinha quando o cliente promete algo com prazo, como "te pago amanhã".</Vazio> : (
        <ul>
          {dados.map((p) => (
            <li key={p.id} className="flex items-center gap-3 border-b border-linha/70 px-4 py-3 last:border-0">
              <span className="text-xl">🤝</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold">{p.descricao}</div>
                <div className="text-[12px] text-suave">{p.quem === "cliente" ? "Cliente" : "Empresa"} · {p.contatoNome ?? telefone(p.contatoTelefone)} {p.venceEm && `· até ${dataHora(p.venceEm)}`}</div>
              </div>
              {p.conversaId && <Link to="/conversas" search={{ c: p.conversaId }} className="text-[12px] font-semibold text-petroleo">Conversa</Link>}
              {p.status !== "cumprida" && <Botao tamanho="sm" variante="secundario" onClick={() => executar(() => put(`/crm/promessas/${p.id}`, { status: "cumprida" }), "Marcada como cumprida").then(recarregar)}>Cumprida</Botao>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function NovoNegocio({ funil, aoFechar }: { funil: any; aoFechar: () => void }) {
  const [d, setD] = useState({ titulo: "", valor: "", etapaId: funil.etapas.find((e: any) => !e.ganho && !e.perda)?.id ?? "", telefone: "", nome: "" });
  const { executar, carregando } = useAcao();
  const salvar = async () => {
    let contatoId: string | undefined;
    if (d.telefone.trim()) {
      const c = await get<any>(`/contatos${qs({ busca: d.telefone, limite: 1 })}`);
      contatoId = c.itens[0]?.id ?? (await post<any>("/contatos", { telefone: d.telefone, nome: d.nome || d.titulo })).id;
    }
    return post("/crm/negocios", { funilId: funil.id, etapaId: d.etapaId, titulo: d.titulo, valor: Number(d.valor.replace(",", ".")) || 0, contatoId });
  };
  return (
    <Modal titulo="Novo negócio" aoFechar={aoFechar} rodape={<Botao carregando={carregando} onClick={() => executar(salvar, "Negócio criado").then((r) => r && aoFechar())}>Criar</Botao>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Título" className="sm:col-span-2"><Entrada value={d.titulo} onChange={(e) => setD({ ...d, titulo: e.target.value })} placeholder="Ex.: Kit 3 camisetas - João" /></Campo>
        <Campo rotulo="WhatsApp do cliente"><Entrada value={d.telefone} onChange={(e) => setD({ ...d, telefone: e.target.value })} /></Campo>
        <Campo rotulo="Nome do cliente"><Entrada value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} /></Campo>
        <Campo rotulo="Valor (R$)"><Entrada value={d.valor} onChange={(e) => setD({ ...d, valor: e.target.value })} inputMode="decimal" /></Campo>
        <Campo rotulo="Etapa"><Selecao value={d.etapaId} onChange={(e) => setD({ ...d, etapaId: e.target.value })} opcoes={funil.etapas.map((e: any) => ({ valor: e.id, rotulo: e.nome }))} /></Campo>
      </div>
    </Modal>
  );
}

function DetalheNegocio({ id, etapas, aoFechar }: { id: string; etapas: any[]; aoFechar: () => void }) {
  const { dados: n, recarregar } = useDados<any>(`/crm/negocios/${id}`);
  const { dados: equipe } = useDados<any>("/equipe");
  const { executar, carregando } = useAcao();
  const { confirmar } = useAvisos();
  const { pode } = useSessao();
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");
  useEffect(() => {
    if (n) setValor(String(n.valor ?? 0).replace(".", ","));
  }, [n?.id]);
  if (!n) return <Modal titulo="Negócio" aoFechar={aoFechar}><Carregando /></Modal>;
  const fatores = n.metadados?.closing_score_factors ?? {};
  const nomesFatores: Record<string, string> = { urgency_high: "Urgência alta", urgency_medium: "Tem prazo", fast_response: "Responde rápido", moderate_response: "Responde razoável", high_engagement: "Muito engajado", moderate_engagement: "Engajado", value_confirmed: "Aceitou o valor", purchase_confirmed: "Confirmou compra", interest_shown: "Mostrou interesse", sent_media: "Mandou fotos/áudios", complete_profile: "Cadastro completo", competitor: "Citou concorrente", objection_price: "Achou caro", objection_thinking: "Vai pensar", objection_repeated: "Objeção repetida", ghosting_mild: "Sumiu uns dias", ghosting_severe: "Sumiu há 1 semana+" };
  return (
    <Modal titulo={n.titulo} aoFechar={aoFechar} largura="max-w-3xl">
      <div className="grid gap-5 md:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {etapas.map((e) => (
              <button key={e.id} type="button" onClick={() => executar(() => post(`/crm/negocios/${id}/mover`, { etapaId: e.id }), `Movido para ${e.nome}`).then(recarregar)}
                className={`rounded-full px-3 py-1 text-[12px] font-semibold ring-1 ${n.etapaId === e.id ? "text-white" : "bg-white text-texto ring-linha"}`}
                style={n.etapaId === e.id ? { background: e.cor, boxShadow: "none" } : undefined}>{e.nome}</button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Valor (R$)">
              <div className="flex gap-2"><Entrada value={valor} onChange={(e) => setValor(e.target.value)} /><Botao variante="secundario" onClick={() => executar(() => put(`/crm/negocios/${id}`, { valor: Number(valor.replace(/\./g, "").replace(",", ".")) || 0 }), "Valor salvo").then(recarregar)}>Salvar</Botao></div>
            </Campo>
            <Campo rotulo="Responsável">
              <Selecao vazio="Sem responsável" value={n.responsavelId ?? ""} onChange={(e) => executar(() => put(`/crm/negocios/${id}`, { responsavelId: e.target.value || null }), "Responsável atualizado").then(recarregar)}
                opcoes={(equipe?.membros ?? []).map((m: any) => ({ valor: m.id, rotulo: m.nome }))} />
            </Campo>
          </div>
          <div>
            <div className="mb-2 text-[12px] font-semibold text-suave uppercase">Histórico</div>
            <div className="mb-3 flex gap-2"><AreaTexto rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escreva uma anotação..." /><Botao onClick={() => executar(() => post(`/crm/negocios/${id}/notas`, { texto: nota }), "Anotação salva").then(() => { setNota(""); recarregar(); })} disabled={!nota.trim()}>Anotar</Botao></div>
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {n.eventos.map((e: any) => (
                <li key={e.id} className="rounded-xl bg-fundo px-3 py-2 text-[12.5px]">
                  <div><b>{({ criado: "Criado", etapa: "Mudou de etapa", valor: "Valor alterado", score: "Score atualizado", nota: "Anotação", ganho: "🎉 Ganho", perdido: "Perdido", responsavel: "Responsável" } as any)[e.tipo] ?? e.tipo}</b>{e.de && e.para && e.tipo !== "nota" ? `: ${e.de} → ${e.para}` : ""}</div>
                  {e.texto && <div className="text-texto/80">{e.texto}</div>}
                  <div className="text-[11px] text-suave">{e.autorTipo === "ia" ? "🤖 IA" : e.autorNome ?? e.autorTipo} · {dataHora(e.createdAt)}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-fundo p-4">
            <div className="flex items-center justify-between"><span className="text-[12px] font-semibold text-suave uppercase">Termômetro (score da IA)</span><span className="font-titulo text-2xl font-bold text-laranja">{n.scoreIa ?? "—"}</span></div>
            <div className="mt-2"><Barra valor={n.scoreIa ?? 0} total={100} /></div>
            <ul className="mt-3 flex flex-col gap-1">
              {Object.entries(fatores).map(([k, v]: any) => (
                <li key={k} className="flex justify-between text-[12px]"><span>{nomesFatores[k] ?? k}</span><span className={`font-bold ${v > 0 ? "text-verde" : "text-vermelho"}`}>{v > 0 ? `+${v}` : v}</span></li>
              ))}
            </ul>
            {n.metadados?.next_step && <div className="mt-3 rounded-xl bg-white p-2.5 text-[12px]"><b>Próximo passo:</b> {n.metadados.next_step}</div>}
          </div>
          <div className="rounded-2xl bg-fundo p-4 text-[13px]">
            <div className="flex items-center gap-2"><User className="size-4 text-suave" />{n.contatoNome ?? "—"}</div>
            <div className="mt-1 text-suave">{telefone(n.contatoTelefone)}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {n.conversaAtual && <Link to="/conversas" search={{ c: n.conversaAtual }} className="flex items-center gap-1 text-[12.5px] font-semibold text-laranja"><MessageSquare className="size-4" /> Abrir conversa</Link>}
              {n.contatoId && <Link to="/contatos/$id" params={{ id: n.contatoId }} className="text-[12.5px] font-semibold text-petroleo">Ficha do cliente</Link>}
            </div>
          </div>
          {pode("supervisor") && (
            <Botao variante="fantasma" className="!text-vermelho" icone={<Trash2 className="size-4" />} carregando={carregando}
              onClick={async () => { if (await confirmar("Apagar este negócio? O histórico dele some.", { perigo: true, botao: "Apagar" })) executar(() => del(`/crm/negocios/${id}`), "Negócio apagado").then(aoFechar); }}>
              Apagar negócio
            </Botao>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ConfigFunil({ funil, aoFechar }: { funil: any; aoFechar: () => void }) {
  const [nome, setNome] = useState(funil.nome);
  const [etapas, setEtapas] = useState<any[]>(funil.etapas.map((e: any) => ({ ...e, slaDias: e.config?.sla_dias ?? "" })));
  const [pesos, setPesos] = useState<Record<string, number>>(funil.config?.score_weights ?? {});
  const [autoCriar, setAutoCriar] = useState(funil.config?.auto_criar !== false);
  const [aba, setAba] = useState<"etapas" | "score">("etapas");
  const { executar, carregando } = useAcao();
  const salvar = () => put(`/crm/funis/${funil.id}`, {
    nome, autoCriar, pesos,
    etapas: etapas.map((e) => ({ id: e.id, nome: e.nome, cor: e.cor, ganho: e.ganho, perda: e.perda, probabilidade: Number(e.probabilidade) || 0, config: { ...(e.config ?? {}), sla_dias: e.slaDias === "" ? undefined : Number(e.slaDias) } })),
  });
  return (
    <Modal titulo="Configurar funil" aoFechar={aoFechar} largura="max-w-2xl" rodape={<Botao carregando={carregando} onClick={() => executar(salvar, "Funil salvo").then((r) => r && aoFechar())}>Salvar</Botao>}>
      <div className="flex flex-col gap-4">
        <Campo rotulo="Nome do funil"><Entrada value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Interruptor ligado={autoCriar} aoMudar={setAutoCriar} rotulo="Criar negócio sozinho para cada novo contato" descricao="Toda conversa nova entra na primeira etapa deste funil." />
        <Abas valor={aba} aoMudar={setAba} abas={[{ valor: "etapas", rotulo: "Etapas" }, { valor: "score", rotulo: "Pesos do termômetro" }]} />
        {aba === "etapas" ? (
          <div className="flex flex-col gap-2">
            {etapas.map((e, i) => (
              <div key={e.id ?? i} className="grid grid-cols-[32px_1fr_80px_80px_auto] items-center gap-2 rounded-xl border border-linha p-2">
                <input type="color" value={e.cor} onChange={(x) => setEtapas(etapas.map((y, j) => (j === i ? { ...y, cor: x.target.value } : y)))} className="size-8 cursor-pointer rounded" />
                <Entrada value={e.nome} onChange={(x) => setEtapas(etapas.map((y, j) => (j === i ? { ...y, nome: x.target.value } : y)))} />
                <Entrada title="Probabilidade de fechar (%)" value={e.probabilidade} onChange={(x) => setEtapas(etapas.map((y, j) => (j === i ? { ...y, probabilidade: x.target.value } : y)))} placeholder="%" />
                <Entrada title="Alerta se ficar mais de N dias" value={e.slaDias} onChange={(x) => setEtapas(etapas.map((y, j) => (j === i ? { ...y, slaDias: x.target.value } : y)))} placeholder="SLA dias" />
                <div className="flex items-center gap-1">
                  <select value={e.ganho ? "ganho" : e.perda ? "perda" : ""} onChange={(x) => setEtapas(etapas.map((y, j) => (j === i ? { ...y, ganho: x.target.value === "ganho", perda: x.target.value === "perda" } : y)))} className="rounded-lg border border-linha px-1 py-1.5 text-[12px]">
                    <option value="">Normal</option><option value="ganho">Ganho</option><option value="perda">Perda</option>
                  </select>
                  <button type="button" onClick={() => setEtapas(etapas.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button>
                </div>
              </div>
            ))}
            <Botao variante="secundario" tamanho="sm" onClick={() => setEtapas([...etapas.slice(0, -2), { nome: "Nova etapa", cor: "#6366f1", ganho: false, perda: false, probabilidade: 50, slaDias: "" }, ...etapas.slice(-2)])}>+ Etapa</Botao>
            <p className="text-[12px] text-suave">% = chance de fechar nessa etapa (usada na previsão). SLA = avisa quando o negócio fica parado mais que esses dias.</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(pesos).map(([k, v]) => (
              <label key={k} className="flex items-center justify-between gap-2 rounded-xl border border-linha px-3 py-1.5 text-[12.5px]">
                <span>{k.replace(/_/g, " ")}</span>
                <input type="number" value={v} onChange={(e) => setPesos({ ...pesos, [k]: Number(e.target.value) })} className="w-16 rounded-lg border border-linha px-2 py-1 text-right" />
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
