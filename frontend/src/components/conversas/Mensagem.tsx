import { Bot, Check, CheckCheck, Clock, FileText, MapPin, StickyNote, TriangleAlert, User } from "lucide-react";
import { useEffect, useState } from "react";
import { urlArquivo } from "../../lib/api";
import { hora } from "../../lib/formato";
import { ImagemArquivo } from "../ui";

export type Msg = {
  id: string; conteudo?: string | null; remetente: "customer" | "ai" | "agent" | "system"; remetenteNome?: string | null; usuarioNome?: string | null;
  tipo: string; midiaUrl?: string | null; midiaMime?: string | null; arquivoNome?: string | null; legenda?: string | null; transcricao?: string | null;
  metadados?: any; statusEntrega?: string | null; erroEntrega?: string | null; visibilidade: string; enviadaEm: string;
};

function useBlob(url?: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    urlArquivo(url)?.then((s) => vivo && setSrc(s)).catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [url]);
  return src;
}

function Midia({ m }: { m: Msg }) {
  const src = useBlob(m.tipo === "image" || m.tipo === "sticker" ? null : m.midiaUrl);
  if (!m.midiaUrl) {
    if (["image", "audio", "video", "document", "sticker"].includes(m.tipo))
      return <div className="rounded-lg bg-black/5 px-3 py-2 text-[12px] italic opacity-70">[{m.tipo === "audio" ? "áudio" : m.tipo === "image" ? "imagem" : m.tipo} indisponível]</div>;
    return null;
  }
  switch (m.tipo) {
    case "image":
    case "sticker":
      return (
        <a href="#" onClick={async (e) => { e.preventDefault(); const u = await urlArquivo(m.midiaUrl); if (u) window.open(u, "_blank"); }}>
          <ImagemArquivo url={m.midiaUrl} className={`${m.tipo === "sticker" ? "max-h-32 w-32" : "max-h-72 w-64"} rounded-xl object-cover`} />
        </a>
      );
    case "audio":
      return src ? <audio src={src} controls className="h-10 w-64 max-w-full" /> : <div className="h-10 w-64 animate-pulse rounded-full bg-black/5" />;
    case "video":
      return src ? <video src={src} controls className="max-h-72 w-72 max-w-full rounded-xl" /> : <div className="h-40 w-64 animate-pulse rounded-xl bg-black/5" />;
    default:
      return (
        <a href={src ?? "#"} target="_blank" rel="noreferrer" download={m.arquivoNome ?? undefined}
          className="flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2 text-[13px] font-medium hover:bg-black/10">
          <FileText className="size-5 shrink-0" />
          <span className="truncate">{m.arquivoNome ?? "Documento"}</span>
        </a>
      );
  }
}

function Entrega({ s }: { s?: string | null }) {
  if (s === "read") return <CheckCheck className="size-3.5 text-sky-500" />;
  if (s === "delivered") return <CheckCheck className="size-3.5 opacity-60" />;
  if (s === "sent") return <Check className="size-3.5 opacity-60" />;
  if (s === "failed") return <TriangleAlert className="size-3.5 text-vermelho" />;
  if (s === "pending") return <Clock className="size-3 opacity-60" />;
  return null;
}

export function Mensagem({ m }: { m: Msg }) {
  if (m.remetente === "system") {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-fundo-2 px-3 py-1 text-[11.5px] text-suave">{m.conteudo}</span>
      </div>
    );
  }
  if (m.visibilidade === "internal") {
    return (
      <div className="my-1.5 flex justify-end">
        <div className="max-w-[78%] rounded-2xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-[13.5px] text-amber-900">
          <div className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold"><StickyNote className="size-3.5" /> Nota interna · {m.remetenteNome ?? m.usuarioNome}</div>
          <div className="whitespace-pre-wrap">{m.conteudo}</div>
          <div className="mt-1 text-right text-[10.5px] opacity-70">{hora(m.enviadaEm)}</div>
        </div>
      </div>
    );
  }
  const cliente = m.remetente === "customer";
  const ia = m.remetente === "ai";
  const texto = m.conteudo ?? m.legenda;
  const interativo = m.metadados?.interativo;
  const opcoes: string[] = interativo?.opcoes?.map((o: any) => o.titulo) ?? interativo?.secoes?.flatMap((s: any) => s.opcoes.map((o: any) => o.titulo)) ?? [];
  return (
    <div className={`my-1 flex ${cliente ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[13.5px] shadow-sm ${
        cliente ? "rounded-tl-md bg-white text-texto ring-1 ring-linha" : ia ? "rounded-tr-md bg-petroleo text-white" : "rounded-tr-md bg-[#fde3cc] text-texto"}`}>
        {!cliente && (
          <div className={`mb-0.5 flex items-center gap-1 text-[11px] font-semibold ${ia ? "text-white/80" : "text-laranja"}`}>
            {ia ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
            {m.remetenteNome ?? m.usuarioNome ?? (ia ? "IA" : "Equipe")}
          </div>
        )}
        {m.metadados?.referral && (
          <div className="mb-1.5 rounded-lg bg-black/5 px-2 py-1 text-[11.5px]">📣 Veio do anúncio: {m.metadados.referral.headline ?? m.metadados.referral.source_id}</div>
        )}
        <Midia m={m} />
        {m.tipo === "location" && m.metadados?.localizacao && (
          <a href={`https://maps.google.com/?q=${m.metadados.localizacao.latitude},${m.metadados.localizacao.longitude}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline"><MapPin className="size-4" /> Ver no mapa</a>
        )}
        {m.transcricao && <div className={`mt-1 rounded-lg px-2 py-1 text-[12.5px] italic ${ia ? "bg-white/10" : "bg-black/5"}`}>🎤 “{m.transcricao}”</div>}
        {texto && m.tipo !== "location" && <div className={`whitespace-pre-wrap break-words ${m.midiaUrl ? "mt-1.5" : ""}`}>{texto}</div>}
        {opcoes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {opcoes.map((o) => <span key={o} className={`rounded-full px-2 py-0.5 text-[11.5px] ${ia ? "bg-white/15" : "bg-black/5"}`}>{o}</span>)}
          </div>
        )}
        <div className={`mt-1 flex items-center justify-end gap-1 text-[10.5px] ${cliente ? "text-suave" : ia ? "text-white/70" : "text-texto/60"}`}>
          {m.metadados?.editada && <span>editada ·</span>}
          {hora(m.enviadaEm)}
          {!cliente && <Entrega s={m.statusEntrega} />}
        </div>
        {m.statusEntrega === "failed" && m.erroEntrega && <div className="mt-1 text-[11px] font-medium text-vermelho">{m.erroEntrega}</div>}
      </div>
    </div>
  );
}
