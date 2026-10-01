import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, GraduationCap, PlayCircle, RotateCcw, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { del, get, put } from "../lib/api";
import { Botao, Modal } from "./form";

// Tutorial guiado: passos cadastrados pelo admin da plataforma (Admin → Tutorial).
// Cada passo pode abrir uma tela (rota) e destacar um elemento (data-tour="...").

type Passo = { id: string; trilha: string; ordem: number; titulo: string; texto: string; rota?: string | null; alvo?: string | null; posicao: string; imagemUrl?: string | null; videoUrl?: string | null; icone?: string | null };
type Trilha = { chave: string; nome: string; descricao?: string; icone?: string };
type Progresso = { trilha: string; passo: number; concluidoEm?: string | null; pulou: boolean };
type Dados = { trilhas: Trilha[]; passos: Passo[]; progresso: Progresso[] };

const Ctx = createContext<{ iniciar: (trilha: string) => void; abrirCentral: () => void } | null>(null);
export const useTutorial = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("fora do tutorial");
  return c;
};

export function ProvedorTutorial({ children }: { children: ReactNode }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [ativa, setAtiva] = useState<{ trilha: string; indice: number } | null>(null);
  const [central, setCentral] = useState(false);

  const carregar = useCallback(() => get<Dados>("/tutorial").then(setDados).catch(() => undefined), []);
  useEffect(() => {
    carregar().then(() => undefined);
  }, [carregar]);

  // primeiro acesso: abre "Primeiros passos" sozinho
  useEffect(() => {
    if (!dados || ativa) return;
    const p = dados.progresso.find((x) => x.trilha === "inicio");
    if (!p && dados.passos.some((x) => x.trilha === "inicio")) setTimeout(() => setAtiva({ trilha: "inicio", indice: 0 }), 900);
  }, [dados]);

  const passos = useMemo(() => (ativa && dados ? dados.passos.filter((p) => p.trilha === ativa.trilha).sort((a, b) => a.ordem - b.ordem) : []), [ativa, dados]);

  const salvar = (trilha: string, passo: number, concluido: boolean, pulou: boolean) =>
    put("/tutorial/progresso", { trilha, passo, concluido, pulou }).then(carregar).catch(() => undefined);

  const valor = {
    // busca de novo antes de começar (o admin pode ter acabado de editar)
    iniciar: (trilha: string) => {
      setCentral(false);
      carregar().then(() => setAtiva({ trilha, indice: 0 }));
    },
    abrirCentral: () => setCentral(true),
  };

  return (
    <Ctx.Provider value={valor}>
      {children}
      {ativa && passos.length > 0 && (
        <Balao
          passo={passos[ativa.indice]}
          indice={ativa.indice}
          total={passos.length}
          aoVoltar={() => setAtiva({ ...ativa, indice: Math.max(0, ativa.indice - 1) })}
          aoAvancar={() => {
            if (ativa.indice + 1 >= passos.length) {
              salvar(ativa.trilha, passos.length, true, false);
              setAtiva(null);
            } else {
              salvar(ativa.trilha, ativa.indice + 1, false, false);
              setAtiva({ ...ativa, indice: ativa.indice + 1 });
            }
          }}
          aoPular={() => {
            salvar(ativa.trilha, ativa.indice, false, true);
            setAtiva(null);
          }}
        />
      )}
      {central && dados && (
        <Modal titulo="Central de ajuda e tutoriais" aoFechar={() => setCentral(false)} largura="max-w-2xl">
          <p className="mb-4 text-sm text-suave">Escolha um assunto e o sistema te mostra, passo a passo, como usar. É só apertar <b>Próximo</b> em cada parte.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {dados.trilhas.map((t) => {
              const total = dados.passos.filter((p) => p.trilha === t.chave).length;
              const pr = dados.progresso.find((p) => p.trilha === t.chave);
              const feito = !!pr?.concluidoEm;
              return (
                <button key={t.chave} type="button" onClick={() => valor.iniciar(t.chave)}
                  className="group flex items-start gap-3 rounded-2xl border border-linha bg-fundo/50 p-4 text-left transition hover:border-laranja hover:bg-white">
                  <span className="text-3xl leading-none">{t.icone ?? "📘"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-titulo text-[14.5px] font-semibold text-texto">
                      {t.nome}
                      {feito && <Check className="size-4 text-verde" />}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-suave">{t.descricao}</span>
                    <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-laranja">
                      <PlayCircle className="size-4" /> {feito ? "Ver de novo" : "Começar"} · {total} passos
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <Botao variante="fantasma" icone={<RotateCcw className="size-4" />} onClick={() => del("/tutorial/progresso").then(carregar)}>
              Zerar meu progresso
            </Botao>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}

function Balao({ passo, indice, total, aoVoltar, aoAvancar, aoPular }: { passo: Passo; indice: number; total: number; aoVoltar: () => void; aoAvancar: () => void; aoPular: () => void }) {
  const navigate = useNavigate();
  const caminho = useRouterState({ select: (s) => s.location.pathname });
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pronto, setPronto] = useState(false);

  // vai para a tela do passo
  useEffect(() => {
    if (passo.rota && !caminho.startsWith(passo.rota)) navigate({ to: passo.rota });
  }, [passo.id]);

  // acha o elemento destacado (espera a tela carregar)
  useLayoutEffect(() => {
    setPronto(false);
    setRect(null);
    if (!passo.alvo) {
      setPronto(true);
      return;
    }
    let tentativas = 0;
    let parar = false;
    const achar = () => {
      if (parar) return;
      const el = document.querySelector<HTMLElement>(`[data-tour="${passo.alvo}"]`);
      if (el && el.getBoundingClientRect().width > 0) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setTimeout(() => {
          if (!parar) {
            setRect(el.getBoundingClientRect());
            setPronto(true);
          }
        }, 350);
      } else if (tentativas++ < 25) setTimeout(achar, 150);
      else setPronto(true); // não achou: mostra no centro
    };
    achar();
    const atualizar = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${passo.alvo}"]`);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", atualizar);
    return () => {
      parar = true;
      window.removeEventListener("resize", atualizar);
    };
  }, [passo.id, caminho]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") aoAvancar();
      if (e.key === "ArrowLeft") aoVoltar();
      if (e.key === "Escape") aoPular();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  });

  if (!pronto) return null;
  const centro = !rect || passo.posicao === "center";
  const largura = Math.min(380, window.innerWidth - 24);
  let estilo: React.CSSProperties = {};
  if (!centro && rect) {
    const m = 16;
    const pos = passo.posicao;
    if (pos === "right") estilo = { left: Math.min(rect.right + m, window.innerWidth - largura - 12), top: Math.max(12, Math.min(rect.top, window.innerHeight - 320)) };
    else if (pos === "left") estilo = { left: Math.max(12, rect.left - largura - m), top: Math.max(12, Math.min(rect.top, window.innerHeight - 320)) };
    else if (pos === "top") estilo = { left: Math.max(12, Math.min(rect.left, window.innerWidth - largura - 12)), top: Math.max(12, rect.top - m - 260) };
    else estilo = { left: Math.max(12, Math.min(rect.left, window.innerWidth - largura - 12)), top: Math.min(rect.bottom + m, window.innerHeight - 300) };
  }
  const ultimo = indice + 1 >= total;

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      {centro ? (
        <div className="absolute inset-0 bg-[#082833]/60 backdrop-blur-[1px]" />
      ) : (
        rect && (
          <div className="tour-destaque pointer-events-none absolute rounded-2xl transition-all duration-300"
            style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />
        )
      )}
      <div className={`tour-balao absolute rounded-3xl bg-white p-5 shadow-[0_24px_60px_-20px_rgba(8,40,51,0.6)] ${centro ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" : ""}`}
        style={{ width: largura, ...estilo }}>
        <div className="flex items-start gap-3">
          <span className="aceno text-[34px] leading-none">{passo.icone ?? "👉"}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold tracking-wide text-laranja uppercase">Passo {indice + 1} de {total}</div>
            <h3 className="mt-0.5 font-titulo text-[17px] leading-snug font-bold text-texto">{passo.titulo}</h3>
          </div>
          <button type="button" onClick={aoPular} aria-label="Fechar" className="rounded-lg p-1 text-suave hover:bg-fundo hover:text-texto">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-texto/90">{passo.texto}</p>
        {passo.imagemUrl && <img src={passo.imagemUrl} alt="" className="mt-3 max-h-48 w-full rounded-xl object-cover" />}
        {passo.videoUrl && (
          passo.videoUrl.includes("youtube") || passo.videoUrl.includes("youtu.be")
            ? <iframe title="vídeo" className="mt-3 aspect-video w-full rounded-xl" src={passo.videoUrl.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/")} allowFullScreen />
            : <video src={passo.videoUrl} controls className="mt-3 w-full rounded-xl" />
        )}
        <div className="mt-4 flex items-center gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === indice ? "w-6 bg-laranja" : i < indice ? "w-1.5 bg-laranja/50" : "w-1.5 bg-linha-2"}`} />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={aoPular} className="text-[12.5px] font-medium text-suave hover:text-texto">Pular tutorial</button>
          <div className="flex gap-2">
            {indice > 0 && <Botao variante="secundario" tamanho="sm" onClick={aoVoltar} icone={<ArrowLeft className="size-3.5" />}>Voltar</Botao>}
            <Botao onClick={aoAvancar} className="!px-5">
              {ultimo ? <>Concluir <GraduationCap className="size-4" /></> : <>Próximo <ArrowRight className="size-4" /></>}
            </Botao>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
