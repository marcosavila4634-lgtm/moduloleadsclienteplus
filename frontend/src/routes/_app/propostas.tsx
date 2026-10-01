import { createFileRoute } from "@tanstack/react-router";
import { Copy, Eye, FileSignature, Plus, Save, Send, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { BuscaContato, type ContatoMin } from "../../components/BuscaContato";
import { AreaTexto, Botao, Campo, Entrada, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { CabecalhoPagina, Card, CardNumero, Carregando, Selo, Vazio, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { del, get, post, put } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { data, num, reais, relativo } from "../../lib/formato";

export const Route = createFileRoute("/_app/propostas")({ component: Propostas });

const STATUS: Record<string, { rotulo: string; cor: "cinza" | "petroleo" | "ambar" | "verde" | "vermelho" }> = {
  draft: { rotulo: "Rascunho", cor: "cinza" }, sent: { rotulo: "Enviada", cor: "petroleo" }, viewed: { rotulo: "Visualizada", cor: "ambar" },
  accepted: { rotulo: "Aceita", cor: "verde" }, rejected: { rotulo: "Recusada", cor: "vermelho" },
};
type Item = { nome: string; descricao?: string; quantidade: number; valor: number };

function Propostas() {
  const { dados, recarregar } = useDados<any[]>("/propostas");
  const [editar, setEditar] = useState<any>(null);
  const [gerar, setGerar] = useState(false);
  const { executar } = useAcao();
  const { confirmar } = useAvisos();
  const lista = dados ?? [];
  const aceitas = lista.filter((p) => p.status === "accepted");
  const abertas = lista.filter((p) => ["sent", "viewed"].includes(p.status));
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Propostas" icone={FileSignature} descricao="Monte, mande pelo WhatsApp e acompanhe quando o cliente abre e aceita.">
        <Botao variante="secundario" icone={<Sparkles className="size-4" />} onClick={() => setGerar(true)}>Gerar com IA</Botao>
        <Botao icone={<Plus className="size-4" />} onClick={() => setEditar({ titulo: "", conteudo: { introducao: "", itens: [{ nome: "", quantidade: 1, valor: 0 }], condicoes: "" }, desconto: 0, validade: "" })}>Nova proposta</Botao>
      </CabecalhoPagina>
      <div className="grid gap-4 sm:grid-cols-3">
        <CardNumero icone={Send} rotulo="Em aberto" valor={num(abertas.length)} detalhe={reais(abertas.reduce((s, p) => s + Number(p.total), 0))} />
        <CardNumero icone={FileSignature} cor="verde" rotulo="Aceitas" valor={num(aceitas.length)} detalhe={reais(aceitas.reduce((s, p) => s + Number(p.total), 0))} />
        <CardNumero icone={Eye} cor="laranja" rotulo="Taxa de aceite" valor={`${lista.filter((p) => p.respondidaEm).length ? Math.round((aceitas.length / lista.filter((p) => p.respondidaEm).length) * 100) : 0}%`} />
      </div>
      <Card className="!p-0">
        {!dados ? <Carregando /> : lista.length === 0 ? <Vazio icone={FileSignature} titulo="Nenhuma proposta ainda" /> : (
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Proposta</th><th>Cliente</th><th>Valor</th><th>Status</th><th>Visualizações</th><th>Validade</th><th></th></tr></thead>
            <tbody>{lista.map((p) => (
              <tr key={p.id} className={`${linhaTabela} cursor-pointer`} onClick={() => get<any>(`/propostas/${p.id}`).then((x) => setEditar({ ...x, contato: p.contatoId ? { id: p.contatoId, nome: p.contatoNome } : null, validade: x.validade ?? "" }))}>
                <td className="px-4 py-2.5 font-semibold">{p.titulo}{p.geradaPorIa && <Sparkles className="ml-1 inline size-3.5 text-laranja" />}</td>
                <td>{p.contatoNome ?? "—"}</td><td className="font-semibold">{reais(p.total)}</td>
                <td><Selo cor={STATUS[p.status]?.cor}>{STATUS[p.status]?.rotulo ?? p.status}</Selo>{p.respostaNome && <div className="text-[11.5px] text-suave">por {p.respostaNome}</div>}</td>
                <td>{num(p.visualizacoes)}{p.vistaEm && <span className="text-[11.5px] text-suave"> · {relativo(p.vistaEm)}</span>}</td>
                <td>{p.validade ? data(p.validade) : "—"}</td>
                <td className="pr-3 text-right" onClick={(e) => e.stopPropagation()}><button type="button" onClick={async () => { if (await confirmar("Apagar esta proposta?", { perigo: true, botao: "Apagar" })) executar(() => del(`/propostas/${p.id}`), "Apagada").then(recarregar); }} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      {editar && <Editor inicial={editar} aoFechar={() => { setEditar(null); recarregar(); }} />}
      {gerar && <Gerar aoFechar={(p) => { setGerar(false); recarregar(); if (p) get<any>(`/propostas/${p.id}`).then((x) => setEditar({ ...x, contato: null, validade: x.validade ?? "" })); }} />}
    </div>
  );
}

function Editor({ inicial, aoFechar }: { inicial: any; aoFechar: () => void }) {
  const [p, setP] = useState<any>(inicial);
  const [contato, setContato] = useState<ContatoMin | null>(inicial.contato ?? (inicial.contatoId ? { id: inicial.contatoId } : null));
  const { dados: modelos, recarregar: recarregarModelos } = useDados<any[]>("/propostas-modelos");
  const { executar, carregando } = useAcao();
  const { avisar } = useAvisos();
  const c = p.conteudo ?? {};
  const itens: Item[] = c.itens ?? [];
  const setC = (k: string, v: any) => setP({ ...p, conteudo: { ...c, [k]: v } });
  const subtotal = itens.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor || 0), 0);
  const total = Math.max(0, subtotal - Number(p.desconto || 0));
  const corpo = () => ({ titulo: p.titulo, contatoId: contato?.id ?? null, negocioId: p.negocioId ?? null, conteudo: c, desconto: Number(p.desconto || 0), validade: p.validade || null });
  const salvar = async () => {
    const r = await executar<any>(() => (p.id ? put(`/propostas/${p.id}`, corpo()) : post("/propostas", corpo())), "Proposta salva");
    if (r) setP({ ...p, ...r, validade: r.validade ?? "" });
    return r;
  };
  return (
    <Modal titulo={p.id ? "Proposta" : "Nova proposta"} largura="max-w-3xl" aoFechar={aoFechar} rodape={
      <>
        {p.id && p.token && <Botao variante="fantasma" className="mr-auto" icone={<Copy className="size-4" />} onClick={() => { navigator.clipboard.writeText(p.link ?? `${location.origin}/p/${p.token}`); avisar("Link copiado"); }}>Copiar link</Botao>}
        <Botao variante="secundario" carregando={carregando} icone={<Save className="size-4" />} onClick={salvar}>Salvar</Botao>
        <Botao carregando={carregando} icone={<Send className="size-4" />} disabled={!contato} onClick={async () => { const r = await salvar(); if (r) executar(() => post(`/propostas/${r.id}/enviar`), "Enviada no WhatsApp do cliente ✅").then((x) => x && aoFechar()); }}>Salvar e enviar no WhatsApp</Botao>
      </>}>
      <div className="flex flex-col gap-3">
        {!p.id && (modelos ?? []).length > 0 && (
          <Campo rotulo="Começar de um modelo"><Selecao value="" vazio="Escolha um modelo..." onChange={(e) => { const m = modelos!.find((x) => x.id === e.target.value); if (m) setP({ ...p, titulo: p.titulo || m.nome, conteudo: structuredClone(m.conteudo) }); }} opcoes={(modelos ?? []).map((m) => ({ valor: m.id, rotulo: m.nome }))} /></Campo>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Título"><Entrada value={p.titulo} onChange={(e) => setP({ ...p, titulo: e.target.value })} placeholder="Proposta de serviços" /></Campo>
          <Campo rotulo="Cliente"><BuscaContato valor={contato} aoEscolher={setContato} /></Campo>
        </div>
        <Campo rotulo="Apresentação"><AreaTexto rows={3} value={c.introducao ?? ""} onChange={(e) => setC("introducao", e.target.value)} placeholder="Olá! Conforme conversamos, segue a proposta..." /></Campo>
        <div>
          <div className="mb-1.5 text-[12px] font-semibold text-suave uppercase">Itens</div>
          <div className="flex flex-col gap-2">
            {itens.map((i, k) => (
              <div key={k} className="grid grid-cols-[1fr_70px_110px_100px_auto] items-start gap-2">
                <div className="flex flex-col gap-1"><Entrada placeholder="Item" value={i.nome} onChange={(e) => setC("itens", itens.map((x, j) => (j === k ? { ...x, nome: e.target.value } : x)))} /><Entrada placeholder="Descrição (opcional)" className="!text-[12px]" value={i.descricao ?? ""} onChange={(e) => setC("itens", itens.map((x, j) => (j === k ? { ...x, descricao: e.target.value } : x)))} /></div>
                <Entrada type="number" title="Quantidade" value={i.quantidade} onChange={(e) => setC("itens", itens.map((x, j) => (j === k ? { ...x, quantidade: Number(e.target.value) } : x)))} />
                <Entrada type="number" step="0.01" title="Valor unitário" value={i.valor} onChange={(e) => setC("itens", itens.map((x, j) => (j === k ? { ...x, valor: Number(e.target.value) } : x)))} />
                <div className="py-2 text-right font-semibold">{reais(Number(i.quantidade || 0) * Number(i.valor || 0))}</div>
                <button type="button" onClick={() => setC("itens", itens.filter((_, j) => j !== k))} className="py-2 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button>
              </div>
            ))}
            <Botao variante="secundario" tamanho="sm" className="self-start" icone={<Plus className="size-3.5" />} onClick={() => setC("itens", [...itens, { nome: "", quantidade: 1, valor: 0 }])}>Adicionar item</Botao>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Desconto (R$)"><Entrada type="number" step="0.01" value={p.desconto} onChange={(e) => setP({ ...p, desconto: e.target.value })} /></Campo>
          <Campo rotulo="Válida até"><Entrada type="date" value={p.validade ?? ""} onChange={(e) => setP({ ...p, validade: e.target.value })} /></Campo>
          <div className="flex flex-col items-end justify-end"><div className="text-[12px] text-suave">Total</div><div className="font-titulo text-[24px] font-bold text-laranja">{reais(total)}</div></div>
        </div>
        <Campo rotulo="Condições (pagamento, prazo, garantia)"><AreaTexto rows={3} value={c.condicoes ?? ""} onChange={(e) => setC("condicoes", e.target.value)} /></Campo>
        <button type="button" className="self-start text-[12.5px] font-semibold text-petroleo hover:underline" onClick={() => {
          const nome = prompt("Nome do modelo:", p.titulo);
          if (nome) executar(() => post("/propostas-modelos", { nome, conteudo: c }), "Modelo salvo").then(recarregarModelos);
        }}>Salvar como modelo</button>
      </div>
    </Modal>
  );
}

function Gerar({ aoFechar }: { aoFechar: (p?: any) => void }) {
  const [contato, setContato] = useState<ContatoMin | null>(null);
  const [instrucao, setInstrucao] = useState("");
  const { executar, carregando } = useAcao();
  return (
    <Modal titulo="Gerar proposta com IA" aoFechar={() => aoFechar()} rodape={
      <Botao carregando={carregando} disabled={!contato} icone={<Sparkles className="size-4" />} onClick={() => executar(() => post<any>("/propostas/gerar", { contatoId: contato!.id, instrucao }), "Proposta gerada! Revise antes de enviar.").then((r) => r && aoFechar(r))}>Gerar</Botao>}>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-suave">A IA lê a conversa com o cliente e os produtos cadastrados e monta a proposta. Você revisa antes de mandar.</p>
        <Campo rotulo="Cliente"><BuscaContato valor={contato} aoEscolher={setContato} /></Campo>
        <Campo rotulo="O que colocar na proposta?"><AreaTexto rows={3} value={instrucao} onChange={(e) => setInstrucao(e.target.value)} placeholder="Ex.: 2 kits do produto X com 10% de desconto, entrega em 5 dias" /></Campo>
      </div>
    </Modal>
  );
}
