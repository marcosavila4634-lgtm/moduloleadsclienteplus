import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProvedorTutorial, useTutorial } from "../components/Tutorial";
import { Sidebar } from "../components/layout/Sidebar";
import { Topbar } from "../components/layout/Topbar";
import { gravarLoja, lerToken } from "../lib/api";
import { carregarSessao, ProvedorSessao, useSessao } from "../lib/sessao";

// Layout do painel: menu lateral recolhível + barra do topo + tutorial guiado.
export const Route = createFileRoute("/_app")({
  beforeLoad: ({ location }) => {
    if (!lerToken()) throw redirect({ to: "/login", search: { voltar: location.href } });
  },
  loader: carregarSessao,
  component: Layout,
  pendingComponent: () => <div className="grid h-full place-items-center text-sm text-suave">Carregando...</div>,
});

function Layout() {
  const { me, admin } = Route.useLoaderData();
  return (
    <ProvedorSessao inicial={me} admin={admin}>
      <ProvedorTutorial>
        <Moldura />
      </ProvedorTutorial>
    </ProvedorSessao>
  );
}

function Moldura() {
  const [recolhida, setRecolhida] = useState(() => {
    try {
      return localStorage.getItem("crm.menu") === "1";
    } catch {
      return false;
    }
  });
  const [aberta, setAberta] = useState(false);
  const { abrirCentral } = useTutorial();
  const navegar = useNavigate();
  const { me } = useSessao();
  // aviso tocado com o app aberto: vai para a conversa (trocando de empresa se precisar)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const ouvir = (e: MessageEvent) => {
      if (e.data?.tipo !== "abrir") return;
      if (e.data.loja && e.data.loja !== me.loja?.id) {
        gravarLoja(e.data.loja);
        location.href = e.data.link;
        return;
      }
      const [caminho, busca] = String(e.data.link).split("?");
      navegar({ to: caminho, search: Object.fromEntries(new URLSearchParams(busca ?? "")) as never });
    };
    navigator.serviceWorker.addEventListener("message", ouvir);
    return () => navigator.serviceWorker.removeEventListener("message", ouvir);
  }, [me.loja?.id]);

  const alternar = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setRecolhida((v) => {
        try {
          localStorage.setItem("crm.menu", v ? "0" : "1");
        } catch {
          /* sem armazenamento */
        }
        return !v;
      });
    } else setAberta((v) => !v);
  };
  return (
    <div className="flex h-full">
      <div className="hidden h-full lg:block print:hidden">
        <Sidebar recolhida={recolhida} />
      </div>
      {aberta && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[#082833]/60" onClick={() => setAberta(false)} />
          <div className="relative h-full w-fit">
            <Sidebar recolhida={false} aoNavegar={() => setAberta(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Topbar aoAlternarMenu={alternar} aoAbrirAjuda={abrirCentral} />
        <main className="flex-1 px-4 pt-4 pb-10 md:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
