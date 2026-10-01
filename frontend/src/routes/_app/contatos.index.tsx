import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ContactRound, Download, MessageSquare, Plus, Tag as IconeTag, Trash2, Upload, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { AreaTexto, Botao, Campo, Entrada, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { Avatar, CabecalhoPagina, Card, Carregando, Selo, Tag, Vazio, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { baixar, post, qs } from "../../lib/api";
import { useAtraso, useDados } from "../../lib/dados";
import { num, relativo, telefone } from "../../lib/formato";
import { useSessao } from "../../lib/sessao";

export const Route = createFileRoute("/_app/contatos/")({
  validateSearch: (s: Record<string, unknown>): { busca?: string; novo?: string; importar?: string; tag?: string } => ({
    busca: typeof s.busca === "string" ? s.busca : undefined, novo: s.novo ? "1" : undefined, importar: s.importar ? "1" : undefined, tag: typeof s.tag === "string" ? s.tag : undefined,
  }),
  component: Contatos,
});

function Contatos() {
  const s = Route.useSearch();
  const navigate = useNavigate();
  const { pode } = useSessao();
  const { confirmar } = useAvisos();
  const [busca, setBusca] = useState(s.busca ?? "");
  const [tag, setTag] = useState(s.tag ?? "");
  const [ordem, setOrdem] = useState("");
  const [pagina, setPagina] = useState(1);
  const [sel, setSel] = useState<string[]>([]);
  const [novo, setNovo] = useState(!!s.novo);
  const [importar, setImportar] = useState(!!s.importar);
  const [tagsMassa, setTagsMassa] = useState(false);
  const b = useAtraso(busca);
  useEffect(() => setBusca(s.busca ?? ""), [s.busca]);
  useEffect(() => setPagina(1), [b, tag, ordem]);
  const { dados, recarregar } = useDados<any>(`/contatos${qs({ busca: b, tag, ordem, pagina, limite: 50 })}`);
  const { dados: tags } = useDados<any[]>("/contatos/tags");
  const { executar } = useAcao();
  const corTag = (n: string) => tags?.find((t) => t.nome === n)?.cor;

  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Contatos" icone={ContactRound} descricao={dados ? `${num(dados.total)} contatos na sua base` : "Sua agenda de clientes"}>
        {pode("supervisor") && <Botao variante="secundario" icone={<Download className="size-4" />} onClick={() => baixar(`/contatos/exportar${qs({ busca: b, tag })}`, "contatos.csv")}>Exportar</Botao>}
        <Botao variante="secundario" icone={<Upload className="size-4" />} onClick={() => setImportar(true)}>Importar</Botao>
        <Botao icone={<Plus className="size-4" />} onClick={() => setNovo(true)}>Novo contato</Botao>
      </CabecalhoPagina>

      <Card className="!p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-linha p-3">
          <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, telefone, e-mail ou @instagram" className="!w-80" />
          <Selecao vazio="Todas as tags" value={tag} onChange={(e) => setTag(e.target.value)} opcoes={(tags ?? []).map((t) => ({ valor: t.nome, rotulo: `${t.nome} (${t.contatos})` }))} className="!w-56" />
          <Selecao value={ordem} onChange={(e) => setOrdem(e.target.value)} opcoes={[{ valor: "", rotulo: "Últimos a conversar" }, { valor: "nome", rotulo: "Nome (A-Z)" }, { valor: "mensagens", rotulo: "Mais mensagens" }, { valor: "antigos", rotulo: "Mais antigos" }]} className="!w-52" />
          <Link to="/contatos/tags" className="ml-auto flex items-center gap-1 text-[13px] font-semibold text-laranja"><IconeTag className="size-4" /> Gerenciar tags</Link>
        </div>
        {sel.length > 0 && (
          <div className="flex items-center gap-3 border-b border-linha bg-orange-50 px-4 py-2 text-[13px]">
            <b>{sel.length} selecionados</b>
            <Botao tamanho="sm" variante="secundario" onClick={() => setTagsMassa(true)}>Tags</Botao>
            {pode("admin") && <Botao tamanho="sm" variante="perigo" icone={<Trash2 className="size-3.5" />} onClick={async () => {
              if (await confirmar(`Apagar ${sel.length} contatos? Conversas e histórico deles também somem.`, { perigo: true, botao: "Apagar" })) {
                await executar(() => post("/contatos/apagar-varios", { ids: sel }), "Contatos apagados");
                setSel([]);
                recarregar();
              }
            }}>Apagar</Botao>}
            <button type="button" onClick={() => setSel([])} className="ml-auto text-suave">Limpar seleção</button>
          </div>
        )}
        {!dados ? <Carregando /> : dados.itens.length === 0 ? <Vazio icone={Users} titulo="Nenhum contato encontrado" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className={cabecalhoTabela}>
                  <th className="w-10 px-4 py-2.5"><input type="checkbox" checked={sel.length === dados.itens.length} onChange={(e) => setSel(e.target.checked ? dados.itens.map((c: any) => c.id) : [])} /></th>
                  <th>Contato</th><th>Telefone</th><th>Tags</th><th>Origem</th><th className="text-right">Mensagens</th><th>Último contato</th><th></th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((c: any) => (
                  <tr key={c.id} className={linhaTabela}>
                    <td className="px-4"><input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} /></td>
                    <td className="py-2.5">
                      <Link to="/contatos/$id" params={{ id: c.id }} className="flex items-center gap-2.5">
                        <Avatar nome={c.nome ?? c.telefone} foto={c.fotoUrl} tamanho={34} />
                        <div className="min-w-0"><div className="font-semibold hover:text-laranja">{c.nome ?? "Sem nome"}</div>{c.email && <div className="text-[11.5px] text-suave">{c.email}</div>}</div>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{c.telefone ? telefone(c.telefone) : c.instagramUsuario ? `@${c.instagramUsuario}` : "—"}</td>
                    <td><div className="flex max-w-[260px] flex-wrap gap-1">{(c.tags ?? []).map((t: string) => <Tag key={t} nome={t} cor={corTag(t)} />)}</div></td>
                    <td>{c.origem ? <Selo>{c.origem}</Selo> : "—"}</td>
                    <td className="text-right">{c.totalMensagens}</td>
                    <td className="text-suave">{relativo(c.ultimoContatoEm)}</td>
                    <td className="pr-3">{c.conversaId && <button type="button" onClick={() => navigate({ to: "/conversas", search: { c: c.conversaId } })} title="Abrir conversa" className="rounded-lg p-1.5 text-suave hover:bg-fundo hover:text-laranja"><MessageSquare className="size-4" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {dados && dados.total > 50 && (
          <div className="flex items-center justify-between p-3 text-[12.5px] text-suave">
            <span>Página {pagina} de {Math.ceil(dados.total / 50)}</span>
            <div className="flex gap-2">
              <Botao variante="secundario" tamanho="sm" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</Botao>
              <Botao variante="secundario" tamanho="sm" disabled={pagina * 50 >= dados.total} onClick={() => setPagina(pagina + 1)}>Próxima</Botao>
            </div>
          </div>
        )}
      </Card>

      {novo && <NovoContato aoFechar={() => { setNovo(false); recarregar(); }} />}
      {importar && <Importar aoFechar={() => { setImportar(false); recarregar(); }} />}
      {tagsMassa && <TagsEmMassa ids={sel} tags={tags ?? []} aoFechar={() => { setTagsMassa(false); setSel([]); recarregar(); }} />}
    </div>
  );
}

function NovoContato({ aoFechar }: { aoFechar: () => void }) {
  const [d, setD] = useState({ nome: "", telefone: "", email: "", aniversario: "", notas: "" });
  const { executar, carregando } = useAcao();
  return (
    <Modal titulo="Novo contato" aoFechar={aoFechar} rodape={<Botao carregando={carregando} onClick={() => executar(() => post("/contatos", d), "Contato criado").then((r) => r && aoFechar())}>Salvar</Botao>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome"><Entrada value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} /></Campo>
        <Campo rotulo="WhatsApp"><Entrada value={d.telefone} onChange={(e) => setD({ ...d, telefone: e.target.value })} placeholder="(51) 99999-9999" /></Campo>
        <Campo rotulo="E-mail"><Entrada type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></Campo>
        <Campo rotulo="Aniversário"><Entrada type="date" value={d.aniversario} onChange={(e) => setD({ ...d, aniversario: e.target.value })} /></Campo>
        <Campo rotulo="Anotações" className="sm:col-span-2"><AreaTexto value={d.notas} onChange={(e) => setD({ ...d, notas: e.target.value })} /></Campo>
      </div>
    </Modal>
  );
}

function Importar({ aoFechar }: { aoFechar: () => void }) {
  const [csv, setCsv] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [tags, setTags] = useState("");
  const [resultado, setResultado] = useState<any>(null);
  const { executar, carregando } = useAcao();
  return (
    <Modal titulo="Importar contatos" aoFechar={aoFechar} rodape={resultado ? <Botao onClick={aoFechar}>Fechar</Botao> : <Botao carregando={carregando} disabled={!csv} onClick={() => executar(() => post("/contatos/importar", { csv, tags: tags.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean) })).then(setResultado)}>Importar</Botao>}>
      {resultado ? (
        <div className="text-center">
          <div className="text-4xl">✅</div>
          <p className="mt-2 text-[14px]"><b>{resultado.criados}</b> novos · <b>{resultado.atualizados}</b> atualizados · <b>{resultado.ignorados}</b> sem telefone (ignorados)</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-suave">Envie uma planilha salva como <b>CSV</b>. A primeira linha precisa ter os nomes das colunas: <b>nome</b>, <b>telefone</b>, e (se tiver) <b>email</b>, <b>tags</b> (separadas por |), <b>aniversario</b>, <b>notas</b>. Outras colunas viram campos do contato.</p>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-linha-2 p-6 text-center hover:border-laranja">
            <Upload className="size-8 text-laranja" />
            <span className="text-[13.5px] font-semibold">{nomeArquivo || "Clique para escolher o arquivo .csv"}</span>
            <input type="file" accept=".csv,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setNomeArquivo(f.name); setCsv(await f.text()); } }} />
          </label>
          <Campo rotulo="Marcar todos com as tags (opcional)" dica="Separe por vírgula."><Entrada value={tags} onChange={(e) => setTags(e.target.value)} placeholder="LISTA SETEMBRO, EVENTO" /></Campo>
        </div>
      )}
    </Modal>
  );
}

function TagsEmMassa({ ids, tags, aoFechar }: { ids: string[]; tags: any[]; aoFechar: () => void }) {
  const [adicionar, setAdicionar] = useState<string[]>([]);
  const [remover, setRemover] = useState<string[]>([]);
  const { executar, carregando } = useAcao();
  return (
    <Modal titulo={`Tags em ${ids.length} contatos`} aoFechar={aoFechar} rodape={<Botao carregando={carregando} onClick={() => executar(() => post("/contatos/tags-em-massa", { ids, adicionar, remover }), "Tags aplicadas").then(aoFechar)}>Aplicar</Botao>}>
      <div className="flex flex-col gap-2">
        {tags.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-xl border border-linha px-3 py-2">
            <Tag nome={t.nome} cor={t.cor} />
            <div className="flex gap-1 text-[12px]">
              <button type="button" onClick={() => { setAdicionar(adicionar.includes(t.nome) ? adicionar.filter((x) => x !== t.nome) : [...adicionar, t.nome]); setRemover(remover.filter((x) => x !== t.nome)); }}
                className={`rounded-lg px-2 py-1 font-semibold ${adicionar.includes(t.nome) ? "bg-verde text-white" : "bg-fundo"}`}>+ Pôr</button>
              <button type="button" onClick={() => { setRemover(remover.includes(t.nome) ? remover.filter((x) => x !== t.nome) : [...remover, t.nome]); setAdicionar(adicionar.filter((x) => x !== t.nome)); }}
                className={`rounded-lg px-2 py-1 font-semibold ${remover.includes(t.nome) ? "bg-vermelho text-white" : "bg-fundo"}`}>− Tirar</button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
