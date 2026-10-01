import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ImagePlus, Minus, Plus, Save, Star, Trash2, Video, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AreaTexto, Botao, Campo, Entrada, Interruptor, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { Card, Carregando, ImagemArquivo, Selo, TituloCard } from "../../components/ui";
import { del, enviarArquivo, get, post, put } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { dataHora, reais, telefone } from "../../lib/formato";

export const Route = createFileRoute("/_app/catalogo/$id")({ component: EditorProduto });

const vazio = { nome: "", descricao: "", categoriaId: "", sku: "", preco: "", precoPromocional: "", promoInicio: "", promoFim: "", midias: [] as any[], atributos: [] as string[], variacoes: [] as any[],
  controlaEstoque: true, estoque: 0, estoqueMinimo: 0, vendeSemEstoque: false, ativo: true, publico: true, destaque: false, iaPodeVender: true, tags: [] as string[], diasRecompra: "", mensagemRecompra: "" };

function EditorProduto() {
  const { id } = Route.useParams();
  const novo = id === "novo";
  const navigate = useNavigate();
  const { dados: p, recarregar } = useDados<any>(novo ? null : `/catalogo/produtos/${id}`);
  const { dados: categorias } = useDados<any[]>("/catalogo/categorias");
  const [f, setF] = useState<any>(novo ? vazio : null);
  const [estoqueAberto, setEstoqueAberto] = useState<any>(null);
  const [enviando, setEnviando] = useState(false);
  const { executar, carregando } = useAcao();
  const { confirmar, avisar } = useAvisos();
  useEffect(() => {
    if (p) setF({ ...vazio, ...p, categoriaId: p.categoriaId ?? "", preco: String(p.preco).replace(".", ","), precoPromocional: p.precoPromocional == null ? "" : String(p.precoPromocional).replace(".", ","),
      promoInicio: p.promoInicio?.slice(0, 16) ?? "", promoFim: p.promoFim?.slice(0, 16) ?? "", diasRecompra: p.diasRecompra ?? "", mensagemRecompra: p.mensagemRecompra ?? "" });
  }, [p?.id, p?.updatedAt]);
  if (!f) return <Carregando />;
  const n = (s: string) => (s === "" ? null : Number(String(s).replace(/\./g, "").replace(",", ".")));

  const salvar = async () => {
    const corpo = { ...f, preco: n(f.preco) ?? 0, precoPromocional: n(f.precoPromocional), promoInicio: f.promoInicio ? new Date(f.promoInicio).toISOString() : null, promoFim: f.promoFim ? new Date(f.promoFim).toISOString() : null,
      categoriaId: f.categoriaId || null, diasRecompra: f.diasRecompra === "" ? null : Number(f.diasRecompra), variacoes: f.variacoes.map((v: any) => ({ ...v, preco: v.preco === "" || v.preco == null ? null : n(String(v.preco)) })) };
    const r = await executar(() => (novo ? post<any>("/catalogo/produtos", corpo) : put<any>(`/catalogo/produtos/${id}`, corpo)), "Produto salvo");
    if (r && novo) navigate({ to: "/catalogo/$id", params: { id: r.id } });
    else if (r) recarregar();
  };

  const subir = async (arquivos: FileList | null) => {
    if (!arquivos) return;
    setEnviando(true);
    try {
      const novas = [];
      for (const a of Array.from(arquivos)) {
        const r = await enviarArquivo(a, true);
        // endereço público: a foto aparece na loja online para qualquer visitante
        novas.push({ url: `/api/arquivos/p/${r.id}/${encodeURIComponent(r.nome)}`, tipo: a.type.startsWith("video/") ? "video" : "image", capa: f.midias.length === 0 && novas.length === 0 });
      }
      setF({ ...f, midias: [...f.midias, ...novas] });
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao enviar", "erro");
    } finally {
      setEnviando(false);
    }
  };

  const gerarVariacoes = () => {
    // combina os valores de cada atributo (ex.: Tamanho: P,M,G × Cor: Preto,Branco)
    const listas: { attr: string; valores: string[] }[] = f.atributos.map((a: string) => ({ attr: a.split(":")[0].trim(), valores: (a.split(":")[1] ?? "").split(",").map((x: string) => x.trim()).filter(Boolean) })).filter((l: any) => l.valores.length);
    let comb: Record<string, string>[] = [{}];
    for (const l of listas) comb = comb.flatMap((c) => l.valores.map((v) => ({ ...c, [l.attr]: v })));
    const novas = comb.filter((c) => Object.keys(c).length).map((c) => {
      const nome = Object.values(c).join(" / ");
      return f.variacoes.find((v: any) => v.nome === nome) ?? { nome, valores: c, estoque: 0, preco: "", ativo: true };
    });
    setF({ ...f, variacoes: novas });
  };

  return (
    <div className="flex flex-col gap-4">
      <Link to="/catalogo" className="flex w-fit items-center gap-1 text-[13px] font-semibold text-suave hover:text-texto"><ArrowLeft className="size-4" /> Catálogo</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-titulo text-[24px] font-bold">{novo ? "Novo produto" : f.nome}</h1>
        <div className="flex gap-2">
          {!novo && <Botao variante="fantasma" className="!text-vermelho" icone={<Trash2 className="size-4" />} onClick={async () => { if (await confirmar("Apagar este produto? Se já teve pedidos, ele só é arquivado.", { perigo: true, botao: "Apagar" })) executar(() => del(`/catalogo/produtos/${id}`), "Produto removido").then(() => navigate({ to: "/catalogo" })); }}>Apagar</Botao>}
          <Botao carregando={carregando} icone={<Save className="size-4" />} onClick={salvar}>Salvar produto</Botao>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <Card className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome do produto" className="sm:col-span-2"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
            <Campo rotulo="Descrição" className="sm:col-span-2" dica="Aparece na loja e a IA usa para explicar o produto."><AreaTexto rows={5} value={f.descricao ?? ""} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Campo>
            <Campo rotulo="Categoria"><Selecao vazio="Sem categoria" value={f.categoriaId} onChange={(e) => setF({ ...f, categoriaId: e.target.value })} opcoes={(categorias ?? []).map((c) => ({ valor: c.id, rotulo: c.nome }))} /></Campo>
            <Campo rotulo="Código (SKU)"><Entrada value={f.sku ?? ""} onChange={(e) => setF({ ...f, sku: e.target.value })} /></Campo>
          </Card>

          <Card>
            <TituloCard icone={ImagePlus} acao={<label className="cursor-pointer text-[12.5px] font-semibold text-laranja">{enviando ? "Enviando..." : "+ Fotos e vídeos"}<input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => subir(e.target.files)} /></label>}>Fotos e vídeos</TituloCard>
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {f.midias.map((m: any, i: number) => (
                <div key={i} className={`group relative aspect-square overflow-hidden rounded-xl border-2 ${m.capa ? "border-laranja" : "border-linha"}`}>
                  {m.tipo === "video" ? <div className="grid h-full place-items-center bg-fundo-2"><Video className="size-8 text-suave" /></div> : <ImagemArquivo url={m.url} className="h-full w-full object-cover" />}
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 p-1 opacity-0 transition group-hover:opacity-100">
                    <button type="button" title="Usar como capa" onClick={() => setF({ ...f, midias: f.midias.map((x: any, j: number) => ({ ...x, capa: j === i })) })} className="rounded p-1 text-white"><Star className="size-4" /></button>
                    <button type="button" title="Remover" onClick={() => setF({ ...f, midias: f.midias.filter((_: any, j: number) => j !== i) })} className="rounded p-1 text-white"><X className="size-4" /></button>
                  </div>
                  {m.capa && <span className="absolute top-1 left-1 rounded bg-laranja px-1.5 text-[10px] font-bold text-white">CAPA</span>}
                </div>
              ))}
              {f.midias.length === 0 && <div className="col-span-full rounded-xl border-2 border-dashed border-linha-2 p-6 text-center text-[13px] text-suave">Nenhuma foto ainda. Produtos com fotos vendem muito mais!</div>}
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <TituloCard>Opções (tamanho, cor...)</TituloCard>
            <p className="text-[12.5px] text-suave">Escreva cada atributo com os valores, um por linha. Ex.: <code>Tamanho: P, M, G</code> e <code>Cor: Preto, Branco</code>. Depois clique em gerar.</p>
            <AreaTexto rows={3} value={f.atributos.join("\n")} onChange={(e) => setF({ ...f, atributos: e.target.value.split("\n") })} placeholder={"Tamanho: P, M, G\nCor: Preto, Branco"} />
            <Botao variante="secundario" tamanho="sm" className="self-start" onClick={gerarVariacoes}>Gerar combinações</Botao>
            {f.variacoes.length > 0 && (
              <table className="w-full text-[13px]">
                <thead><tr className="text-left text-[11px] text-suave uppercase"><th className="py-1">Opção</th><th>Preço (vazio = do produto)</th><th>Estoque</th><th>Ativa</th></tr></thead>
                <tbody>
                  {f.variacoes.map((v: any, i: number) => (
                    <tr key={i} className="border-t border-linha">
                      <td className="py-1.5 font-medium">{v.nome}</td>
                      <td><Entrada value={v.preco ?? ""} onChange={(e) => setF({ ...f, variacoes: f.variacoes.map((x: any, j: number) => (j === i ? { ...x, preco: e.target.value } : x)) })} className="!w-28 !py-1" /></td>
                      <td><Entrada type="number" value={v.estoque} onChange={(e) => setF({ ...f, variacoes: f.variacoes.map((x: any, j: number) => (j === i ? { ...x, estoque: Number(e.target.value) } : x)) })} className="!w-24 !py-1" /></td>
                      <td><input type="checkbox" checked={v.ativo !== false} onChange={(e) => setF({ ...f, variacoes: f.variacoes.map((x: any, j: number) => (j === i ? { ...x, ativo: e.target.checked } : x)) })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {!novo && p?.movimentos && (
            <Card>
              <TituloCard>Movimentos de estoque</TituloCard>
              <table className="mt-2 w-full text-[12.5px]">
                <thead><tr className="text-left text-[11px] text-suave uppercase"><th className="py-1">Quando</th><th>Tipo</th><th>Opção</th><th className="text-right">Qtd</th><th className="text-right">Saldo</th><th>Motivo</th></tr></thead>
                <tbody>
                  {p.movimentos.map((m: any) => (
                    <tr key={m.id} className="border-t border-linha"><td className="py-1.5">{dataHora(m.createdAt)}</td><td>{m.tipo}</td><td>{m.variacaoNome ?? "—"}</td>
                      <td className={`text-right font-semibold ${m.quantidade > 0 ? "text-verde" : "text-vermelho"}`}>{m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}</td><td className="text-right">{m.saldo}</td><td className="text-suave">{m.motivo ?? m.usuarioNome ?? ""}</td></tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <TituloCard>Preço</TituloCard>
            <Campo rotulo="Preço (R$)"><Entrada value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} inputMode="decimal" /></Campo>
            <Campo rotulo="Preço promocional (R$)" dica="Deixe vazio se não houver promoção."><Entrada value={f.precoPromocional} onChange={(e) => setF({ ...f, precoPromocional: e.target.value })} inputMode="decimal" /></Campo>
            {f.precoPromocional !== "" && (
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Início"><Entrada type="datetime-local" value={f.promoInicio} onChange={(e) => setF({ ...f, promoInicio: e.target.value })} /></Campo>
                <Campo rotulo="Fim"><Entrada type="datetime-local" value={f.promoFim} onChange={(e) => setF({ ...f, promoFim: e.target.value })} /></Campo>
              </div>
            )}
          </Card>
          <Card className="flex flex-col gap-3">
            <TituloCard>Estoque</TituloCard>
            <Interruptor ligado={f.controlaEstoque} aoMudar={(v) => setF({ ...f, controlaEstoque: v })} rotulo="Controlar estoque" />
            {f.controlaEstoque && (
              <>
                {f.variacoes.length === 0 && (novo
                  ? <Campo rotulo="Estoque inicial"><Entrada type="number" value={f.estoque} onChange={(e) => setF({ ...f, estoque: Number(e.target.value) })} /></Campo>
                  : <div className="flex items-center justify-between rounded-xl bg-fundo px-3 py-2"><span className="text-[13px]">Em estoque: <b className="text-lg">{p?.estoque}</b></span><Botao tamanho="sm" onClick={() => setEstoqueAberto({ variacaoId: null })}>Entrada / saída</Botao></div>)}
                {!novo && f.variacoes.length > 0 && <Botao tamanho="sm" variante="secundario" onClick={() => setEstoqueAberto({ variacaoId: f.variacoes[0]?.id ?? null })}>Entrada / saída por opção</Botao>}
                <Campo rotulo="Avisar quando ficar com menos de"><Entrada type="number" value={f.estoqueMinimo} onChange={(e) => setF({ ...f, estoqueMinimo: Number(e.target.value) })} /></Campo>
                <Interruptor ligado={f.vendeSemEstoque} aoMudar={(v) => setF({ ...f, vendeSemEstoque: v })} rotulo="Vender sem estoque (sob encomenda)" />
              </>
            )}
          </Card>
          <Card className="flex flex-col gap-3">
            <TituloCard>Onde aparece</TituloCard>
            <Interruptor ligado={f.ativo} aoMudar={(v) => setF({ ...f, ativo: v })} rotulo="Ativo" />
            <Interruptor ligado={f.publico} aoMudar={(v) => setF({ ...f, publico: v })} rotulo="Mostrar na loja online" />
            <Interruptor ligado={f.destaque} aoMudar={(v) => setF({ ...f, destaque: v })} rotulo="Destaque (aparece primeiro)" />
            <Interruptor ligado={f.iaPodeVender} aoMudar={(v) => setF({ ...f, iaPodeVender: v })} rotulo="O robô pode oferecer" />
          </Card>
          <Card className="flex flex-col gap-3">
            <TituloCard>Recompra</TituloCard>
            <Campo rotulo="Dura quantos dias?" dica="Ex.: 30. Uns dias antes de acabar, o cliente recebe um lembrete para comprar de novo."><Entrada type="number" value={f.diasRecompra} onChange={(e) => setF({ ...f, diasRecompra: e.target.value })} placeholder="Não lembrar" /></Campo>
            {f.diasRecompra !== "" && <Campo rotulo="Mensagem do lembrete"><AreaTexto value={f.mensagemRecompra} onChange={(e) => setF({ ...f, mensagemRecompra: e.target.value })} placeholder="Oi {primeiro_nome}! Seu {produto} deve estar acabando. Quer que eu separe outro? {link}" /></Campo>}
          </Card>
          {!novo && (p?.listaEspera ?? []).length > 0 && (
            <Card>
              <TituloCard>Esperando chegar ({p.listaEspera.filter((l: any) => l.status === "aguardando").length})</TituloCard>
              <ul className="mt-2 text-[12.5px]">{p.listaEspera.map((l: any) => <li key={l.id} className="flex justify-between py-1">{l.nome ?? telefone(l.telefone)}<Selo cor={l.status === "avisado" ? "verde" : "ambar"}>{l.status}</Selo></li>)}</ul>
            </Card>
          )}
        </div>
      </div>
      {estoqueAberto && <MovEstoque produto={id} variacoes={f.variacoes} inicial={estoqueAberto.variacaoId} aoFechar={() => { setEstoqueAberto(null); recarregar(); }} />}
    </div>
  );
}

function MovEstoque({ produto, variacoes, inicial, aoFechar }: { produto: string; variacoes: any[]; inicial: string | null; aoFechar: () => void }) {
  const [variacao, setVariacao] = useState(inicial ?? "");
  const [qtd, setQtd] = useState(1);
  const [entrada, setEntrada] = useState(true);
  const [motivo, setMotivo] = useState("");
  const { executar, carregando } = useAcao();
  return (
    <Modal titulo="Movimentar estoque" aoFechar={aoFechar} rodape={
      <Botao carregando={carregando} onClick={() => executar(() => post(`/catalogo/produtos/${produto}/estoque`, { variacaoId: variacao || null, quantidade: entrada ? qtd : -qtd, tipo: entrada ? "entrada" : "saida", motivo }), "Estoque atualizado").then((r) => r && aoFechar())}>Confirmar</Botao>}>
      <div className="flex flex-col gap-3">
        {variacoes.length > 0 && <Campo rotulo="Opção"><Selecao value={variacao} onChange={(e) => setVariacao(e.target.value)} opcoes={variacoes.filter((v) => v.id).map((v) => ({ valor: v.id, rotulo: `${v.nome} (${v.estoque})` }))} /></Campo>}
        <div className="flex gap-2">
          <Botao variante={entrada ? "primario" : "secundario"} icone={<Plus className="size-4" />} onClick={() => setEntrada(true)}>Entrada</Botao>
          <Botao variante={!entrada ? "perigo" : "secundario"} icone={<Minus className="size-4" />} onClick={() => setEntrada(false)}>Saída</Botao>
        </div>
        <Campo rotulo="Quantidade"><Entrada type="number" min={1} value={qtd} onChange={(e) => setQtd(Math.max(1, Number(e.target.value)))} /></Campo>
        <Campo rotulo="Motivo (opcional)"><Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: chegou mercadoria, perda, brinde" /></Campo>
      </div>
    </Modal>
  );
}

export { get };
