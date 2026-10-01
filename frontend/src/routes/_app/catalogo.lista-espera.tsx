import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BellRing } from "lucide-react";
import { CabecalhoPagina, Card, Carregando, Selo, Vazio, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { useDados } from "../../lib/dados";
import { dataHora, telefone } from "../../lib/formato";

export const Route = createFileRoute("/_app/catalogo/lista-espera")({ component: ListaEspera });

function ListaEspera() {
  const { dados } = useDados<any[]>("/catalogo/lista-espera");
  return (
    <div className="flex flex-col gap-4">
      <Link to="/catalogo" className="flex w-fit items-center gap-1 text-[13px] font-semibold text-suave hover:text-texto"><ArrowLeft className="size-4" /> Catálogo</Link>
      <CabecalhoPagina titulo="Avise-me quando chegar" icone={BellRing} descricao="Clientes esperando produtos sem estoque. Ao dar entrada no estoque, eles recebem mensagem no WhatsApp sozinhos." />
      <Card className="!p-0">
        {!dados ? <Carregando /> : dados.length === 0 ? <Vazio icone={BellRing} titulo="Ninguém esperando" /> : (
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2.5">Cliente</th><th>Produto</th><th>Pediu em</th><th>Situação</th></tr></thead>
            <tbody>
              {dados.map((l) => (
                <tr key={l.id} className={linhaTabela}>
                  <td className="px-4 py-2.5"><Link to="/contatos/$id" params={{ id: l.contatoId }} className="font-semibold hover:text-laranja">{l.contatoNome ?? telefone(l.telefone)}</Link></td>
                  <td>{l.produtoNome}{l.variacaoNome && ` · ${l.variacaoNome}`}</td>
                  <td className="text-suave">{dataHora(l.createdAt)}</td>
                  <td>{l.status === "avisado" ? <Selo cor="verde">Avisado {dataHora(l.avisadoEm)}</Selo> : <Selo cor="ambar">Esperando</Selo>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
