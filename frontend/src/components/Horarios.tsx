import { Plus, X } from "lucide-react";

// Editor de horário semanal no formato {"seg":[["09:00","18:00"]], ...} (vazio = fechado).

export const DIAS: [string, string][] = [["seg", "Segunda"], ["ter", "Terça"], ["qua", "Quarta"], ["qui", "Quinta"], ["sex", "Sexta"], ["sab", "Sábado"], ["dom", "Domingo"]];
export type Horario = Record<string, string[][]>;

export function EditorHorarios({ valor, aoMudar }: { valor: Horario; aoMudar: (h: Horario) => void }) {
  const set = (d: string, faixas: string[][]) => aoMudar({ ...valor, [d]: faixas });
  return (
    <div className="flex flex-col divide-y divide-linha rounded-xl border border-linha">
      {DIAS.map(([d, nome]) => {
        const faixas = valor[d] ?? [];
        const aberto = faixas.length > 0;
        return (
          <div key={d} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
            <label className="flex w-28 items-center gap-2 font-semibold">
              <input type="checkbox" checked={aberto} onChange={(e) => set(d, e.target.checked ? [["09:00", "18:00"]] : [])} className="accent-[var(--color-laranja)]" />{nome}
            </label>
            {!aberto && <span className="text-suave">Fechado</span>}
            {faixas.map((f, i) => (
              <span key={i} className="flex items-center gap-1 rounded-lg bg-fundo px-1.5 py-1">
                <input type="time" value={f[0]} onChange={(e) => set(d, faixas.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} className="bg-transparent" />
                <span className="text-suave">às</span>
                <input type="time" value={f[1]} onChange={(e) => set(d, faixas.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} className="bg-transparent" />
                {faixas.length > 1 && <button type="button" onClick={() => set(d, faixas.filter((_, j) => j !== i))} className="text-suave hover:text-vermelho"><X className="size-3.5" /></button>}
              </span>
            ))}
            {aberto && <button type="button" onClick={() => set(d, [...faixas, ["14:00", "18:00"]])} className="flex items-center gap-1 text-[12px] font-semibold text-laranja"><Plus className="size-3.5" /> intervalo</button>}
          </div>
        );
      })}
    </div>
  );
}
