import { createFileRoute } from "@tanstack/react-router";
import { FileText, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { AreaTexto, Botao, Campo, Entrada, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { CabecalhoPagina, Card, Carregando, Dica, Selo, Vazio, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { del, post } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { num } from "../../lib/formato";

export const Route = createFileRoute("/_app/templates")({ component: Templates });

const STATUS: Record<string, { rotulo: string; cor: "verde" | "ambar" | "vermelho" | "cinza" }> = {
  APPROVED: { rotulo: "Aprovado", cor: "verde" }, PENDING: { rotulo: "Em análise", cor: "ambar" }, REJECTED: { rotulo: "Recusado", cor: "vermelho" },
  PAUSED: { rotulo: "Pausado", cor: "cinza" }, DISABLED: { rotulo: "Desativado", cor: "cinza" },
};
const CATEGORIAS: Record<string, string> = { MARKETING: "Marketing (promoções)", UTILITY: "Utilidade (pedidos, lembretes)", AUTHENTICATION: "Autenticação (códigos)" };

export function textoTemplate(t: any, parte = "BODY"): string {
  return (t.componentes ?? []).find((c: any) => c.type === parte)?.text ?? "";
}

function Templates() {
  const { dados, recarregar } = useDados<any[]>("/conexoes/templates");
  const { dados: conexoes } = useDados<any[]>("/conexoes");
  const [novo, setNovo] = useState(false);
  const [ver, setVer] = useState<any>(null);
  const { executar, carregando } = useAcao();
  const { confirmar } = useAvisos();
  const whats = (conexoes ?? []).filter((c) => c.tipo === "whatsapp_cloud");
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Templates do WhatsApp" icone={FileText} descricao="Mensagens aprovadas pela Meta para falar com quem não respondeu nas últimas 24 horas.">
        {whats.map((c) => <Botao key={c.id} variante="secundario" carregando={carregando} icone={<RefreshCw className="size-4" />} onClick={() => executar(() => post<any>(`/conexoes/${c.id}/templates/sincronizar`), "Templates atualizados").then(recarregar)}>Atualizar {whats.length > 1 ? c.nome : ""}</Botao>)}
        <Botao icone={<Plus className="size-4" />} disabled={!whats.length} onClick={() => setNovo(true)}>Novo template</Botao>
      </CabecalhoPagina>
      <Dica>O WhatsApp só deixa mandar mensagem livre até <b>24 horas</b> depois da última mensagem do cliente. Depois disso, é preciso usar um template aprovado — o sistema escolhe sozinho quando necessário (follow-ups, disparos, lembretes).</Dica>
      <Card className="!p-0">
        {!dados ? <Carregando /> : dados.length === 0 ? <Vazio icone={FileText} titulo="Nenhum template">{whats.length ? "Clique em Atualizar para buscar os templates da Meta ou crie um novo." : "Conecte um WhatsApp primeiro."}</Vazio> : (
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Nome</th><th>Mensagem</th><th>Categoria</th><th>Status</th><th>Enviados</th><th>Lidos</th><th>Respondidos</th><th></th></tr></thead>
            <tbody>{dados.map((t) => (
              <tr key={t.id} className={`${linhaTabela} cursor-pointer`} onClick={() => setVer(t)}>
                <td className="px-4 py-2.5 font-mono text-[12px] font-semibold">{t.nome}<div className="font-sans font-normal text-suave">{t.idioma}{whats.length > 1 && ` · ${t.conexaoNome}`}</div></td>
                <td className="max-w-md truncate text-suave">{textoTemplate(t)}</td>
                <td className="text-[12px]">{t.categoria}</td>
                <td><Selo cor={STATUS[t.status]?.cor}>{STATUS[t.status]?.rotulo ?? t.status}</Selo></td>
                <td>{num(t.enviados)}</td>
                <td>{t.enviados ? `${Math.round((t.lidos / t.enviados) * 100)}%` : "—"}</td>
                <td>{t.enviados ? `${Math.round((t.respondidos / t.enviados) * 100)}%` : "—"}</td>
                <td className="pr-3 text-right"><button type="button" onClick={async (e) => { e.stopPropagation(); if (await confirmar(`Apagar o template ${t.nome} também na Meta?`, { perigo: true, botao: "Apagar" })) executar(() => del(`/conexoes/templates/${t.id}`), "Template apagado").then(recarregar); }} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      {ver && (
        <Modal titulo={ver.nome} aoFechar={() => setVer(null)}>
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl bg-[#e5ddd5] p-4">
              <div className="max-w-[85%] rounded-xl rounded-tl-none bg-white p-3 text-[13.5px] whitespace-pre-line shadow">
                {textoTemplate(ver, "HEADER") && <div className="mb-1 font-bold">{textoTemplate(ver, "HEADER")}</div>}
                {textoTemplate(ver)}
                {textoTemplate(ver, "FOOTER") && <div className="mt-1 text-[12px] text-suave">{textoTemplate(ver, "FOOTER")}</div>}
              </div>
              {(ver.componentes ?? []).find((c: any) => c.type === "BUTTONS")?.buttons?.map((b: any, i: number) => <div key={i} className="mt-1 max-w-[85%] rounded-xl bg-white py-2 text-center text-[13px] font-semibold text-sky-600 shadow">{b.text}</div>)}
            </div>
            {ver.motivoRejeicao && ver.motivoRejeicao !== "NONE" && <Dica cor="vermelho">Motivo da recusa: {ver.motivoRejeicao}</Dica>}
          </div>
        </Modal>
      )}
      {novo && <NovoTemplate conexoes={whats} aoFechar={(ok) => { setNovo(false); if (ok) recarregar(); }} />}
    </div>
  );
}

function NovoTemplate({ conexoes, aoFechar }: { conexoes: any[]; aoFechar: (ok?: boolean) => void }) {
  const [f, setF] = useState<any>({ conexaoId: conexoes[0]?.id, nome: "", categoria: "MARKETING", idioma: "pt_BR", cabecalho: "", corpo: "Olá {{1}}! ", rodape: "", botoes: [], exemplos: ["Maria"] });
  const { executar, carregando } = useAcao();
  const variaveis = [...new Set((f.corpo.match(/\{\{(\d+)\}\}/g) ?? []) as string[])];
  return (
    <Modal titulo="Novo template" largura="max-w-2xl" aoFechar={() => aoFechar()} rodape={
      <Botao carregando={carregando} onClick={() => executar(() => post("/conexoes/templates", f), "Enviado para aprovação da Meta. Costuma levar alguns minutos.").then((r) => r && aoFechar(true))}>Enviar para aprovação</Botao>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {conexoes.length > 1 && <Campo rotulo="Número" className="sm:col-span-2"><Selecao value={f.conexaoId} onChange={(e) => setF({ ...f, conexaoId: e.target.value })} opcoes={conexoes.map((c) => ({ valor: c.id, rotulo: c.nome }))} /></Campo>}
        <Campo rotulo="Nome (só letras minúsculas e _)"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="retomar_conversa" /></Campo>
        <Campo rotulo="Categoria"><Selecao value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} opcoes={Object.entries(CATEGORIAS).map(([v, r]) => ({ valor: v, rotulo: r }))} /></Campo>
        <Campo rotulo="Título (opcional)" className="sm:col-span-2"><Entrada value={f.cabecalho} onChange={(e) => setF({ ...f, cabecalho: e.target.value })} /></Campo>
        <Campo rotulo="Mensagem" dica="Use {{1}}, {{2}}... para partes que mudam (ex.: nome do cliente)." className="sm:col-span-2"><AreaTexto rows={4} value={f.corpo} onChange={(e) => setF({ ...f, corpo: e.target.value })} /></Campo>
        {variaveis.map((v, i) => <Campo key={v} rotulo={`Exemplo para ${v}`}><Entrada value={f.exemplos[i] ?? ""} onChange={(e) => { const ex = [...f.exemplos]; ex[i] = e.target.value; setF({ ...f, exemplos: ex }); }} /></Campo>)}
        <Campo rotulo="Rodapé (opcional)" className="sm:col-span-2"><Entrada value={f.rodape} onChange={(e) => setF({ ...f, rodape: e.target.value })} /></Campo>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <div className="text-[12px] font-semibold text-suave uppercase">Botões (até 3)</div>
          {f.botoes.map((b: any, i: number) => (
            <div key={i} className="grid grid-cols-[150px_1fr_1fr_auto] gap-2">
              <Selecao value={b.tipo} onChange={(e) => setF({ ...f, botoes: f.botoes.map((x: any, j: number) => (j === i ? { ...x, tipo: e.target.value } : x)) })} opcoes={[{ valor: "QUICK_REPLY", rotulo: "Resposta" }, { valor: "URL", rotulo: "Link" }, { valor: "PHONE_NUMBER", rotulo: "Ligar" }]} />
              <Entrada placeholder="Texto do botão" value={b.texto} onChange={(e) => setF({ ...f, botoes: f.botoes.map((x: any, j: number) => (j === i ? { ...x, texto: e.target.value } : x)) })} />
              {b.tipo === "URL" ? <Entrada placeholder="https://..." value={b.url ?? ""} onChange={(e) => setF({ ...f, botoes: f.botoes.map((x: any, j: number) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                : b.tipo === "PHONE_NUMBER" ? <Entrada placeholder="+55..." value={b.telefone ?? ""} onChange={(e) => setF({ ...f, botoes: f.botoes.map((x: any, j: number) => (j === i ? { ...x, telefone: e.target.value } : x)) })} /> : <span />}
              <button type="button" onClick={() => setF({ ...f, botoes: f.botoes.filter((_: any, j: number) => j !== i) })} className="text-suave hover:text-vermelho"><Trash2 className="size-4" /></button>
            </div>
          ))}
          {f.botoes.length < 3 && <Botao variante="secundario" tamanho="sm" icone={<Plus className="size-3.5" />} onClick={() => setF({ ...f, botoes: [...f.botoes, { tipo: "QUICK_REPLY", texto: "" }] })}>Adicionar botão</Botao>}
        </div>
      </div>
    </Modal>
  );
}
