import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Copy, DollarSign, Plug, Plus, Receipt, ShoppingCart, Timer, Trash2 } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Botao, Campo, Entrada, Interruptor, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { Abas, CabecalhoPagina, Card, CardNumero, Carregando, Dica, Selo, TituloCard, Vazio, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { del, get, post, put, qs } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { dataHora, duracao, num, reais, relativo } from "../../lib/formato";

type Aba = "resumo" | "integracoes";
export const Route = createFileRoute("/_app/vendas")({
  validateSearch: (s: Record<string, unknown>): { aba?: Aba } => ({ aba: typeof s.aba === "string" ? (s.aba as Aba) : undefined }),
  component: Vendas,
});

const PLATAFORMAS: Record<string, string> = {
  hotmart: "Hotmart", kiwify: "Kiwify", eduzz: "Eduzz", guru: "Digital Manager Guru", hubla: "Hubla", monetizze: "Monetizze", shopify: "Shopify", nuvemshop: "Nuvemshop",
  woocommerce: "WooCommerce", mercadopago: "Mercado Pago", asaas: "Asaas", stripe: "Stripe", cliente_plus: "Cliente Plus", webhook: "Outro (webhook genérico)",
};
const STATUS_COMPRA: Record<string, { rotulo: string; cor: "verde" | "ambar" | "vermelho" | "cinza" }> = {
  approved: { rotulo: "Aprovada", cor: "verde" }, pending: { rotulo: "Pendente", cor: "ambar" }, refunded: { rotulo: "Reembolsada", cor: "vermelho" }, chargeback: { rotulo: "Chargeback", cor: "vermelho" }, canceled: { rotulo: "Cancelada", cor: "cinza" },
};

function Vendas() {
  const { aba = "resumo" } = Route.useSearch();
  const navegar = Route.useNavigate();
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Central de vendas" icone={DollarSign} descricao="Todas as vendas — da loja, da agenda e das plataformas — e quanto o robô ajudou." />
      <Abas valor={aba} aoMudar={(a) => navegar({ search: { aba: a } })} abas={[{ valor: "resumo", rotulo: "Resumo" }, { valor: "integracoes", rotulo: "Integrações" }]} />
      {aba === "resumo" ? <Resumo /> : <Integracoes />}
    </div>
  );
}

function Resumo() {
  const [dias, setDias] = useState(30);
  const { dados } = useDados<any>(`/vendas/resumo${qs({ dias })}`);
  if (!dados) return <Carregando />;
  const f = dados.funil;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end"><Selecao className="!w-32" value={String(dias)} onChange={(e) => setDias(Number(e.target.value))} opcoes={[{ valor: "7", rotulo: "7 dias" }, { valor: "30", rotulo: "30 dias" }, { valor: "90", rotulo: "90 dias" }, { valor: "365", rotulo: "1 ano" }]} /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardNumero icone={DollarSign} cor="laranja" rotulo="Receita" valor={reais(dados.receita)} detalhe={`${num(dados.vendas)} vendas`} />
        <CardNumero icone={Bot} rotulo="Receita com ajuda do robô" valor={reais(dados.receitaIa)} detalhe={`${dados.taxaIa}% das vendas`} />
        <CardNumero icone={Timer} cor="ambar" rotulo="Tempo médio até vender" valor={dados.minutosMedio ? duracao(Number(dados.minutosMedio) * 60000) : "—"} detalhe="Da primeira conversa até a compra" />
        <CardNumero icone={Receipt} cor="vermelho" rotulo="Reembolsos" valor={num(dados.reembolsos)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <TituloCard>Receita por dia</TituloCard>
          <div className="mt-3 h-64">
            <ResponsiveContainer>
              <AreaChart data={dados.porDia.map((d: any) => ({ dia: d.dia.slice(5).split("-").reverse().join("/"), Total: Number(d.receita), "Com o robô": Number(d.receitaIa) }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-linha)" /><XAxis dataKey="dia" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `R$${num(v)}`} />
                <Tooltip formatter={(v) => reais(Number(v))} /><Legend />
                <Area type="monotone" dataKey="Total" stroke="var(--color-petroleo)" fill="var(--color-petroleo)" fillOpacity={0.15} />
                <Area type="monotone" dataKey="Com o robô" stroke="var(--color-laranja)" fill="var(--color-laranja)" fillOpacity={0.25} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="flex flex-col gap-3">
          <TituloCard>Do papo à venda</TituloCard>
          {[["Conversas", f.conversas], ["Atendidas pelo robô", f.interacoesIa], ["Vendas", f.vendas]].map(([r, v], i) => (
            <div key={r as string} style={{ width: `${100 - i * 18}%` }} className={`mx-auto rounded-xl px-3 py-2.5 text-center text-white ${i === 0 ? "bg-petroleo" : i === 1 ? "bg-petroleo-claro" : "bg-laranja-gradiente"}`}>
              <div className="font-titulo text-[20px] font-bold">{num(v as number)}</div><div className="text-[12px] opacity-90">{r}</div>
            </div>
          ))}
          <div className="text-center text-[12.5px] text-suave">Conversão: <b>{f.conversas ? ((f.vendas / f.conversas) * 100).toFixed(1) : 0}%</b></div>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="!p-0">
          <div className="px-4 py-3"><TituloCard>Produtos mais vendidos</TituloCard></div>
          <table className="w-full text-[13px]"><tbody>{dados.produtos.map((p: any) => <tr key={p.produto} className={linhaTabela}><td className="px-4 py-2">{p.produto}</td><td>{num(p.vendas)}</td><td className="pr-4 text-right font-semibold">{reais(p.receita)}</td></tr>)}</tbody></table>
        </Card>
        <Card className="!p-0">
          <div className="px-4 py-3"><TituloCard>Por origem</TituloCard></div>
          <table className="w-full text-[13px]"><tbody>{dados.plataformas.map((p: any) => <tr key={p.plataforma} className={linhaTabela}><td className="px-4 py-2">{PLATAFORMAS[p.plataforma] ?? (p.plataforma === "loja" ? "Loja própria" : p.plataforma === "agenda" ? "Agenda" : p.plataforma)}</td><td>{num(p.vendas)}</td><td className="pr-4 text-right font-semibold">{reais(p.receita)}</td></tr>)}</tbody></table>
        </Card>
      </div>
      <Card className="!p-0">
        <div className="px-4 py-3"><TituloCard icone={ShoppingCart}>Últimas vendas</TituloCard></div>
        {dados.ultimas.length === 0 ? <Vazio icone={ShoppingCart} titulo="Nenhuma venda registrada" /> : (
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Quando</th><th>Cliente</th><th>Produto</th><th>Origem</th><th>Status</th><th>Robô</th><th className="pr-4 text-right">Valor</th></tr></thead>
            <tbody>{dados.ultimas.map((c: any) => (
              <tr key={c.id} className={linhaTabela}>
                <td className="px-4 py-2 whitespace-nowrap">{dataHora(c.compradoEm)}</td>
                <td>{c.contatoId ? <Link to="/contatos/$id" params={{ id: c.contatoId }} className="font-semibold text-petroleo">{c.contatoNome ?? "Contato"}</Link> : "—"}</td>
                <td className="max-w-xs truncate">{c.produto}</td><td className="text-suave">{PLATAFORMAS[c.plataforma] ?? c.plataforma}</td>
                <td><Selo cor={STATUS_COMPRA[c.status]?.cor}>{STATUS_COMPRA[c.status]?.rotulo ?? c.status}</Selo></td>
                <td>{c.influenciadaIa && <Bot className="size-4 text-laranja" />}</td>
                <td className="pr-4 text-right font-semibold">{reais(c.valor)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Integracoes() {
  const { dados, recarregar } = useDados<any[]>("/vendas/integracoes");
  const [nova, setNova] = useState(false);
  const [eventos, setEventos] = useState<any>(null);
  const { executar } = useAcao();
  const { avisar, confirmar } = useAvisos();
  return (
    <div className="flex flex-col gap-4">
      <Dica>Ligue sua plataforma de vendas: a cada compra, o sistema registra no histórico do cliente, marca o negócio como ganho e mostra se o robô ajudou a vender. Também dá para disparar automações com o gatilho "Compra".</Dica>
      <Card className="!p-0">
        <div className="flex items-center justify-between px-4 py-3"><TituloCard icone={Plug}>Integrações</TituloCard><Botao tamanho="sm" icone={<Plus className="size-4" />} onClick={() => setNova(true)}>Nova integração</Botao></div>
        {!dados ? <Carregando /> : dados.length === 0 ? <Vazio icone={Plug} titulo="Nenhuma integração" /> : (
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Plataforma</th><th>Endereço do webhook</th><th>Eventos</th><th>Último</th><th>Ativa</th><th></th></tr></thead>
            <tbody>{dados.map((i) => (
              <tr key={i.id} className={linhaTabela}>
                <td className="px-4 py-2.5"><div className="font-semibold">{i.nome}</div><div className="text-[12px] text-suave">{PLATAFORMAS[i.plataforma]}</div>{i.ultimoErro && <div className="max-w-xs truncate text-[12px] text-vermelho">{i.ultimoErro}</div>}</td>
                <td><button type="button" onClick={() => { navigator.clipboard.writeText(i.webhook); avisar("Endereço copiado! Cole na plataforma."); }} className="flex max-w-sm items-center gap-1 truncate font-mono text-[11.5px] text-petroleo hover:underline"><span className="truncate">{i.webhook}</span><Copy className="size-3.5 shrink-0" /></button></td>
                <td><button type="button" onClick={() => get(`/vendas/integracoes/${i.id}/eventos`).then((e) => setEventos({ nome: i.nome, lista: e }))} className="font-semibold text-laranja hover:underline">{num(i.eventosRecebidos)}</button></td>
                <td className="text-suave">{i.ultimoEventoEm ? relativo(i.ultimoEventoEm) : "nunca"}</td>
                <td><Interruptor ligado={i.ativo} aoMudar={(v) => executar(() => put(`/vendas/integracoes/${i.id}`, { ...i, ativo: v })).then(recarregar)} /></td>
                <td className="pr-3 text-right"><button type="button" onClick={async () => { if (await confirmar("Apagar a integração? As vendas já registradas continuam.", { perigo: true, botao: "Apagar" })) executar(() => del(`/vendas/integracoes/${i.id}`), "Integração apagada").then(recarregar); }} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      {nova && <NovaIntegracao aoFechar={(ok) => { setNova(false); if (ok) recarregar(); }} />}
      {eventos && (
        <Modal titulo={`Eventos — ${eventos.nome}`} largura="max-w-3xl" aoFechar={() => setEventos(null)}>
          {eventos.lista.length === 0 ? <p className="text-sm text-suave">Nenhum evento recebido.</p> : (
            <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">{eventos.lista.map((e: any) => (
              <details key={e.id} className="rounded-xl border border-linha p-2 text-[12.5px]">
                <summary className="cursor-pointer"><b>{dataHora(e.createdAt)}</b> · {e.tipo ?? e.status ?? "evento"} {e.erro && <span className="text-vermelho">· {e.erro}</span>}</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-fundo p-2 text-[11px]">{JSON.stringify(e.corpo ?? e, null, 2)}</pre>
              </details>
            ))}</div>
          )}
        </Modal>
      )}
    </div>
  );
}

function NovaIntegracao({ aoFechar }: { aoFechar: (ok?: boolean) => void }) {
  const [f, setF] = useState({ plataforma: "hotmart", nome: "" });
  const [criada, setCriada] = useState<any>(null);
  const { executar, carregando } = useAcao();
  const { avisar } = useAvisos();
  if (criada) {
    return (
      <Modal titulo="Integração criada" aoFechar={() => aoFechar(true)}>
        <div className="flex flex-col gap-3 text-[13px]">
          <p>Agora, no painel da <b>{PLATAFORMAS[criada.plataforma]}</b>, procure por <b>Webhook</b> (ou "Postback"/"Notificações") e cole este endereço, marcando os eventos de compra aprovada, reembolso e cancelamento:</p>
          <div className="flex gap-2"><Entrada readOnly value={criada.webhook} /><Botao icone={<Copy className="size-4" />} onClick={() => { navigator.clipboard.writeText(criada.webhook); avisar("Copiado!"); }}>Copiar</Botao></div>
          <p className="text-suave">Faça uma compra de teste para conferir: ela aparece em "Eventos".</p>
        </div>
      </Modal>
    );
  }
  return (
    <Modal titulo="Nova integração" aoFechar={() => aoFechar()} rodape={<Botao carregando={carregando} onClick={() => executar(() => post("/vendas/integracoes", { ...f, nome: f.nome || PLATAFORMAS[f.plataforma] })).then((r) => r && setCriada(r))}>Criar</Botao>}>
      <div className="grid gap-3">
        <Campo rotulo="Plataforma"><Selecao value={f.plataforma} onChange={(e) => setF({ ...f, plataforma: e.target.value })} opcoes={Object.entries(PLATAFORMAS).map(([v, r]) => ({ valor: v, rotulo: r }))} /></Campo>
        <Campo rotulo="Nome (opcional)"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder={PLATAFORMAS[f.plataforma]} /></Campo>
      </div>
    </Modal>
  );
}
