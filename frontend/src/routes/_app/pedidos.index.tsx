import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, DollarSign, Package, PackageCheck, Plus, ShoppingCart, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { Botao, Campo, Entrada, Modal, Selecao, useAcao } from "../../components/form";
import { Abas, CabecalhoPagina, Card, CardNumero, Carregando, Selo, Vazio, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { get, post, qs } from "../../lib/api";
import { useAtraso, useDados } from "../../lib/dados";
import { dataHora, reais, telefone } from "../../lib/formato";
import { useEvento } from "../../lib/sessao";

export const Route = createFileRoute("/_app/pedidos/")({
  validateSearch: (s: Record<string, unknown>): { novo?: string } => ({ novo: s.novo ? "1" : undefined }),
  component: Pedidos,
});

export const STATUS_PEDIDO: Record<string, { rotulo: string; cor: any }> = {
  carrinho: { rotulo: "Carrinho", cor: "cinza" }, aguardando_pagamento: { rotulo: "Aguardando pagamento", cor: "ambar" }, pago: { rotulo: "Pago", cor: "verde" },
  separando: { rotulo: "Separando", cor: "azul" }, enviado: { rotulo: "Enviado", cor: "roxo" }, pronto_retirada: { rotulo: "Pronto p/ retirar", cor: "petroleo" },
  entregue: { rotulo: "Entregue", cor: "verde" }, cancelado: { rotulo: "Cancelado", cor: "vermelho" },
};

function Pedidos() {
  const { novo } = Route.useSearch();
  const [status, setStatus] = useState("");
  const [busca, setBusca] = useState("");
  const b = useAtraso(busca);
  const { dados, recarregar } = useDados<any>(`/pedidos${qs({ status, busca: b })}`);
  const [novoAberto, setNovoAberto] = useState(!!novo);
  useEvento("pedido", () => recarregar());
  const r = dados?.resumo;
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Pedidos" icone={Package} descricao="Vendas da loja online, do WhatsApp e da IA. Mudou o status, o cliente é avisado no WhatsApp.">
        <Botao icone={<Plus className="size-4" />} onClick={() => setNovoAberto(true)}>Novo pedido</Botao>
      </CabecalhoPagina>
      {r && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CardNumero icone={Clock} cor="ambar" rotulo="Aguardando pagamento" valor={r.aguardando} />
          <CardNumero icone={PackageCheck} cor="petroleo" rotulo="Para separar" valor={r.preparar} />
          <CardNumero icone={Truck} cor="roxo" rotulo="Enviados" valor={r.enviados} />
          <CardNumero icone={DollarSign} cor="laranja" rotulo="Vendido no mês" valor={reais(r.receitaMes)} detalhe={`${r.pedidosMes} pedidos pagos · ${r.carrinhos} carrinhos abertos`} />
        </div>
      )}
      <Card className="!p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-linha p-3">
          <Abas valor={status} aoMudar={setStatus} abas={[{ valor: "", rotulo: "Todos" }, { valor: "aguardando_pagamento", rotulo: "Aguardando" }, { valor: "pago", rotulo: "Pagos" }, { valor: "separando", rotulo: "Separando" }, { valor: "enviado", rotulo: "Enviados" }, { valor: "entregue", rotulo: "Entregues" }, { valor: "carrinho", rotulo: "Carrinhos abandonados" }, { valor: "cancelado", rotulo: "Cancelados" }]} />
          <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº, nome ou telefone" className="ml-auto !w-56" />
        </div>
        {!dados ? <Carregando /> : dados.itens.length === 0 ? <Vazio icone={ShoppingCart} titulo="Nenhum pedido aqui" /> : (
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2.5">Pedido</th><th>Cliente</th><th>Itens</th><th>Total</th><th>Pagamento</th><th>Origem</th><th>Status</th><th>Data</th></tr></thead>
            <tbody>
              {dados.itens.map((p: any) => (
                <tr key={p.id} className={linhaTabela}>
                  <td className="px-4 py-2.5"><Link to="/pedidos/$id" params={{ id: p.id }} className="font-titulo font-bold text-laranja">#{p.numero}</Link></td>
                  <td><div className="font-semibold">{p.nomeCliente ?? "—"}</div><div className="text-[11.5px] text-suave">{telefone(p.telefoneCliente)}</div></td>
                  <td>{p.itens}</td>
                  <td className="font-semibold">{reais(p.total)}</td>
                  <td className="capitalize">{(p.formaPagamento ?? "").replace("_", " ")}</td>
                  <td><Selo>{p.origem === "ia" ? "🤖 IA" : p.origem}</Selo></td>
                  <td><Selo cor={STATUS_PEDIDO[p.status]?.cor}>{STATUS_PEDIDO[p.status]?.rotulo ?? p.status}</Selo></td>
                  <td className="text-suave">{dataHora(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {novoAberto && <NovoPedido aoFechar={() => { setNovoAberto(false); recarregar(); }} />}
    </div>
  );
}

function NovoPedido({ aoFechar }: { aoFechar: () => void }) {
  const { dados: produtos } = useDados<any[]>("/catalogo/produtos");
  const [cliente, setCliente] = useState({ telefone: "", nome: "" });
  const [itens, setItens] = useState<{ produtoId: string; variacaoId?: string; quantidade: number }[]>([]);
  const [extra, setExtra] = useState({ cupom: "", formaPagamento: "pix", entregaTipo: "entrega", endereco: "", status: "aguardando_pagamento" });
  const [calc, setCalc] = useState<any>(null);
  const [vars, setVars] = useState<Record<string, any[]>>({});
  const { executar, carregando } = useAcao();
  useEffect(() => {
    if (!itens.length) return setCalc(null);
    post("/pedidos/calcular", { itens, cupom: extra.cupom, entregaTipo: extra.entregaTipo }).then(setCalc).catch((e) => setCalc({ erro: e.message }));
  }, [JSON.stringify(itens), extra.cupom, extra.entregaTipo]);
  const carregarVars = (id: string) => !vars[id] && get<any>(`/catalogo/produtos/${id}`).then((p) => setVars((v) => ({ ...v, [id]: p.variacoes.filter((x: any) => x.ativo) })));
  return (
    <Modal titulo="Novo pedido" aoFechar={aoFechar} largura="max-w-2xl" rodape={
      <Botao carregando={carregando} disabled={!itens.length || !cliente.telefone} onClick={() => executar(() => post("/pedidos", { ...cliente, itens, ...extra, endereco: extra.endereco ? { texto: extra.endereco } : null }), "Pedido criado e cliente avisado").then((r) => r && aoFechar())}>Criar pedido</Botao>}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="WhatsApp do cliente"><Entrada value={cliente.telefone} onChange={(e) => setCliente({ ...cliente, telefone: e.target.value })} /></Campo>
          <Campo rotulo="Nome"><Entrada value={cliente.nome} onChange={(e) => setCliente({ ...cliente, nome: e.target.value })} /></Campo>
        </div>
        <div>
          <div className="mb-1.5 text-[12.5px] font-semibold">Itens</div>
          {itens.map((it, i) => {
            const p = produtos?.find((x) => x.id === it.produtoId);
            return (
              <div key={i} className="mb-2 flex items-center gap-2">
                <span className="flex-1 truncate text-[13px] font-medium">{p?.nome}</span>
                {(vars[it.produtoId] ?? []).length > 0 && (
                  <select value={it.variacaoId ?? ""} onChange={(e) => setItens(itens.map((x, j) => (j === i ? { ...x, variacaoId: e.target.value || undefined } : x)))} className="rounded-lg border border-linha px-2 py-1 text-[12px]">
                    <option value="">Escolha a opção</option>{vars[it.produtoId].map((v) => <option key={v.id} value={v.id}>{v.nome} ({v.estoque})</option>)}
                  </select>
                )}
                <Entrada type="number" min={1} value={it.quantidade} onChange={(e) => setItens(itens.map((x, j) => (j === i ? { ...x, quantidade: Math.max(1, Number(e.target.value)) } : x)))} className="!w-20 !py-1" />
                <button type="button" onClick={() => setItens(itens.filter((_, j) => j !== i))} className="text-suave">✕</button>
              </div>
            );
          })}
          <Selecao vazio="+ Adicionar produto" value="" onChange={(e) => { if (e.target.value) { setItens([...itens, { produtoId: e.target.value, quantidade: 1 }]); carregarVars(e.target.value); } }}
            opcoes={(produtos ?? []).filter((p) => p.ativo).map((p) => ({ valor: p.id, rotulo: `${p.nome} — ${reais(p.precoAtual)}` }))} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Pagamento"><Selecao value={extra.formaPagamento} onChange={(e) => setExtra({ ...extra, formaPagamento: e.target.value })} opcoes={[{ valor: "pix", rotulo: "Pix" }, { valor: "cartao", rotulo: "Cartão" }, { valor: "dinheiro", rotulo: "Dinheiro" }, { valor: "na_entrega", rotulo: "Na entrega" }, { valor: "combinar", rotulo: "A combinar" }]} /></Campo>
          <Campo rotulo="Entrega"><Selecao value={extra.entregaTipo} onChange={(e) => setExtra({ ...extra, entregaTipo: e.target.value })} opcoes={[{ valor: "entrega", rotulo: "Entrega" }, { valor: "retirada", rotulo: "Retirada" }]} /></Campo>
          <Campo rotulo="Já está"><Selecao value={extra.status} onChange={(e) => setExtra({ ...extra, status: e.target.value })} opcoes={[{ valor: "aguardando_pagamento", rotulo: "Aguardando pagamento" }, { valor: "pago", rotulo: "Pago" }]} /></Campo>
          {extra.entregaTipo === "entrega" && <Campo rotulo="Endereço" className="sm:col-span-2"><Entrada value={extra.endereco} onChange={(e) => setExtra({ ...extra, endereco: e.target.value })} /></Campo>}
          <Campo rotulo="Cupom"><Entrada value={extra.cupom} onChange={(e) => setExtra({ ...extra, cupom: e.target.value.toUpperCase() })} /></Campo>
        </div>
        {calc && (calc.erro ? <div className="text-[13px] text-vermelho">{calc.erro}</div> : (
          <div className="rounded-2xl bg-fundo p-3 text-[13px]">
            <div className="flex justify-between"><span>Subtotal</span><span>{reais(calc.subtotal)}</span></div>
            {calc.desconto > 0 && <div className="flex justify-between text-verde"><span>Desconto</span><span>- {reais(calc.desconto)}</span></div>}
            <div className="flex justify-between"><span>Frete</span><span>{calc.frete > 0 ? reais(calc.frete) : "Grátis"}</span></div>
            {calc.erroCupom && <div className="text-vermelho">{calc.erroCupom}</div>}
            <div className="mt-1 flex justify-between font-titulo text-[16px] font-bold"><span>Total</span><span>{reais(calc.total)}</span></div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
