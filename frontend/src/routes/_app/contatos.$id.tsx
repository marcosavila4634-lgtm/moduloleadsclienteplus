import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Ban, Brain, CalendarDays, MessageSquare, Package, Save, ShoppingBag, Star, Target, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AreaTexto, Botao, Campo, Entrada, Interruptor, useAcao, useAvisos } from "../../components/form";
import { Avatar, Card, Carregando, Selo, Tag, TituloCard } from "../../components/ui";
import { del, post, put } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { data, dataHora, reais, relativo, telefone } from "../../lib/formato";
import { useSessao } from "../../lib/sessao";

export const Route = createFileRoute("/_app/contatos/$id")({ component: FichaContato });

function FichaContato() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { pode } = useSessao();
  const { confirmar } = useAvisos();
  const { dados: c, recarregar } = useDados<any>(`/contatos/${id}`);
  const { dados: tags } = useDados<any[]>("/contatos/tags");
  const { dados: campos } = useDados<any[]>("/contatos/campos");
  const [f, setF] = useState<any>(null);
  const [memoria, setMemoria] = useState("");
  const { executar, carregando } = useAcao();
  useEffect(() => {
    if (c) setF({ nome: c.nome ?? "", email: c.email ?? "", telefone: c.telefone ?? "", aniversario: c.aniversario ?? "", notas: c.notas ?? "", campos: c.campos ?? {}, tags: c.tags ?? [], optOut: c.optOut, bloqueado: c.bloqueado });
  }, [c?.id]);
  if (!c || !f) return <Carregando />;
  const corTag = (n: string) => tags?.find((t) => t.nome === n)?.cor;

  return (
    <div className="flex flex-col gap-4">
      <Link to="/contatos" className="flex w-fit items-center gap-1 text-[13px] font-semibold text-suave hover:text-texto"><ArrowLeft className="size-4" /> Contatos</Link>
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col items-center text-center">
            <Avatar nome={c.nome ?? c.telefone} foto={c.fotoUrl} tamanho={84} />
            <h1 className="mt-3 font-titulo text-[20px] font-bold">{c.nome ?? "Sem nome"}</h1>
            <div className="text-[13px] text-suave">{c.telefone ? telefone(c.telefone) : c.instagramUsuario ? `@${c.instagramUsuario}` : ""}</div>
            <div className="mt-2 flex flex-wrap justify-center gap-1">{(c.tags ?? []).map((t: string) => <Tag key={t} nome={t} cor={corTag(t)} />)}</div>
            <div className="mt-3 grid w-full grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-fundo py-2"><div className="font-titulo text-lg font-bold">{c.totalMensagens}</div><div className="text-[11px] text-suave">mensagens</div></div>
              <div className="rounded-xl bg-fundo py-2"><div className="font-titulo text-lg font-bold">{c.compras.filter((x: any) => x.status === "approved").length}</div><div className="text-[11px] text-suave">compras</div></div>
              <div className="rounded-xl bg-fundo py-2"><div className="font-titulo text-[15px] font-bold">{reais(c.compras.filter((x: any) => x.status === "approved").reduce((s: number, x: any) => s + Number(x.valor), 0))}</div><div className="text-[11px] text-suave">gasto total</div></div>
            </div>
            <div className="mt-3 flex w-full gap-2">
              {c.conversas[0] && <Botao className="flex-1" icone={<MessageSquare className="size-4" />} onClick={() => navigate({ to: "/conversas", search: { c: c.conversas[0].id } })}>Conversar</Botao>}
            </div>
            <div className="mt-3 w-full text-left text-[12px] text-suave">
              Primeiro contato: {data(c.primeiroContatoEm)} · Último: {relativo(c.ultimoContatoEm)} · Origem: {c.origem ?? "—"}
            </div>
          </Card>

          <Card>
            <TituloCard icone={Brain}>O que a IA sabe</TituloCard>
            <ul className="mt-3 flex flex-col gap-2">
              {c.memorias.map((m: any) => (
                <li key={m.id} className="flex items-start gap-2 rounded-xl bg-fundo px-3 py-2 text-[12.5px]">
                  <span className="flex-1">{m.fato} <span className="text-[10.5px] text-suave">({m.fonte === "ia" ? "IA" : m.fonte})</span></span>
                  <button type="button" onClick={() => executar(() => del(`/contatos/${id}/memorias/${m.id}`)).then(recarregar)} className="text-suave hover:text-vermelho"><Trash2 className="size-3.5" /></button>
                </li>
              ))}
              {c.memorias.length === 0 && <li className="text-[12.5px] text-suave">Ainda nada. A IA anota sozinha as preferências e fatos importantes.</li>}
            </ul>
            <div className="mt-3 flex gap-2">
              <Entrada value={memoria} onChange={(e) => setMemoria(e.target.value)} placeholder="Ex.: Veste tamanho M, prefere cores escuras" />
              <Botao variante="secundario" disabled={!memoria.trim()} onClick={() => executar(() => post(`/contatos/${id}/memorias`, { fato: memoria, categoria: "preferencia" })).then(() => { setMemoria(""); recarregar(); })}>Anotar</Botao>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <TituloCard icone={Save} acao={<Botao carregando={carregando} onClick={() => executar(() => put(`/contatos/${id}`, f), "Contato salvo").then(recarregar)}>Salvar</Botao>}>Dados do contato</TituloCard>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Nome"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
              <Campo rotulo="WhatsApp"><Entrada value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} /></Campo>
              <Campo rotulo="E-mail"><Entrada value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
              <Campo rotulo="Aniversário"><Entrada type="date" value={f.aniversario ?? ""} onChange={(e) => setF({ ...f, aniversario: e.target.value })} /></Campo>
              {(campos ?? []).map((cp) => (
                <Campo key={cp.id} rotulo={cp.nome}>
                  {cp.tipo === "selecao" ? (
                    <select className="rounded-xl border border-linha-2 px-3 py-2 text-[13.5px]" value={f.campos[cp.chave] ?? ""} onChange={(e) => setF({ ...f, campos: { ...f.campos, [cp.chave]: e.target.value } })}>
                      <option value="">—</option>{(cp.opcoes ?? []).map((o: string) => <option key={o}>{o}</option>)}
                    </select>
                  ) : <Entrada type={cp.tipo === "numero" ? "number" : cp.tipo === "data" ? "date" : "text"} value={f.campos[cp.chave] ?? ""} onChange={(e) => setF({ ...f, campos: { ...f.campos, [cp.chave]: e.target.value } })} />}
                </Campo>
              ))}
              {Object.keys(f.campos).filter((k) => !(campos ?? []).some((cp) => cp.chave === k)).map((k) => (
                <Campo key={k} rotulo={k}><Entrada value={f.campos[k] ?? ""} onChange={(e) => setF({ ...f, campos: { ...f.campos, [k]: e.target.value } })} /></Campo>
              ))}
              <Campo rotulo="Tags" className="sm:col-span-2">
                <div className="flex flex-wrap gap-1.5">
                  {(tags ?? []).map((t) => (
                    <button key={t.id} type="button" onClick={() => setF({ ...f, tags: f.tags.includes(t.nome) ? f.tags.filter((x: string) => x !== t.nome) : [...f.tags, t.nome] })}
                      className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ${f.tags.includes(t.nome) ? "text-white" : "bg-white ring-linha"}`} style={f.tags.includes(t.nome) ? { background: t.cor } : undefined}>{t.nome}</button>
                  ))}
                </div>
              </Campo>
              <Campo rotulo="Anotações" className="sm:col-span-2"><AreaTexto value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></Campo>
              <Interruptor ligado={f.optOut} aoMudar={(v) => setF({ ...f, optOut: v })} rotulo="Não enviar marketing" descricao="Fica fora de disparos e automações de oferta." />
              <Interruptor ligado={f.bloqueado} aoMudar={(v) => setF({ ...f, bloqueado: v })} rotulo="Bloqueado" descricao="Ninguém (nem a IA) responde este contato." />
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <TituloCard icone={Target}>Negócios</TituloCard>
              <ul className="mt-3 flex flex-col gap-2">
                {c.negocios.map((n: any) => (
                  <li key={n.id} className="flex items-center justify-between gap-2 rounded-xl bg-fundo px-3 py-2 text-[12.5px]">
                    <span className="min-w-0"><span className="block truncate font-semibold">{n.titulo}</span><span className="text-suave">{n.funilNome} · <span style={{ color: n.etapaCor }}>{n.etapaNome}</span></span></span>
                    <span className="font-semibold">{reais(n.valor)}</span>
                  </li>
                ))}
                {c.negocios.length === 0 && <li className="text-[12.5px] text-suave">Nenhum negócio.</li>}
              </ul>
            </Card>
            <Card>
              <TituloCard icone={ShoppingBag}>Compras e pedidos</TituloCard>
              <ul className="mt-3 flex flex-col gap-2">
                {c.pedidos.map((p: any) => (
                  <Link key={p.id} to="/pedidos/$id" params={{ id: p.id }} className="flex items-center justify-between rounded-xl bg-fundo px-3 py-2 text-[12.5px] hover:bg-fundo-2">
                    <span><Package className="mr-1 inline size-3.5" />Pedido #{p.numero} · {p.status.replaceAll("_", " ")}</span><span className="font-semibold">{reais(p.total)}</span>
                  </Link>
                ))}
                {c.compras.filter((x: any) => x.plataforma !== "loja").map((x: any) => (
                  <li key={x.id} className="flex items-center justify-between rounded-xl bg-fundo px-3 py-2 text-[12.5px]">
                    <span>{x.produto ?? "Compra"} <Selo>{x.plataforma}</Selo> {x.status !== "approved" && <Selo cor="vermelho">{x.status}</Selo>}</span><span className="font-semibold">{reais(x.valor)}</span>
                  </li>
                ))}
                {c.pedidos.length === 0 && c.compras.length === 0 && <li className="text-[12.5px] text-suave">Nenhuma compra ainda.</li>}
              </ul>
            </Card>
            <Card>
              <TituloCard icone={CalendarDays}>Agendamentos</TituloCard>
              <ul className="mt-3 flex flex-col gap-2">
                {c.agendamentos.map((a: any) => <li key={a.id} className="rounded-xl bg-fundo px-3 py-2 text-[12.5px]">{a.titulo} · {dataHora(a.inicio)} <Selo>{a.status}</Selo></li>)}
                {c.agendamentos.length === 0 && <li className="text-[12.5px] text-suave">Nenhum agendamento.</li>}
              </ul>
            </Card>
            <Card>
              <TituloCard icone={Star}>Satisfação (NPS)</TituloCard>
              <ul className="mt-3 flex flex-col gap-2">
                {c.nps.map((n: any, i: number) => <li key={i} className="rounded-xl bg-fundo px-3 py-2 text-[12.5px]"><b className={n.nota >= 9 ? "text-verde" : n.nota <= 6 ? "text-vermelho" : ""}>Nota {n.nota}</b> {n.comentario && `· “${n.comentario}”`} <span className="text-suave">· {data(n.respondidaEm)}</span></li>)}
                {c.nps.length === 0 && <li className="text-[12.5px] text-suave">Ainda não respondeu a pesquisa.</li>}
              </ul>
            </Card>
          </div>
          {pode("admin") && (
            <div className="flex justify-end">
              <Botao variante="fantasma" className="!text-vermelho" icone={<Ban className="size-4" />}
                onClick={async () => { if (await confirmar("Apagar este contato e todo o histórico dele (conversas, negócios)?", { perigo: true, botao: "Apagar" })) executar(() => del(`/contatos/${id}`), "Contato apagado").then(() => navigate({ to: "/contatos" })); }}>
                Apagar contato
              </Botao>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
