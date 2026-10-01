import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  FileText,
  Flame,
  Hand,
  ImageIcon,
  ListChecks,
  Loader2,
  MessageCirclePlus,
  MessageSquare,
  Mic,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  StickyNote,
  Tag as IconeTag,
  UserRoundCog,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Botao, Campo, Entrada, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { Mensagem, type Msg } from "../../components/conversas/Mensagem";
import { IconeInstagram } from "../../components/Icones";
import { Abas, Avatar, Barra, Carregando, Selo, Tag, Vazio } from "../../components/ui";
import { enviarArquivo, get, post, put, qs } from "../../lib/api";
import { useAtraso, useDados } from "../../lib/dados";
import { dataHora, diaChat, reais, relativo, telefone } from "../../lib/formato";
import { useEvento, useSessao } from "../../lib/sessao";

export const Route = createFileRoute("/_app/conversas")({
  validateSearch: (s: Record<string, unknown>): { c?: string; nova?: string } => ({ c: typeof s.c === "string" ? s.c : undefined, nova: s.nova ? "1" : undefined }),
  component: Conversas,
});

type Conversa = {
  id: string; contatoId: string; contatoNome?: string; contatoTelefone?: string; contatoFoto?: string; contatoInstagram?: string; contatoTags?: string[]; contatoEmail?: string;
  canal: string; status: string; iaAtiva: boolean; atribuidaA: string; handoffStatus: string; humanoId?: string; humanoNome?: string; agenteId?: string; agenteNome?: string;
  naoLidas: number; ultimaMensagem?: string; ultimaMensagemEm?: string; ultimaDoClienteEm?: string; aguardandoResposta: boolean; tags: string[]; origem?: string;
  slaStatus: string; conexaoNome?: string; setorNome?: string; resumo?: string; resumoEm?: string;
  negocio?: any; memorias?: any[]; promessas?: any[]; pedidos?: any[]; janela24h?: boolean;
};
type Aba = "todas" | "nao_lidas" | "ia" | "humano" | "fila";

function Conversas() {
  const { c: selecionada, nova } = Route.useSearch();
  const navigate = useNavigate();
  const [aba, setAba] = useState<Aba>("todas");
  const [canal, setCanal] = useState("");
  const [tag, setTag] = useState("");
  const [busca, setBusca] = useState("");
  const buscaAtrasada = useAtraso(busca);
  const [lista, setLista] = useState<Conversa[] | null>(null);
  const [contadores, setContadores] = useState<Record<string, number>>({});
  const [maisCarregando, setMaisCarregando] = useState(false);
  const [fim, setFim] = useState(false);
  const [novaAberta, setNovaAberta] = useState(!!nova);
  const { dados: tags } = useDados<any[]>("/contatos/tags");

  const filtro = qs({ aba, canal, tag, busca: buscaAtrasada });
  const carregar = async () => {
    const [l, c] = await Promise.all([get<Conversa[]>(`/conversas${filtro}`), get<Record<string, number>>("/conversas/contadores")]);
    setLista(l);
    setFim(l.length < 60);
    setContadores(c);
  };
  useEffect(() => {
    setLista(null);
    carregar();
  }, [filtro]);

  const mais = async () => {
    if (!lista?.length || fim) return;
    setMaisCarregando(true);
    const antes = lista[lista.length - 1].ultimaMensagemEm;
    const l = await get<Conversa[]>(`/conversas${filtro}${filtro ? "&" : "?"}antes=${encodeURIComponent(antes ?? "")}`);
    setLista([...lista, ...l]);
    setFim(l.length < 60);
    setMaisCarregando(false);
  };

  // tempo real: conversa atualizada sobe para o topo
  useEvento("conversa", (c: Conversa) => {
    setLista((l) => {
      if (!l) return l;
      const sem = l.filter((x) => x.id !== c.id);
      const passa =
        (aba === "todas" || (aba === "nao_lidas" && c.naoLidas > 0) || (aba === "ia" && c.atribuidaA === "ai" && c.iaAtiva) || (aba === "humano" && c.atribuidaA === "human" && !!c.humanoId) || (aba === "fila" && c.atribuidaA === "human" && !c.humanoId))
        && (!canal || c.canal === canal) && (!tag || (c.contatoTags ?? []).includes(tag)) && !buscaAtrasada;
      return passa ? [c, ...sem] : sem.length === l.length ? l : sem;
    });
    get<Record<string, number>>("/conversas/contadores").then(setContadores).catch(() => undefined);
  });

  const abrir = (id: string) => navigate({ to: "/conversas", search: { c: id } });

  return (
    <div className="-mx-4 -mt-4 -mb-10 flex h-[calc(100vh-64px)] md:-mx-6">
      {/* lista */}
      <aside data-tour="lista-conversas" className={`flex w-full shrink-0 flex-col border-r border-linha bg-cartao md:w-[340px] ${selecionada ? "hidden md:flex" : "flex"}`}>
        <div className="border-b border-linha p-3">
          <div className="flex items-center justify-between">
            <h1 className="font-titulo text-[19px] font-bold">Conversas</h1>
            <Botao tamanho="sm" icone={<MessageCirclePlus className="size-4" />} onClick={() => setNovaAberta(true)}>Nova</Botao>
          </div>
          <div className="mt-3 flex h-9 items-center gap-2 rounded-xl border border-linha bg-fundo px-2.5">
            <Search className="size-4 text-suave" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, telefone ou mensagem" className="w-full bg-transparent text-[13px] outline-none" />
          </div>
          <div className="mt-2.5 -mx-1 overflow-x-auto px-1">
            <Abas tour="abas-conversas" valor={aba} aoMudar={setAba} abas={[
              { valor: "todas", rotulo: "Todas" },
              { valor: "nao_lidas", rotulo: "Não lidas", quantidade: contadores.naoLidas },
              { valor: "ia", rotulo: "IA", quantidade: contadores.ia },
              { valor: "humano", rotulo: "Humano", quantidade: contadores.humano },
              { valor: "fila", rotulo: "Fila", quantidade: contadores.fila },
            ]} />
          </div>
          <div className="mt-2 flex gap-2">
            <select value={canal} onChange={(e) => setCanal(e.target.value)} className="flex-1 rounded-lg border border-linha bg-white px-2 py-1 text-[12px]">
              <option value="">Todos os canais</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
            </select>
            <select value={tag} onChange={(e) => setTag(e.target.value)} className="flex-1 rounded-lg border border-linha bg-white px-2 py-1 text-[12px]">
              <option value="">Todas as tags</option>
              {(tags ?? []).map((t) => <option key={t.id} value={t.nome}>{t.nome}</option>)}
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto" onScroll={(e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight > el.scrollHeight - 200 && !maisCarregando) mais(); }}>
          {!lista ? <Carregando /> : lista.length === 0 ? <Vazio icone={MessageSquare} titulo="Nenhuma conversa aqui" /> : lista.map((c) => (
            <button key={c.id} type="button" onClick={() => abrir(c.id)}
              className={`flex w-full items-start gap-3 border-b border-linha/60 px-3 py-3 text-left transition hover:bg-fundo ${selecionada === c.id ? "bg-orange-50/70" : ""}`}>
              <div className="relative">
                <Avatar nome={c.contatoNome ?? c.contatoTelefone ?? c.contatoInstagram} foto={c.contatoFoto} tamanho={42} />
                <span className={`absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full ring-2 ring-white ${c.canal === "instagram" ? "bg-pink-500" : "bg-green-500"}`}>
                  {c.canal === "instagram" ? <IconeInstagram className="size-2.5 text-white" /> : <MessageSquare className="size-2.5 text-white" />}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate text-[13.5px] ${c.naoLidas > 0 ? "font-bold" : "font-semibold"}`}>{c.contatoNome ?? (c.contatoTelefone ? telefone(c.contatoTelefone) : `@${c.contatoInstagram}`)}</span>
                  <span className={`shrink-0 text-[11px] ${c.naoLidas > 0 ? "font-semibold text-laranja" : "text-suave"}`}>{relativo(c.ultimaMensagemEm)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="flex-1 truncate text-[12.5px] text-suave">{c.ultimaMensagem ?? "—"}</span>
                  {c.naoLidas > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-laranja px-1.5 text-[10.5px] font-bold text-white">{c.naoLidas}</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {c.atribuidaA === "ai" && c.iaAtiva ? <Selo cor="petroleo"><Bot className="size-3" />{c.agenteNome ?? "IA"}</Selo>
                    : c.humanoNome ? <Selo cor="laranja">{c.humanoNome.split(" ")[0]}</Selo> : <Selo cor="ambar">Fila</Selo>}
                  {c.slaStatus === "breached" && <Selo cor="vermelho">Atrasada</Selo>}
                  {(c.contatoTags ?? []).slice(0, 2).map((t) => <Selo key={t}>{t}</Selo>)}
                </div>
              </div>
            </button>
          ))}
          {maisCarregando && <div className="py-3 text-center"><Loader2 className="mx-auto size-4 animate-spin text-laranja" /></div>}
        </div>
      </aside>

      {/* chat */}
      {selecionada ? (
        <Chat key={selecionada} id={selecionada} tags={tags ?? []} aoVoltar={() => navigate({ to: "/conversas", search: {} })} />
      ) : (
        <div className="hidden flex-1 place-items-center bg-fundo md:grid">
          <Vazio icone={MessageSquare} titulo="Escolha uma conversa">As mensagens do WhatsApp e do Instagram chegam aqui em tempo real.</Vazio>
        </div>
      )}
      {novaAberta && <NovaConversa aoFechar={() => setNovaAberta(false)} aoCriar={(id) => { setNovaAberta(false); abrir(id); }} />}
    </div>
  );
}

function Chat({ id, tags, aoVoltar }: { id: string; tags: any[]; aoVoltar: () => void }) {
  const { avisar } = useAvisos();
  const { me } = useSessao();
  const [conv, setConv] = useState<Conversa | null>(null);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [temMais, setTemMais] = useState(true);
  const [painel, setPainel] = useState(true);
  const fundo = useRef<HTMLDivElement>(null);
  const colarNoFim = useRef(true);

  const carregarConversa = () => get<Conversa>(`/conversas/${id}`).then(setConv).catch((e) => avisar(e.message, "erro"));
  useEffect(() => {
    carregarConversa();
    get<Msg[]>(`/conversas/${id}/mensagens?limite=80`).then((m) => { setMsgs(m); setTemMais(m.length >= 80); });
    post(`/conversas/${id}/lida`, { lida: true }).catch(() => undefined);
  }, [id]);

  useLayoutEffect(() => {
    if (colarNoFim.current && fundo.current) fundo.current.scrollTop = fundo.current.scrollHeight;
  }, [msgs]);

  useEvento("mensagem", (d: { conversaId: string; mensagem: Msg }) => {
    if (d.conversaId !== id) return;
    const el = fundo.current;
    colarNoFim.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    setMsgs((m) => (m ? [...m.filter((x) => x.id !== d.mensagem.id), d.mensagem] : m));
    if (d.mensagem.remetente === "customer") post(`/conversas/${id}/lida`, { lida: true }).catch(() => undefined);
  });
  useEvento("entrega", (d: any) => setMsgs((m) => m?.map((x) => (x.id === d.id ? { ...x, statusEntrega: d.statusEntrega, erroEntrega: d.erroEntrega } : x)) ?? m));
  useEvento("conversa", (c: Conversa) => c.id === id && setConv((a) => (a ? { ...a, ...c } : a)));

  const antigas = async () => {
    if (!msgs?.length) return;
    const el = fundo.current!;
    const altura = el.scrollHeight;
    const m = await get<Msg[]>(`/conversas/${id}/mensagens?limite=80&antes=${encodeURIComponent(msgs[0].enviadaEm)}`);
    colarNoFim.current = false;
    setMsgs([...m, ...msgs]);
    setTemMais(m.length >= 80);
    requestAnimationFrame(() => (el.scrollTop = el.scrollHeight - altura));
  };

  const grupos = useMemo(() => {
    const g: { dia: string; itens: Msg[] }[] = [];
    for (const m of msgs ?? []) {
      const dia = diaChat(m.enviadaEm);
      if (!g.length || g[g.length - 1].dia !== dia) g.push({ dia, itens: [] });
      g[g.length - 1].itens.push(m);
    }
    return g;
  }, [msgs]);

  if (!conv) return <div className="flex-1"><Carregando /></div>;
  const nome = conv.contatoNome ?? (conv.contatoTelefone ? telefone(conv.contatoTelefone) : `@${conv.contatoInstagram}`);
  const comIa = conv.atribuidaA === "ai" && conv.iaAtiva;

  return (
    <div className="flex min-w-0 flex-1">
      <section data-tour="chat" className="flex min-w-0 flex-1 flex-col bg-[#f3eee4]">
        <header className="flex items-center gap-3 border-b border-linha bg-cartao px-3 py-2.5 md:px-4">
          <button type="button" onClick={aoVoltar} className="rounded-lg p-1.5 hover:bg-fundo md:hidden"><ArrowLeft className="size-5" /></button>
          <Avatar nome={nome} foto={conv.contatoFoto} tamanho={40} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-titulo text-[15px] font-semibold">{nome}</div>
            <div className="truncate text-[12px] text-suave">
              {conv.canal === "instagram" ? "Instagram" : telefone(conv.contatoTelefone)} · {conv.conexaoNome ?? "sem conexão"}
              {conv.janela24h === false && conv.canal === "whatsapp" && <span className="ml-1 font-semibold text-vermelho">· janela de 24 h fechada</span>}
            </div>
          </div>
          <BotaoAtendimento conv={conv} aoMudar={carregarConversa} />
          <StatusConversa conv={conv} />
          <button type="button" onClick={() => setPainel((v) => !v)} className="hidden rounded-lg p-2 text-suave hover:bg-fundo xl:block" title="Informações do cliente"><UserRoundCog className="size-5" /></button>
        </header>

        <div ref={fundo} className="flex-1 overflow-y-auto px-3 py-3 md:px-6"
          style={{ backgroundImage: "radial-gradient(#e7dfd1 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
          {temMais && msgs && msgs.length > 0 && (
            <div className="mb-2 text-center"><button type="button" onClick={antigas} className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-petroleo shadow-sm">Carregar mensagens anteriores</button></div>
          )}
          {!msgs ? <Carregando /> : grupos.map((g) => (
            <div key={g.dia}>
              <div className="sticky top-0 z-10 my-3 flex justify-center"><span className="rounded-full bg-white/90 px-3 py-1 text-[11.5px] font-semibold text-suave shadow-sm">{g.dia}</span></div>
              {g.itens.map((m) => <Mensagem key={m.id} m={m} />)}
            </div>
          ))}
          {comIa && conv.aguardandoResposta && (
            <div className="my-2 flex justify-end"><span className="flex items-center gap-1.5 rounded-full bg-petroleo/10 px-3 py-1 text-[12px] font-medium text-petroleo"><Bot className="size-3.5" /> {conv.agenteNome ?? "IA"} está pensando na resposta...</span></div>
          )}
        </div>

        <Compositor conv={conv} nomeUsuario={me.usuario.nome} aoEnviar={() => { colarNoFim.current = true; }} />
      </section>

      {painel && <PainelCliente conv={conv} tags={tags} aoMudar={carregarConversa} />}
    </div>
  );
}

function BotaoAtendimento({ conv, aoMudar }: { conv: Conversa; aoMudar: () => void }) {
  const { executar, carregando } = useAcao();
  const comIa = conv.atribuidaA === "ai" && conv.iaAtiva;
  return comIa ? (
    <Botao data-tour="botao-ia" variante="secundario" tamanho="sm" carregando={carregando} icone={<Hand className="size-4" />}
      onClick={() => executar(() => post(`/conversas/${conv.id}/assumir`), "Você assumiu a conversa. A IA parou de responder.").then(aoMudar)}>
      Assumir
    </Botao>
  ) : (
    <Botao data-tour="botao-ia" variante="petroleo" tamanho="sm" carregando={carregando} icone={<Bot className="size-4" />}
      onClick={() => executar(() => post(`/conversas/${conv.id}/ia`, { responderAgora: true }), "Conversa devolvida para a IA").then(aoMudar)}>
      Devolver para a IA
    </Botao>
  );
}

function StatusConversa({ conv }: { conv: Conversa }) {
  const { executar } = useAcao();
  const opcoes: Record<string, string> = { new: "Nova", open: "Aberta", pending: "Pendente", resolved: "Resolvida", closed: "Fechada" };
  return (
    <label className="relative hidden sm:block">
      <select value={conv.status} onChange={(e) => executar(() => put(`/conversas/${conv.id}/status`, { status: e.target.value }), "Status atualizado")}
        className={`appearance-none rounded-xl border py-1.5 pr-7 pl-3 text-[12.5px] font-semibold outline-none ${conv.status === "resolved" || conv.status === "closed" ? "border-green-300 bg-green-50 text-green-800" : "border-linha bg-white"}`}>
        {Object.entries(opcoes).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-suave" />
    </label>
  );
}

function Compositor({ conv, nomeUsuario, aoEnviar }: { conv: Conversa; nomeUsuario: string; aoEnviar: () => void }) {
  const { avisar } = useAvisos();
  const [texto, setTexto] = useState("");
  const [nota, setNota] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [rapidas, setRapidas] = useState<any[] | null>(null);
  const [templates, setTemplates] = useState(false);
  const [opcoes, setOpcoes] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const bloqueado = conv.canal === "whatsapp" && conv.janela24h === false && !nota;

  useEffect(() => {
    if (texto.startsWith("/") && !rapidas) get<any[]>("/conversas/respostas-rapidas").then(setRapidas).catch(() => setRapidas([]));
  }, [texto]);
  const sugestoes = texto.startsWith("/") ? (rapidas ?? []).filter((r) => r.atalho.startsWith(texto.slice(1).toLowerCase())) : [];

  const enviar = async () => {
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    try {
      if (nota) await post(`/conversas/${conv.id}/notas`, { texto: t });
      else await post(`/conversas/${conv.id}/mensagens`, { tipo: "text", texto: t });
      setTexto("");
      aoEnviar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Não enviou", "erro");
    } finally {
      setEnviando(false);
    }
  };

  const enviarArquivoChat = async (f: File) => {
    setEnviando(true);
    try {
      const a = await enviarArquivo(f);
      const tipo = f.type.startsWith("image/") ? "image" : f.type.startsWith("audio/") ? "audio" : f.type.startsWith("video/") ? "video" : "document";
      await post(`/conversas/${conv.id}/mensagens`, { tipo, midiaUrl: a.url, midiaMime: a.mime, arquivoNome: a.nome, legenda: texto.trim() || undefined });
      setTexto("");
      aoEnviar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Não enviou o arquivo", "erro");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div data-tour="caixa-mensagem" className="border-t border-linha bg-cartao p-3">
      {bloqueado && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          Passaram 24 h desde a última mensagem do cliente. Pela regra do WhatsApp, só dá para enviar um <b>template aprovado</b>.
          <Botao tamanho="sm" onClick={() => setTemplates(true)}>Enviar template</Botao>
        </div>
      )}
      {sugestoes.length > 0 && (
        <div className="mb-2 max-h-48 overflow-y-auto rounded-xl border border-linha bg-white shadow-lg">
          {sugestoes.map((r) => (
            <button key={r.id} type="button" onClick={() => setTexto(r.texto)} className="block w-full px-3 py-2 text-left text-[13px] hover:bg-fundo">
              <b className="text-laranja">/{r.atalho}</b> <span className="text-suave">{r.texto.slice(0, 80)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex shrink-0 gap-0.5 pb-1">
          <button type="button" title="Anexar foto, áudio, vídeo ou arquivo" disabled={bloqueado} onClick={() => arquivo.current?.click()} className="rounded-lg p-2 text-suave hover:bg-fundo hover:text-texto disabled:opacity-40"><Paperclip className="size-5" /></button>
          <button type="button" title="Enviar opções (botões)" disabled={bloqueado} onClick={() => setOpcoes(true)} className="rounded-lg p-2 text-suave hover:bg-fundo hover:text-texto disabled:opacity-40"><ListChecks className="size-5" /></button>
          <button type="button" title="Template aprovado" onClick={() => setTemplates(true)} className="rounded-lg p-2 text-suave hover:bg-fundo hover:text-texto"><Zap className="size-5" /></button>
          <button type="button" title="Nota interna (o cliente não vê)" onClick={() => setNota((v) => !v)} className={`rounded-lg p-2 hover:bg-fundo ${nota ? "bg-amber-100 text-amber-700" : "text-suave"}`}><StickyNote className="size-5" /></button>
          <input ref={arquivo} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarArquivoChat(f); e.target.value = ""; }} />
        </div>
        <textarea
          value={texto}
          disabled={bloqueado}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          rows={1}
          placeholder={nota ? "Nota interna para a equipe..." : bloqueado ? "Use um template para reabrir a conversa" : `Mensagem como ${nomeUsuario.split(" ")[0]} · "/" respostas prontas`}
          className={`max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl border px-4 py-2.5 text-[14px] outline-none focus:border-laranja ${nota ? "border-amber-300 bg-amber-50" : "border-linha-2 bg-white"} disabled:bg-fundo`}
        />
        <button type="button" onClick={enviar} disabled={enviando || !texto.trim()} className="mb-0.5 grid size-11 shrink-0 place-items-center rounded-full bg-laranja-gradiente text-white shadow disabled:opacity-50">
          {enviando ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
        </button>
      </div>
      {templates && <EnviarTemplate conv={conv} aoFechar={() => setTemplates(false)} />}
      {opcoes && <EnviarOpcoes conv={conv} aoFechar={() => setOpcoes(false)} />}
    </div>
  );
}

function EnviarTemplate({ conv, aoFechar }: { conv: Conversa; aoFechar: () => void }) {
  const { dados } = useDados<any[]>("/conexoes/templates?status=APPROVED");
  const [sel, setSel] = useState<any>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const { executar, carregando } = useAcao();
  const corpo = sel?.componentes?.find((c: any) => c.type === "BODY")?.text ?? "";
  const numeros = [...corpo.matchAll(/\{\{(\d+)\}\}/g)].map((m: any) => m[1]);
  return (
    <Modal titulo="Enviar template aprovado" aoFechar={aoFechar} rodape={<Botao carregando={carregando} disabled={!sel} onClick={() => executar(() => post(`/conversas/${conv.id}/mensagens`, { tipo: "template", templateId: sel.id, variaveis: vars, manterIa: true }), "Template enviado").then((r) => r && aoFechar())}>Enviar</Botao>}>
      {!dados ? <Carregando /> : dados.length === 0 ? <p className="text-sm text-suave">Nenhum template aprovado ainda. Crie em Marketing → Templates da Meta.</p> : (
        <div className="flex flex-col gap-3">
          <Selecao vazio="Escolha o template" value={sel?.id ?? ""} onChange={(e) => { setSel(dados.find((t) => t.id === e.target.value)); setVars({}); }} opcoes={dados.map((t) => ({ valor: t.id, rotulo: `${t.nome} (${t.idioma})` }))} />
          {sel && <div className="rounded-xl bg-fundo p-3 text-[13px] whitespace-pre-wrap">{corpo}</div>}
          {numeros.map((n) => (
            <Campo key={n} rotulo={`Variável {{${n}}}`} dica="Pode usar {nome}, {primeiro_nome}, {telefone}.">
              <Entrada value={vars[n] ?? ""} onChange={(e) => setVars({ ...vars, [n]: e.target.value })} placeholder={n === "1" ? "{primeiro_nome}" : ""} />
            </Campo>
          ))}
        </div>
      )}
    </Modal>
  );
}

function EnviarOpcoes({ conv, aoFechar }: { conv: Conversa; aoFechar: () => void }) {
  const [texto, setTexto] = useState("");
  const [ops, setOps] = useState(["", ""]);
  const { executar, carregando } = useAcao();
  const validas = ops.map((o) => o.trim()).filter(Boolean);
  return (
    <Modal titulo="Pergunta com opções" aoFechar={aoFechar} rodape={<Botao carregando={carregando} disabled={!texto.trim() || validas.length < 1}
      onClick={() => executar(() => post(`/conversas/${conv.id}/mensagens`, { tipo: validas.length <= 3 ? "buttons" : "list", texto, opcoes: validas }), "Enviado").then((r) => r && aoFechar())}>Enviar</Botao>}>
      <div className="flex flex-col gap-3">
        <Campo rotulo="Pergunta"><Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Qual tamanho você prefere?" /></Campo>
        <Campo rotulo="Opções" dica="Até 3 viram botões; mais que isso vira uma lista (até 10).">
          <div className="flex flex-col gap-2">
            {ops.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Entrada value={o} maxLength={24} onChange={(e) => setOps(ops.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Opção ${i + 1}`} />
                <button type="button" onClick={() => setOps(ops.filter((_, j) => j !== i))} className="rounded-lg p-2 text-suave hover:bg-fundo"><X className="size-4" /></button>
              </div>
            ))}
            {ops.length < 10 && <Botao variante="secundario" tamanho="sm" onClick={() => setOps([...ops, ""])}>+ Opção</Botao>}
          </div>
        </Campo>
      </div>
    </Modal>
  );
}

function PainelCliente({ conv, tags, aoMudar }: { conv: Conversa; tags: any[]; aoMudar: () => void }) {
  const { executar, carregando } = useAcao();
  const { dados: equipe } = useDados<any>("/equipe");
  const [editarTags, setEditarTags] = useState(false);
  const [transferir, setTransferir] = useState(false);
  const corTag = (n: string) => tags.find((t) => t.nome === n)?.cor;
  const n = conv.negocio;
  return (
    <aside data-tour="painel-cliente" className="hidden w-[320px] shrink-0 flex-col overflow-y-auto border-l border-linha bg-cartao xl:flex">
      <div className="flex flex-col items-center border-b border-linha px-4 py-5 text-center">
        <Avatar nome={conv.contatoNome ?? conv.contatoTelefone} foto={conv.contatoFoto} tamanho={64} />
        <div className="mt-2 font-titulo text-[16px] font-semibold">{conv.contatoNome ?? "Sem nome"}</div>
        <div className="text-[12.5px] text-suave">{conv.contatoTelefone ? telefone(conv.contatoTelefone) : `@${conv.contatoInstagram}`}</div>
        {conv.contatoEmail && <div className="text-[12px] text-suave">{conv.contatoEmail}</div>}
        <Link to="/contatos/$id" params={{ id: conv.contatoId }} className="mt-2 text-[12.5px] font-semibold text-laranja hover:underline">Ver ficha completa</Link>
        {conv.origem && <Selo cor="azul" className="mt-2">Origem: {conv.origem}</Selo>}
      </div>

      <div className="border-b border-linha p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-suave uppercase"><IconeTag className="size-3.5" /> Tags</span>
          <button type="button" onClick={() => setEditarTags(true)} className="text-[12px] font-semibold text-laranja">Editar</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {(conv.contatoTags ?? []).length === 0 ? <span className="text-[12.5px] text-suave">Sem tags</span> : (conv.contatoTags ?? []).map((t) => <Tag key={t} nome={t} cor={corTag(t)} />)}
        </div>
      </div>

      <div className="border-b border-linha p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-suave uppercase">Atendimento</span>
          <button type="button" onClick={() => setTransferir(true)} className="text-[12px] font-semibold text-laranja">Transferir</button>
        </div>
        <div className="text-[13px]">
          {conv.atribuidaA === "ai" && conv.iaAtiva ? <>🤖 Robô <b>{conv.agenteNome}</b> atendendo</> : conv.humanoNome ? <>👤 <b>{conv.humanoNome}</b> atendendo</> : <>⏳ Na fila{conv.setorNome ? ` do setor ${conv.setorNome}` : ""}</>}
        </div>
      </div>

      {n && (
        <div className="border-b border-linha p-4">
          <div className="mb-2 text-[12px] font-semibold text-suave uppercase">Negócio</div>
          <Link to="/crm" className="block rounded-xl border border-linha p-3 hover:border-laranja/50">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-semibold">{n.titulo}</span>
              <span className="text-[12.5px] font-semibold">{reais(n.valor)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <Selo cor="cinza"><span className="size-2 rounded-full" style={{ background: n.etapaCor }} />{n.etapaNome}</Selo>
              {n.scoreIa != null && <span className={`flex items-center gap-1 text-[12px] font-bold ${n.scoreIa >= 70 ? "text-laranja" : n.scoreIa < 40 ? "text-sky-600" : "text-texto"}`}><Flame className="size-3.5" />{n.scoreIa}%</span>}
            </div>
            {n.scoreIa != null && <div className="mt-2"><Barra valor={n.scoreIa} total={100} /></div>}
          </Link>
        </div>
      )}

      <div className="border-b border-linha p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-suave uppercase"><Sparkles className="size-3.5 text-laranja" /> Resumo da IA</span>
          <button type="button" disabled={carregando} onClick={() => executar(() => post(`/conversas/${conv.id}/resumo`), "Resumo atualizado").then(aoMudar)} className="text-suave hover:text-laranja" title="Atualizar"><RefreshCw className={`size-3.5 ${carregando ? "animate-spin" : ""}`} /></button>
        </div>
        <p className="text-[12.5px] leading-relaxed text-texto/85">{conv.resumo ?? "Ainda sem resumo. Clique em atualizar."}</p>
        {conv.resumoEm && <div className="mt-1 text-[11px] text-suave">{dataHora(conv.resumoEm)}</div>}
      </div>

      {(conv.memorias ?? []).length > 0 && (
        <div className="border-b border-linha p-4">
          <div className="mb-2 text-[12px] font-semibold text-suave uppercase">O que sabemos do cliente</div>
          <ul className="flex flex-col gap-1.5">
            {conv.memorias!.map((m) => <li key={m.id} className="flex gap-2 text-[12.5px]"><CircleDot className="mt-0.5 size-3 shrink-0 text-laranja" />{m.fato}</li>)}
          </ul>
        </div>
      )}

      {(conv.promessas ?? []).length > 0 && (
        <div className="border-b border-linha p-4">
          <div className="mb-2 text-[12px] font-semibold text-suave uppercase">Promessas</div>
          {conv.promessas!.map((p) => <div key={p.id} className="mb-1 text-[12.5px]">🤝 {p.descricao} {p.venceEm && <span className="text-suave">· {dataHora(p.venceEm)}</span>}</div>)}
        </div>
      )}

      {(conv.pedidos ?? []).length > 0 && (
        <div className="p-4">
          <div className="mb-2 text-[12px] font-semibold text-suave uppercase">Pedidos</div>
          {conv.pedidos!.map((p) => (
            <Link key={p.id} to="/pedidos/$id" params={{ id: p.id }} className="mb-1.5 flex items-center justify-between rounded-lg bg-fundo px-2.5 py-1.5 text-[12.5px] hover:bg-fundo-2">
              <span className="font-semibold">#{p.numero}</span><span>{p.status.replace("_", " ")}</span><span className="font-semibold">{reais(p.total)}</span>
            </Link>
          ))}
        </div>
      )}

      {editarTags && <EditarTags conv={conv} tags={tags} aoFechar={() => { setEditarTags(false); aoMudar(); }} />}
      {transferir && (
        <Modal titulo="Transferir conversa" aoFechar={() => setTransferir(false)}>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => executar(() => post(`/conversas/${conv.id}/transferir`, {}), "Enviada para a fila").then(() => { setTransferir(false); aoMudar(); })}
              className="rounded-xl border border-linha px-3 py-2.5 text-left text-[13.5px] hover:border-laranja">⏳ Para a fila (quem estiver livre pega)</button>
            {(equipe?.setores ?? []).map((s: any) => (
              <button key={s.id} type="button" onClick={() => executar(() => post(`/conversas/${conv.id}/transferir`, { setorId: s.id }), `Enviada para ${s.nome}`).then(() => { setTransferir(false); aoMudar(); })}
                className="rounded-xl border border-linha px-3 py-2.5 text-left text-[13.5px] hover:border-laranja">🏷️ Setor {s.nome}</button>
            ))}
            {(equipe?.membros ?? []).map((m: any) => (
              <button key={m.id} type="button" onClick={() => executar(() => post(`/conversas/${conv.id}/transferir`, { usuarioId: m.id }), `Transferida para ${m.nome}`).then(() => { setTransferir(false); aoMudar(); })}
                className="flex items-center gap-2 rounded-xl border border-linha px-3 py-2 text-left text-[13.5px] hover:border-laranja">
                <Avatar nome={m.nome} foto={m.fotoUrl} tamanho={28} /> {m.nome} <span className="ml-auto text-[11px] text-suave">{m.conversasAtivas} ativas</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </aside>
  );
}

function EditarTags({ conv, tags, aoFechar }: { conv: Conversa; tags: any[]; aoFechar: () => void }) {
  const [sel, setSel] = useState<string[]>(conv.contatoTags ?? []);
  const [nova, setNova] = useState("");
  const { executar, carregando } = useAcao();
  const todas = [...new Set([...tags.map((t) => t.nome), ...sel])];
  return (
    <Modal titulo="Tags do contato" aoFechar={aoFechar} rodape={<Botao carregando={carregando} onClick={() => executar(() => put(`/conversas/${conv.id}/tags`, { tags: sel }), "Tags salvas").then(aoFechar)}>Salvar</Botao>}>
      <div className="flex flex-wrap gap-2">
        {todas.map((t) => (
          <button key={t} type="button" onClick={() => setSel(sel.includes(t) ? sel.filter((x) => x !== t) : [...sel, t])}
            className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 ${sel.includes(t) ? "bg-laranja text-white ring-laranja" : "bg-white text-texto ring-linha"}`}>
            {sel.includes(t) && <CheckCircle2 className="mr-1 inline size-3.5" />}{t}
          </button>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Entrada value={nova} onChange={(e) => setNova(e.target.value.toUpperCase())} placeholder="Nova tag" />
        <Botao variante="secundario" onClick={() => { if (nova.trim()) { setSel([...sel, nova.trim()]); setNova(""); } }}>Adicionar</Botao>
      </div>
    </Modal>
  );
}

function NovaConversa({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: (id: string) => void }) {
  const [telefoneN, setTelefone] = useState("");
  const [nome, setNome] = useState("");
  const { dados: conexoes } = useDados<any[]>("/conexoes");
  const [conexao, setConexao] = useState("");
  const { dados: templates } = useDados<any[]>("/conexoes/templates?status=APPROVED");
  const [tpl, setTpl] = useState("");
  const { executar, carregando } = useAcao();
  return (
    <Modal titulo="Nova conversa" aoFechar={aoFechar} rodape={
      <Botao carregando={carregando} onClick={() => executar(() => post<{ id: string }>("/conversas", { telefone: telefoneN, nome, conexaoId: conexao || undefined, templateId: tpl || undefined, variaveis: { 1: "{primeiro_nome}" } })).then((c) => c && aoCriar(c.id))}>
        Abrir conversa
      </Botao>}>
      <div className="flex flex-col gap-3">
        <Campo rotulo="WhatsApp do cliente"><Entrada value={telefoneN} onChange={(e) => setTelefone(e.target.value)} placeholder="(51) 99999-9999" /></Campo>
        <Campo rotulo="Nome (opcional)"><Entrada value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Campo rotulo="Número da empresa"><Selecao vazio="Padrão" value={conexao} onChange={(e) => setConexao(e.target.value)} opcoes={(conexoes ?? []).filter((c) => c.tipo === "whatsapp_cloud").map((c) => ({ valor: c.id, rotulo: c.nome }))} /></Campo>
        <Campo rotulo="Primeira mensagem (template aprovado)" dica="O WhatsApp só permite começar conversa com template aprovado pela Meta.">
          <Selecao vazio="Sem mensagem agora" value={tpl} onChange={(e) => setTpl(e.target.value)} opcoes={(templates ?? []).map((t) => ({ valor: t.id, rotulo: t.nome }))} />
        </Campo>
      </div>
    </Modal>
  );
}

export { ImageIcon, Mic, FileText };
