import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Brain, Gauge, GraduationCap, Lightbulb, MessagesSquare, RotateCcw, Send, Sparkles, Star, Target, TrendingUp, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Botao, Campo, Entrada, Selecao, useAcao } from "../../components/form";
import { Abas, Avatar, Barra, CabecalhoPagina, Card, CardNumero, Carregando, Dica, Selo, TituloCard, Vazio, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { post, qs } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { num, reais, relativo, telefone } from "../../lib/formato";
import { useSessao } from "../../lib/sessao";

type Aba = "previsao" | "indicadores" | "coach" | "roleplay";
export const Route = createFileRoute("/_app/inteligencia")({
  validateSearch: (s: Record<string, unknown>): { aba?: Aba } => ({ aba: typeof s.aba === "string" ? (s.aba as Aba) : undefined }),
  component: Inteligencia,
});

const CATEGORIAS: Record<string, string> = { commit: "Quase certo", best_case: "Provável", pipeline: "Em andamento", omitted: "Fora da previsão", closed: "Fechado" };

function Inteligencia() {
  const { aba = "previsao" } = Route.useSearch();
  const navegar = Route.useNavigate();
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Inteligência de vendas" icone={Brain} descricao="Previsão de receita, gargalos do funil e treino da equipe com IA." />
      <Abas valor={aba} aoMudar={(a) => navegar({ search: { aba: a } })} abas={[{ valor: "previsao", rotulo: "Previsão" }, { valor: "indicadores", rotulo: "Indicadores e leitura da IA" }, { valor: "coach", rotulo: "Coach de conversas" }, { valor: "roleplay", rotulo: "Treino (roleplay)" }]} />
      {aba === "previsao" && <Previsao />}
      {aba === "indicadores" && <Indicadores />}
      {aba === "coach" && <Coach />}
      {aba === "roleplay" && <Roleplay />}
    </div>
  );
}

function Previsao() {
  const { dados } = useDados<any>("/crm/previsao");
  if (!dados) return <Carregando />;
  const c = dados.cascata;
  const passos = [
    { nome: "Início do mês", valor: Number(c.inicio), base: 0, cor: "var(--color-petroleo)" },
    { nome: "Novos", valor: Number(c.novos), base: Number(c.inicio), cor: "var(--color-verde)" },
    { nome: "Ganhos", valor: Number(c.ganhos), base: Number(c.inicio) + Number(c.novos) - Number(c.ganhos), cor: "var(--color-laranja)" },
    { nome: "Perdidos", valor: Number(c.perdidos), base: Math.max(0, Number(c.inicio) + Number(c.novos) - Number(c.ganhos) - Number(c.perdidos)), cor: "var(--color-vermelho)" },
    { nome: "Hoje", valor: Number(c.fim), base: 0, cor: "var(--color-petroleo)" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Dica>A previsão soma os negócios abertos com fechamento previsto no período. O valor <b>ponderado</b> multiplica cada negócio pela chance de fechar (score da IA) — é o número mais realista.</Dica>
      <div className="grid gap-4 md:grid-cols-3">
        {[30, 60, 90].map((d, i) => (
          <Card key={d} className="flex flex-col gap-1">
            <div className="flex items-center justify-between"><span className="text-[13px] font-semibold text-suave">Próximos {d} dias</span><Selo cor={i === 0 ? "laranja" : "cinza"}>{dados[`d${d}`].negocios} negócios</Selo></div>
            <div className="font-titulo text-[28px] font-bold text-laranja">{reais(dados[`d${d}`].ponderado)}</div>
            <div className="text-[12.5px] text-suave">ponderado · {reais(dados[`d${d}`].total)} se tudo fechar</div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <TituloCard icone={TrendingUp}>Cascata do mês (valor do funil)</TituloCard>
          <div className="mt-3 h-72">
            <ResponsiveContainer>
              <BarChart data={passos}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-linha)" /><XAxis dataKey="nome" fontSize={12} /><YAxis fontSize={11} tickFormatter={(v) => `R$${num(v)}`} />
                <Tooltip formatter={(v, n) => (n === "base" ? null : reais(Number(v)))} />
                <Bar dataKey="base" stackId="a" fill="transparent" />
                <Bar dataKey="valor" stackId="a" radius={[6, 6, 0, 0]}>{passos.map((p) => <Cell key={p.nome} fill={p.cor} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="flex flex-col gap-3">
          <TituloCard icone={Target}>Por chance de fechar</TituloCard>
          {dados.porCategoria.length === 0 ? <p className="text-[13px] text-suave">Sem negócios abertos.</p> : dados.porCategoria.map((x: any) => (
            <div key={x.categoria}>
              <div className="flex justify-between text-[13px]"><span className="font-semibold">{CATEGORIAS[x.categoria] ?? x.categoria}</span><span>{reais(x.valor)}</span></div>
              <Barra valor={Number(x.valor)} total={Math.max(...dados.porCategoria.map((y: any) => Number(y.valor)), 1)} />
              <div className="text-[11.5px] text-suave">{x.negocios} negócios</div>
            </div>
          ))}
        </Card>
      </div>
      <Card className="!p-0">
        <div className="px-4 py-3"><TituloCard>Maiores negócios abertos</TituloCard></div>
        <table className="w-full text-[13px]">
          <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Negócio</th><th>Etapa</th><th>Chance</th><th>Fechamento previsto</th><th className="pr-4 text-right">Valor</th></tr></thead>
          <tbody>{dados.negocios.slice(0, 15).map((n: any) => (
            <tr key={n.id} className={linhaTabela}>
              <td className="px-4 py-2"><Link to="/crm" search={{ n: n.id }} className="font-semibold text-petroleo">{n.titulo}</Link><div className="text-[12px] text-suave">{n.contatoNome}</div></td>
              <td>{n.etapaNome}</td><td>{n.scoreIa != null ? `${n.scoreIa}%` : "—"}</td><td>{n.fechamentoPrevisto ? n.fechamentoPrevisto.split("-").reverse().join("/") : "—"}</td><td className="pr-4 text-right font-semibold">{reais(n.valor)}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}

function Indicadores() {
  const [dias, setDias] = useState(90);
  const { dados } = useDados<any>(`/inteligencia/indicadores${qs({ dias })}`);
  const [leitura, setLeitura] = useState<any>(null);
  const { executar, carregando } = useAcao();
  if (!dados) return <Carregando />;
  const maxEtapa = Math.max(...dados.etapas.map((e: any) => Number(e.abertos)), 1);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Selecao className="!w-36" value={String(dias)} onChange={(e) => setDias(Number(e.target.value))} opcoes={[{ valor: "30", rotulo: "30 dias" }, { valor: "90", rotulo: "90 dias" }, { valor: "180", rotulo: "6 meses" }, { valor: "365", rotulo: "1 ano" }]} />
        <Botao carregando={carregando} icone={<Sparkles className="size-4" />} onClick={() => executar(() => post("/inteligencia/leitura", {})).then((r) => r && setLeitura(r))}>Pedir a leitura da IA</Botao>
      </div>
      {leitura && (
        <Card className="flex flex-col gap-4 ring-2 ring-laranja/30">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-laranja-gradiente text-white"><Sparkles className="size-5" /></span><div><div className="font-titulo font-bold">O que a IA viu no seu funil</div><p className="text-[14px]">{leitura.resumo}</p></div></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2"><div className="flex items-center gap-1.5 text-[13px] font-bold text-vermelho"><AlertTriangle className="size-4" /> Atenção</div>
              {leitura.alertas.map((a: any, i: number) => <div key={i} className="rounded-xl bg-red-50 p-3 text-[13px]"><b>{a.titulo}</b><p className="text-suave">{a.detalhe}</p><p className="mt-1 font-semibold text-vermelho">👉 {a.acao}</p></div>)}</div>
            <div className="flex flex-col gap-2"><div className="flex items-center gap-1.5 text-[13px] font-bold text-verde"><Lightbulb className="size-4" /> Oportunidades</div>
              {leitura.oportunidades.map((a: any, i: number) => <div key={i} className="rounded-xl bg-green-50 p-3 text-[13px]"><b>{a.titulo}</b><p className="text-suave">{a.detalhe}</p><p className="mt-1 font-semibold text-verde">👉 {a.acao}</p></div>)}</div>
          </div>
          <div className="rounded-xl bg-fundo p-3 text-[13px]"><b>Previsão:</b> {leitura.previsao}</div>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardNumero icone={Trophy} cor="verde" rotulo="Taxa de ganho" valor={`${dados.taxaGanho}%`} detalhe={`${dados.ganhos} ganhos · ${dados.perdidos} perdidos`} />
        <CardNumero icone={Target} cor="laranja" rotulo="Ticket médio" valor={reais(dados.ticketMedio)} />
        <CardNumero icone={Gauge} rotulo="Ciclo de venda" valor={`${Math.round(dados.cicloDias)} dias`} detalhe="Do lead até ganhar" />
        <CardNumero icone={TrendingUp} cor="ambar" rotulo="Velocidade do funil" valor={`${reais(dados.velocidadeDia)}/dia`} detalhe={`${dados.parados} parados há +7 dias · ${dados.semDono} sem dono`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <TituloCard>Funil por etapa (abertos agora)</TituloCard>
          {dados.etapas.map((e: any) => (
            <div key={e.id} className="flex items-center gap-3 text-[13px]">
              <span className="w-32 shrink-0 truncate font-semibold">{e.nome}</span>
              <div className="flex-1"><div className="h-6 rounded-lg" style={{ width: `${Math.max(4, (Number(e.abertos) / maxEtapa) * 100)}%`, background: e.cor ?? "var(--color-petroleo)" }} /></div>
              <span className="w-20 text-right">{e.abertos} · {reais(e.valor)}</span>
              <span className={`w-20 text-right text-[12px] ${Number(e.diasMedios) > 7 ? "font-semibold text-vermelho" : "text-suave"}`}>{Math.round(Number(e.diasMedios))}d parado</span>
            </div>
          ))}
        </Card>
        <Card className="!p-0">
          <div className="px-4 py-3"><TituloCard>Por que perdemos</TituloCard></div>
          {dados.motivosPerda.length === 0 ? <Vazio icone={Target} titulo="Nenhuma perda no período" /> : (
            <table className="w-full text-[13px]"><tbody>{dados.motivosPerda.map((m: any) => <tr key={m.motivo} className={linhaTabela}><td className="px-4 py-2">{m.motivo}</td><td>{m.negocios}</td><td className="pr-4 text-right">{reais(m.valor)}</td></tr>)}</tbody></table>
          )}
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="!p-0">
          <div className="px-4 py-3"><TituloCard>Por vendedor</TituloCard></div>
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Vendedor</th><th>Ganhos</th><th>Taxa</th><th>Abertos</th><th className="pr-4 text-right">Receita</th></tr></thead>
            <tbody>{dados.vendedores.map((v: any) => <tr key={v.nome} className={linhaTabela}><td className="px-4 py-2"><div className="flex items-center gap-2"><Avatar nome={v.nome} tamanho={26} />{v.nome}</div></td><td>{v.ganhos}</td><td>{v.ganhos + v.perdidos ? `${Math.round((v.ganhos / (v.ganhos + v.perdidos)) * 100)}%` : "—"}</td><td>{v.abertos}</td><td className="pr-4 text-right font-semibold">{reais(v.receita)}</td></tr>)}</tbody>
          </table>
        </Card>
        <Card className="!p-0">
          <div className="px-4 py-3"><TituloCard icone={AlertTriangle} cor="text-vermelho">Negócios em risco</TituloCard></div>
          {dados.emRisco.length === 0 ? <Vazio icone={Target} titulo="Nada em risco 🎉" /> : (
            <table className="w-full text-[13px]"><tbody>{dados.emRisco.map((n: any) => (
              <tr key={n.id} className={linhaTabela}><td className="px-4 py-2"><div className="font-semibold">{n.titulo}</div><div className="text-[12px] text-suave">{n.contatoNome} · {n.etapa}</div></td><td className="text-[12px]">{Math.round(Number(n.diasParado))} dias sem conversa{n.scoreIa != null && ` · ${n.scoreIa}%`}</td><td className="pr-4 text-right font-semibold">{reais(n.valor)}</td></tr>
            ))}</tbody></table>
          )}
        </Card>
      </div>
    </div>
  );
}

function CartaoAvaliacao({ a }: { a: any }) {
  const cor = a.nota >= 8 ? "text-verde" : a.nota >= 5 ? "text-ambar" : "text-vermelho";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <div className={`font-titulo text-[44px] leading-none font-extrabold ${cor}`}>{a.nota}<span className="text-[18px] text-suave">/10</span></div>
        <p className="text-[14px]">{a.resumo}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-green-50 p-3 text-[13px]"><div className="mb-1 flex items-center gap-1 font-bold text-verde"><Star className="size-4" /> Mandou bem</div><ul className="ml-4 list-disc space-y-0.5">{a.pontosFortes.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></div>
        <div className="rounded-xl bg-amber-50 p-3 text-[13px]"><div className="mb-1 flex items-center gap-1 font-bold text-ambar"><Lightbulb className="size-4" /> Dá para melhorar</div><ul className="ml-4 list-disc space-y-0.5">{a.melhorar.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></div>
      </div>
      {a.mensagemSugerida && <div className="rounded-xl bg-fundo p-3 text-[13px]"><div className="mb-1 font-bold">💬 Uma mensagem melhor seria:</div><div className="rounded-xl rounded-tr-none bg-[#d9fdd3] p-2.5 whitespace-pre-line">{a.mensagemSugerida}</div></div>}
      {a.proximoPasso && <div className="text-[13px]"><b>Próximo passo:</b> {a.proximoPasso}</div>}
    </div>
  );
}

function Coach() {
  const [busca, setBusca] = useState("");
  const { dados } = useDados<any[]>(`/conversas${qs({ aba: "humano", busca: busca || undefined, limite: 40 })}`);
  const [sel, setSel] = useState<any>(null);
  const [aval, setAval] = useState<any>(null);
  const { executar, carregando } = useAcao();
  const { pode } = useSessao();
  if (!pode("supervisor")) return <Card><Vazio icone={GraduationCap} titulo="Disponível para supervisores">Peça ao seu supervisor para avaliar suas conversas — ou treine na aba Roleplay.</Vazio></Card>;
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card className="flex max-h-[70vh] flex-col gap-2 !p-3">
        <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conversa..." />
        <div className="flex-1 overflow-y-auto">
          {!dados ? <Carregando /> : dados.map((c) => (
            <button key={c.id} type="button" onClick={() => { setSel(c); setAval(null); }} className={`flex w-full items-center gap-2 rounded-xl p-2 text-left ${sel?.id === c.id ? "bg-laranja-claro" : "hover:bg-fundo"}`}>
              <Avatar nome={c.contatoNome} foto={c.contatoFoto} tamanho={34} />
              <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold">{c.contatoNome ?? telefone(c.contatoTelefone)}</div><div className="truncate text-[12px] text-suave">{c.humanoNome ?? "—"} · {relativo(c.ultimaMensagemEm)}</div></div>
            </button>
          ))}
        </div>
      </Card>
      <Card className="flex flex-col gap-4">
        {!sel ? <Vazio icone={GraduationCap} titulo="Escolha uma conversa">A IA avalia o atendimento como um coach de vendas: nota, o que foi bem, o que melhorar e um exemplo de mensagem.</Vazio> : (
          <>
            <div className="flex items-center justify-between"><div><div className="font-titulo text-[17px] font-bold">{sel.contatoNome ?? telefone(sel.contatoTelefone)}</div><div className="text-[12.5px] text-suave">Atendido por {sel.humanoNome ?? "—"}</div></div>
              <div className="flex gap-2"><Link to="/conversas" search={{ c: sel.id }} className="rounded-xl px-3 py-2 text-[13px] font-semibold text-petroleo hover:bg-fundo">Abrir conversa</Link>
                <Botao carregando={carregando} icone={<Sparkles className="size-4" />} onClick={() => executar(() => post("/inteligencia/coach", { conversaId: sel.id })).then((r) => r && setAval(r))}>Avaliar atendimento</Botao></div></div>
            {carregando && <Carregando texto="O coach está lendo a conversa..." />}
            {aval && <CartaoAvaliacao a={aval} />}
          </>
        )}
      </Card>
    </div>
  );
}

const CENARIOS = [
  { nome: "Achou caro", cenario: "O cliente gostou do produto mas acha o preço alto e diz que viu mais barato em outro lugar.", perfil: "Mulher, 35 anos, pesquisa bastante antes de comprar" },
  { nome: "Vou pensar", cenario: "O cliente pediu informações, recebeu o preço e respondeu 'vou pensar'.", perfil: "Homem, 42 anos, indeciso, ocupado" },
  { nome: "Primeiro contato do anúncio", cenario: "O cliente clicou num anúncio do Instagram e mandou 'Oi, quero saber mais'.", perfil: "Jovem, 24 anos, curioso, responde rápido" },
  { nome: "Cliente sumido", cenario: "O cliente parou de responder há 5 dias depois de receber a proposta. O vendedor vai retomar o contato.", perfil: "Empresário, sem tempo, direto" },
  { nome: "Reclamação", cenario: "O cliente comprou, o produto atrasou e ele está irritado.", perfil: "Cliente antigo, impaciente" },
];

function Roleplay() {
  const [cfg, setCfg] = useState({ ...CENARIOS[0], dificuldade: "média" });
  const [hist, setHist] = useState<{ de: "vendedor" | "cliente"; texto: string }[] | null>(null);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [aval, setAval] = useState<any>(null);
  const { executar, carregando } = useAcao();
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [hist, pensando]);
  const cliente = async (h: { de: "vendedor" | "cliente"; texto: string }[]) => {
    setPensando(true);
    const r = await executar(() => post<{ resposta: string }>("/inteligencia/roleplay", { ...cfg, historico: h }));
    setPensando(false);
    if (r) setHist([...h, { de: "cliente", texto: r.resposta }]);
  };
  if (!hist) {
    return (
      <Card className="flex max-w-3xl flex-col gap-4">
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-laranja-gradiente text-white"><MessagesSquare className="size-5" /></span>
          <div><div className="font-titulo text-[17px] font-bold">Treine vendas com um cliente de mentira</div><p className="text-[13px] text-suave">A IA faz o papel do cliente. Você responde como faria no WhatsApp. No fim, recebe uma nota e dicas.</p></div></div>
        <div className="grid gap-2 sm:grid-cols-3">{CENARIOS.map((c) => <button key={c.nome} type="button" onClick={() => setCfg({ ...cfg, ...c })} className={`rounded-2xl border-2 p-3 text-left text-[13px] ${cfg.nome === c.nome ? "border-laranja bg-laranja-claro" : "border-linha"}`}><b>{c.nome}</b><div className="text-[12px] text-suave">{c.cenario}</div></button>)}</div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_160px]">
          <Campo rotulo="Situação"><Entrada value={cfg.cenario} onChange={(e) => setCfg({ ...cfg, nome: "Personalizado", cenario: e.target.value })} /></Campo>
          <Campo rotulo="Quem é o cliente"><Entrada value={cfg.perfil} onChange={(e) => setCfg({ ...cfg, perfil: e.target.value })} /></Campo>
          <Campo rotulo="Dificuldade"><Selecao value={cfg.dificuldade} onChange={(e) => setCfg({ ...cfg, dificuldade: e.target.value })} opcoes={["fácil", "média", "difícil"].map((d) => ({ valor: d, rotulo: d }))} /></Campo>
        </div>
        <div className="flex gap-2">
          <Botao onClick={() => { setHist([]); setAval(null); cliente([]); }}>O cliente começa</Botao>
          <Botao variante="secundario" onClick={() => { setHist([]); setAval(null); }}>Eu começo</Botao>
        </div>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      <Card className="flex h-[70vh] flex-col !p-0">
        <div className="flex items-center justify-between border-b border-linha px-4 py-3"><div><div className="font-semibold">🎭 {cfg.nome}</div><div className="text-[12px] text-suave">{cfg.perfil} · {cfg.dificuldade}</div></div>
          <Botao tamanho="sm" variante="fantasma" icone={<RotateCcw className="size-3.5" />} onClick={() => { setHist(null); setAval(null); }}>Novo treino</Botao></div>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-[#efeae2] p-4">
          {hist.map((m, i) => <div key={i} className={`max-w-[75%] rounded-xl px-3 py-2 text-[13.5px] whitespace-pre-line shadow-sm ${m.de === "vendedor" ? "self-end rounded-tr-none bg-[#d9fdd3]" : "self-start rounded-tl-none bg-white"}`}>{m.texto}</div>)}
          {pensando && <div className="self-start rounded-xl bg-white px-3 py-2 text-[13px] text-suave">digitando...</div>}
          <div ref={fim} />
        </div>
        <form className="flex gap-2 border-t border-linha p-3" onSubmit={(e) => { e.preventDefault(); if (!texto.trim() || pensando) return; const h = [...hist, { de: "vendedor" as const, texto: texto.trim() }]; setHist(h); setTexto(""); cliente(h); }}>
          <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Responda como vendedor..." autoFocus />
          <Botao type="submit" disabled={pensando} icone={<Send className="size-4" />}>Enviar</Botao>
        </form>
      </Card>
      <Card className="flex flex-col gap-3">
        <TituloCard icone={GraduationCap}>Sua nota</TituloCard>
        {aval ? <CartaoAvaliacao a={aval} /> : <p className="text-[13px] text-suave">Converse até achar que fechou (ou perdeu) a venda e peça a nota.</p>}
        <Botao variante={aval ? "secundario" : "primario"} carregando={carregando && !pensando} disabled={hist.length < 2} icone={<Sparkles className="size-4" />} onClick={() => executar(() => post("/inteligencia/roleplay/avaliar", { cenario: cfg.cenario, historico: hist })).then((r) => r && setAval(r))}>{aval ? "Avaliar de novo" : "Terminar e ver a nota"}</Botao>
      </Card>
    </div>
  );
}
