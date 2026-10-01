import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Plus, SlidersHorizontal, Tag as IconeTag, Trash2 } from "lucide-react";
import { useState } from "react";
import { AreaTexto, Botao, Campo, Entrada, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { CabecalhoPagina, Card, Carregando, Dica, Tag, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { del, post, put } from "../../lib/api";
import { useDados } from "../../lib/dados";

export const Route = createFileRoute("/_app/contatos/tags")({ component: Tags });

function Tags() {
  const { dados, recarregar } = useDados<any[]>("/contatos/tags");
  const { dados: campos, recarregar: recarregarCampos } = useDados<any[]>("/contatos/campos");
  const [editar, setEditar] = useState<any>(null);
  const [campo, setCampo] = useState<any>(null);
  const { executar } = useAcao();
  const { confirmar } = useAvisos();
  return (
    <div className="flex flex-col gap-4">
      <Link to="/contatos" className="flex w-fit items-center gap-1 text-[13px] font-semibold text-suave hover:text-texto"><ArrowLeft className="size-4" /> Contatos</Link>
      <CabecalhoPagina titulo="Tags e campos" icone={IconeTag} descricao="Etiquetas para organizar os clientes. A descrição ensina a IA quando marcar cada tag.">
        <Botao icone={<Plus className="size-4" />} onClick={() => setEditar({ nome: "", cor: "#f47b20", descricao: "" })}>Nova tag</Botao>
      </CabecalhoPagina>
      <Dica>Escreva na descrição <b>quando</b> a tag deve ser usada (ex.: "Quando o cliente pedir desconto"). O robô de IA lê isso e marca sozinho. Automações podem começar quando uma tag é marcada.</Dica>
      <Card className="!p-0">
        {!dados ? <Carregando /> : (
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2.5">Tag</th><th>Quando usar</th><th className="text-right">Contatos</th><th></th></tr></thead>
            <tbody>
              {dados.map((t) => (
                <tr key={t.id} className={linhaTabela}>
                  <td className="px-4 py-2.5"><Tag nome={t.nome} cor={t.cor} /></td>
                  <td className="max-w-xl text-suave">{t.descricao || "—"}</td>
                  <td className="text-right font-semibold">{t.contatos}</td>
                  <td className="w-24 pr-3 text-right">
                    <button type="button" onClick={() => setEditar(t)} className="rounded-lg p-1.5 text-suave hover:bg-fundo hover:text-texto"><Pencil className="size-4" /></button>
                    <button type="button" onClick={async () => { if (await confirmar(`Apagar a tag ${t.nome}? Ela sai de todos os contatos.`, { perigo: true, botao: "Apagar" })) executar(() => del(`/contatos/tags/${t.id}`), "Tag apagada").then(recarregar); }} className="rounded-lg p-1.5 text-suave hover:bg-fundo hover:text-vermelho"><Trash2 className="size-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <CabecalhoPagina titulo="Campos personalizados" icone={SlidersHorizontal} descricao="Informações extras da ficha do cliente (tamanho, cidade, CPF...). A IA também enxerga.">
        <Botao variante="secundario" icone={<Plus className="size-4" />} onClick={() => setCampo({ nome: "", tipo: "texto", opcoes: [] })}>Novo campo</Botao>
      </CabecalhoPagina>
      <Card className="!p-0">
        <table className="w-full text-[13px]">
          <thead><tr className={cabecalhoTabela}><th className="px-4 py-2.5">Campo</th><th>Tipo</th><th>Chave</th><th></th></tr></thead>
          <tbody>
            {(campos ?? []).map((c) => (
              <tr key={c.id} className={linhaTabela}>
                <td className="px-4 py-2.5 font-semibold">{c.nome}</td><td>{c.tipo}</td><td className="text-suave">{c.chave}</td>
                <td className="w-24 pr-3 text-right">
                  <button type="button" onClick={() => setCampo(c)} className="rounded-lg p-1.5 text-suave hover:bg-fundo"><Pencil className="size-4" /></button>
                  <button type="button" onClick={() => executar(() => del(`/contatos/campos/${c.id}`), "Campo apagado").then(recarregarCampos)} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button>
                </td>
              </tr>
            ))}
            {(campos ?? []).length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-suave">Nenhum campo extra.</td></tr>}
          </tbody>
        </table>
      </Card>

      {editar && (
        <Modal titulo={editar.id ? "Editar tag" : "Nova tag"} aoFechar={() => setEditar(null)} rodape={
          <Botao onClick={() => executar(() => (editar.id ? put(`/contatos/tags/${editar.id}`, editar) : post("/contatos/tags", editar)), "Tag salva").then((r) => { if (r) { setEditar(null); recarregar(); } })}>Salvar</Botao>}>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <Campo rotulo="Nome" className="flex-1"><Entrada value={editar.nome} onChange={(e) => setEditar({ ...editar, nome: e.target.value.toUpperCase() })} /></Campo>
              <Campo rotulo="Cor"><input type="color" value={editar.cor} onChange={(e) => setEditar({ ...editar, cor: e.target.value })} className="h-10 w-14 rounded-xl" /></Campo>
            </div>
            <Campo rotulo="Quando usar (a IA lê isto)"><AreaTexto value={editar.descricao ?? ""} onChange={(e) => setEditar({ ...editar, descricao: e.target.value })} placeholder="Ex.: Quando o cliente disser que vai comprar mas ainda não pagou." /></Campo>
          </div>
        </Modal>
      )}
      {campo && (
        <Modal titulo={campo.id ? "Editar campo" : "Novo campo"} aoFechar={() => setCampo(null)} rodape={
          <Botao onClick={() => executar(() => (campo.id ? put(`/contatos/campos/${campo.id}`, campo) : post("/contatos/campos", campo)), "Campo salvo").then((r) => { if (r) { setCampo(null); recarregarCampos(); } })}>Salvar</Botao>}>
          <div className="flex flex-col gap-3">
            <Campo rotulo="Nome"><Entrada value={campo.nome} onChange={(e) => setCampo({ ...campo, nome: e.target.value })} /></Campo>
            <Campo rotulo="Tipo"><Selecao value={campo.tipo} onChange={(e) => setCampo({ ...campo, tipo: e.target.value })} opcoes={[{ valor: "texto", rotulo: "Texto" }, { valor: "numero", rotulo: "Número" }, { valor: "data", rotulo: "Data" }, { valor: "selecao", rotulo: "Lista de opções" }]} /></Campo>
            {campo.tipo === "selecao" && <Campo rotulo="Opções (uma por linha)"><AreaTexto value={(campo.opcoes ?? []).join("\n")} onChange={(e) => setCampo({ ...campo, opcoes: e.target.value.split("\n").filter(Boolean) })} /></Campo>}
          </div>
        </Modal>
      )}
    </div>
  );
}
