import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { ProvedorAvisos } from "../components/form";

export const Route = createRootRoute({
  component: () => (
    <ProvedorAvisos>
      <Outlet />
    </ProvedorAvisos>
  ),
  notFoundComponent: () => (
    <div className="grid min-h-full place-items-center p-8 text-center">
      <div>
        <div className="font-titulo text-5xl font-extrabold text-laranja">404</div>
        <p className="mt-2 text-suave">Esta página não existe.</p>
        <Link to="/" className="mt-4 inline-block font-semibold text-petroleo underline">Voltar ao início</Link>
      </div>
    </div>
  ),
});
