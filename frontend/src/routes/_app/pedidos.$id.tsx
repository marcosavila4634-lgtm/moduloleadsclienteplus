import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Copy, ExternalLink, MessageSquare } from "lucide-react";
import { useState } from "react";
import { Botao, Campo, Entrada, Modal, useAcao, useAvisos } from "../../components/form";
import { Card, Carregando, Selo, TituloCard } from "../../components/ui";
import { post } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { dataHora, reais, telefone } from "../../lib/formato";
import { STATUS_PEDIDO } from "./pedidos.index";

export const Route = createFileRoute("/_app/pedidos/$id")({ component: DetalhePedido });

const FLUXO = ["aguardando_pagamento", "pago", "separando", "enviado", "entregue"];

function DetalhePedido() {
  const { id } = Route.useParams();
  const { dados: p, recarregar } = useDados<any>(`/pedidos/${id}`);
  const [status, setStatus] = useState<string | null>(null);
  const { avisar, confirmar } = useAvisos();
  if (!p) return <Carregando />;
  const idx = FLUXO.indexOf(p.status);
  const proximo = p.status === "pago" || p.status === "separando" ? (p.entregaTipo === "retirada" ? (p.status === "pago" ? "separando" : "pronto_retirada") : FLUXO[idx + 1]) : FLUXO[idx + 1];
  return (
    <div className="flex flex-col gap-4">
      <Link to="/pedidos" className="flex w-fit items-center gap-1 text-[13px] font-semibold text-suave hover:text-texto"><ArrowLeft className="size-4" /> Pedidos</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-titulo text-[26px] font-bold">Pedido #{p.numero}</h1>
        <Selo cor={STATUS_PEDIDO[p.status]?.cor}>{STATUS_PEDIDO[p.status]?.rotulo}</Selo>
        <div className="ml-auto flex gap-2">
          {p.status !== "cancelado" && p.status !== "entregue" && <Botao variante="fantasma" className="!text-vermelho" onClick={async () => { if (await confirmar("Cancelar o pedido? O estoque volta e o cliente é avisado.", { perigo: true, botao: "Cancelar pedido" })) setStatus("cancelado"); }}>Cancelar</Botao>}
          {proximo && p.status !== "cancelado" && <Botao icone={<Check className="size-4" />} onClick={() => setStatus(proximo)}>Marcar como {STATUS_PEDIDO[proximo]?.rotulo.toLowerCase()}</Botao>}
        </div>
      </div>
      {p.status !== "cancelado" && p.status !== "carrinho" && (
        <div className="flex flex-wrap gap-2">
          {[...FLUXO.slice(0, 3), p.entregaTipo === "retirada" ? "pronto_retirada" : "enviado", "entregue"].map((s, i, arr) => {
            const feito = arr.indexOf(p.status) >= i;
            return <div key={s} className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${feito ? "bg-laranja-gradiente text-white" : "bg-cartao text-suave ring-1 ring-linha"}`}>{feito && <Check className="size-3.5" />}{STATUS_PEDIDO[s].rotulo}</div>;
          })}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <TituloCard>Itens</TituloCard>
          <table className="mt-3 w-full text-[13.5px]">
            <tbody>
              {p.itens.map((i: any) => (
                <tr key={i.id} className="border-b border-linha last:border-0"><td className="py-2">{i.quantidade}× <b>{i.nome}</b></td><td className="text-right text-suave">{reais(i.precoUnitario)}</td><td className="text-right font-semibold">{reais(i.total)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-col items-end gap-1 text-[13px]">
            <div>Subtotal: {reais(p.subtotal)}</div>
            {p.desconto > 0 && <div className="text-verde">Desconto {p.cupomCodigo && `(${p.cupomCodigo})`}: - {reais(p.desconto)}</div>}
            <div>Frete: {p.frete > 0 ? reais(p.frete) : "grátis"}</div>
            <div className="font-titulo text-[20px] font-bold">Total: {reais(p.total)}</div>
          </div>
          <TituloCard>Histórico</TituloCard>
          <ul className="mt-2 flex flex-col gap-1.5">
            {p.eventos.map((e: any) => (
              <li key={e.id} className="flex items-center gap-2 text-[12.5px]"><Selo cor={STATUS_PEDIDO[e.status]?.cor}>{STATUS_PEDIDO[e.status]?.rotulo ?? e.status}</Selo><span className="text-suave">{dataHora(e.createdAt)} {e.usuarioNome && `· ${e.usuarioNome}`}</span>{e.avisado && <span className="text-verde">· cliente avisado ✓</span>}{e.texto && <span>· {e.texto}</span>}</li>
            ))}
          </ul>
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="text-[13px]">
            <TituloCard>Cliente</TituloCard>
            <div className="mt-2 font-semibold">{p.nomeCliente ?? p.contatoNome}</div>
            <div className="text-suave">{telefone(p.telefoneCliente)}</div>
            {p.conversaId && <Link to="/conversas" search={{ c: p.conversaId }} className="mt-2 inline-flex items-center gap-1 font-semibold text-laranja"><MessageSquare className="size-4" /> Abrir conversa</Link>}
            <div className="mt-3 border-t border-linha pt-3">
              <div><b>Entrega:</b> {p.entregaTipo === "retirada" ? "Retirada na loja" : "Entrega"}</div>
              {p.endereco && <div className="text-suave">{p.endereco.texto ?? [p.endereco.rua, p.endereco.numero, p.endereco.bairro, p.endereco.cidade].filter(Boolean).join(", ")}</div>}
              {p.rastreioCodigo && <div className="mt-1"><b>Rastreio:</b> {p.rastreioCodigo}</div>}
              {p.observacoes && <div className="mt-1"><b>Obs.:</b> {p.observacoes}</div>}
            </div>
            <div className="mt-3 border-t border-linha pt-3">
              <div><b>Pagamento:</b> <span className="capitalize">{(p.formaPagamento ?? "").replace("_", " ")}</span> {p.pagoEm && <Selo cor="verde">pago {dataHora(p.pagoEm)}</Selo>}</div>
              {p.pixCopiaCola && <button type="button" onClick={() => { navigator.clipboard.writeText(p.pixCopiaCola); avisar("Pix copiado"); }} className="mt-1 flex items-center gap-1 text-[12.5px] font-semibold text-petroleo"><Copy className="size-3.5" /> Copiar Pix copia e cola</button>}
            </div>
            <a href={p.linkAcompanhar} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-laranja">Página de acompanhamento <ExternalLink className="size-3.5" /></a>
          </Card>
        </div>
      </div>
      {status && <MudarStatus pedido={p} status={status} aoFechar={() => { setStatus(null); recarregar(); }} />}
    </div>
  );
}

function MudarStatus({ pedido, status, aoFechar }: { pedido: any; status: string; aoFechar: () => void }) {
  const [rastreio, setRastreio] = useState({ codigo: pedido.rastreioCodigo ?? "", url: "" });
  const [obs, setObs] = useState("");
  const { executar, carregando } = useAcao();
  return (
    <Modal titulo={`Marcar como ${STATUS_PEDIDO[status]?.rotulo.toLowerCase()}`} aoFechar={aoFechar} rodape={
      <Botao carregando={carregando} onClick={() => executar(() => post(`/pedidos/${pedido.id}/status`, { status, rastreioCodigo: rastreio.codigo || undefined, rastreioUrl: rastreio.url || undefined, observacao: obs || undefined, motivo: status === "cancelado" ? obs : undefined }), "Status atualizado e cliente avisado").then((r) => r && aoFechar())}>Confirmar</Botao>}>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-suave">O cliente recebe uma mensagem no WhatsApp com o novo status. {status === "pago" && "O estoque é baixado agora."}{status === "cancelado" && " O estoque volta."}</p>
        {status === "enviado" && (
          <>
            <Campo rotulo="Código de rastreio"><Entrada value={rastreio.codigo} onChange={(e) => setRastreio({ ...rastreio, codigo: e.target.value })} /></Campo>
            <Campo rotulo="Link de rastreio (opcional)"><Entrada value={rastreio.url} onChange={(e) => setRastreio({ ...rastreio, url: e.target.value })} /></Campo>
          </>
        )}
        <Campo rotulo={status === "cancelado" ? "Motivo" : "Observação (opcional)"}><Entrada value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
      </div>
    </Modal>
  );
}
