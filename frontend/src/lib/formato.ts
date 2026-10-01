// Formatos em português (dinheiro, datas, telefone, tempo relativo).

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numero = new Intl.NumberFormat("pt-BR");

export const reais = (v: number | string | null | undefined) => moeda.format(Number(v ?? 0));
export const num = (v: number | string | null | undefined) => numero.format(Number(v ?? 0));

export function data(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function dataHora(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function hora(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** "agora", "5 min", "3 h", "ontem", "12/09" */
export function relativo(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 172800) return "ontem";
  if (s < 7 * 86400) return d.toLocaleDateString("pt-BR", { weekday: "short" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Dia da mensagem para separadores do chat: "Hoje", "Ontem", "12 de setembro". */
export function diaChat(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 86400000);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: d.getFullYear() === hoje.getFullYear() ? undefined : "numeric" });
}

export function telefone(t?: string | null) {
  if (!t) return "";
  const d = t.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);
    return `(${ddd}) ${resto.length === 9 ? `${resto.slice(0, 5)}-${resto.slice(5)}` : `${resto.slice(0, 4)}-${resto.slice(4)}`}`;
  }
  return `+${d}`;
}

export function iniciais(nome?: string | null) {
  if (!nome) return "?";
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

export function duracao(ms?: number | null) {
  if (ms == null) return "—";
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1).replace(".", ",")} h`;
}

/** Cor estável a partir de um texto (avatares sem foto). */
export function corDe(texto?: string | null) {
  const cores = ["#145f6e", "#f47b20", "#1f7f8f", "#e5484d", "#7c3aed", "#0ea5e9", "#16a34a", "#d97706"];
  let h = 0;
  for (const c of texto ?? "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return cores[h % cores.length];
}

export function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
