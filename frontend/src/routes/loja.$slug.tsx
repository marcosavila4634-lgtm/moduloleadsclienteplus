import { createFileRoute } from "@tanstack/react-router";
import { Bell, Check, ChevronLeft, ChevronRight, Copy, Minus, Package, Plus, ShoppingBag, Store, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Campo, Entrada, useAvisos } from "../components/form";
import { IconeWhatsApp } from "../components/Icones";
import { PaginaLoja, type Produto, type Vitrine } from "../components/loja/PaginaLoja";
import { Carregando } from "../components/ui";
import { get, post } from "../lib/api";
import { reais } from "../lib/formato";
import { paginaPadrao } from "../lib/pagina";

export const Route = createFileRoute("/loja/$slug")({
  validateSearch: (s: Record<string, unknown>): { carrinho?: string } => ({ carrinho: typeof s.carrinho === "string" ? s.carrinho : undefined }),
  component: () => {
    const { slug } = Route.useParams();
    const { carrinho } = Route.useSearch();
    return <Loja slug={slug} tokenCarrinho={carrinho} />;
  },
});

type Item = { produtoId: string; variacaoId?: string | null; quantidade: number };
type Cliente = { nome: string; telefone: string; pedidoToken?: string };

function ler<T>(chave: string, padrao: T): T {
  try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch { return padrao; }
}
function gravar(chave: string, v: unknown) {
  try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* navegador sem armazenamento */ }
}

export function Loja({ slug, tokenCarrinho, produtoSlug }: { slug: string; tokenCarrinho?: string; produtoSlug?: string }) {
  const [v, setV] = useState<Vitrine & { pagina?: any } | null>(null);
  const [erro, setErro] = useState(false);
  const [itens, setItens] = useState<Item[]>(() => ler(`loja:${slug}:itens`, []));
  const [cliente, setCliente] = useState<Cliente>(() => ler(`loja:${slug}:cliente`, { nome: "", telefone: "" }));
  const [aberto, setAberto] = useState<Produto | null>(null);
  const [sacola, setSacola] = useState(false);

  useEffect(() => {
    get<any>(`/publico/lojas/${slug}`).then((d) => { setV(d); document.title = d.loja.nome; }).catch(() => setErro(true));
  }, [slug]);
  useEffect(() => {
    if (!tokenCarrinho) return;
    get<any>(`/publico/lojas/${slug}/carrinho/${tokenCarrinho}`).then((c) => {
      setItens(c.itens.map((i: any) => ({ produtoId: i.produtoId, variacaoId: i.variacaoId, quantidade: i.quantidade })));
      setCliente({ nome: c.nome ?? "", telefone: c.telefone ?? "", pedidoToken: c.pedidoToken });
      setSacola(true);
    }).catch(() => undefined);
  }, [tokenCarrinho]);
  useEffect(() => { if (v && produtoSlug) setAberto(v.produtos.find((p) => p.slug === produtoSlug) ?? null); }, [v, produtoSlug]);
  useEffect(() => gravar(`loja:${slug}:itens`, itens), [itens]);
  useEffect(() => gravar(`loja:${slug}:cliente`, cliente), [cliente]);

  if (erro) return <div className="grid min-h-screen place-items-center bg-fundo p-8 text-center"><div><Store className="mx-auto size-12 text-suave" /><p className="mt-3 font-titulo text-xl font-bold">Loja não encontrada</p></div></div>;
  if (!v) return <div className="min-h-screen bg-fundo"><Carregando /></div>;
  const pagina = v.pagina ?? paginaPadrao(v.loja.nome);
  const cor = pagina.tema.cor;
  const qtd = itens.reduce((s, i) => s + i.quantidade, 0);
  const adicionar = (i: Item) => {
    setItens((l) => {
      const ja = l.find((x) => x.produtoId === i.produtoId && (x.variacaoId ?? null) === (i.variacaoId ?? null));
      return ja ? l.map((x) => (x === ja ? { ...x, quantidade: x.quantidade + i.quantidade } : x)) : [...l, i];
    });
    setAberto(null);
    setSacola(true);
  };

  return (
    <div className="min-h-screen">
      <PaginaLoja pagina={pagina} vitrine={v} aoAbrirProduto={setAberto} />
      {qtd > 0 && !sacola && (
        <button type="button" onClick={() => setSacola(true)} style={{ background: cor }} className="fixed right-5 bottom-5 z-30 flex items-center gap-2 rounded-full px-5 py-3.5 font-bold text-white shadow-2xl">
          <ShoppingBag className="size-5" /> Sacola ({qtd})
        </button>
      )}
      {aberto && <ModalProduto p={aberto} slug={slug} cor={cor} cliente={cliente} setCliente={setCliente} aoFechar={() => setAberto(null)} aoAdicionar={adicionar} />}
      {sacola && <Sacola v={v} slug={slug} cor={cor} itens={itens} setItens={setItens} cliente={cliente} setCliente={setCliente} aoFechar={() => setSacola(false)} />}
    </div>
  );
}

function Midias({ p }: { p: Produto & { variacaoMidia?: string } }) {
  const midias = p.variacaoMidia ? [{ url: p.variacaoMidia, tipo: "image" }, ...p.midias] : p.midias;
  const [i, setI] = useState(0);
  const m = midias[Math.min(i, midias.length - 1)];
  if (!m) return <div className="grid aspect-square place-items-center bg-black/5"><Package className="size-14 opacity-30" /></div>;
  return (
    <div className="relative aspect-square bg-black">
      {m.tipo === "video" ? <video src={m.url} controls playsInline className="h-full w-full object-contain" /> : <img src={m.url} alt={p.nome} className="h-full w-full object-contain" />}
      {midias.length > 1 && (
        <>
          <button type="button" onClick={() => setI((i - 1 + midias.length) % midias.length)} className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-white/85 p-1.5"><ChevronLeft className="size-5" /></button>
          <button type="button" onClick={() => setI((i + 1) % midias.length)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-white/85 p-1.5"><ChevronRight className="size-5" /></button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">{midias.map((_, j) => <span key={j} className={`size-2 rounded-full ${j === i ? "bg-white" : "bg-white/45"}`} />)}</div>
        </>
      )}
    </div>
  );
}

function Gaveta({ titulo, aoFechar, children, rodape, lado = "direita" }: { titulo: string; aoFechar: () => void; children: React.ReactNode; rodape?: React.ReactNode; lado?: "direita" | "centro" }) {
  return (
    <div className="fixed inset-0 z-40 flex bg-black/45 backdrop-blur-[2px]" onClick={aoFechar}>
      <div onClick={(e) => e.stopPropagation()} className={`flex max-h-full w-full flex-col bg-white text-[#16323c] shadow-2xl ${lado === "direita" ? "ml-auto h-full max-w-md" : "m-auto max-h-[92vh] max-w-3xl overflow-hidden rounded-3xl"}`}>
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-3.5"><div className="font-titulo text-[17px] font-bold">{titulo}</div><button type="button" onClick={aoFechar} className="rounded-full p-1.5 hover:bg-black/5"><X className="size-5" /></button></div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {rodape && <div className="border-t border-black/5 p-4">{rodape}</div>}
      </div>
    </div>
  );
}

function ModalProduto({ p, slug, cor, cliente, setCliente, aoFechar, aoAdicionar }: { p: Produto; slug: string; cor: string; cliente: Cliente; setCliente: (c: Cliente) => void; aoFechar: () => void; aoAdicionar: (i: Item) => void }) {
  const [variacao, setVariacao] = useState<any>(null);
  const [qtd, setQtd] = useState(1);
  const [avise, setAvise] = useState(false);
  const [avisado, setAvisado] = useState(false);
  const { avisar } = useAvisos();
  const temVariacoes = p.variacoes.length > 0;
  const disponivel = temVariacoes ? (variacao ? variacao.disponivel : p.variacoes.some((x) => x.disponivel)) : p.disponivel;
  const preco = variacao ? variacao.precoAtual : p.precoAtual;
  return (
    <Gaveta titulo={p.nome} aoFechar={aoFechar} lado="centro">
      <div className="grid md:grid-cols-2">
        <Midias p={{ ...p, variacaoMidia: variacao?.midiaUrl }} />
        <div className="flex flex-col gap-4 p-5">
          <div>
            <div className="font-titulo text-[22px] font-bold">{p.nome}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-titulo text-[24px] font-extrabold" style={{ color: cor }}>{reais(preco)}</span>
              {p.emPromocao && <span className="text-[14px] text-black/40 line-through">{reais(variacao?.preco ?? p.preco)}</span>}
            </div>
          </div>
          {p.descricao && <p className="text-[14px] leading-relaxed whitespace-pre-line text-black/70">{p.descricao}</p>}
          {temVariacoes && (
            <div>
              <div className="mb-2 text-[13px] font-semibold">Escolha uma opção</div>
              <div className="flex flex-wrap gap-2">
                {p.variacoes.map((x) => (
                  <button key={x.id} type="button" onClick={() => setVariacao(x)} style={variacao?.id === x.id ? { borderColor: cor, background: `${cor}14` } : undefined}
                    className={`rounded-xl border-2 px-3 py-2 text-[13px] font-semibold ${x.disponivel ? "border-black/10" : "border-dashed border-black/10 text-black/40"}`}>{x.nome}{!x.disponivel && " · esgotado"}</button>
                ))}
              </div>
            </div>
          )}
          {disponivel || (temVariacoes && !variacao) ? (
            <div className="mt-auto flex items-center gap-3">
              <div className="flex items-center rounded-xl border border-black/10">
                <button type="button" onClick={() => setQtd(Math.max(1, qtd - 1))} className="p-2.5"><Minus className="size-4" /></button>
                <span className="w-8 text-center font-bold">{qtd}</span>
                <button type="button" onClick={() => setQtd(qtd + 1)} className="p-2.5"><Plus className="size-4" /></button>
              </div>
              <button type="button" disabled={temVariacoes && !variacao} onClick={() => aoAdicionar({ produtoId: p.id, variacaoId: variacao?.id ?? null, quantidade: qtd })}
                style={{ background: cor }} className="flex-1 rounded-xl py-3 font-bold text-white disabled:opacity-50">
                {temVariacoes && !variacao ? "Escolha uma opção" : `Adicionar · ${reais(preco * qtd)}`}
              </button>
            </div>
          ) : avisado ? (
            <div className="mt-auto flex items-center gap-2 rounded-xl bg-green-50 p-3 text-[13.5px] font-semibold text-green-700"><Check className="size-5" /> Pronto! Avisaremos no seu WhatsApp quando chegar.</div>
          ) : avise ? (
            <div className="mt-auto flex flex-col gap-2">
              <Entrada placeholder="Seu nome" value={cliente.nome} onChange={(e) => setCliente({ ...cliente, nome: e.target.value })} />
              <Entrada placeholder="Seu WhatsApp com DDD" inputMode="tel" value={cliente.telefone} onChange={(e) => setCliente({ ...cliente, telefone: e.target.value })} />
              <button type="button" style={{ background: cor }} className="rounded-xl py-3 font-bold text-white"
                onClick={() => post(`/publico/lojas/${slug}/avise-me`, { produtoId: p.id, variacaoId: variacao?.id, nome: cliente.nome, telefone: cliente.telefone }).then(() => setAvisado(true)).catch((e) => avisar(e.message, "erro"))}>Quero ser avisado</button>
            </div>
          ) : (
            <div className="mt-auto flex flex-col gap-2">
              <div className="rounded-xl bg-black/5 p-3 text-center text-[13.5px] font-semibold">Esgotado no momento</div>
              <button type="button" onClick={() => setAvise(true)} style={{ borderColor: cor, color: cor }} className="flex items-center justify-center gap-2 rounded-xl border-2 py-3 font-bold"><Bell className="size-4" /> Avise-me quando chegar</button>
            </div>
          )}
        </div>
      </div>
    </Gaveta>
  );
}

const NOMES_PAGAMENTO: Record<string, string> = { pix: "Pix", cartao_entrega: "Cartão na entrega", dinheiro: "Dinheiro", combinar: "Combinar pelo WhatsApp", link: "Link de pagamento" };

function Sacola({ v, slug, cor, itens, setItens, cliente, setCliente, aoFechar }: {
  v: Vitrine; slug: string; cor: string; itens: Item[]; setItens: (f: (l: Item[]) => Item[]) => void; cliente: Cliente; setCliente: (c: Cliente) => void; aoFechar: () => void;
}) {
  const [etapa, setEtapa] = useState<"sacola" | "dados" | "feito">("sacola");
  const [cupom, setCupom] = useState("");
  const [calc, setCalc] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const entrega = v.entrega ?? {};
  const podeEntregar = entrega.entrega !== false;
  const podeRetirar = !!entrega.retirada;
  const [f, setF] = useState({ entregaTipo: podeEntregar ? "entrega" : "retirada", formaPagamento: v.pagamentos?.formas?.includes("pix") && v.pagamentos?.pix ? "pix" : v.pagamentos?.formas?.[0] ?? "combinar", endereco: { cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "" }, observacoes: "", email: "" });
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<any>(null);
  const { avisar } = useAvisos();
  const porId = useMemo(() => new Map(v.produtos.map((p) => [p.id, p])), [v]);
  const visiveis = itens.filter((i) => porId.has(i.produtoId));

  useEffect(() => {
    if (!visiveis.length) { setCalc(null); return; }
    const t = setTimeout(() => post<any>(`/publico/lojas/${slug}/calcular`, { itens: visiveis, cupom: cupom || undefined, entregaTipo: f.entregaTipo }).then((c) => { setCalc(c); setErro(null); }).catch((e) => setErro(e.message)), 350);
    return () => clearTimeout(t);
  }, [JSON.stringify(visiveis), cupom, f.entregaTipo]);

  const tel = cliente.telefone.replace(/\D/g, "");
  const salvarCarrinho = () => {
    if (tel.length < 10) return;
    post<any>(`/publico/lojas/${slug}/carrinho`, { nome: cliente.nome, telefone: tel, itens: visiveis, pedidoToken: cliente.pedidoToken }).then((r) => setCliente({ ...cliente, pedidoToken: r.pedidoToken })).catch(() => undefined);
  };
  const finalizar = async () => {
    if (!cliente.nome.trim() || tel.length < 10) return avisar("Preencha seu nome e WhatsApp com DDD", "erro");
    if (f.entregaTipo === "entrega" && (!f.endereco.rua || !f.endereco.numero || !f.endereco.bairro)) return avisar("Preencha o endereço de entrega", "erro");
    setEnviando(true);
    try {
      const r = await post<any>(`/publico/lojas/${slug}/pedidos`, { nome: cliente.nome, telefone: tel, email: f.email || undefined, itens: visiveis, cupom: cupom || undefined, formaPagamento: f.formaPagamento, entregaTipo: f.entregaTipo, endereco: f.entregaTipo === "entrega" ? f.endereco : null, observacoes: f.observacoes || undefined, pedidoToken: cliente.pedidoToken });
      setFeito(r);
      setEtapa("feito");
      setItens(() => []);
      setCliente({ nome: cliente.nome, telefone: cliente.telefone });
    } catch (e: any) {
      avisar(e.message, "erro");
    } finally {
      setEnviando(false);
    }
  };
  const botao = (texto: React.ReactNode, onClick: () => void, desab = false) => (
    <button type="button" disabled={desab || enviando} onClick={onClick} style={{ background: cor }} className="w-full rounded-xl py-3.5 font-bold text-white disabled:opacity-50">{enviando ? "Enviando..." : texto}</button>
  );
  const resumo = calc && (
    <div className="flex flex-col gap-1 text-[13.5px]">
      <div className="flex justify-between"><span>Subtotal</span><span>{reais(calc.subtotal)}</span></div>
      {calc.desconto > 0 && <div className="flex justify-between text-green-700"><span>Desconto</span><span>- {reais(calc.desconto)}</span></div>}
      <div className="flex justify-between"><span>Frete</span><span>{calc.frete > 0 ? reais(calc.frete) : "Grátis"}</span></div>
      <div className="mt-1 flex justify-between font-titulo text-[18px] font-bold"><span>Total</span><span>{reais(calc.total)}</span></div>
    </div>
  );

  if (etapa === "feito" && feito) {
    return (
      <Gaveta titulo="Pedido feito!" aoFechar={aoFechar}>
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          <div className="grid size-16 place-items-center rounded-full text-white" style={{ background: cor }}><Check className="size-8" /></div>
          <div><div className="font-titulo text-[22px] font-bold">Pedido #{feito.numero}</div><div className="text-black/60">Total {reais(feito.total)}</div></div>
          {feito.pix && (
            <div className="w-full rounded-2xl bg-black/[0.04] p-4 text-left">
              <div className="mb-2 text-[13.5px] font-semibold">Pague com Pix copia e cola:</div>
              <div className="max-h-24 overflow-y-auto rounded-lg bg-white p-2 font-mono text-[11px] break-all">{feito.pix}</div>
              <button type="button" onClick={() => { navigator.clipboard.writeText(feito.pix); avisar("Código Pix copiado!"); }} style={{ background: cor }} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold text-white"><Copy className="size-4" /> Copiar código Pix</button>
            </div>
          )}
          {feito.whatsapp && <a href={feito.whatsapp} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25d366] py-3 font-bold text-white"><IconeWhatsApp className="size-5" /> Falar com a loja no WhatsApp</a>}
          <a href={`/pedido/${feito.token}`} className="text-[13.5px] font-semibold underline" style={{ color: cor }}>Acompanhar meu pedido</a>
        </div>
      </Gaveta>
    );
  }

  if (etapa === "dados") {
    const e = f.endereco;
    const setE = (k: keyof typeof e) => (ev: { target: { value: string } }) => setF({ ...f, endereco: { ...e, [k]: ev.target.value } });
    return (
      <Gaveta titulo="Finalizar pedido" aoFechar={aoFechar} rodape={<div className="flex flex-col gap-3">{resumo}{botao("Fazer pedido", finalizar, !calc)}</div>}>
        <div className="flex flex-col gap-3 p-5">
          <button type="button" onClick={() => setEtapa("sacola")} className="w-fit text-[13px] font-semibold text-black/50">← Voltar para a sacola</button>
          <Campo rotulo="Seu nome"><Entrada value={cliente.nome} onChange={(ev) => setCliente({ ...cliente, nome: ev.target.value })} /></Campo>
          <Campo rotulo="WhatsApp com DDD"><Entrada inputMode="tel" value={cliente.telefone} onBlur={salvarCarrinho} onChange={(ev) => setCliente({ ...cliente, telefone: ev.target.value })} placeholder="(11) 99999-9999" /></Campo>
          {podeEntregar && podeRetirar && (
            <div className="grid grid-cols-2 gap-2">
              {["entrega", "retirada"].map((t) => (
                <button key={t} type="button" onClick={() => setF({ ...f, entregaTipo: t })} style={f.entregaTipo === t ? { borderColor: cor, background: `${cor}14` } : undefined} className="rounded-xl border-2 border-black/10 py-2.5 text-[13.5px] font-semibold">{t === "entrega" ? "Receber em casa" : "Retirar na loja"}</button>
              ))}
            </div>
          )}
          {f.entregaTipo === "entrega" ? (
            <div className="grid grid-cols-6 gap-2">
              <Entrada className="col-span-2" placeholder="CEP" value={e.cep} onChange={setE("cep")} onBlur={async () => {
                const cep = e.cep.replace(/\D/g, "");
                if (cep.length !== 8) return;
                try { const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json()); if (!r.erro) setF((a) => ({ ...a, endereco: { ...a.endereco, rua: r.logradouro || a.endereco.rua, bairro: r.bairro || a.endereco.bairro, cidade: r.localidade ? `${r.localidade}/${r.uf}` : a.endereco.cidade } })); } catch { /* sem internet para o CEP */ }
              }} />
              <Entrada className="col-span-4" placeholder="Rua" value={e.rua} onChange={setE("rua")} />
              <Entrada className="col-span-2" placeholder="Número" value={e.numero} onChange={setE("numero")} />
              <Entrada className="col-span-4" placeholder="Complemento" value={e.complemento} onChange={setE("complemento")} />
              <Entrada className="col-span-3" placeholder="Bairro" value={e.bairro} onChange={setE("bairro")} />
              <Entrada className="col-span-3" placeholder="Cidade" value={e.cidade} onChange={setE("cidade")} />
              {entrega.prazo && <p className="col-span-6 text-[12.5px] text-black/55">Prazo: {entrega.prazo}</p>}
            </div>
          ) : entrega.endereco_retirada && <p className="rounded-xl bg-black/[0.04] p-3 text-[13px]">Retirada em: <b>{entrega.endereco_retirada}</b></p>}
          <div>
            <div className="mb-1.5 text-[13px] font-semibold">Forma de pagamento</div>
            <div className="flex flex-col gap-1.5">
              {(v.pagamentos?.formas ?? ["combinar"]).filter((x: string) => x !== "pix" || v.pagamentos?.pix).map((x: string) => (
                <label key={x} className="flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 px-3 py-2.5 text-[13.5px]">
                  <input type="radio" checked={f.formaPagamento === x} onChange={() => setF({ ...f, formaPagamento: x })} style={{ accentColor: cor }} /> {NOMES_PAGAMENTO[x] ?? x}
                </label>
              ))}
            </div>
          </div>
          <Campo rotulo="Observações (opcional)"><Entrada value={f.observacoes} onChange={(ev) => setF({ ...f, observacoes: ev.target.value })} /></Campo>
        </div>
      </Gaveta>
    );
  }

  return (
    <Gaveta titulo="Sua sacola" aoFechar={aoFechar} rodape={visiveis.length > 0 && (
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Entrada placeholder="Cupom de desconto" value={cupom} onChange={(e) => setCupom(e.target.value.toUpperCase())} />
        </div>
        {calc?.erroCupom && cupom && <div className="text-[12.5px] text-red-600">{calc.erroCupom}</div>}
        {erro && <div className="text-[12.5px] text-red-600">{erro}</div>}
        {resumo}
        {entrega.gratis_acima > 0 && calc && calc.subtotal < entrega.gratis_acima && <div className="text-[12.5px] text-black/60">Faltam <b>{reais(entrega.gratis_acima - calc.subtotal)}</b> para frete grátis 🚚</div>}
        {botao("Continuar", () => setEtapa("dados"), !calc || !!erro)}
      </div>
    )}>
      {visiveis.length === 0 ? (
        <div className="grid place-items-center gap-2 p-10 text-center text-black/50"><ShoppingBag className="size-10" />Sua sacola está vazia</div>
      ) : (
        <div className="flex flex-col divide-y divide-black/5">
          {visiveis.map((i, idx) => {
            const p = porId.get(i.produtoId)!;
            const vr = p.variacoes.find((x) => x.id === i.variacaoId);
            const capa = p.midias.find((m) => m.tipo === "image");
            const mudar = (q: number) => setItens((l) => (q <= 0 ? l.filter((x) => x !== i) : l.map((x) => (x === i ? { ...x, quantidade: q } : x))));
            return (
              <div key={idx} className="flex gap-3 p-4">
                {capa ? <img src={vr?.midiaUrl ?? capa.url} alt="" className="size-16 rounded-xl object-cover" /> : <div className="grid size-16 place-items-center rounded-xl bg-black/5"><Package className="size-6 opacity-40" /></div>}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{p.nome}</div>
                  {vr && <div className="text-[12.5px] text-black/55">{vr.nome}</div>}
                  <div className="mt-1 flex items-center gap-2">
                    <button type="button" onClick={() => mudar(i.quantidade - 1)} className="rounded-lg border border-black/10 p-1"><Minus className="size-3.5" /></button>
                    <span className="w-6 text-center text-[13.5px] font-bold">{i.quantidade}</span>
                    <button type="button" onClick={() => mudar(i.quantidade + 1)} className="rounded-lg border border-black/10 p-1"><Plus className="size-3.5" /></button>
                    <button type="button" onClick={() => mudar(0)} className="ml-1 text-black/40 hover:text-red-600"><Trash2 className="size-4" /></button>
                  </div>
                </div>
                <div className="font-bold">{reais((vr?.precoAtual ?? p.precoAtual) * i.quantidade)}</div>
              </div>
            );
          })}
        </div>
      )}
    </Gaveta>
  );
}

