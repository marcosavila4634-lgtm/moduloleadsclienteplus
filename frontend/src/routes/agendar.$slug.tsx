import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, CalendarDays, Check, Clock, User } from "lucide-react";
import { useEffect, useState } from "react";
import { AreaTexto, Botao, Campo, Entrada, useAvisos } from "../components/form";
import { Carregando } from "../components/ui";
import { get, post, qs } from "../lib/api";
import { dataHora, reais } from "../lib/formato";

export const Route = createFileRoute("/agendar/$slug")({ component: Agendar });

const dias = (n: number) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function Agendar() {
  const { slug } = Route.useParams();
  const [pg, setPg] = useState<any>(null);
  const [erro, setErro] = useState(false);
  const [servico, setServico] = useState<any>(null);
  const [prof, setProf] = useState<string>("");
  const [dia, setDia] = useState(iso(new Date()));
  const [vagas, setVagas] = useState<any[] | null>(null);
  const [vaga, setVaga] = useState<any>(null);
  const [f, setF] = useState({ nome: "", telefone: "", observacao: "" });
  const [feito, setFeito] = useState<any>(null);
  const [enviando, setEnviando] = useState(false);
  const { avisar } = useAvisos();

  useEffect(() => { get<any>(`/publico/agendar/${slug}`).then((d) => { setPg(d); document.title = d.titulo || d.loja; }).catch(() => setErro(true)); }, [slug]);
  useEffect(() => {
    if (!servico) return;
    setVagas(null); setVaga(null);
    get<any[]>(`/publico/agendar/${slug}/vagas${qs({ tipo: servico.id, colaborador: prof || undefined, dia })}`).then(setVagas).catch(() => setVagas([]));
  }, [servico, prof, dia]);

  if (erro) return <div className="grid min-h-screen place-items-center bg-fundo text-center"><div><CalendarDays className="mx-auto size-12 text-suave" /><p className="mt-3 font-titulo text-xl font-bold">Página não encontrada</p></div></div>;
  if (!pg) return <div className="min-h-screen bg-fundo"><Carregando /></div>;
  const profs = servico ? pg.profissionais.filter((p: any) => !servico.colaboradores?.length || servico.colaboradores.includes(p.id)) : [];

  return (
    <div className="min-h-screen bg-fundo px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5 text-center">
          <div className="text-[13px] font-semibold text-laranja">{pg.loja}</div>
          <h1 className="font-titulo text-[28px] font-bold">{pg.titulo || "Agende seu horário"}</h1>
          {pg.descricao && <p className="mt-1 text-suave">{pg.descricao}</p>}
        </div>
        {feito ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-cartao p-8 text-center sombra-cartao">
            <div className="grid size-16 place-items-center rounded-full bg-laranja-gradiente text-white"><CalendarCheck className="size-8" /></div>
            <div className="font-titulo text-[22px] font-bold">Agendado!</div>
            <div>{feito.titulo}</div>
            <div className="font-semibold text-petroleo">{dataHora(feito.inicio)}</div>
            <p className="text-[13px] text-suave">Você vai receber a confirmação e um lembrete no seu WhatsApp.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Passo n={1} titulo="Escolha o serviço">
              <div className="grid gap-2 sm:grid-cols-2">
                {pg.servicos.map((s: any) => (
                  <button key={s.id} type="button" onClick={() => { setServico(s); setProf(""); }} className={`rounded-2xl border-2 p-3 text-left ${servico?.id === s.id ? "border-laranja bg-laranja-claro" : "border-linha bg-cartao"}`}>
                    <div className="font-semibold">{s.nome}</div>
                    <div className="mt-0.5 flex gap-3 text-[12.5px] text-suave"><span className="flex items-center gap-1"><Clock className="size-3.5" />{s.duracaoMin} min</span>{s.preco > 0 && <span>{reais(s.preco)}</span>}</div>
                    {s.descricao && <div className="mt-1 text-[12.5px] text-suave">{s.descricao}</div>}
                  </button>
                ))}
              </div>
            </Passo>
            {servico && profs.length > 1 && (
              <Passo n={2} titulo="Com quem?">
                <div className="flex flex-wrap gap-2">
                  {[{ id: "", nome: "Qualquer um" }, ...profs].map((p: any) => (
                    <button key={p.id} type="button" onClick={() => setProf(p.id)} className={`flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-[13px] font-semibold ${prof === p.id ? "border-laranja bg-laranja-claro" : "border-linha bg-cartao"}`}><User className="size-4" />{p.nome}</button>
                  ))}
                </div>
              </Passo>
            )}
            {servico && (
              <Passo n={profs.length > 1 ? 3 : 2} titulo="Dia e horário">
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {dias(21).map((d) => (
                    <button key={iso(d)} type="button" onClick={() => setDia(iso(d))} className={`flex w-14 shrink-0 flex-col items-center rounded-2xl border-2 py-2 ${dia === iso(d) ? "border-laranja bg-laranja-claro" : "border-linha bg-cartao"}`}>
                      <span className="text-[11px] text-suave uppercase">{d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span>
                      <span className="font-titulo text-[18px] font-bold">{d.getDate()}</span>
                    </button>
                  ))}
                </div>
                {vagas === null ? <Carregando /> : vagas.length === 0 ? <p className="py-4 text-center text-[13.5px] text-suave">Sem horários livres neste dia. Tente outro.</p> : (
                  <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {vagas.map((v) => (
                      <button key={v.inicio + v.colaboradorId} type="button" onClick={() => setVaga(v)} title={v.colaborador ?? ""} className={`rounded-xl border-2 py-2 text-[13.5px] font-semibold ${vaga === v ? "border-laranja bg-laranja text-white" : "border-linha bg-cartao"}`}>{v.hora.slice(0, 5)}</button>
                    ))}
                  </div>
                )}
              </Passo>
            )}
            {vaga && (
              <Passo n={profs.length > 1 ? 4 : 3} titulo="Seus dados">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo rotulo="Nome"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
                  <Campo rotulo="WhatsApp com DDD"><Entrada inputMode="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} /></Campo>
                  <Campo rotulo="Observação (opcional)" className="sm:col-span-2"><AreaTexto rows={2} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} /></Campo>
                </div>
                <Botao className="mt-3 w-full justify-center" carregando={enviando} icone={<Check className="size-4" />} onClick={async () => {
                  if (!f.nome.trim() || f.telefone.replace(/\D/g, "").length < 10) return avisar("Preencha nome e WhatsApp", "erro");
                  setEnviando(true);
                  try { setFeito(await post(`/publico/agendar/${slug}`, { tipoId: servico.id, colaboradorId: vaga.colaboradorId, inicio: vaga.inicio, ...f })); } catch (e: any) { avisar(e.message, "erro"); } finally { setEnviando(false); }
                }}>Confirmar {vaga.hora.slice(0, 5)}{vaga.colaborador ? ` com ${vaga.colaborador}` : ""}</Botao>
              </Passo>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-cartao p-5 sombra-cartao">
      <div className="mb-3 flex items-center gap-2 font-titulo font-bold"><span className="grid size-7 place-items-center rounded-full bg-laranja-gradiente text-[13px] text-white">{n}</span>{titulo}</div>
      {children}
    </div>
  );
}
