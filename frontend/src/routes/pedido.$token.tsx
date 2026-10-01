import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Package, Store, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAvisos } from "../components/form";
import { Carregando } from "../components/ui";
import { get } from "../lib/api";
import { dataHora, reais } from "../lib/formato";

export const Route = createFileRoute("/pedido/$token")({ component: Acompanhar });

const PASSOS: Record<string, string> = { aguardando_pagamento: "Pedido recebido", pago: "Pagamento confirmado", separando: "Separando seu pedido", enviado: "Saiu para entrega", pronto_retirada: "Pronto para retirar", entregue: "Entregue" };

function Acompanhar() {
  const { token } = Route.useParams();
  const [p, setP] = useState<any>(null);
  const [erro, setErro] = useState(false);
  const { avisar } = useAvisos();
  useEffect(() => {
    const carregar = () => get<any>(`/publico/pedidos/${token}`).then((d) => { setP(d); document.title = `Pedido #${d.numero}`; }).catch(() => setErro(true));
    carregar();
    const t = setInterval(carregar, 30000);
    return () => clearInterval(t);
  }, [token]);
  if (erro) return <div className="grid min-h-screen place-items-center bg-fundo text-center"><div><Package className="mx-auto size-12 text-suave" /><p className="mt-3 font-titulo text-xl font-bold">Pedido não encontrado</p></div></div>;
  if (!p) return <div className="min-h-screen bg-fundo"><Carregando /></div>;
  const fluxo = ["aguardando_pagamento", "pago", "separando", p.entregaTipo === "retirada" ? "pronto_retirada" : "enviado", "entregue"];
  const atual = fluxo.indexOf(p.status);
  const quando = (s: string) => p.historico.find((h: any) => h.status === s)?.createdAt;
  return (
    <div className="min-h-screen bg-fundo px-4 py-8">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <a href={`/loja/${p.lojaSlug}`} className="flex items-center gap-2 font-titulo font-bold text-petroleo"><Store className="size-5" /> {p.lojaNome}</a>
        <div className="rounded-3xl bg-cartao p-6 sombra-cartao">
          <div className="text-[13px] text-suave">Pedido</div>
          <div className="font-titulo text-[28px] font-bold">#{p.numero}</div>
          <div className="text-[13px] text-suave">Feito em {dataHora(p.createdAt)} · {p.nomeCliente}</div>
          {p.status === "cancelado" ? (
            <div className="mt-5 flex items-center gap-2 rounded-2xl bg-red-50 p-4 font-semibold text-vermelho"><X className="size-5" /> Este pedido foi cancelado.</div>
          ) : (
            <ol className="mt-6 flex flex-col">
              {fluxo.map((s, i) => {
                const feito = i <= atual;
                return (
                  <li key={s} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < fluxo.length - 1 && <span className={`absolute top-7 left-[13px] h-[calc(100%-24px)] w-0.5 ${i < atual ? "bg-laranja" : "bg-linha"}`} />}
                    <span className={`z-10 grid size-7 shrink-0 place-items-center rounded-full ${feito ? "bg-laranja-gradiente text-white" : "bg-fundo-2 text-suave"} ${i === atual ? "ring-4 ring-laranja/20" : ""}`}>{feito ? <Check className="size-4" /> : i + 1}</span>
                    <div>
                      <div className={`font-semibold ${feito ? "" : "text-suave"}`}>{PASSOS[s]}</div>
                      {quando(s) && <div className="text-[12px] text-suave">{dataHora(quando(s))}</div>}
                      {s === "enviado" && p.rastreioCodigo && i <= atual && <div className="text-[12.5px]">Rastreio: {p.rastreioUrl ? <a href={p.rastreioUrl} target="_blank" rel="noreferrer" className="font-semibold text-laranja underline">{p.rastreioCodigo}</a> : <b>{p.rastreioCodigo}</b>}</div>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {p.status === "aguardando_pagamento" && p.pixCopiaCola && (
            <div className="mt-5 rounded-2xl bg-fundo p-4">
              <div className="mb-2 text-[13.5px] font-semibold">Pague com Pix copia e cola</div>
              <div className="max-h-20 overflow-y-auto rounded-lg bg-white p-2 font-mono text-[11px] break-all">{p.pixCopiaCola}</div>
              <button type="button" onClick={() => { navigator.clipboard.writeText(p.pixCopiaCola); avisar("Código Pix copiado!"); }} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-laranja-gradiente py-3 font-bold text-white"><Copy className="size-4" /> Copiar código Pix</button>
            </div>
          )}
        </div>
        <div className="rounded-3xl bg-cartao p-6 text-[14px] sombra-cartao">
          {p.itens.map((i: any, k: number) => <div key={k} className="flex justify-between py-1"><span>{i.quantidade}× {i.nome}</span><span>{reais(i.total)}</span></div>)}
          <div className="mt-2 border-t border-linha pt-2 text-[13px] text-suave">
            <div className="flex justify-between"><span>Subtotal</span><span>{reais(p.subtotal)}</span></div>
            {p.desconto > 0 && <div className="flex justify-between text-verde"><span>Desconto</span><span>- {reais(p.desconto)}</span></div>}
            <div className="flex justify-between"><span>Frete</span><span>{p.frete > 0 ? reais(p.frete) : "Grátis"}</span></div>
          </div>
          <div className="mt-1 flex justify-between font-titulo text-[18px] font-bold"><span>Total</span><span>{reais(p.total)}</span></div>
        </div>
      </div>
    </div>
  );
}
