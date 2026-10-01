import { createFileRoute, Link } from "@tanstack/react-router";
import { Megaphone, Pause, Play, Plus, Send, Trash2, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AreaTexto, Botao, Campo, Entrada, Interruptor, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { Barra, CabecalhoPagina, Card, Carregando, Dica, Selo, Vazio, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { del, post, put } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { dataHora, num, telefone } from "../../lib/formato";
import { useEvento } from "../../lib/sessao";
import { textoTemplate } from "./templates";

export const Route = createFileRoute("/_app/disparos")({ component: Disparos });

const STATUS: Record<string, { rotulo: string; cor: "cinza" | "verde" | "laranja" | "vermelho" | "petroleo" | "ambar" }> = {
  draft: { rotulo: "Rascunho", cor: "cinza" }, scheduled: { rotulo: "Agendado", cor: "petroleo" }, running: { rotulo: "Enviando", cor: "laranja" },
  paused: { rotulo: "Pausado", cor: "ambar" }, done: { rotulo: "Concluído", cor: "verde" }, canceled: { rotulo: "Cancelado", cor: "vermelho" },
};
const STATUS_ENVIO: Record<string, string> = { pending: "Na fila", sent: "Enviado", delivered: "Entregue", read: "Lido", replied: "Respondeu", failed: "Falhou", skipped: "Pulado" };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

function Disparos() {
  const { dados, recarregar } = useDados<any[]>("/disparos");
  const [editar, setEditar] = useState<any>(null);
  const [ver, setVer] = useState<string | null>(null);
  const { executar } = useAcao();
  const { confirmar } = useAvisos();
  useEffect(() => {
    if (!dados?.some((d) => d.status === "running")) return;
    const t = setInterval(recarregar, 5000);
    return () => clearInterval(t);
  }, [dados]);
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Disparos" icone={Megaphone} descricao="Mande uma mensagem para muitos contatos de uma vez, com segurança.">
        <Botao icone={<Plus className="size-4" />} onClick={() => setEditar({ nome: "", modo: "template", variaveis: {}, publico: { tags: [], semTags: [], etapas: [] }, intervaloSegundos: 8, iaResponde: true })}>Novo disparo</Botao>
      </CabecalhoPagina>
      <Dica>Para quem não falou com você nas últimas 24h, o WhatsApp só aceita <b>templates aprovados</b>. O sistema manda um por vez, com intervalo, respeita o limite diário do número e nunca envia para quem pediu para sair.</Dica>
      <Card className="!p-0">
        {!dados ? <Carregando /> : dados.length === 0 ? <Vazio icone={Megaphone} titulo="Nenhum disparo ainda">Crie um disparo para avisar promoções, novidades ou reativar clientes.</Vazio> : (
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Disparo</th><th>Status</th><th>Progresso</th><th>Entregues</th><th>Lidos</th><th>Responderam</th><th>Falhas</th><th></th></tr></thead>
            <tbody>{dados.map((d) => (
              <tr key={d.id} className={`${linhaTabela} cursor-pointer`} onClick={() => (["draft", "scheduled"].includes(d.status) ? setEditar({ ...d, agendadoPara: d.agendadoPara ? new Date(d.agendadoPara).toISOString().slice(0, 16) : "" }) : setVer(d.id))}>
                <td className="px-4 py-2.5"><div className="font-semibold">{d.nome}</div><div className="text-[12px] text-suave">{d.templateNome ?? "Texto livre"} · {d.conexaoNome}{d.agendadoPara && d.status === "scheduled" && ` · ${dataHora(d.agendadoPara)}`}</div></td>
                <td><Selo cor={STATUS[d.status]?.cor}>{STATUS[d.status]?.rotulo}</Selo></td>
                <td className="w-40 pr-4"><div className="text-[12px] text-suave">{num(d.enviados)} de {num(d.total)}</div><Barra valor={d.enviados} total={d.total || 1} /></td>
                <td>{pct(d.entregues, d.enviados)}</td><td>{pct(d.lidos, d.enviados)}</td><td className="font-semibold text-verde">{num(d.respondidos)} <span className="font-normal text-suave">({pct(d.respondidos, d.enviados)})</span></td>
                <td className={d.falhas ? "text-vermelho" : ""}>{num(d.falhas)}</td>
                <td className="pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                  {d.status === "running" && <button type="button" title="Pausar" onClick={() => executar(() => post(`/disparos/${d.id}/pausar`), "Pausado").then(recarregar)} className="rounded-lg p-1.5 text-suave hover:bg-fundo"><Pause className="size-4" /></button>}
                  {d.status === "paused" && <button type="button" title="Continuar" onClick={() => executar(() => post(`/disparos/${d.id}/iniciar`), "Continuando").then(recarregar)} className="rounded-lg p-1.5 text-suave hover:bg-fundo"><Play className="size-4" /></button>}
                  {["running", "paused", "scheduled"].includes(d.status) && <button type="button" title="Cancelar" onClick={async () => { if (await confirmar("Cancelar o disparo? Quem ainda não recebeu não vai receber.", { perigo: true, botao: "Cancelar disparo" })) executar(() => post(`/disparos/${d.id}/cancelar`), "Cancelado").then(recarregar); }} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><X className="size-4" /></button>}
                  {["draft", "done", "canceled"].includes(d.status) && <button type="button" title="Apagar" onClick={() => executar(() => del(`/disparos/${d.id}`), "Apagado").then(recarregar)} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      {editar && <Editor inicial={editar} aoFechar={(ok) => { setEditar(null); if (ok) recarregar(); }} />}
      {ver && <Detalhe id={ver} aoFechar={() => { setVer(null); recarregar(); }} />}
    </div>
  );
}

function Editor({ inicial, aoFechar }: { inicial: any; aoFechar: (ok?: boolean) => void }) {
  const [d, setD] = useState<any>(inicial);
  const [passo, setPasso] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const { dados: conexoes } = useDados<any[]>("/conexoes");
  const { dados: templates } = useDados<any[]>("/conexoes/templates?status=APPROVED");
  const { dados: tags } = useDados<any[]>("/contatos/tags");
  const { dados: funis } = useDados<any[]>("/crm/funis");
  const { executar, carregando } = useAcao();
  const { confirmar } = useAvisos();
  const whats = (conexoes ?? []).filter((c) => c.tipo === "whatsapp_cloud" && c.status === "conectado");
  useEffect(() => { if (!d.conexaoId && whats[0]) setD((x: any) => ({ ...x, conexaoId: whats[0].id })); }, [conexoes]);
  const p = d.publico ?? {};
  useEffect(() => {
    const t = setTimeout(() => post<{ total: number }>("/disparos/publico", p).then((r) => setTotal(r.total)).catch(() => setTotal(null)), 400);
    return () => clearTimeout(t);
  }, [JSON.stringify(p)]);
  const tpl = (templates ?? []).find((t) => t.id === d.templateId);
  const corpoTpl = tpl ? textoTemplate(tpl) : "";
  const nVars = [...new Set(corpoTpl.match(/\{\{(\d+)\}\}/g) ?? [])].length;
  const setP = (k: string, v: any) => setD({ ...d, publico: { ...p, [k]: v } });
  const alternar = (k: string, v: string) => setP(k, (p[k] ?? []).includes(v) ? p[k].filter((x: string) => x !== v) : [...(p[k] ?? []), v]);
  const salvar = async (iniciar: boolean) => {
    const corpo = { ...d, agendadoPara: d.agendadoPara ? new Date(d.agendadoPara).toISOString() : null };
    const r = await executar(() => (d.id ? put<any>(`/disparos/${d.id}`, corpo) : post<any>("/disparos", corpo)));
    if (!r) return;
    if (iniciar) {
      if (!(await confirmar(`Enviar para ${num(total ?? 0)} contatos${d.agendadoPara ? ` em ${dataHora(corpo.agendadoPara)}` : " agora"}?`, { botao: "Sim, enviar" }))) { setD({ ...d, id: r.id }); return; }
      await executar(() => post(`/disparos/${r.id}/iniciar`), d.agendadoPara ? "Disparo agendado" : "Disparo iniciado! 🚀");
    }
    aoFechar(true);
  };
  return (
    <Modal titulo={d.id ? "Editar disparo" : "Novo disparo"} largura="max-w-3xl" aoFechar={() => aoFechar()} rodape={
      <>
        {passo > 1 && <Botao variante="fantasma" className="mr-auto" onClick={() => setPasso(passo - 1)}>Voltar</Botao>}
        {passo < 3 ? <Botao onClick={() => setPasso(passo + 1)}>Próximo</Botao> : <>
          <Botao variante="secundario" carregando={carregando} onClick={() => salvar(false)}>Salvar rascunho</Botao>
          <Botao carregando={carregando} icone={<Send className="size-4" />} disabled={!total} onClick={() => salvar(true)}>{d.agendadoPara ? "Agendar" : "Enviar agora"}</Botao>
        </>}
      </>}>
      <div className="mb-4 flex gap-2">{["Mensagem", "Quem recebe", "Quando"].map((t, i) => <div key={t} className={`flex-1 rounded-full py-1.5 text-center text-[12.5px] font-semibold ${passo === i + 1 ? "bg-laranja-gradiente text-white" : passo > i + 1 ? "bg-laranja-claro text-laranja" : "bg-fundo text-suave"}`}>{i + 1}. {t}</div>)}</div>
      {passo === 1 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome do disparo (só para você)"><Entrada value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} placeholder="Promoção de outubro" /></Campo>
          <Campo rotulo="Número que envia">
            {whats.length ? <Selecao value={d.conexaoId ?? ""} onChange={(e) => setD({ ...d, conexaoId: e.target.value })} opcoes={whats.map((c) => ({ valor: c.id, rotulo: `${c.nome} ${telefone(c.telefone)}` }))} />
              : <div className="text-[13px] text-vermelho">Nenhum WhatsApp conectado. <Link to="/conexoes" className="font-semibold underline">Conectar</Link></div>}
          </Campo>
          <div className="flex gap-2 sm:col-span-2">
            {[{ v: "template", t: "Template aprovado", s: "Chega para todos" }, { v: "texto", t: "Texto livre", s: "Só chega para quem falou com você nas últimas 24h" }].map((o) => (
              <button key={o.v} type="button" onClick={() => setD({ ...d, modo: o.v })} className={`flex-1 rounded-2xl border-2 p-3 text-left ${d.modo === o.v ? "border-laranja bg-laranja-claro" : "border-linha"}`}><div className="font-semibold">{o.t}</div><div className="text-[12px] text-suave">{o.s}</div></button>
            ))}
          </div>
          {d.modo === "template" ? (
            <>
              <Campo rotulo="Template" className="sm:col-span-2"><Selecao value={d.templateId ?? ""} onChange={(e) => setD({ ...d, templateId: e.target.value, variaveis: {} })} vazio="Escolha..." opcoes={(templates ?? []).filter((t) => !d.conexaoId || t.conexaoId === d.conexaoId).map((t) => ({ valor: t.id, rotulo: t.nome }))} /></Campo>
              {tpl && <div className="rounded-2xl bg-[#e5ddd5] p-3 sm:col-span-2"><div className="max-w-[85%] rounded-xl bg-white p-3 text-[13px] whitespace-pre-line shadow">{corpoTpl}</div></div>}
              {Array.from({ length: nVars }, (_, i) => String(i + 1)).map((n) => (
                <Campo key={n} rotulo={`Valor de {{${n}}}`} dica="Use {nome} ou {primeiro_nome} para personalizar."><Entrada value={d.variaveis?.[n] ?? ""} onChange={(e) => setD({ ...d, variaveis: { ...d.variaveis, [n]: e.target.value } })} placeholder={n === "1" ? "{primeiro_nome}" : ""} /></Campo>
              ))}
            </>
          ) : (
            <>
              <Campo rotulo="Mensagem" dica="Use {primeiro_nome} e {nome}." className="sm:col-span-2"><AreaTexto rows={5} value={d.texto ?? ""} onChange={(e) => setD({ ...d, texto: e.target.value })} /></Campo>
              <Campo rotulo="Link de imagem (opcional)" className="sm:col-span-2"><Entrada value={d.midiaUrl ?? ""} onChange={(e) => setD({ ...d, midiaUrl: e.target.value })} placeholder="https://..." /></Campo>
            </>
          )}
        </div>
      )}
      {passo === 2 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-2xl bg-laranja-claro p-4"><Users className="size-6 text-laranja" /><div><div className="font-titulo text-[22px] font-bold">{total === null ? "..." : num(total)}</div><div className="text-[12.5px] text-suave">contatos vão receber (sem contar quem pediu para sair ou está bloqueado)</div></div></div>
          <Campo rotulo="Com estas etiquetas (vazio = todos)"><div className="flex flex-wrap gap-1.5">{(tags ?? []).map((t) => <button key={t.id} type="button" onClick={() => alternar("tags", t.nome)} className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ${(p.tags ?? []).includes(t.nome) ? "bg-petroleo text-white ring-transparent" : "ring-linha"}`}>{t.nome} <span className="opacity-60">{t.contatos}</span></button>)}</div></Campo>
          <Campo rotulo="Menos quem tem estas etiquetas"><div className="flex flex-wrap gap-1.5">{(tags ?? []).map((t) => <button key={t.id} type="button" onClick={() => alternar("semTags", t.nome)} className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ${(p.semTags ?? []).includes(t.nome) ? "bg-vermelho text-white ring-transparent" : "ring-linha"}`}>{t.nome}</button>)}</div></Campo>
          <Campo rotulo="Que estão nestas etapas do funil">
            <div className="flex flex-col gap-2">{(funis ?? []).map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[12px] font-semibold text-suave">{f.nome}:</span>{f.etapas.map((e: any) => <button key={e.id} type="button" onClick={() => alternar("etapas", e.id)} className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ${(p.etapas ?? []).includes(e.id) ? "bg-laranja text-white ring-transparent" : "ring-linha"}`}>{e.nome}</button>)}</div>
            ))}</div>
          </Campo>
        </div>
      )}
      {passo === 3 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Quando enviar" dica="Vazio = agora."><Entrada type="datetime-local" value={d.agendadoPara ?? ""} onChange={(e) => setD({ ...d, agendadoPara: e.target.value })} /></Campo>
          <Campo rotulo="Intervalo entre mensagens (segundos)" dica="Mais devagar = menos risco de bloqueio."><Entrada type="number" min={3} value={d.intervaloSegundos} onChange={(e) => setD({ ...d, intervaloSegundos: Number(e.target.value) })} /></Campo>
          <Campo rotulo="Etiqueta para quem responder (opcional)"><Entrada value={d.tagAoResponder ?? ""} onChange={(e) => setD({ ...d, tagAoResponder: e.target.value.toUpperCase() })} placeholder="RESPONDEU PROMO" /></Campo>
          <div className="flex items-end"><Interruptor ligado={d.iaResponde} aoMudar={(v) => setD({ ...d, iaResponde: v })} rotulo="O robô atende quem responder" /></div>
          {total !== null && d.intervaloSegundos > 0 && <p className="text-[12.5px] text-suave sm:col-span-2">Tempo estimado: cerca de {Math.ceil((total * d.intervaloSegundos) / 60)} minutos.</p>}
        </div>
      )}
    </Modal>
  );
}

function Detalhe({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const { dados: d, recarregar } = useDados<any>(`/disparos/${id}`);
  useEvento("entrega", recarregar);
  useEffect(() => { const t = setInterval(recarregar, 6000); return () => clearInterval(t); }, []);
  return (
    <Modal titulo={d?.nome ?? "Disparo"} largura="max-w-3xl" aoFechar={aoFechar}>
      {!d ? <Carregando /> : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[["Total", d.total], ["Enviados", d.enviados], ["Entregues", d.entregues], ["Lidos", d.lidos], ["Responderam", d.respondidos], ["Falhas", d.falhas]].map(([r, v]) => (
              <div key={r as string} className="rounded-xl bg-fundo px-3 py-2"><div className="text-[11.5px] text-suave">{r}</div><div className="font-titulo text-[18px] font-bold">{num(v as number)}</div></div>
            ))}
          </div>
          <Barra valor={d.enviados} total={d.total || 1} />
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className={cabecalhoTabela}><th className="py-2">Contato</th><th>Status</th><th>Quando</th><th>Erro</th></tr></thead>
              <tbody>{d.envios.map((e: any) => (
                <tr key={e.id} className={linhaTabela}><td className="py-1.5">{e.nome ?? telefone(e.telefone)}</td><td><Selo cor={e.status === "failed" ? "vermelho" : e.status === "replied" ? "verde" : e.status === "read" ? "petroleo" : "cinza"}>{STATUS_ENVIO[e.status] ?? e.status}</Selo></td><td>{e.enviadoEm ? dataHora(e.enviadoEm) : "—"}</td><td className="max-w-xs truncate text-vermelho">{e.erro}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
