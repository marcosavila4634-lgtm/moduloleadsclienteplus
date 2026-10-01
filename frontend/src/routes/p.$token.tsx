import { createFileRoute } from "@tanstack/react-router";
import { Check, FileText, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AreaTexto, Botao, Campo, Entrada, useAvisos } from "../components/form";
import { Carregando } from "../components/ui";
import { get, post } from "../lib/api";
import { data, reais } from "../lib/formato";

export const Route = createFileRoute("/p/$token")({ component: PropostaPublica });

function PropostaPublica() {
  const { token } = Route.useParams();
  const [p, setP] = useState<any>(null);
  const [erro, setErro] = useState(false);
  const [resp, setResp] = useState<null | boolean>(null);
  const [nome, setNome] = useState("");
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const { avisar } = useAvisos();
  const carregar = () => get<any>(`/publico/propostas/${token}`).then((d) => { setP(d); document.title = d.titulo; }).catch(() => setErro(true));
  useEffect(() => { carregar(); }, [token]);
  if (erro) return <div className="grid min-h-screen place-items-center bg-fundo text-center"><div><FileText className="mx-auto size-12 text-suave" /><p className="mt-3 font-titulo text-xl font-bold">Proposta não encontrada</p></div></div>;
  if (!p) return <div className="min-h-screen bg-fundo"><Carregando /></div>;
  const c = p.conteudo ?? {};
  const itens: any[] = c.itens ?? [];
  const subtotal = itens.reduce((s, i) => s + Number(i.quantidade ?? 1) * Number(i.valor ?? 0), 0);
  const expirou = p.validade && new Date(p.validade + "T23:59:59") < new Date();
  const respondida = p.respondidaEm;
  return (
    <div className="min-h-screen bg-fundo px-4 py-8">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl bg-cartao sombra-cartao">
        <div className="bg-menu-gradiente px-8 py-8 text-white">
          <div className="text-[13px] font-semibold opacity-80">{p.loja}</div>
          <h1 className="mt-1 font-titulo text-[28px] font-bold">{p.titulo}</h1>
          {p.cliente && <div className="mt-1 opacity-85">Para: {p.cliente}</div>}
          {p.validade && <div className="mt-3 inline-block rounded-full bg-white/15 px-3 py-1 text-[12.5px]">Válida até {data(p.validade)}</div>}
        </div>
        <div className="flex flex-col gap-6 p-8">
          {c.introducao && <p className="text-[15px] leading-relaxed whitespace-pre-line">{c.introducao}</p>}
          {itens.length > 0 && (
            <table className="w-full text-[14px]">
              <thead><tr className="border-b border-linha text-left text-[12px] text-suave uppercase"><th className="py-2">Item</th><th className="text-right">Qtd.</th><th className="text-right">Valor</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {itens.map((i, k) => (
                  <tr key={k} className="border-b border-linha last:border-0 align-top">
                    <td className="py-3"><div className="font-semibold">{i.nome}</div>{i.descricao && <div className="text-[13px] text-suave">{i.descricao}</div>}</td>
                    <td className="py-3 text-right">{i.quantidade ?? 1}</td>
                    <td className="py-3 text-right">{reais(i.valor)}</td>
                    <td className="py-3 text-right font-semibold">{reais(Number(i.quantidade ?? 1) * Number(i.valor ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="ml-auto flex w-64 flex-col gap-1 text-[14px]">
            {p.desconto > 0 && <><div className="flex justify-between"><span>Subtotal</span><span>{reais(subtotal)}</span></div><div className="flex justify-between text-verde"><span>Desconto</span><span>- {reais(p.desconto)}</span></div></>}
            <div className="flex justify-between font-titulo text-[22px] font-bold"><span>Total</span><span className="text-laranja">{reais(p.total)}</span></div>
          </div>
          {c.condicoes && <div className="rounded-2xl bg-fundo p-4 text-[13.5px] whitespace-pre-line"><div className="mb-1 font-semibold">Condições</div>{c.condicoes}</div>}
          {respondida ? (
            <div className={`flex items-center gap-2 rounded-2xl p-4 font-semibold ${p.status === "accepted" ? "bg-green-50 text-verde" : "bg-red-50 text-vermelho"}`}>
              {p.status === "accepted" ? <Check className="size-5" /> : <X className="size-5" />} Proposta {p.status === "accepted" ? "aceita" : "recusada"} por {p.respostaNome} em {data(p.respondidaEm)}.
            </div>
          ) : expirou ? (
            <div className="rounded-2xl bg-fundo-2 p-4 text-center font-semibold text-suave">Esta proposta expirou. Fale com a gente para uma nova.</div>
          ) : resp === null ? (
            <div className="flex flex-wrap justify-end gap-3">
              <Botao variante="secundario" onClick={() => setResp(false)}>Recusar</Botao>
              <Botao icone={<Check className="size-4" />} onClick={() => setResp(true)}>Aceitar proposta</Botao>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-2xl border border-linha p-4">
              <Campo rotulo="Seu nome completo"><Entrada value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
              <Campo rotulo={resp ? "Comentário (opcional)" : "Pode contar o motivo? (opcional)"}><AreaTexto rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} /></Campo>
              <div className="flex justify-end gap-2">
                <Botao variante="fantasma" onClick={() => setResp(null)}>Voltar</Botao>
                <Botao carregando={enviando} variante={resp ? "primario" : "perigo"} onClick={async () => {
                  if (!nome.trim()) return avisar("Digite seu nome", "erro");
                  setEnviando(true);
                  try { await post(`/publico/propostas/${token}`, { aceitar: resp, nome, comentario }); await carregar(); } catch (e: any) { avisar(e.message, "erro"); } finally { setEnviando(false); }
                }}>{resp ? "Confirmar aceite" : "Confirmar recusa"}</Botao>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
