import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, TicketPercent, Trash2 } from "lucide-react";
import { useState } from "react";
import { Botao, Campo, Entrada, Interruptor, Modal, Selecao, useAcao } from "../../components/form";
import { CabecalhoPagina, Card, Carregando, Dica, Selo, Vazio, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { del, post, put } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { data, reais } from "../../lib/formato";

export const Route = createFileRoute("/_app/cupons")({ component: Cupons });

function Cupons() {
  const { dados, recarregar } = useDados<any[]>("/catalogo/cupons");
  const [editar, setEditar] = useState<any>(null);
  const { executar } = useAcao();
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Cupons e promoções" icone={TicketPercent} descricao="Descontos para usar na loja, nos pedidos e pelo robô.">
        <Botao icone={<Plus className="size-4" />} onClick={() => setEditar({ codigo: "", tipo: "percentual", valor: 10, pedidoMinimo: 0, umPorCliente: true, primeiraCompra: false, iaPodeOferecer: false, ativo: true })}>Novo cupom</Botao>
      </CabecalhoPagina>
      <Dica>Marque <b>"O robô pode oferecer"</b> para a IA usar o cupom e fechar a venda de quem está em dúvida. Promoções com data ficam no próprio produto (preço promocional). Frete grátis acima de um valor fica em Configurações → Loja.</Dica>
      <Card className="!p-0">
        {!dados ? <Carregando /> : dados.length === 0 ? <Vazio icone={TicketPercent} titulo="Nenhum cupom" /> : (
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2.5">Código</th><th>Desconto</th><th>Regras</th><th>Validade</th><th>Usos</th><th>Economia gerada</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {dados.map((c) => (
                <tr key={c.id} className={linhaTabela}>
                  <td className="px-4 py-2.5 font-titulo font-bold text-laranja">{c.codigo}</td>
                  <td>{c.tipo === "percentual" ? `${c.valor}%` : c.tipo === "valor" ? reais(c.valor) : "Frete grátis"}</td>
                  <td className="text-[12px] text-suave">{[c.pedidoMinimo > 0 && `mín. ${reais(c.pedidoMinimo)}`, c.umPorCliente && "1 por cliente", c.primeiraCompra && "1ª compra", c.iaPodeOferecer && "🤖 IA oferece"].filter(Boolean).join(" · ")}</td>
                  <td className="text-[12px]">{c.inicio || c.fim ? `${c.inicio ? data(c.inicio) : "já"} → ${c.fim ? data(c.fim) : "sem fim"}` : "Sempre"}</td>
                  <td>{c.usos}{c.usosMax ? ` / ${c.usosMax}` : ""}</td>
                  <td>{reais(c.descontoTotal)}</td>
                  <td>{c.ativo ? <Selo cor="verde">Ativo</Selo> : <Selo>Inativo</Selo>}</td>
                  <td className="pr-3 text-right">
                    <button type="button" onClick={() => setEditar({ ...c, inicio: c.inicio?.slice(0, 16) ?? "", fim: c.fim?.slice(0, 16) ?? "" })} className="rounded-lg p-1.5 text-suave hover:bg-fundo"><Pencil className="size-4" /></button>
                    <button type="button" onClick={() => executar(() => del(`/catalogo/cupons/${c.id}`), "Cupom desativado").then(recarregar)} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {editar && (
        <Modal titulo={editar.id ? "Editar cupom" : "Novo cupom"} aoFechar={() => setEditar(null)} rodape={
          <Botao onClick={() => {
            const corpo = { ...editar, inicio: editar.inicio ? new Date(editar.inicio).toISOString() : null, fim: editar.fim ? new Date(editar.fim).toISOString() : null };
            executar(() => (editar.id ? put(`/catalogo/cupons/${editar.id}`, corpo) : post("/catalogo/cupons", corpo)), "Cupom salvo").then((r) => { if (r) { setEditar(null); recarregar(); } });
          }}>Salvar</Botao>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Código"><Entrada value={editar.codigo} onChange={(e) => setEditar({ ...editar, codigo: e.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="BEMVINDO10" /></Campo>
            <Campo rotulo="Tipo"><Selecao value={editar.tipo} onChange={(e) => setEditar({ ...editar, tipo: e.target.value })} opcoes={[{ valor: "percentual", rotulo: "% de desconto" }, { valor: "valor", rotulo: "R$ de desconto" }, { valor: "frete_gratis", rotulo: "Frete grátis" }]} /></Campo>
            {editar.tipo !== "frete_gratis" && <Campo rotulo={editar.tipo === "percentual" ? "Percentual" : "Valor (R$)"}><Entrada type="number" value={editar.valor} onChange={(e) => setEditar({ ...editar, valor: Number(e.target.value) })} /></Campo>}
            <Campo rotulo="Pedido mínimo (R$)"><Entrada type="number" value={editar.pedidoMinimo} onChange={(e) => setEditar({ ...editar, pedidoMinimo: Number(e.target.value) })} /></Campo>
            <Campo rotulo="Começa em (opcional)"><Entrada type="datetime-local" value={editar.inicio ?? ""} onChange={(e) => setEditar({ ...editar, inicio: e.target.value })} /></Campo>
            <Campo rotulo="Termina em (opcional)"><Entrada type="datetime-local" value={editar.fim ?? ""} onChange={(e) => setEditar({ ...editar, fim: e.target.value })} /></Campo>
            <Campo rotulo="Limite de usos (opcional)"><Entrada type="number" value={editar.usosMax ?? ""} onChange={(e) => setEditar({ ...editar, usosMax: e.target.value === "" ? null : Number(e.target.value) })} /></Campo>
            <Campo rotulo="Descrição (opcional)"><Entrada value={editar.descricao ?? ""} onChange={(e) => setEditar({ ...editar, descricao: e.target.value })} /></Campo>
            <div className="flex flex-col gap-3 sm:col-span-2">
              <Interruptor ligado={editar.umPorCliente} aoMudar={(v) => setEditar({ ...editar, umPorCliente: v })} rotulo="Uma vez por cliente" />
              <Interruptor ligado={editar.primeiraCompra} aoMudar={(v) => setEditar({ ...editar, primeiraCompra: v })} rotulo="Só na primeira compra" />
              <Interruptor ligado={editar.iaPodeOferecer} aoMudar={(v) => setEditar({ ...editar, iaPodeOferecer: v })} rotulo="O robô pode oferecer" descricao="A IA usa este cupom para convencer quem está em dúvida." />
              <Interruptor ligado={editar.ativo} aoMudar={(v) => setEditar({ ...editar, ativo: v })} rotulo="Ativo" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
