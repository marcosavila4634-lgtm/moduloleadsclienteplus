import { createFileRoute } from "@tanstack/react-router";
import { Loja } from "./loja.$slug";

// Link direto de um produto (enviado pelo robô, lista de espera e recompra).
export const Route = createFileRoute("/loja/$slug_/p/$produto")({
  component: () => {
    const { slug, produto } = Route.useParams();
    return <Loja slug={slug} produtoSlug={produto} />;
  },
});
