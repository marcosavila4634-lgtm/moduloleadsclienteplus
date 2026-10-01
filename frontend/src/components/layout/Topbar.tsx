import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Building2, Check, ChevronDown, CircleHelp, Menu, MessageSquareText, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { get, post } from "../../lib/api";
import { relativo } from "../../lib/formato";
import { useEvento, useSessao } from "../../lib/sessao";
import { Avatar } from "../ui";

type Notificacao = { id: string; titulo: string; texto?: string; link?: string; lidaEm?: string; createdAt: string; tipo: string };

function useFora(aberto: boolean, fechar: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const f = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && fechar();
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [aberto, fechar]);
  return ref;
}

export function Topbar({ aoAlternarMenu, aoAbrirAjuda }: { aoAlternarMenu: () => void; aoAbrirAjuda: () => void }) {
  const { me, trocarLoja } = useSessao();
  const navigate = useNavigate();
  const [empresasAbertas, setEmpresasAbertas] = useState(false);
  const [avisosAbertos, setAvisosAbertos] = useState(false);
  const [notificacoes, setNotificacoes] = useState<{ itens: Notificacao[]; naoLidas: number }>({ itens: [], naoLidas: 0 });
  const [esperando, setEsperando] = useState(0);
  const refEmpresas = useFora(empresasAbertas, () => setEmpresasAbertas(false));
  const refAvisos = useFora(avisosAbertos, () => setAvisosAbertos(false));

  const carregar = () => {
    get<{ itens: Notificacao[]; naoLidas: number }>("/notificacoes").then(setNotificacoes).catch(() => undefined);
    get<{ naoLidas: number }>("/conversas/contadores").then((c) => setEsperando(Number(c.naoLidas ?? 0))).catch(() => undefined);
  };
  useEffect(carregar, [me.loja?.id]);
  useEvento("notificacao", (n: Notificacao) => {
    setNotificacoes((a) => ({ itens: [n, ...a.itens].slice(0, 50), naoLidas: a.naoLidas + 1 }));
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) new Notification(n.titulo, { body: n.texto ?? "", icon: "/icone.svg" });
  });
  useEvento("conversa", () => get<{ naoLidas: number }>("/conversas/contadores").then((c) => setEsperando(Number(c.naoLidas ?? 0))).catch(() => undefined));

  const empresa = me.empresas.find((e) => e.id === me.loja?.id);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-linha/70 bg-fundo/90 px-4 backdrop-blur md:gap-4 md:px-6 print:hidden">
      <button type="button" onClick={aoAlternarMenu} aria-label="Abrir ou recolher menu" className="rounded-xl p-2 text-texto hover:bg-cartao">
        <Menu className="size-6" />
      </button>

      <form
        data-tour="busca"
        onSubmit={(e) => {
          e.preventDefault();
          const busca = new FormData(e.currentTarget).get("busca")?.toString().trim();
          navigate({ to: "/contatos", search: busca ? { busca } : {} });
        }}
        className="hidden h-10 w-full max-w-[360px] items-center gap-2.5 rounded-xl border border-linha bg-cartao px-3 text-sm focus-within:border-laranja sm:flex"
      >
        <Search className="size-4 text-suave" />
        <input type="search" name="busca" placeholder="Buscar clientes, telefones, pedidos..." className="w-full bg-transparent text-texto outline-none placeholder:text-suave" />
      </form>

      <div ref={refEmpresas} className="relative ml-auto hidden lg:block">
        <button type="button" onClick={() => setEmpresasAbertas((v) => !v)}
          className="flex h-10 items-center gap-2 rounded-xl border border-linha bg-cartao px-3 text-sm font-semibold text-texto hover:border-laranja/60">
          <Building2 className="size-4 text-laranja" />
          <span className="max-w-[220px] truncate">{empresa?.nome ?? "Sem empresa"}</span>
          <ChevronDown className="size-4 text-suave" />
        </button>
        {empresasAbertas && (
          <div className="absolute top-12 right-0 w-72 rounded-2xl border border-linha bg-cartao p-2 shadow-2xl">
            <div className="px-2 pt-1 pb-2 text-[11px] font-semibold tracking-wide text-suave uppercase">Suas empresas</div>
            {me.empresas.map((e) => (
              <button key={e.id} type="button" onClick={() => trocarLoja(e.id)} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-fundo">
                <Building2 className="size-4 text-petroleo" />
                <span className="flex-1 truncate font-medium">{e.nome}</span>
                <span className="text-[11px] text-suave capitalize">{e.papel}</span>
                {e.id === me.loja?.id && <Check className="size-4 text-laranja" />}
              </button>
            ))}
            <Link to="/perfil" onClick={() => setEmpresasAbertas(false)} className="mt-1 block rounded-xl px-2 py-2 text-center text-xs font-semibold text-laranja hover:bg-fundo">
              + Nova empresa
            </Link>
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1 md:gap-2 lg:ml-1">
        <div ref={refAvisos} className="relative">
          <button type="button" data-tour="notificacoes" aria-label="Avisos" onClick={() => {
            setAvisosAbertos((v) => !v);
            if (notificacoes.naoLidas) post("/notificacoes/lidas").then(() => setNotificacoes((a) => ({ ...a, naoLidas: 0 })));
          }} className="relative rounded-xl p-2 text-texto hover:bg-cartao">
            <Bell className="size-5" />
            {notificacoes.naoLidas > 0 && (
              <span className="absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-vermelho px-1 text-[10px] font-bold text-white">
                {notificacoes.naoLidas > 99 ? "99+" : notificacoes.naoLidas}
              </span>
            )}
          </button>
          {avisosAbertos && (
            <div className="absolute top-12 right-0 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-linha bg-cartao p-2 shadow-2xl">
              <div className="px-2 pt-1 pb-2 font-titulo text-sm font-semibold text-texto">Avisos</div>
              {notificacoes.itens.length === 0 && <p className="px-2 pb-3 text-sm text-suave">Nenhum aviso por enquanto.</p>}
              <ul className="max-h-[60vh] overflow-y-auto">
                {notificacoes.itens.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => { setAvisosAbertos(false); if (n.link) navigate({ to: n.link.split("?")[0], search: Object.fromEntries(new URLSearchParams(n.link.split("?")[1] ?? "")) }); }}
                      className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-fundo">
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.lidaEm ? "bg-linha-2" : "bg-laranja"}`} />
                      <div className="min-w-0 flex-1 leading-snug">
                        <div className="text-[13px] font-semibold text-texto">{n.titulo}</div>
                        {n.texto && <div className="line-clamp-2 text-[12px] text-suave">{n.texto}</div>}
                        <div className="mt-0.5 text-[11px] text-suave">{relativo(n.createdAt)}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <Link to="/conversas" aria-label="Conversas" className="relative rounded-xl p-2 text-texto hover:bg-cartao">
          <MessageSquareText className="size-5" />
          {esperando > 0 && <span className="absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-laranja px-1 text-[10px] font-bold text-white">{esperando > 99 ? "99+" : esperando}</span>}
        </Link>
        <button type="button" data-tour="ajuda" aria-label="Ajuda e tutoriais" onClick={aoAbrirAjuda} className="rounded-xl p-2 text-texto hover:bg-cartao">
          <CircleHelp className="size-5" />
        </button>
        <Link to="/perfil" className="ml-1 flex items-center gap-2.5 rounded-xl py-1 pr-1 pl-1 hover:bg-cartao md:pr-3">
          <Avatar nome={me.usuario.nome} foto={me.usuario.fotoUrl} tamanho={36} />
          <div className="hidden leading-tight md:block">
            <div className="max-w-[140px] truncate text-[13px] font-semibold text-texto">{me.usuario.nome.split(" ")[0]}</div>
            <div className="text-[11px] text-suave capitalize">{me.papel}</div>
          </div>
        </Link>
      </div>
    </header>
  );
}
