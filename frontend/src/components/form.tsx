import { Loader2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";

// Formulários: botões, campos, janelas (modal), confirmação e avisos (toast).

type Variante = "primario" | "secundario" | "fantasma" | "perigo" | "petroleo";
const VARIANTES: Record<Variante, string> = {
  primario: "bg-laranja-gradiente text-white shadow-[0_6px_16px_-8px_rgba(244,123,32,0.9)] hover:brightness-105",
  secundario: "bg-cartao text-texto ring-1 ring-linha-2 hover:bg-fundo",
  fantasma: "text-suave hover:bg-fundo-2 hover:text-texto",
  perigo: "bg-vermelho text-white hover:brightness-110",
  petroleo: "bg-petroleo text-white hover:bg-petroleo-claro",
};

export function Botao({ variante = "primario", carregando, icone, children, className = "", tamanho = "md", ...resto }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante; carregando?: boolean; icone?: ReactNode; tamanho?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      {...resto}
      disabled={resto.disabled || carregando}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
        tamanho === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-[13.5px]"
      } ${VARIANTES[variante]} ${className}`}
    >
      {carregando ? <Loader2 className="size-4 animate-spin" /> : icone}
      {children}
    </button>
  );
}

export function Campo({ rotulo, dica, erro, children, className = "" }: { rotulo?: ReactNode; dica?: ReactNode; erro?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      {rotulo && <span className="text-[12.5px] font-semibold text-texto">{rotulo}</span>}
      {children}
      {dica && !erro && <span className="text-[11.5px] leading-snug text-suave">{dica}</span>}
      {erro && <span className="text-[11.5px] font-medium text-vermelho">{erro}</span>}
    </label>
  );
}

const classeEntrada = "w-full rounded-xl border border-linha-2 bg-white px-3 py-2 text-[13.5px] text-texto outline-none transition placeholder:text-suave/70 focus:border-laranja focus:ring-2 focus:ring-laranja/20 disabled:bg-fundo";

export function Entrada(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`${classeEntrada} ${p.className ?? ""}`} />;
}

export function AreaTexto(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...p} className={`${classeEntrada} resize-y ${p.className ?? ""}`} />;
}

export function Selecao({ opcoes, vazio, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { opcoes: { valor: string; rotulo: string }[]; vazio?: string }) {
  return (
    <select {...p} className={`${classeEntrada} pr-8 ${p.className ?? ""}`}>
      {vazio !== undefined && <option value="">{vazio}</option>}
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </select>
  );
}

export function Interruptor({ ligado, aoMudar, rotulo, descricao, desabilitado }: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo?: ReactNode; descricao?: ReactNode; desabilitado?: boolean }) {
  return (
    <button type="button" disabled={desabilitado} onClick={() => aoMudar(!ligado)} className="flex w-full items-start gap-3 text-left disabled:opacity-60">
      <span className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${ligado ? "bg-laranja" : "bg-linha-2"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${ligado ? "left-[22px]" : "left-0.5"}`} />
      </span>
      {(rotulo || descricao) && (
        <span className="min-w-0">
          {rotulo && <span className="block text-[13.5px] font-semibold text-texto">{rotulo}</span>}
          {descricao && <span className="block text-[12px] leading-snug text-suave">{descricao}</span>}
        </span>
      )}
    </button>
  );
}

export function Modal({ titulo, aoFechar, children, rodape, largura = "max-w-lg" }: { titulo: ReactNode; aoFechar: () => void; children: ReactNode; rodape?: ReactNode; largura?: string }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aoFechar]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-[#082833]/55 backdrop-blur-[2px]" onClick={aoFechar} />
      <div className={`relative flex max-h-[92vh] w-full ${largura} flex-col rounded-t-3xl bg-cartao shadow-2xl sm:rounded-3xl`}>
        <div className="flex items-center justify-between gap-3 border-b border-linha px-5 py-4">
          <h3 className="font-titulo text-[17px] font-semibold text-texto">{titulo}</h3>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-lg p-1.5 text-suave hover:bg-fundo hover:text-texto">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <div className="flex flex-wrap justify-end gap-2 border-t border-linha px-5 py-3">{rodape}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------- avisos (toast) e confirmação ----------------

type Aviso = { id: number; texto: string; tipo: "ok" | "erro" };
const CtxAviso = createContext<{ avisar: (texto: string, tipo?: "ok" | "erro") => void; confirmar: (texto: string, opcoes?: { titulo?: string; botao?: string; perigo?: boolean }) => Promise<boolean> } | null>(null);

export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [pergunta, setPergunta] = useState<{ texto: string; titulo?: string; botao?: string; perigo?: boolean; resolver: (v: boolean) => void } | null>(null);
  const avisar = useCallback((texto: string, tipo: "ok" | "erro" = "ok") => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === "erro" ? 6000 : 3500);
  }, []);
  const confirmar = useCallback((texto: string, o: { titulo?: string; botao?: string; perigo?: boolean } = {}) =>
    new Promise<boolean>((resolver) => setPergunta({ texto, ...o, resolver })), []);
  return (
    <CtxAviso.Provider value={{ avisar, confirmar }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
          {avisos.map((a) => (
            <div key={a.id} className={`pointer-events-auto rounded-2xl px-4 py-3 text-[13.5px] font-medium text-white shadow-xl ${a.tipo === "erro" ? "bg-vermelho" : "bg-petroleo"}`}>
              {a.texto}
            </div>
          ))}
        </div>,
        document.body,
      )}
      {pergunta && (
        <Modal
          titulo={pergunta.titulo ?? "Tem certeza?"}
          aoFechar={() => { pergunta.resolver(false); setPergunta(null); }}
          largura="max-w-md"
          rodape={
            <>
              <Botao variante="secundario" onClick={() => { pergunta.resolver(false); setPergunta(null); }}>Cancelar</Botao>
              <Botao variante={pergunta.perigo ? "perigo" : "primario"} onClick={() => { pergunta.resolver(true); setPergunta(null); }}>{pergunta.botao ?? "Confirmar"}</Botao>
            </>
          }
        >
          <p className="text-[14px] leading-relaxed text-texto">{pergunta.texto}</p>
        </Modal>
      )}
    </CtxAviso.Provider>
  );
}

export function useAvisos() {
  const c = useContext(CtxAviso);
  if (!c) throw new Error("fora dos avisos");
  return c;
}

/** Executa uma ação da API mostrando carregando e o erro em aviso. */
export function useAcao() {
  const { avisar } = useAvisos();
  const [carregando, setCarregando] = useState(false);
  const executar = useCallback(async <T,>(fn: () => Promise<T>, sucesso?: string): Promise<T | undefined> => {
    setCarregando(true);
    try {
      const r = await fn();
      if (sucesso) avisar(sucesso);
      return r;
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Algo deu errado", "erro");
      return undefined;
    } finally {
      setCarregando(false);
    }
  }, [avisar]);
  return { carregando, executar };
}
