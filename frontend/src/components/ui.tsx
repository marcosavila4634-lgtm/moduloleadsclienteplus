import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, ArrowUp, CircleHelp, Loader2, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { corDe, iniciais } from "../lib/formato";
import { urlArquivo } from "../lib/api";

// Peças visuais comuns (cards, títulos, números, abas, avisos).

export function Card({ children, className = "", tour }: { children: ReactNode; className?: string; tour?: string }) {
  return (
    <section data-tour={tour} className={`sombra-cartao rounded-2xl border border-linha bg-cartao p-4 ${className}`}>
      {children}
    </section>
  );
}

export function TituloCard({ icone: Icone, cor = "text-laranja", children, acao }: { icone?: LucideIcon; cor?: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5 font-titulo text-[15px] font-semibold text-texto">
        {Icone && <Icone className={`size-[18px] ${cor}`} />}
        {children}
      </h2>
      {acao}
    </div>
  );
}

export function VerTodos({ para, children = "Ver todos" }: { para: string; children?: ReactNode }) {
  return (
    <Link to={para} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold whitespace-nowrap text-laranja hover:underline">
      {children}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

export function CabecalhoPagina({ titulo, descricao, icone: Icone, children }: { titulo: string; descricao?: ReactNode; icone?: LucideIcon; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {Icone && (
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-laranja-gradiente text-white shadow-[0_8px_20px_-10px_rgba(244,123,32,0.9)]">
            <Icone className="size-[22px]" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-titulo text-[24px] leading-tight font-bold text-texto md:text-[26px]">{titulo}</h1>
          {descricao && <p className="mt-0.5 max-w-3xl text-sm text-suave">{descricao}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 print:hidden">{children}</div>}
    </div>
  );
}

export function Variacao({ valor, invertido = false }: { valor: number | null | undefined; invertido?: boolean }) {
  if (valor == null || Number.isNaN(valor)) return null;
  const subiu = valor >= 0;
  const bom = invertido ? !subiu : subiu;
  const Seta = subiu ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[13px] font-bold ${bom ? "text-verde" : "text-vermelho"}`}>
      <Seta className="size-3.5" strokeWidth={3} />
      {Math.abs(Math.round(valor))}%
    </span>
  );
}

const CORES_ICONE = {
  petroleo: "bg-petroleo",
  laranja: "bg-laranja",
  ambar: "bg-ambar",
  vermelho: "bg-vermelho",
  verde: "bg-verde",
  azul: "bg-sky-600",
  roxo: "bg-violet-600",
} as const;
export type CorIcone = keyof typeof CORES_ICONE;

/** Número de destaque com ícone redondo (igual aos cards do topo da foto de referência). */
export function CardNumero({ icone: Icone, cor = "petroleo", rotulo, valor, variacao, detalhe, invertido, tour }: {
  icone: LucideIcon; cor?: CorIcone; rotulo: string; valor: ReactNode; variacao?: number | null; detalhe?: ReactNode; invertido?: boolean; tour?: string;
}) {
  return (
    <Card className="flex items-center gap-3 !px-3.5 !py-3.5" tour={tour}>
      <span className={`grid size-11 shrink-0 place-items-center rounded-full text-white ${CORES_ICONE[cor]}`}>
        <Icone className="size-[21px]" />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="text-[12.5px] font-semibold text-texto">{rotulo}</div>
        <div className="mt-0.5 font-titulo text-[20px] font-bold whitespace-nowrap text-texto">{valor}</div>
        {variacao !== undefined && <Variacao valor={variacao} invertido={invertido} />}
        {detalhe && <div className="mt-0.5 text-[11.5px] text-suave">{detalhe}</div>}
      </div>
    </Card>
  );
}

export function Abas<T extends string>({ abas, valor, aoMudar, tour }: { abas: { valor: T; rotulo: string; quantidade?: number | null }[]; valor: T; aoMudar: (v: T) => void; tour?: string }) {
  return (
    <div data-tour={tour} className="flex flex-wrap gap-1.5">
      {abas.map((a) => (
        <button
          key={a.valor}
          type="button"
          onClick={() => aoMudar(a.valor)}
          className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
            valor === a.valor ? "bg-laranja-gradiente text-white shadow-[0_6px_16px_-8px_rgba(244,123,32,0.9)]" : "bg-cartao text-suave ring-1 ring-linha hover:text-texto"
          }`}
        >
          {a.rotulo}
          {a.quantidade != null && a.quantidade > 0 && (
            <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${valor === a.valor ? "bg-white/25" : "bg-fundo-2 text-texto"}`}>{a.quantidade}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Vazio({ icone: Icone, titulo, children, acao }: { icone: LucideIcon; titulo?: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="px-5 py-12 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-fundo-2 text-petroleo">
        <Icone className="size-7" />
      </span>
      {titulo && <div className="mt-3 font-titulo text-[15px] font-semibold text-texto">{titulo}</div>}
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-suave">{children}</div>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}

export function Dica({ icone: Icone = CircleHelp, children, cor = "petroleo" }: { icone?: LucideIcon; children: ReactNode; cor?: "petroleo" | "laranja" | "verde" | "vermelho" }) {
  const cores = {
    petroleo: "border-petroleo/20 bg-petroleo/[0.06] text-petroleo",
    laranja: "border-laranja/30 bg-laranja/[0.08] text-[#9a4a0c]",
    verde: "border-verde/25 bg-verde/[0.07] text-[#11672f]",
    vermelho: "border-vermelho/25 bg-vermelho/[0.07] text-[#a4262b]",
  };
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-[13px] leading-relaxed ${cores[cor]}`}>
      <Icone className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Selo({ children, cor = "cinza", className = "" }: { children: ReactNode; cor?: "cinza" | "verde" | "laranja" | "vermelho" | "petroleo" | "azul" | "roxo" | "ambar"; className?: string }) {
  const cores = {
    cinza: "bg-fundo-2 text-suave",
    verde: "bg-green-100 text-green-800",
    laranja: "bg-orange-100 text-orange-800",
    vermelho: "bg-red-100 text-red-700",
    petroleo: "bg-teal-100 text-teal-800",
    azul: "bg-sky-100 text-sky-800",
    roxo: "bg-violet-100 text-violet-800",
    ambar: "bg-amber-100 text-amber-800",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${cores[cor]} ${className}`}>{children}</span>;
}

export function Tag({ nome, cor }: { nome: string; cor?: string | null }) {
  const c = cor ?? "#6b7a80";
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold whitespace-nowrap" style={{ background: `${c}1f`, color: c }}>
      <span className="size-1.5 rounded-full" style={{ background: c }} />
      {nome}
    </span>
  );
}

/** Imagem de arquivo privado (baixa com o token). */
export function ImagemArquivo({ url, className = "", alt = "" }: { url?: string | null; className?: string; alt?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    urlArquivo(url)?.then((s) => vivo && setSrc(s)).catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [url]);
  if (!src) return <div className={`animate-pulse bg-fundo-2 ${className}`} />;
  return <img src={src} alt={alt} className={className} loading="lazy" />;
}

export function Avatar({ nome, foto, tamanho = 40, className = "" }: { nome?: string | null; foto?: string | null; tamanho?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    setSrc(null);
    urlArquivo(foto)?.then((s) => vivo && setSrc(s)).catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [foto]);
  const estilo = { width: tamanho, height: tamanho, fontSize: tamanho * 0.36 };
  if (src) return <img src={src} alt="" style={estilo} className={`shrink-0 rounded-full object-cover ${className}`} />;
  return (
    <span style={{ ...estilo, background: corDe(nome) }} className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${className}`}>
      {iniciais(nome)}
    </span>
  );
}

export function Carregando({ texto = "Carregando..." }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-suave">
      <Loader2 className="size-5 animate-spin text-laranja" />
      {texto}
    </div>
  );
}

export function Barra({ valor, total, cor = "bg-laranja-gradiente" }: { valor: number; total: number; cor?: string }) {
  const p = total <= 0 ? 0 : Math.min(100, Math.round((valor / total) * 100));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-fundo-2">
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${p}%` }} />
    </div>
  );
}

export const cabecalhoTabela = "border-b border-linha text-left text-[11px] font-semibold tracking-wide text-suave uppercase";
export const linhaTabela = "border-b border-linha/70 last:border-0 hover:bg-fundo/60";
