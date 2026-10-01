// Acesso à API do backend (/api). Envia o token e a empresa escolhida; erros
// chegam como {erro: "..."} e viram exceção com a mensagem em português.

const CHAVE_TOKEN = "crm.token";
const CHAVE_LOJA = "crm.loja";

export function lerToken(): string | null {
  try {
    return localStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
}

export function gravarToken(t: string | null) {
  try {
    if (t) localStorage.setItem(CHAVE_TOKEN, t);
    else localStorage.removeItem(CHAVE_TOKEN);
  } catch {
    /* navegador sem armazenamento */
  }
}

export function lerLoja(): string | null {
  try {
    return localStorage.getItem(CHAVE_LOJA);
  } catch {
    return null;
  }
}

export function gravarLoja(id: string | null) {
  try {
    if (id) localStorage.setItem(CHAVE_LOJA, id);
    else localStorage.removeItem(CHAVE_LOJA);
  } catch {
    /* navegador sem armazenamento */
  }
}

export class ErroApi extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

function cabecalhos(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  const t = lerToken();
  if (t) h.set("Authorization", `Bearer ${t}`);
  const l = lerLoja();
  if (l) h.set("X-Loja", l);
  return h;
}

async function tratar<T>(r: Response): Promise<T> {
  if (r.status === 401 && !location.pathname.startsWith("/login")) {
    gravarToken(null);
    location.href = `/login?voltar=${encodeURIComponent(location.pathname + location.search)}`;
  }
  const tipo = r.headers.get("content-type") ?? "";
  const corpo = tipo.includes("json") ? await r.json().catch(() => null) : await r.text();
  if (!r.ok) {
    const msg = corpo && typeof corpo === "object" && "erro" in corpo ? String((corpo as { erro: string }).erro) : `Erro ${r.status}`;
    throw new ErroApi(r.status, msg);
  }
  return corpo as T;
}

export async function api<T = unknown>(caminho: string, opcoes: { metodo?: string; corpo?: unknown; sinal?: AbortSignal } = {}): Promise<T> {
  const metodo = opcoes.metodo ?? (opcoes.corpo !== undefined ? "POST" : "GET");
  const h = cabecalhos();
  let body: BodyInit | undefined;
  if (opcoes.corpo instanceof FormData) body = opcoes.corpo;
  else if (opcoes.corpo !== undefined) {
    h.set("Content-Type", "application/json");
    body = JSON.stringify(opcoes.corpo);
  }
  const r = await fetch(`/api${caminho}`, { method: metodo, headers: h, body, signal: opcoes.sinal });
  return tratar<T>(r);
}

export const get = <T = unknown>(c: string) => api<T>(c);
export const post = <T = unknown>(c: string, corpo: unknown = {}) => api<T>(c, { metodo: "POST", corpo });
export const put = <T = unknown>(c: string, corpo: unknown = {}) => api<T>(c, { metodo: "PUT", corpo });
export const del = <T = unknown>(c: string) => api<T>(c, { metodo: "DELETE" });

/** Monta a query string ignorando vazios. */
export function qs(p: Record<string, string | number | boolean | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== "" && v !== false) u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** Envia um arquivo e devolve o endereço (/api/arquivos/<id>). */
export async function enviarArquivo(arquivo: File, publico = false): Promise<{ id: string; url: string; urlPublica?: string; mime: string; nome: string }> {
  const fd = new FormData();
  fd.append("arquivo", arquivo);
  if (publico) fd.append("publico", "true");
  return api("/arquivos", { metodo: "POST", corpo: fd });
}

/**
 * Arquivos privados precisam do token: baixa com fetch e devolve um endereço
 * local (blob) para <img>/<audio>/<video>. Guarda em cache.
 */
const cacheBlob = new Map<string, Promise<string>>();
export function urlArquivo(url: string | null | undefined): Promise<string> | null {
  if (!url) return null;
  if (!url.startsWith("/api/arquivos/") || url.startsWith("/api/arquivos/p/")) return Promise.resolve(url);
  let p = cacheBlob.get(url);
  if (!p) {
    p = fetch(url, { headers: cabecalhos() })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("arquivo"))))
      .then((b) => URL.createObjectURL(b));
    cacheBlob.set(url, p);
    p.catch(() => cacheBlob.delete(url));
  }
  return p;
}

/** Baixa um CSV/arquivo protegido e salva no computador. */
export async function baixar(caminho: string, nome: string) {
  const r = await fetch(`/api${caminho}`, { headers: cabecalhos() });
  if (!r.ok) throw new ErroApi(r.status, "Não foi possível baixar");
  const b = await r.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/**
 * Eventos em tempo real (SSE lido com fetch, para mandar o token no cabeçalho).
 * Reconecta sozinho. Devolve a função para parar.
 */
export function ouvirEventos(aoEvento: (tipo: string, dados: any) => void): () => void {
  let parar = false;
  let controle: AbortController | null = null;
  const conectar = async () => {
    while (!parar) {
      controle = new AbortController();
      try {
        const r = await fetch("/api/eventos", { headers: cabecalhos({ Accept: "text/event-stream" }), signal: controle.signal });
        if (!r.ok || !r.body) throw new Error("sse");
        const leitor = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await leitor.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const bloco = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const dado = bloco.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
            if (!dado) continue;
            try {
              const ev = JSON.parse(dado);
              if (ev.tipo !== "ping") aoEvento(ev.tipo, ev.dados);
            } catch {
              /* evento inválido: ignora */
            }
          }
        }
      } catch {
        /* caiu: tenta de novo */
      }
      if (!parar) await new Promise((r) => setTimeout(r, 3000));
    }
  };
  conectar();
  return () => {
    parar = true;
    controle?.abort();
  };
}
