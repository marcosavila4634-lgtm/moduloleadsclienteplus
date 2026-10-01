import type { ReactNode } from "react";
import { Logo } from "./Sidebar";

/** Moldura das telas de login/cadastro: lado petróleo com a marca, lado claro com o formulário. */
export function TelaEntrada({ titulo, subtitulo, children }: { titulo: string; subtitulo?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full">
      <div className="bg-menu-gradiente relative hidden w-[46%] flex-col justify-between overflow-hidden p-10 lg:flex">
        <Logo />
        <div className="relative z-10 max-w-md">
          <div className="font-titulo text-[38px] leading-[1.1] font-extrabold text-white">
            Cada conversa pode virar <span className="text-laranja-claro">uma venda.</span>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-menu-texto">
            WhatsApp, Instagram, funil de vendas, robô de IA, catálogo e automações em um só lugar — atendendo seus clientes até de madrugada.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-center">
            {[["24h", "atendimento com IA"], ["+ vendas", "com follow-up automático"], ["1 lugar", "para toda a equipe"]].map(([a, b]) => (
              <div key={a} className="rounded-2xl border border-white/10 bg-white/[0.06] px-2 py-3">
                <div className="font-titulo text-lg font-bold text-white">{a}</div>
                <div className="text-[11px] text-menu-texto">{b}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="-rotate-[5deg] font-script text-[34px] leading-none text-white/90">
          Atender bem é <span className="text-laranja-claro">vender mais!</span>
        </div>
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-laranja/20 blur-3xl" />
        <div className="pointer-events-none absolute top-24 -right-10 size-64 rounded-full bg-petroleo-claro/30 blur-3xl" />
      </div>
      <div className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 lg:hidden">
            <div className="inline-flex rounded-2xl bg-menu px-4 py-3"><Logo /></div>
          </div>
          <h1 className="font-titulo text-[28px] font-bold text-texto">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-sm text-suave">{subtitulo}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  );
}
