import { createFileRoute } from "@tanstack/react-router";
import { Check, ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";
import { AreaTexto, Botao, Campo, Entrada, useAvisos } from "../components/form";
import { Carregando } from "../components/ui";
import { get, post } from "../lib/api";
import { dataHora } from "../lib/formato";
import type { Pergunta } from "../lib/formularios";

export const Route = createFileRoute("/formulario/$token")({ component: Formulario });

function Formulario() {
  const { token } = Route.useParams();
  const [f, setF] = useState<any>(null);
  const [erro, setErro] = useState(false);
  const [resp, setResp] = useState<Record<string, any>>({});
  const [assinatura, setAssinatura] = useState("");
  const [aceite, setAceite] = useState(false);
  const [feito, setFeito] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const { avisar } = useAvisos();
  useEffect(() => { get<any>(`/publico/formularios/${token}`).then((d) => { setF(d); setAssinatura(d.contatoNome ?? ""); document.title = d.nome; }).catch(() => setErro(true)); }, [token]);
  if (erro) return <div className="grid min-h-screen place-items-center bg-fundo text-center"><div><ClipboardList className="mx-auto size-12 text-suave" /><p className="mt-3 font-titulo text-xl font-bold">Formulário não encontrado</p></div></div>;
  if (!f) return <div className="min-h-screen bg-fundo"><Carregando /></div>;
  const perguntas: Pergunta[] = f.conteudo?.perguntas ?? [];
  const pronto = feito || f.assinadoEm;
  return (
    <div className="min-h-screen bg-fundo px-4 py-8">
      <div className="mx-auto max-w-2xl rounded-3xl bg-cartao p-7 sombra-cartao">
        <div className="text-[13px] font-semibold text-laranja">{f.loja}</div>
        <h1 className="font-titulo text-[24px] font-bold">{f.nome}</h1>
        {pronto ? (
          <div className="mt-6 flex items-center gap-2 rounded-2xl bg-green-50 p-4 font-semibold text-verde"><Check className="size-5" /> Respondido{f.assinadoEm && ` em ${dataHora(f.assinadoEm)}`}. Obrigado!</div>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            {f.conteudo?.texto && <div className="max-h-80 overflow-y-auto rounded-2xl bg-fundo p-4 text-[13.5px] leading-relaxed whitespace-pre-line">{f.conteudo.texto}</div>}
            {perguntas.map((p) => (
              <Campo key={p.id} rotulo={<>{p.rotulo}{p.obrigatoria && <span className="text-vermelho"> *</span>}</>}>
                {p.tipo === "longo" ? <AreaTexto rows={3} value={resp[p.id] ?? ""} onChange={(e) => setResp({ ...resp, [p.id]: e.target.value })} />
                  : p.tipo === "sim_nao" || p.tipo === "opcoes" ? (
                    <div className="flex flex-wrap gap-2">
                      {(p.tipo === "sim_nao" ? ["Sim", "Não"] : p.opcoes ?? []).map((o) => (
                        <button key={o} type="button" onClick={() => setResp({ ...resp, [p.id]: o })} className={`rounded-xl border-2 px-3 py-1.5 text-[13px] font-semibold ${resp[p.id] === o ? "border-laranja bg-laranja-claro" : "border-linha"}`}>{o}</button>
                      ))}
                    </div>
                  ) : <Entrada type={p.tipo === "data" ? "date" : "text"} value={resp[p.id] ?? ""} onChange={(e) => setResp({ ...resp, [p.id]: e.target.value })} />}
              </Campo>
            ))}
            <div className="rounded-2xl border border-linha p-4">
              <Campo rotulo="Assinatura (seu nome completo)"><Entrada value={assinatura} onChange={(e) => setAssinatura(e.target.value)} className="font-script !text-[22px]" /></Campo>
              <label className="mt-3 flex items-start gap-2 text-[13px]"><input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5 accent-[var(--color-laranja)]" /> Declaro que as informações são verdadeiras e concordo com o conteúdo acima.</label>
            </div>
            <Botao carregando={enviando} className="justify-center" icone={<Check className="size-4" />} onClick={async () => {
              const falta = perguntas.find((p) => p.obrigatoria && !String(resp[p.id] ?? "").trim());
              if (falta) return avisar(`Responda: ${falta.rotulo}`, "erro");
              if (!assinatura.trim() || !aceite) return avisar("Assine e marque a declaração", "erro");
              const respostas = Object.fromEntries(perguntas.map((p) => [p.rotulo, resp[p.id] ?? ""]));
              setEnviando(true);
              try { await post(`/publico/formularios/${token}`, { respostas, assinatura }); setFeito(true); } catch (e: any) { avisar(e.message, "erro"); } finally { setEnviando(false); }
            }}>Enviar e assinar</Botao>
          </div>
        )}
      </div>
    </div>
  );
}
