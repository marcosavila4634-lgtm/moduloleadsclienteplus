import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { get, qs } from "../lib/api";
import { telefone } from "../lib/formato";
import { Entrada } from "./form";

export type ContatoMin = { id: string; nome?: string | null; telefone?: string | null };

/** Campo de busca de contato com lista de sugestões. */
export function BuscaContato({ valor, aoEscolher, placeholder = "Buscar contato por nome ou telefone..." }: { valor: ContatoMin | null; aoEscolher: (c: ContatoMin | null) => void; placeholder?: string }) {
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<ContatoMin[]>([]);
  useEffect(() => {
    if (busca.length < 2) { setLista([]); return; }
    const t = setTimeout(() => get<any>(`/contatos${qs({ busca, limite: 8 })}`).then((r) => setLista(r.itens)).catch(() => undefined), 300);
    return () => clearTimeout(t);
  }, [busca]);
  if (valor) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-linha bg-fundo px-3 py-2 text-[13px]">
        <span><b>{valor.nome ?? "Sem nome"}</b> <span className="text-suave">{telefone(valor.telefone)}</span></span>
        <button type="button" onClick={() => aoEscolher(null)} className="text-suave hover:text-vermelho"><X className="size-4" /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={placeholder} />
      {lista.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 flex flex-col rounded-xl bg-cartao p-1 shadow-xl ring-1 ring-linha">
          {lista.map((c) => (
            <button key={c.id} type="button" onClick={() => { aoEscolher(c); setBusca(""); }} className="rounded-lg px-3 py-2 text-left text-[13px] hover:bg-fundo">
              <b>{c.nome ?? "Sem nome"}</b> <span className="text-suave">{telefone(c.telefone)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
