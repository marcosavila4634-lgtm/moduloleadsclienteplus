import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CalendarPlus,
  Check,
  CircleHelp,
  Clock,
  ContactRound,
  DollarSign,
  FilePlus2,
  Flame,
  KanbanSquare,
  Megaphone,
  MessageCirclePlus,
  MessagesSquare,
  Rocket,
  ShoppingCart,
  Snowflake,
  Sparkles,
  Target,
  TriangleAlert,
  UserPlus,
  X,
} from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CelularConversa } from "../../components/Ilustracoes";
import { useTutorial } from "../../components/Tutorial";
import { Avatar, Barra, Card, CardNumero, Carregando, TituloCard, VerTodos } from "../../components/ui";
import { useDados } from "../../lib/dados";
import { dataHora, duracao, num, reais, relativo, saudacao } from "../../lib/formato";
import { useEvento, useSessao } from "../../lib/sessao";

export const Route = createFileRoute("/_app/painel")({ component: Painel });

type Dash = Record<string, any>;
type PassoInicial = { id: string; titulo: string; texto: string; para: string; trilha: string; feito: boolean; opcional?: boolean };

const FRASES = [
  "“Cliente bem atendido volta — e ainda traz outro.”",
  "“Quem responde primeiro, vende primeiro.”",
  "“Cada conversa é uma oportunidade de encantar.”",
  "“Organização hoje, resultado amanhã.”",
];

function Painel() {
  const { me } = useSessao();
  const [periodo, setPeriodo] = useState("30");
  const { dados: d, recarregar } = useDados<Dash>(`/dashboard?periodo=${periodo}`);
  const { dados: esperando } = useDados<any[]>("/conversas?aba=todas&limite=8&status=open");
  const { dados: agenda } = useDados<any[]>(`/agenda/eventos?de=${new Date().toISOString()}`);
  useEvento("conversa", () => recarregar());
  const frase = FRASES[new Date().getDate() % FRASES.length];
  const nome = me.usuario.nome.split(" ")[0];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        {/* banner */}
        <section className="sombra-cartao relative overflow-hidden rounded-3xl border border-linha bg-gradient-to-br from-white via-[#fdf8f1] to-[#f7ead9] px-6 py-6 md:px-8">
          <div className="relative z-10 max-w-[440px]">
            <h1 className="font-titulo text-[28px] leading-tight font-extrabold text-texto md:text-[34px]">
              {saudacao()}, <span className="text-laranja">{nome}!</span>
            </h1>
            <p className="mt-1.5 text-[15px] text-texto/80">Hoje é um ótimo dia para transformar conversas em vendas.</p>
            <p className="mt-4 text-[14px] text-suave italic">{frase}</p>
            <svg viewBox="0 0 120 10" className="mt-1 h-2.5 w-28"><path d="M2 6 Q60 -2 118 6" stroke="#f47b20" strokeWidth="3" fill="none" strokeLinecap="round" /></svg>
          </div>
          <CelularConversa className="pointer-events-none absolute -bottom-8 hidden h-[220px] md:right-4 md:block 2xl:right-44" />
          <div className="pointer-events-none absolute top-5 right-6 hidden -rotate-6 text-right font-script text-[30px] leading-[0.95] text-petroleo 2xl:block">
            Mais
            <br />
            conversas,
            <br />
            <span className="text-laranja">mais vendas</span>
          </div>
        </section>

        {/* números */}
        {!d ? (
          <Carregando />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-titulo text-[15px] font-semibold text-texto">Seu resultado</h2>
              <div className="flex gap-1 rounded-full bg-cartao p-1 ring-1 ring-linha">
                {[["hoje", "Hoje"], ["7", "7 dias"], ["30", "30 dias"], ["90", "Trimestre"]].map(([v, r]) => (
                  <button key={v} type="button" onClick={() => setPeriodo(v)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${periodo === v ? "bg-laranja-gradiente text-white" : "text-suave hover:text-texto"}`}>{r}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CardNumero icone={MessagesSquare} cor="petroleo" rotulo="Conversas" valor={num(d.conversas)} variacao={d.variacao} detalhe={`Período anterior: ${num(d.conversasAntes)}`} />
              <CardNumero icone={Bot} cor="laranja" rotulo="Autonomia da IA" valor={`${String(d.autonomiaIa).replace(".", ",")}%`} detalhe={`${num(d.resolvidasIa)} resolvidas sem humano`} />
              <CardNumero icone={KanbanSquare} cor="ambar" rotulo="Negócios abertos" valor={num(d.negociosAbertos)} detalhe={`${num(d.ganhos)} ganhos · ${String(d.conversao).replace(".", ",")}% conversão`} />
              <CardNumero icone={DollarSign} cor="vermelho" rotulo="Vendas no período" valor={reais(d.receita)} detalhe={`Ticket médio ${reais(d.ticketMedio)}`} />
            </div>
          </>
        )}

        <Atalhos />
        <PrimeirosPassos />

        {d && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <TituloCard icone={MessagesSquare} acao={<VerTodos para="/relatorios">Relatório</VerTodos>}>Conversas por dia</TituloCard>
              <div className="mt-3 h-56">
                <ResponsiveContainer>
                  <AreaChart data={(d.porDia ?? []).map((x: any) => ({ ...x, dia: x.dia.slice(8, 10) + "/" + x.dia.slice(5, 7) }))}>
                    <defs>
                      <linearGradient id="g-conv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f47b20" stopOpacity={0.35} /><stop offset="1" stopColor="#f47b20" stopOpacity={0} /></linearGradient>
                      <linearGradient id="g-ia" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#145f6e" stopOpacity={0.3} /><stop offset="1" stopColor="#145f6e" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid stroke="#eee6d8" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "#6b7a80" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: "#6b7a80" }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e9e2d4", fontSize: 12 }} />
                    <Area isAnimationActive={false} type="monotone" dataKey="conversas" name="Conversas" stroke="#f47b20" strokeWidth={2.5} fill="url(#g-conv)" />
                    <Area isAnimationActive={false} type="monotone" dataKey="ia" name="Respostas da IA" stroke="#145f6e" strokeWidth={2} fill="url(#g-ia)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <TituloCard icone={Target} acao={<VerTodos para="/crm">Abrir funil</VerTodos>}>Onde estão os negócios</TituloCard>
              <div className="mt-4 flex flex-col gap-3">
                {(d.funil ?? []).map((e: any) => {
                  const total = (d.funil ?? []).reduce((s: number, x: any) => s + Number(x.negocios), 0);
                  return (
                    <div key={e.id}>
                      <div className="mb-1 flex items-center justify-between text-[13px]">
                        <span className="flex items-center gap-2 font-medium text-texto"><span className="size-2.5 rounded-full" style={{ background: e.cor }} />{e.nome}</span>
                        <span className="font-semibold text-texto">{e.negocios}<span className="ml-2 text-xs font-normal text-suave">{reais(e.valor)}</span></span>
                      </div>
                      <Barra valor={Number(e.negocios)} total={total} cor={e.ganho ? "bg-verde" : e.perda ? "bg-vermelho" : "bg-laranja-gradiente"} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2 text-[13px]"><Flame className="size-4 text-laranja" /><b>{d.scoreAlto}</b> quentes (score ≥ 70)</div>
                <div className="flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-[13px]"><Snowflake className="size-4 text-sky-600" /><b>{d.esfriando}</b> esfriando</div>
              </div>
            </Card>

            <Card>
              <TituloCard icone={Clock}>Quem respondeu primeiro</TituloCard>
              {(() => {
                const ia = Number(d.primeiroQuemRespondeu?.ia ?? 0), eq = Number(d.primeiroQuemRespondeu?.equipe ?? 0);
                const t = ia + eq || 1;
                return (
                  <div className="mt-4 flex flex-col gap-4">
                    <div>
                      <div className="mb-1 flex justify-between text-[13px]"><span className="font-medium">🤖 Robô de IA</span><span className="text-suave">{ia} conversas · {Math.round((ia / t) * 100)}% · mediana {duracao(d.primeiraIaMs)}</span></div>
                      <Barra valor={ia} total={t} cor="bg-petroleo" />
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-[13px]"><span className="font-medium">👤 Sua equipe</span><span className="text-suave">{eq} conversas · {Math.round((eq / t) * 100)}% · mediana {duracao(d.primeiraEquipeMs)}</span></div>
                      <Barra valor={eq} total={t} />
                    </div>
                  </div>
                );
              })()}
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-linha text-left text-[11px] text-suave uppercase"><th className="py-2">Robô</th><th>Conversas</th><th>Sem humano</th></tr></thead>
                  <tbody>
                    {(d.agentes ?? []).map((a: any) => (
                      <tr key={a.id} className="border-b border-linha/60 last:border-0"><td className="py-2 font-medium"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: a.cor }} />{a.nome}</td><td>{a.conversas}</td><td>{a.semHumano}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <TituloCard icone={TriangleAlert} cor="text-vermelho" acao={<VerTodos para="/conversas">Ver conversas</VerTodos>}>Esperando resposta</TituloCard>
              <div className="mt-2 flex items-center gap-2 text-[13px] text-suave">
                <b className="text-texto">{d.esperando}</b> conversas esperando {d.maisAntiga && <>· a mais antiga há <b className="text-vermelho">{relativo(d.maisAntiga)}</b></>}
              </div>
              <ul className="mt-3 flex flex-col">
                {(esperando ?? []).filter((c) => c.aguardandoResposta).slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link to="/conversas" search={{ c: c.id }} className="flex items-center gap-3 rounded-xl px-1 py-2 hover:bg-fundo">
                      <Avatar nome={c.contatoNome ?? c.contatoTelefone} foto={c.contatoFoto} tamanho={36} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold">{c.contatoNome ?? c.contatoTelefone}</div>
                        <div className="truncate text-[12px] text-suave">{c.ultimaMensagem}</div>
                      </div>
                      <span className="text-[11px] font-semibold text-vermelho">{relativo(c.ultimaDoClienteEm)}</span>
                    </Link>
                  </li>
                ))}
                {(esperando ?? []).filter((c) => c.aguardandoResposta).length === 0 && <li className="py-6 text-center text-sm text-verde">Tudo respondido por aqui! 🎉</li>}
              </ul>
            </Card>
          </div>
        )}
      </div>

      {/* coluna direita */}
      <div className="flex flex-col gap-5">
        <Card className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-fundo-2 text-petroleo"><CalendarDays className="size-5" /></span>
          <div className="leading-tight">
            <div className="text-[11px] font-semibold text-suave uppercase">Hoje</div>
            <div className="font-titulo text-[14.5px] font-semibold text-texto first-letter:uppercase">
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
        </Card>

        <section className="bg-menu-gradiente relative overflow-hidden rounded-3xl p-5 text-white">
          <Sparkles className="absolute top-4 right-4 size-10 text-laranja-claro/70" />
          <div className="font-titulo text-[20px] leading-tight font-bold">Reative clientes<br />que sumiram</div>
          <p className="mt-2 text-[13px] text-menu-texto">Mande uma oferta para quem não compra há um tempo — o robô continua a conversa.</p>
          <Link to="/disparos" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-laranja-gradiente px-4 py-2 text-[13px] font-semibold text-white">
            Criar disparo <ArrowRight className="size-4" />
          </Link>
          <div className="pointer-events-none absolute -right-10 -bottom-12 size-40 rounded-full bg-laranja/25 blur-2xl" />
        </section>

        {d && (d.emRisco ?? []).length > 0 && (
          <Card>
            <TituloCard icone={Flame} cor="text-vermelho" acao={<VerTodos para="/crm" />}>Negócios em risco</TituloCard>
            <ul className="mt-3 flex flex-col gap-2">
              {d.emRisco.map((n: any) => (
                <li key={n.id} className="flex items-center justify-between gap-2 rounded-xl bg-fundo px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold">{n.titulo}</div>
                    <div className="text-[11.5px] text-suave">{n.etapa} · score {n.scoreIa ?? "—"}</div>
                  </div>
                  <span className="text-[12px] font-semibold text-texto">{reais(n.valor)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <TituloCard icone={CalendarDays} acao={<VerTodos para="/agenda" />}>Próximos agendamentos</TituloCard>
          <ul className="mt-3 flex flex-col gap-2">
            {(agenda ?? []).filter((e) => e.status !== "canceled").slice(0, 5).map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl text-[11px] leading-none font-bold text-white" style={{ background: e.tipoCor ?? "#145f6e" }}>
                  {new Date(e.inicio).getDate()}
                  <br />
                  {new Date(e.inicio).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{e.titulo}</div>
                  <div className="text-[11.5px] text-suave">{dataHora(e.inicio)} · {e.contatoNome ?? "sem cliente"}</div>
                </div>
              </li>
            ))}
            {(agenda ?? []).length === 0 && <li className="py-4 text-center text-[13px] text-suave">Nenhum agendamento pela frente.</li>}
          </ul>
        </Card>

        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-laranja to-[#e2531a] p-5 text-white">
          <div className="font-script text-[30px] leading-[0.95]">Venda também<br />pela sua loja online</div>
          <p className="mt-2 text-[12.5px] text-white/85">Catálogo com fotos, carrinho e pedido direto no WhatsApp.</p>
          <Link to="/pagina" className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-[12.5px] font-semibold text-laranja">
            Montar minha página <ArrowRight className="size-4" />
          </Link>
          <ShoppingCart className="absolute -right-3 -bottom-3 size-24 text-white/15" />
        </section>
      </div>
    </div>
  );
}

function Atalhos() {
  const itens = [
    { icone: MessageCirclePlus, rotulo: "Nova conversa", para: "/conversas", search: { nova: "1" } },
    { icone: UserPlus, rotulo: "Novo contato", para: "/contatos", search: { novo: "1" } },
    { icone: KanbanSquare, rotulo: "Novo negócio", para: "/crm", search: { novo: "1" } },
    { icone: ShoppingCart, rotulo: "Novo pedido", para: "/pedidos", search: { novo: "1" } },
    { icone: CalendarPlus, rotulo: "Agendar", para: "/agenda", search: { novo: "1" } },
    { icone: FilePlus2, rotulo: "Proposta", para: "/propostas", search: { novo: "1" } },
    { icone: Megaphone, rotulo: "Disparo", para: "/disparos", search: {} },
    { icone: ContactRound, rotulo: "Importar contatos", para: "/contatos", search: { importar: "1" } },
  ];
  return (
    <div className="grid grid-cols-4 gap-2.5 lg:grid-cols-8">
      {itens.map(({ icone: Icone, rotulo, para, search }) => (
        <Link key={rotulo} to={para} search={search as never}
          className="sombra-cartao group flex flex-col items-center gap-1.5 rounded-2xl border border-linha bg-cartao px-1 py-3 text-center transition hover:-translate-y-0.5 hover:border-laranja/50">
          <Icone className="size-6 text-laranja transition group-hover:scale-110" />
          <span className="text-[11.5px] leading-tight font-semibold text-texto">{rotulo}</span>
        </Link>
      ))}
    </div>
  );
}

function PrimeirosPassos() {
  const { dados: passos } = useDados<PassoInicial[]>("/dashboard/primeiros-passos");
  const { iniciar } = useTutorial();
  const [escondido, setEscondido] = useState(() => localStorage.getItem("crm.passos-escondido") === "1");
  const [mostrarFeitos, setMostrarFeitos] = useState(false);
  if (!passos || escondido) return null;
  const obrigatorios = passos.filter((p) => !p.opcional);
  const feitos = passos.filter((p) => p.feito).length;
  if (obrigatorios.every((p) => p.feito) && !mostrarFeitos) return null;
  const lista = passos.filter((p) => mostrarFeitos || !p.feito);
  return (
    <section className="sombra-cartao rounded-3xl border border-laranja/30 bg-gradient-to-br from-[#fff7ee] to-white p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-laranja-gradiente text-white"><Rocket className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-titulo text-[16px] font-bold text-texto">Primeiros passos</h2>
          <p className="text-[13px] text-suave">{feitos} de {passos.length} feitos. Cada passo tem um "Como fazer" que mostra tudo na tela.</p>
          <div className="mt-2 max-w-md"><Barra valor={feitos} total={passos.length} /></div>
        </div>
        <button type="button" onClick={() => { localStorage.setItem("crm.passos-escondido", "1"); setEscondido(true); }}
          className="flex items-center gap-1 text-[12.5px] text-suave hover:text-texto"><X className="size-3.5" /> Esconder</button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {lista.map((p, i) => (
          <div key={p.id} className={`rounded-2xl border bg-white p-3.5 ${!p.feito && i === 0 ? "border-laranja/60" : "border-linha"}`}>
            <div className="flex items-start gap-3">
              <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold ${p.feito ? "bg-verde text-white" : "bg-fundo-2 text-texto"}`}>
                {p.feito ? <Check className="size-4" /> : passos.indexOf(p) + 1}
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold text-texto">{p.titulo} {p.opcional && <span className="text-[11px] font-normal text-suave">(opcional)</span>}</div>
                <div className="text-[12.5px] text-suave">{p.texto}</div>
                <div className="mt-2 flex gap-4 text-[12.5px] font-semibold">
                  <button type="button" onClick={() => iniciar(p.trilha)} className="flex items-center gap-1 text-laranja hover:underline"><CircleHelp className="size-3.5" /> Como fazer</button>
                  <Link to={p.para} className="flex items-center gap-1 text-texto hover:underline">Ir para a tela <ArrowRight className="size-3.5" /></Link>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setMostrarFeitos((v) => !v)} className="mt-3 flex items-center gap-1 text-[12.5px] text-suave hover:text-texto">
        <Check className="size-3.5 text-verde" /> {mostrarFeitos ? "Esconder os feitos" : `Mostrar os feitos (${feitos})`}
      </button>
    </section>
  );
}
