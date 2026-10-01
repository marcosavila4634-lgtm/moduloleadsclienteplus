import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Eye, EyeOff, ExternalLink, Globe, History, Monitor, Plus, Rocket, Smartphone, Trash2, Undo2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AreaTexto, Botao, Campo, Entrada, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { PaginaLoja, type Vitrine } from "../../components/loja/PaginaLoja";
import { Carregando, Selo } from "../../components/ui";
import { enviarArquivo, get, post, put } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { dataHora } from "../../lib/formato";
import { NOMES_SECAO, paginaPadrao, secaoNova, type Pagina, type Secao, type TipoSecao } from "../../lib/pagina";
import { useSessao } from "../../lib/sessao";

export const Route = createFileRoute("/_app/pagina")({ component: EditorPagina });

function EditorPagina() {
  const { me } = useSessao();
  const { dados, recarregar } = useDados<any>("/pagina");
  const [p, setP] = useState<Pagina | null>(null);
  const [vitrine, setVitrine] = useState<Vitrine | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [modo, setModo] = useState<"celular" | "computador">("computador");
  const [versoes, setVersoes] = useState(false);
  const [salvo, setSalvo] = useState(true);
  const { executar, carregando } = useAcao();
  const { confirmar } = useAvisos();
  const temporizador = useRef<number | null>(null);

  useEffect(() => {
    if (dados && !p) setP(dados.rascunho ?? paginaPadrao(me.loja?.nome ?? "Minha loja"));
  }, [dados]);
  useEffect(() => {
    if (dados?.slug) get<Vitrine>(`/publico/lojas/${dados.slug}`).then(setVitrine).catch(() => setVitrine({ loja: { id: "", nome: me.loja?.nome ?? "", slug: dados.slug }, categorias: [], produtos: [], entrega: {}, pagamentos: {} }));
  }, [dados?.slug]);

  // salva o rascunho sozinho 1,5 s depois de cada mudança
  const mudar = (novo: Pagina) => {
    setP(novo);
    setSalvo(false);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => put("/pagina", { pagina: novo }).then(() => setSalvo(true)).catch(() => undefined), 1500);
  };
  if (!p || !dados) return <Carregando />;
  const secao = p.secoes.find((s) => s.id === sel);
  const setSecao = (s: Secao) => mudar({ ...p, secoes: p.secoes.map((x) => (x.id === s.id ? s : x)) });
  const mover = (i: number, d: number) => {
    const l = [...p.secoes];
    const [x] = l.splice(i, 1);
    l.splice(i + d, 0, x);
    mudar({ ...p, secoes: l });
  };
  const link = `${location.origin}/loja/${dados.slug}`;

  return (
    <div className="-mx-4 -mt-4 -mb-10 flex h-[calc(100vh-64px)] flex-col md:-mx-6">
      <div className="flex flex-wrap items-center gap-3 border-b border-linha bg-cartao px-4 py-2.5">
        <Globe className="size-5 text-laranja" />
        <div className="min-w-0 flex-1">
          <div className="font-titulo text-[16px] font-bold">Página da loja</div>
          <a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] text-suave hover:text-laranja">{link} <ExternalLink className="size-3" /></a>
        </div>
        <span className="text-[12px] text-suave">{salvo ? "Rascunho salvo ✓" : "Salvando..."}</span>
        {dados.publicadaEm && <Selo cor="verde">Publicada {dataHora(dados.publicadaEm)}</Selo>}
        <div className="flex rounded-xl bg-fundo p-1">
          <button type="button" onClick={() => setModo("computador")} className={`rounded-lg p-1.5 ${modo === "computador" ? "bg-white shadow" : ""}`}><Monitor className="size-4" /></button>
          <button type="button" onClick={() => setModo("celular")} className={`rounded-lg p-1.5 ${modo === "celular" ? "bg-white shadow" : ""}`}><Smartphone className="size-4" /></button>
        </div>
        <Botao variante="secundario" icone={<History className="size-4" />} onClick={() => setVersoes(true)}>Versões</Botao>
        <Botao variante="secundario" icone={<Undo2 className="size-4" />} onClick={async () => { if (await confirmar("Descartar as mudanças e voltar para a versão publicada?")) executar(() => post("/pagina/descartar"), "Mudanças descartadas").then(() => { setP(null); recarregar(); }); }}>Descartar</Botao>
        <Botao carregando={carregando} icone={<Rocket className="size-4" />} onClick={async () => { await put("/pagina", { pagina: p }); executar(() => post("/pagina/publicar"), "Página publicada! Já está no ar.").then(recarregar); }}>Publicar</Botao>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="w-[320px] shrink-0 overflow-y-auto border-r border-linha bg-cartao p-4">
          {secao ? (
            <EditorSecao s={secao} aoMudar={setSecao} aoVoltar={() => setSel(null)} />
          ) : (
            <>
              <div className="mb-2 text-[11px] font-bold tracking-wide text-suave uppercase">Tema</div>
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Cor principal"><input type="color" value={p.tema.cor} onChange={(e) => mudar({ ...p, tema: { ...p.tema, cor: e.target.value } })} className="h-9 w-full rounded-lg" /></Campo>
                <Campo rotulo="Cor secundária"><input type="color" value={p.tema.cor2} onChange={(e) => mudar({ ...p, tema: { ...p.tema, cor2: e.target.value } })} className="h-9 w-full rounded-lg" /></Campo>
                <Campo rotulo="Fundo"><Selecao value={p.tema.fundo} onChange={(e) => mudar({ ...p, tema: { ...p.tema, fundo: e.target.value as any } })} opcoes={[{ valor: "creme", rotulo: "Creme" }, { valor: "claro", rotulo: "Branco" }, { valor: "escuro", rotulo: "Escuro" }]} /></Campo>
                <Campo rotulo="Cantos"><Selecao value={p.tema.cantos} onChange={(e) => mudar({ ...p, tema: { ...p.tema, cantos: e.target.value as any } })} opcoes={[{ valor: "arredondados", rotulo: "Arredondados" }, { valor: "retos", rotulo: "Retos" }]} /></Campo>
              </div>
              <div className="mt-5 mb-2 text-[11px] font-bold tracking-wide text-suave uppercase">Seções (clique para editar)</div>
              <div className="flex flex-col gap-1.5">
                {p.secoes.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-1 rounded-xl border border-linha px-2 py-1.5">
                    <button type="button" onClick={() => setSel(s.id)} className={`flex-1 truncate text-left text-[13px] font-medium ${s.visivel ? "" : "text-suave line-through"}`}>{NOMES_SECAO[s.tipo]}</button>
                    <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} className="p-1 text-suave disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                    <button type="button" disabled={i === p.secoes.length - 1} onClick={() => mover(i, 1)} className="p-1 text-suave disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                    <button type="button" onClick={() => setSecao({ ...s, visivel: !s.visivel })} className="p-1 text-suave">{s.visivel ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}</button>
                    <button type="button" onClick={() => mudar({ ...p, secoes: p.secoes.filter((x) => x.id !== s.id) })} className="p-1 text-suave hover:text-vermelho"><Trash2 className="size-3.5" /></button>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <Selecao vazio="+ Adicionar seção" value="" onChange={(e) => { if (e.target.value) { const n = secaoNova(e.target.value as TipoSecao); mudar({ ...p, secoes: [...p.secoes, n] }); setSel(n.id); } }}
                  opcoes={Object.entries(NOMES_SECAO).map(([v, r]) => ({ valor: v, rotulo: r }))} />
              </div>
            </>
          )}
        </aside>
        <div className="flex-1 overflow-y-auto bg-fundo-2 p-6">
          <div className={`mx-auto overflow-hidden bg-white shadow-2xl transition-all ${modo === "celular" ? "w-[390px] rounded-[36px] ring-8 ring-[#0b3240]" : "max-w-6xl rounded-2xl"}`}>
            {vitrine ? <PaginaLoja pagina={p} vitrine={vitrine} aoClicarSecao={setSel} selecionada={sel} compacta={modo === "celular"} /> : <Carregando />}
          </div>
        </div>
      </div>
      {versoes && <Versoes aoFechar={() => setVersoes(false)} aoRestaurar={() => { setVersoes(false); setP(null); recarregar(); }} />}
    </div>
  );
}

function CampoImagem({ rotulo, valor, aoMudar }: { rotulo: string; valor?: string; aoMudar: (u: string) => void }) {
  const [enviando, setEnviando] = useState(false);
  return (
    <Campo rotulo={rotulo}>
      <div className="flex items-center gap-2">
        {valor && <img src={valor} alt="" className="size-12 rounded-lg object-cover" />}
        <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-linha-2 px-3 py-2 text-[12.5px]">
          <Upload className="size-4 text-laranja" />{enviando ? "Enviando..." : valor ? "Trocar imagem" : "Enviar imagem"}
          <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setEnviando(true); const r = await enviarArquivo(f, true); setEnviando(false); aoMudar(`/api/arquivos/p/${r.id}/${encodeURIComponent(r.nome)}`); }} />
        </label>
        {valor && <button type="button" onClick={() => aoMudar("")} className="text-suave"><Trash2 className="size-4" /></button>}
      </div>
    </Campo>
  );
}

function ListaItens({ itens, campos, aoMudar, novo }: { itens: any[]; campos: { chave: string; rotulo: string; area?: boolean }[]; aoMudar: (l: any[]) => void; novo: any }) {
  return (
    <div className="flex flex-col gap-2">
      {itens.map((it, i) => (
        <div key={i} className="rounded-xl border border-linha p-2.5">
          {campos.map((c) => c.area
            ? <AreaTexto key={c.chave} rows={2} className="mb-1.5" placeholder={c.rotulo} value={it[c.chave] ?? ""} onChange={(e) => aoMudar(itens.map((x, j) => (j === i ? { ...x, [c.chave]: e.target.value } : x)))} />
            : <Entrada key={c.chave} className="mb-1.5" placeholder={c.rotulo} value={it[c.chave] ?? ""} onChange={(e) => aoMudar(itens.map((x, j) => (j === i ? { ...x, [c.chave]: e.target.value } : x)))} />)}
          <button type="button" onClick={() => aoMudar(itens.filter((_, j) => j !== i))} className="text-[12px] font-semibold text-vermelho">Remover</button>
        </div>
      ))}
      <Botao variante="secundario" tamanho="sm" icone={<Plus className="size-3.5" />} onClick={() => aoMudar([...itens, { ...novo }])}>Adicionar</Botao>
    </div>
  );
}

function EditorSecao({ s, aoMudar, aoVoltar }: { s: Secao; aoMudar: (s: Secao) => void; aoVoltar: () => void }) {
  const m = (k: string) => (e: { target: { value: string } }) => aoMudar({ ...s, [k]: e.target.value });
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={aoVoltar} className="w-fit text-[12.5px] font-semibold text-suave hover:text-texto">← Todas as seções</button>
      <div className="font-titulo text-[16px] font-bold">{NOMES_SECAO[s.tipo]}</div>
      {"titulo" in s && <Campo rotulo="Título"><Entrada value={s.titulo ?? ""} onChange={m("titulo")} /></Campo>}
      {s.tipo === "topo" && (
        <>
          <Campo rotulo="Frase"><AreaTexto value={s.subtitulo ?? ""} onChange={m("subtitulo")} /></Campo>
          <Campo rotulo="Texto do botão"><Entrada value={s.botao ?? ""} onChange={m("botao")} /></Campo>
          <CampoImagem rotulo="Imagem de fundo" valor={s.imagem} aoMudar={(u) => aoMudar({ ...s, imagem: u })} />
        </>
      )}
      {(s.tipo === "aviso" || s.tipo === "texto_foto" || s.tipo === "contato") && <Campo rotulo="Texto"><AreaTexto rows={s.tipo === "texto_foto" ? 6 : 2} value={s.texto ?? ""} onChange={m("texto")} /></Campo>}
      {s.tipo === "texto_foto" && (
        <>
          <CampoImagem rotulo="Foto" valor={s.imagem} aoMudar={(u) => aoMudar({ ...s, imagem: u })} />
          <Campo rotulo="Foto do lado"><Selecao value={s.ladoImagem ?? "direita"} onChange={m("ladoImagem")} opcoes={[{ valor: "direita", rotulo: "Direito" }, { valor: "esquerda", rotulo: "Esquerdo" }]} /></Campo>
        </>
      )}
      {s.tipo === "video" && <Campo rotulo="Link do vídeo (YouTube ou Vimeo)"><Entrada value={s.url ?? ""} onChange={m("url")} placeholder="https://youtube.com/watch?v=..." /></Campo>}
      {s.tipo === "catalogo" && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={!!s.mostrarCategorias} onChange={(e) => aoMudar({ ...s, mostrarCategorias: e.target.checked })} /> Mostrar filtro de categorias</label>}
      {s.tipo === "beneficios" && <ListaItens itens={s.itens ?? []} aoMudar={(l) => aoMudar({ ...s, itens: l })} novo={{ icone: "⭐", titulo: "", texto: "" }} campos={[{ chave: "icone", rotulo: "Emoji" }, { chave: "titulo", rotulo: "Título" }, { chave: "texto", rotulo: "Texto" }]} />}
      {s.tipo === "depoimentos" && <ListaItens itens={s.itens ?? []} aoMudar={(l) => aoMudar({ ...s, itens: l })} novo={{ nome: "", texto: "", nota: 5 }} campos={[{ chave: "nome", rotulo: "Nome" }, { chave: "texto", rotulo: "Depoimento", area: true }]} />}
      {s.tipo === "perguntas" && <ListaItens itens={s.itens ?? []} aoMudar={(l) => aoMudar({ ...s, itens: l })} novo={{ pergunta: "", resposta: "" }} campos={[{ chave: "pergunta", rotulo: "Pergunta" }, { chave: "resposta", rotulo: "Resposta", area: true }]} />}
      {s.tipo === "galeria" && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">{(s.imagens ?? []).map((u: string, i: number) => (
            <div key={i} className="relative"><img src={u} alt="" className="aspect-square w-full rounded-lg object-cover" /><button type="button" onClick={() => aoMudar({ ...s, imagens: s.imagens.filter((_: string, j: number) => j !== i) })} className="absolute top-1 right-1 rounded bg-black/60 p-0.5 text-white"><Trash2 className="size-3" /></button></div>
          ))}</div>
          <CampoImagem rotulo="Adicionar foto" aoMudar={(u) => u && aoMudar({ ...s, imagens: [...(s.imagens ?? []), u] })} />
        </div>
      )}
      {s.tipo === "contato" && (
        <>
          <Campo rotulo="Instagram"><Entrada value={s.instagram ?? ""} onChange={m("instagram")} placeholder="@sualoja" /></Campo>
          <Campo rotulo="Endereço"><Entrada value={s.endereco ?? ""} onChange={m("endereco")} /></Campo>
          <Campo rotulo="Horário"><Entrada value={s.horario ?? ""} onChange={m("horario")} placeholder="Seg a Sáb, 9h às 18h" /></Campo>
          <p className="text-[12px] text-suave">O botão do WhatsApp usa o número conectado em Conexões.</p>
        </>
      )}
    </div>
  );
}

function Versoes({ aoFechar, aoRestaurar }: { aoFechar: () => void; aoRestaurar: () => void }) {
  const { dados } = useDados<any[]>("/pagina/versoes");
  const { executar } = useAcao();
  return (
    <Modal titulo="Versões publicadas" aoFechar={aoFechar}>
      {(dados ?? []).length === 0 ? <p className="text-sm text-suave">Nenhuma publicação ainda.</p> : (dados ?? []).map((v) => (
        <div key={v.id} className="mb-2 flex items-center justify-between rounded-xl border border-linha px-3 py-2 text-[13px]">
          <span>{dataHora(v.createdAt)} · {v.publicadaPor ?? "—"}</span>
          <Botao tamanho="sm" variante="secundario" onClick={() => executar(() => post(`/pagina/versoes/${v.id}/restaurar`), "Versão trazida para o rascunho").then(aoRestaurar)}>Restaurar</Botao>
        </div>
      ))}
    </Modal>
  );
}
