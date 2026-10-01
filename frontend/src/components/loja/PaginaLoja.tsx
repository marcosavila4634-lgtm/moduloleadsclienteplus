import { ChevronDown, Clock, MapPin, MessageCircle, Package, ShoppingBag, Star } from "lucide-react";
import { useState, type ReactNode } from "react";
import { reais } from "../../lib/formato";
import { videoEmbed, type Pagina, type Secao } from "../../lib/pagina";
import { IconeInstagram } from "../Icones";

// Desenho da página pública da loja (usado no site e na prévia do editor).

export type Produto = { id: string; nome: string; slug: string; descricao?: string; preco: number; precoAtual: number; emPromocao: boolean; midias: { url: string; tipo: string; capa?: boolean }[]; categoriaId?: string; destaque: boolean; disponivel: boolean; variacoes: any[] };
export type Vitrine = { loja: { id: string; nome: string; slug: string; whatsapp?: string }; categorias: { id: string; nome: string }[]; produtos: Produto[]; entrega: any; pagamentos: any };

const FUNDOS = { claro: "#ffffff", creme: "#f8f4ec", escuro: "#0f1d22" };

export function PaginaLoja({ pagina, vitrine, aoAbrirProduto, aoClicarSecao, selecionada, compacta }: {
  pagina: Pagina; vitrine: Vitrine; aoAbrirProduto?: (p: Produto) => void; aoClicarSecao?: (id: string) => void; selecionada?: string | null; compacta?: boolean;
}) {
  const t = pagina.tema;
  const escuro = t.fundo === "escuro";
  const r = t.cantos === "retos" ? "rounded-md" : "rounded-3xl";
  const estilo = { background: FUNDOS[t.fundo] ?? FUNDOS.creme, color: escuro ? "#f2efe9" : "#16323c", "--cor": t.cor, "--cor2": t.cor2 } as React.CSSProperties;
  const sombra = escuro ? "" : "shadow-[0_10px_30px_-18px_rgba(0,0,0,0.35)]";
  const cartao = escuro ? "bg-white/[0.06] ring-1 ring-white/10" : `bg-white ring-1 ring-black/5 ${sombra}`;
  const envolver = (s: Secao, conteudo: ReactNode) => (
    <div key={s.id} onClick={aoClicarSecao ? (e) => { e.stopPropagation(); aoClicarSecao(s.id); } : undefined}
      className={aoClicarSecao ? `cursor-pointer outline-offset-4 transition hover:outline-2 hover:outline-dashed hover:outline-[var(--cor)] ${selecionada === s.id ? "outline-2 outline-[var(--cor)]" : ""}` : ""}>
      {conteudo}
    </div>
  );
  const wrap = compacta ? "px-4" : "mx-auto max-w-6xl px-5";
  return (
    <div style={estilo} className="min-h-full font-sans">
      {pagina.secoes.filter((s) => s.visivel).map((s) => {
        switch (s.tipo) {
          case "aviso":
            return envolver(s, <div className="px-4 py-2 text-center text-[13px] font-semibold text-white" style={{ background: t.cor2 }}>{s.texto}</div>);
          case "topo":
            return envolver(s, (
              <header className="relative overflow-hidden" style={{ background: s.imagem ? `linear-gradient(90deg, rgba(0,0,0,.65), rgba(0,0,0,.15)), url(${s.imagem}) center/cover` : `linear-gradient(120deg, ${t.cor2}, ${t.cor})` }}>
                <div className={`${wrap} py-14 text-white md:py-20`}>
                  <div className="mb-6 flex items-center gap-2 font-titulo text-[15px] font-bold opacity-95"><ShoppingBag className="size-5" />{vitrine.loja.nome}</div>
                  <h1 className="max-w-2xl font-titulo text-[34px] leading-[1.1] font-extrabold md:text-[48px]">{s.titulo}</h1>
                  <p className="mt-3 max-w-xl text-[16px] opacity-90">{s.subtitulo}</p>
                  {s.botao && <a href="#produtos" className={`mt-6 inline-block px-6 py-3 font-semibold text-white ${r}`} style={{ background: t.cor }}>{s.botao}</a>}
                </div>
              </header>
            ));
          case "beneficios":
            return envolver(s, (
              <section className={`${wrap} py-10`}>
                {s.titulo && <h2 className="mb-6 text-center font-titulo text-[24px] font-bold">{s.titulo}</h2>}
                <div className={`grid gap-4 ${compacta ? "" : "md:grid-cols-3"}`}>
                  {(s.itens ?? []).map((b: any, i: number) => (
                    <div key={i} className={`${cartao} ${r} p-5 text-center`}>
                      <div className="text-3xl">{b.icone}</div>
                      <div className="mt-2 font-titulo text-[16px] font-semibold">{b.titulo}</div>
                      <div className="mt-1 text-[13.5px] opacity-75">{b.texto}</div>
                    </div>
                  ))}
                </div>
              </section>
            ));
          case "catalogo":
            return envolver(s, <Catalogo s={s} vitrine={vitrine} cartao={cartao} r={r} cor={t.cor} wrap={wrap} compacta={compacta} aoAbrir={aoAbrirProduto} />);
          case "texto_foto":
            return envolver(s, (
              <section className={`${wrap} grid items-center gap-8 py-12 ${compacta ? "" : "md:grid-cols-2"}`}>
                <div className={s.ladoImagem === "esquerda" && !compacta ? "md:order-2" : ""}>
                  <h2 className="font-titulo text-[26px] font-bold">{s.titulo}</h2>
                  <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line opacity-85">{s.texto}</p>
                </div>
                {s.imagem ? <img src={s.imagem} alt="" className={`aspect-[4/3] w-full object-cover ${r}`} /> : <div className={`grid aspect-[4/3] place-items-center ${r} opacity-40 ring-1 ring-current`}>Foto</div>}
              </section>
            ));
          case "video": {
            const src = videoEmbed(s.url ?? "");
            return envolver(s, (
              <section className={`${wrap} py-10`}>
                {s.titulo && <h2 className="mb-5 text-center font-titulo text-[24px] font-bold">{s.titulo}</h2>}
                {src ? <iframe title="vídeo" src={src} className={`aspect-video w-full ${r}`} allowFullScreen /> : s.url ? <video src={s.url} controls className={`w-full ${r}`} /> : <div className={`grid aspect-video place-items-center ${r} opacity-40 ring-1 ring-current`}>Cole o link do vídeo</div>}
              </section>
            ));
          }
          case "depoimentos":
            return envolver(s, (
              <section className={`${wrap} py-10`}>
                <h2 className="mb-6 text-center font-titulo text-[24px] font-bold">{s.titulo}</h2>
                <div className={`grid gap-4 ${compacta ? "" : "md:grid-cols-3"}`}>
                  {(s.itens ?? []).map((d: any, i: number) => (
                    <div key={i} className={`${cartao} ${r} p-5`}>
                      <div className="flex gap-0.5">{Array.from({ length: d.nota ?? 5 }).map((_, j) => <Star key={j} className="size-4 fill-amber-400 text-amber-400" />)}</div>
                      <p className="mt-2 text-[14px] italic opacity-85">“{d.texto}”</p>
                      <div className="mt-3 text-[13px] font-semibold">{d.nome}</div>
                    </div>
                  ))}
                </div>
              </section>
            ));
          case "galeria":
            return envolver(s, (
              <section className={`${wrap} py-10`}>
                {s.titulo && <h2 className="mb-5 text-center font-titulo text-[24px] font-bold">{s.titulo}</h2>}
                <div className={`grid grid-cols-2 gap-3 ${compacta ? "" : "md:grid-cols-4"}`}>
                  {(s.imagens ?? []).map((u: string, i: number) => <img key={i} src={u} alt="" className={`aspect-square w-full object-cover ${r}`} />)}
                </div>
              </section>
            ));
          case "perguntas":
            return envolver(s, <Perguntas s={s} cartao={cartao} r={r} wrap={wrap} />);
          case "contato":
            return envolver(s, (
              <footer className="mt-6 py-10 text-white" style={{ background: t.cor2 }}>
                <div className={`${wrap} grid gap-6 ${compacta ? "" : "md:grid-cols-3"}`}>
                  <div><div className="font-titulo text-[18px] font-bold">{vitrine.loja.nome}</div><p className="mt-2 text-[14px] opacity-85">{s.texto}</p></div>
                  <div className="flex flex-col gap-2 text-[14px]">
                    {s.endereco && <span className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0" />{s.endereco}</span>}
                    {s.horario && <span className="flex items-start gap-2"><Clock className="mt-0.5 size-4 shrink-0" />{s.horario}</span>}
                    {s.instagram && <a href={`https://instagram.com/${s.instagram.replace("@", "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-2"><IconeInstagram className="size-4" />@{s.instagram.replace("@", "")}</a>}
                  </div>
                  {vitrine.loja.whatsapp && (
                    <a href={`https://wa.me/${vitrine.loja.whatsapp}`} target="_blank" rel="noreferrer" className={`flex h-fit items-center justify-center gap-2 bg-[#25d366] px-5 py-3 font-semibold text-white ${r}`}>
                      <MessageCircle className="size-5" /> Falar no WhatsApp
                    </a>
                  )}
                </div>
                <div className="mt-8 text-center text-[11.5px] opacity-60">Loja feita com Gestão Plus CRM</div>
              </footer>
            ));
          default:
            return null;
        }
      })}
    </div>
  );
}

function Catalogo({ s, vitrine, cartao, r, cor, wrap, compacta, aoAbrir }: { s: Secao; vitrine: Vitrine; cartao: string; r: string; cor: string; wrap: string; compacta?: boolean; aoAbrir?: (p: Produto) => void }) {
  const [cat, setCat] = useState<string | null>(null);
  const lista = vitrine.produtos.filter((p) => !cat || p.categoriaId === cat);
  return (
    <section id="produtos" className={`${wrap} py-10`}>
      <h2 className="mb-5 text-center font-titulo text-[26px] font-bold">{s.titulo}</h2>
      {s.mostrarCategorias && vitrine.categorias.length > 0 && (
        <div className="mb-6 flex flex-wrap justify-center gap-2">
          {[{ id: null, nome: "Todos" }, ...vitrine.categorias].map((c) => (
            <button key={c.id ?? "todos"} type="button" onClick={(e) => { e.stopPropagation(); setCat(c.id); }}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold ${cat === c.id ? "text-white" : "ring-1 ring-current/20"}`} style={cat === c.id ? { background: cor } : undefined}>{c.nome}</button>
          ))}
        </div>
      )}
      {lista.length === 0 ? <div className="py-10 text-center opacity-60"><Package className="mx-auto size-8" />Nenhum produto por aqui ainda.</div> : (
        <div className={`grid grid-cols-2 gap-4 ${compacta ? "" : "md:grid-cols-3 lg:grid-cols-4"}`}>
          {lista.map((p) => {
            const capa = p.midias.find((m) => m.capa && m.tipo === "image") ?? p.midias.find((m) => m.tipo === "image");
            return (
              <button key={p.id} type="button" onClick={(e) => { e.stopPropagation(); aoAbrir?.(p); }} className={`${cartao} ${r} group overflow-hidden text-left transition hover:-translate-y-1`}>
                <div className="relative aspect-square bg-black/5">
                  {capa ? <img src={capa.url} alt={p.nome} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" /> : <div className="grid h-full place-items-center opacity-40"><Package className="size-10" /></div>}
                  {p.emPromocao && <span className="absolute top-2 left-2 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">OFERTA</span>}
                  {!p.disponivel && <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-[11.5px] font-semibold text-white">Esgotado</span>}
                </div>
                <div className="p-3">
                  <div className="line-clamp-2 text-[14px] font-semibold">{p.nome}</div>
                  <div className="mt-1.5">
                    {p.emPromocao && <span className="mr-1.5 text-[12px] line-through opacity-60">{reais(p.preco)}</span>}
                    <span className="font-titulo text-[17px] font-bold" style={{ color: cor }}>{reais(p.precoAtual)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Perguntas({ s, cartao, r, wrap }: { s: Secao; cartao: string; r: string; wrap: string }) {
  const [aberta, setAberta] = useState<number | null>(0);
  return (
    <section className={`${wrap} max-w-3xl py-10`}>
      <h2 className="mb-5 text-center font-titulo text-[24px] font-bold">{s.titulo}</h2>
      <div className="flex flex-col gap-2">
        {(s.itens ?? []).map((q: any, i: number) => (
          <div key={i} className={`${cartao} ${r} overflow-hidden`}>
            <button type="button" onClick={(e) => { e.stopPropagation(); setAberta(aberta === i ? null : i); }} className="flex w-full items-center justify-between px-5 py-3.5 text-left font-semibold">
              {q.pergunta}<ChevronDown className={`size-4 transition ${aberta === i ? "rotate-180" : ""}`} />
            </button>
            {aberta === i && <div className="px-5 pb-4 text-[14px] opacity-80">{q.resposta}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
