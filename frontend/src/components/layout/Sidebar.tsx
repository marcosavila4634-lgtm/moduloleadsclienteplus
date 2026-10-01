import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, Crown, LogOut } from "lucide-react";
import { useState } from "react";
import { useSessao } from "../../lib/sessao";
import { Avatar } from "../ui";
import { MENU, MENU_ADMIN, type ItemMenu } from "./menu";

const item = "flex items-center gap-3 rounded-xl px-3 py-[9px] text-[13.5px] font-medium text-menu-texto/85 transition-colors hover:bg-white/[0.07] hover:text-white";
const ativo = "bg-gradient-to-r from-ambar to-laranja !text-white font-semibold shadow-[0_8px_22px_-8px_rgba(244,123,32,0.85)]";

export function Logo({ compacto }: { compacto?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/icone.svg" alt="" className="size-10 shrink-0 drop-shadow-[0_6px_14px_rgba(0,0,0,0.35)]" />
      {!compacto && (
        <div className="leading-none">
          <div className="font-titulo text-[19px] font-extrabold tracking-tight text-white">
            GESTÃO <span className="text-laranja-claro">PLUS</span>
          </div>
          <div className="mt-1 text-[10.5px] font-semibold tracking-[0.32em] text-menu-texto">CRM & VENDAS</div>
          <div className="mt-1 text-[8.5px] font-medium tracking-wide text-menu-texto/70">CONVERSAS QUE VIRAM CLIENTES</div>
        </div>
      )}
    </div>
  );
}

export function Sidebar({ recolhida, aoNavegar }: { recolhida: boolean; aoNavegar?: () => void }) {
  const { me, admin, pode, sair } = useSessao();
  const caminho = useRouterState({ select: (s) => s.location.pathname });
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const itens: ItemMenu[] = [...MENU.filter((i) => !i.minimo || pode(i.minimo)), ...(admin ? [MENU_ADMIN] : [])];

  return (
    <aside className={`bg-menu-gradiente flex h-full flex-col transition-[width] duration-200 ${recolhida ? "w-[78px]" : "w-[244px]"}`}>
      <div className={`flex h-[84px] shrink-0 items-center ${recolhida ? "justify-center" : "px-5"}`}>
        <Link to="/painel" onClick={aoNavegar}>
          <Logo compacto={recolhida} />
        </Link>
      </div>

      <nav data-tour="menu" className="menu-rolagem mt-1 flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
        {itens.map((m) => {
          const Icone = m.icone;
          const classe = `${item} ${recolhida ? "justify-center !px-0" : ""}`;
          const conteudo = (
            <>
              <Icone className="size-[19px] shrink-0" />
              {!recolhida && <span className="flex-1 truncate">{m.rotulo}</span>}
            </>
          );
          if (m.filhos) {
            const filhoAtivo = m.filhos.some((f) => caminho.startsWith(f.para));
            const aberto = abertos[m.rotulo] ?? filhoAtivo;
            return (
              <div key={m.rotulo} data-tour={m.tour}>
                <button type="button" title={m.rotulo} onClick={() => setAbertos((a) => ({ ...a, [m.rotulo]: !aberto }))}
                  className={`${classe} w-full text-left ${filhoAtivo ? "!text-white" : ""} ${filhoAtivo && recolhida ? ativo : ""}`}>
                  {conteudo}
                  {!recolhida && <ChevronDown className={`size-4 transition-transform ${aberto ? "rotate-180" : ""}`} />}
                </button>
                {aberto && !recolhida && (
                  <div className="mt-0.5 mb-1 ml-[21px] flex flex-col gap-0.5 border-l border-menu-linha pl-3">
                    {m.filhos.map((f) => (
                      <Link key={f.para} to={f.para} onClick={aoNavegar} data-tour={f.para === "/pedidos" ? "menu-pedidos" : undefined}
                        className="rounded-lg px-3 py-1.5 text-[13px] text-menu-texto/75 hover:bg-white/[0.07] hover:text-white"
                        activeProps={{ className: "!text-laranja-claro font-semibold" }}>
                        {f.rotulo}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <Link key={m.rotulo} to={m.para!} title={m.rotulo} onClick={aoNavegar} data-tour={m.tour} className={classe} activeProps={{ className: ativo }}>
              {conteudo}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 px-3 pb-3">
        <a
          href="https://clienteplus.club"
          target="_blank"
          rel="noreferrer"
          title="Cliente Plus"
          className={`flex items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-[#5b2bb5]/80 via-[#3b1f7a]/70 to-[#1b1147]/80 px-3 py-3 hover:border-white/25 ${recolhida ? "justify-center !px-0" : ""}`}
        >
          <Crown className="size-7 shrink-0 fill-amber-400/30 text-amber-400" />
          {!recolhida && (
            <div className="min-w-0 leading-tight">
              <div className="font-titulo text-[15px] font-semibold text-white">Cliente Plus</div>
              <div className="mt-0.5 text-[10.5px] text-white/75">Transforme clientes em uma rede de indicações.</div>
            </div>
          )}
        </a>

        <div className={`mt-3 flex items-center gap-3 rounded-xl px-2 py-2 ${recolhida ? "justify-center !px-0" : ""}`}>
          <Link to="/perfil" onClick={aoNavegar} title="Meu perfil" className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar nome={me.usuario.nome} foto={me.usuario.fotoUrl} tamanho={40} className="ring-2 ring-white/20" />
            {!recolhida && (
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[13.5px] font-semibold text-white">{me.usuario.nome}</div>
                <div className="text-[11px] text-menu-texto/70 capitalize">{me.papel ?? "sem empresa"}</div>
              </div>
            )}
          </Link>
          {!recolhida && (
            <button type="button" onClick={sair} title="Sair" className="rounded-lg p-1.5 text-menu-texto/70 hover:bg-white/10 hover:text-white">
              <LogOut className="size-4" />
            </button>
          )}
        </div>

        {!recolhida && (
          <div className="relative mt-3 mb-1 -rotate-[6deg] px-3 font-script text-[25px] leading-[0.95] text-white/90 [@media(max-height:880px)]:hidden">
            Atender bem
            <br />
            <span className="pl-6">é vender</span>
            <br />
            <span className="pl-12 text-laranja-claro">mais!</span>
          </div>
        )}
      </div>
    </aside>
  );
}
