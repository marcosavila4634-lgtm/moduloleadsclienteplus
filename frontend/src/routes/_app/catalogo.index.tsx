import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, BellRing, FolderPlus, Package, Plus, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { Botao, Campo, Entrada, Modal, Selecao, useAcao } from "../../components/form";
import { CabecalhoPagina, Card, Carregando, Dica, ImagemArquivo, Selo, Vazio } from "../../components/ui";
import { post, qs } from "../../lib/api";
import { useAtraso, useDados } from "../../lib/dados";
import { reais } from "../../lib/formato";

export const Route = createFileRoute("/_app/catalogo/")({ component: Catalogo });

function Catalogo() {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [baixo, setBaixo] = useState(false);
  const b = useAtraso(busca);
  const { dados } = useDados<any[]>(`/catalogo/produtos${qs({ busca: b, categoria, estoqueBaixo: baixo })}`);
  const { dados: categorias, recarregar: recCat } = useDados<any[]>("/catalogo/categorias");
  const [novaCat, setNovaCat] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Catálogo" icone={ShoppingBag} descricao="Seus produtos com fotos, vídeos, preço e estoque. Aparecem na loja online e o robô vende por eles.">
        <Link to="/catalogo/lista-espera"><Botao variante="secundario" icone={<BellRing className="size-4" />}>Avise-me</Botao></Link>
        <Botao variante="secundario" icone={<FolderPlus className="size-4" />} onClick={() => setNovaCat(true)}>Categoria</Botao>
        <Botao data-tour="novo-produto" icone={<Plus className="size-4" />} onClick={() => navigate({ to: "/catalogo/$id", params: { id: "novo" } })}>Novo produto</Botao>
      </CabecalhoPagina>
      <div className="flex flex-wrap gap-2">
        <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto ou código" className="!w-72" />
        <Selecao vazio="Todas as categorias" value={categoria} onChange={(e) => setCategoria(e.target.value)} opcoes={(categorias ?? []).map((c) => ({ valor: c.id, rotulo: `${c.nome} (${c.produtos})` }))} className="!w-56" />
        <button type="button" onClick={() => setBaixo(!baixo)} className={`flex items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold ring-1 ${baixo ? "bg-vermelho text-white ring-vermelho" : "bg-white ring-linha"}`}><AlertTriangle className="size-4" /> Estoque baixo</button>
      </div>
      {!dados ? <Carregando /> : dados.length === 0 ? (
        <Card><Vazio icone={Package} titulo="Nenhum produto ainda" acao={<Botao onClick={() => navigate({ to: "/catalogo/$id", params: { id: "novo" } })}>Cadastrar produto</Botao>}>Cadastre o que você vende. Dá para colocar fotos, vídeos e opções como tamanho e cor.</Vazio></Card>
      ) : (
        <div data-tour="lista-produtos" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {dados.map((p) => {
            const capa = (p.midias ?? []).find((m: any) => m.capa && m.tipo === "image") ?? (p.midias ?? []).find((m: any) => m.tipo === "image");
            const semEstoque = p.controlaEstoque && p.estoque <= 0 && !p.vendeSemEstoque;
            return (
              <Link key={p.id} to="/catalogo/$id" params={{ id: p.id }} className="sombra-cartao group overflow-hidden rounded-2xl border border-linha bg-cartao transition hover:-translate-y-0.5 hover:border-laranja/50">
                <div className="relative aspect-[4/3] bg-fundo-2">
                  {capa ? <ImagemArquivo url={capa.url} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-suave"><Package className="size-10" /></div>}
                  <div className="absolute top-2 left-2 flex gap-1">
                    {p.emPromocao && <Selo cor="vermelho">Promoção</Selo>}
                    {p.destaque && <Selo cor="ambar">Destaque</Selo>}
                    {!p.ativo && <Selo>Inativo</Selo>}
                  </div>
                </div>
                <div className="p-3">
                  <div className="truncate font-semibold">{p.nome}</div>
                  <div className="text-[12px] text-suave">{p.categoriaNome ?? "Sem categoria"}{p.variacoes > 0 && ` · ${p.variacoes} opções`}</div>
                  <div className="mt-2 flex items-end justify-between">
                    <div>
                      {p.emPromocao && <div className="text-[11.5px] text-suave line-through">{reais(p.preco)}</div>}
                      <div className="font-titulo text-[17px] font-bold text-laranja">{reais(p.precoAtual)}</div>
                    </div>
                    <div className="text-right text-[12px]">
                      {p.controlaEstoque ? <span className={semEstoque ? "font-semibold text-vermelho" : p.estoque <= p.estoqueMinimo ? "font-semibold text-ambar" : "text-suave"}>{semEstoque ? "Sem estoque" : `${p.estoque} em estoque`}</span> : <span className="text-suave">Sem controle</span>}
                      {p.listaEspera > 0 && <div className="text-petroleo">{p.listaEspera} esperando</div>}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <Dica>Produto sem estoque mostra o botão <b>“Avise-me quando chegar”</b> na loja. Quando você der entrada no estoque, o sistema avisa essas pessoas no WhatsApp sozinho.</Dica>
      {novaCat && <NovaCategoria aoFechar={() => { setNovaCat(false); recCat(); }} />}
    </div>
  );
}

function NovaCategoria({ aoFechar }: { aoFechar: () => void }) {
  const [nome, setNome] = useState("");
  const { executar } = useAcao();
  return (
    <Modal titulo="Nova categoria" aoFechar={aoFechar} rodape={<Botao onClick={() => executar(() => post("/catalogo/categorias", { nome }), "Categoria criada").then(aoFechar)}>Criar</Botao>}>
      <Campo rotulo="Nome"><Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Camisetas" /></Campo>
    </Modal>
  );
}
