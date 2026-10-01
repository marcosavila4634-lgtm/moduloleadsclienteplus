import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Copy, Folder, FolderPlus, Plus, Trash2, Workflow } from "lucide-react";
import { useState } from "react";
import { Botao, Campo, Entrada, Modal, useAcao, useAvisos } from "../../components/form";
import { CabecalhoPagina, Card, Carregando, Dica, Selo, Vazio, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { blocoDe } from "../../lib/automacoes";
import { del, post } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { dataHora } from "../../lib/formato";

export const Route = createFileRoute("/_app/automacoes/")({ component: Automacoes });

const MODELOS = [
  { nome: "Boas-vindas para novo contato", grafo: grafoSimples("contact_created", {}, [{ type: "send_message", config: { mensagens: [{ tipo: "text", texto: "Oi {primeiro_nome}! 😊 Seja bem-vindo(a)! Como posso te ajudar?" }] } }]) },
  { nome: "Reativar quem não respondeu", grafo: grafoSimples("tag_added", { tag: "NÃO RESPONDEU" }, [{ type: "delay", config: { quantidade: 2, unidade: "dias", hora_fixa: "15:00" } }, { type: "ai_message", config: { instrucao: "Retome a conversa de forma leve, lembrando do interesse do cliente, sem pressionar.", enviar: true } }]) },
  { nome: "Pós-venda: agradecer e pedir avaliação", grafo: grafoSimples("purchase", { status: "approved" }, [{ type: "delay", config: { quantidade: 1, unidade: "dias", hora_fixa: "10:00" } }, { type: "send_message", config: { mensagens: [{ tipo: "text", texto: "{primeiro_nome}, obrigado pela compra! 💜 Qualquer dúvida é só chamar aqui." }] } }, { type: "add_tags", config: { tags: ["CLIENTE"] } }]) },
];

function grafoSimples(gatilho: string, cfgGatilho: any, acoes: { type: string; config: any }[]) {
  const nodes: any[] = [{ id: "g1", kind: "trigger", type: gatilho, name: blocoDe(gatilho, "trigger")?.nome, config: cfgGatilho, position: { x: 80, y: 120 } }];
  const edges: any[] = [];
  acoes.forEach((a, i) => {
    const id = `a${i + 1}`;
    nodes.push({ id, kind: "action", type: a.type, name: blocoDe(a.type, "action")?.nome, config: a.config, position: { x: 400 + i * 320, y: 120 } });
    edges.push({ id: `e${i}`, source: i === 0 ? "g1" : `a${i}`, target: id });
  });
  return { nodes, edges };
}

function Automacoes() {
  const { dados, recarregar } = useDados<any>("/automacoes");
  const [pasta, setPasta] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [novaPasta, setNovaPasta] = useState(false);
  const { executar } = useAcao();
  const { confirmar } = useAvisos();
  const lista = (dados?.automacoes ?? []).filter((a: any) => !pasta || a.pastaId === pasta);
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Automações" icone={Workflow} descricao="Receitas que o sistema faz sozinho: QUANDO acontecer algo, ENTÃO faz as ações.">
        <Botao variante="secundario" icone={<FolderPlus className="size-4" />} onClick={() => setNovaPasta(true)}>Nova pasta</Botao>
        <Botao data-tour="nova-automacao" icone={<Plus className="size-4" />} onClick={() => setNova(true)}>Nova automação</Botao>
      </CabecalhoPagina>
      <Dica>As mensagens automáticas respeitam a janela de horário de <Link to="/configuracoes" className="font-semibold underline">Configurações</Link>. Os registros de execução ficam guardados por 6 meses.</Dica>
      {dados?.pastas?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPasta(null)} className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 ${!pasta ? "bg-petroleo text-white ring-petroleo" : "bg-white ring-linha"}`}>Todas</button>
          {dados.pastas.map((p: any) => (
            <button key={p.id} type="button" onClick={() => setPasta(p.id)} className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 ${pasta === p.id ? "bg-petroleo text-white ring-petroleo" : "bg-white ring-linha"}`}><Folder className="size-3.5" />{p.nome}</button>
          ))}
        </div>
      )}
      <Card className="!p-0">
        {!dados ? <Carregando /> : lista.length === 0 ? <Vazio icone={Workflow} titulo="Nenhuma automação" acao={<Botao onClick={() => setNova(true)}>Criar automação</Botao>} /> : (
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2.5">Nome</th><th>Gatilho</th><th>Blocos</th><th>Execuções</th><th>Última</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {lista.map((a: any) => (
                <tr key={a.id} className={linhaTabela}>
                  <td className="px-4 py-2.5"><Link to="/automacoes/$id" params={{ id: a.id }} className="font-semibold hover:text-laranja">{a.nome}</Link>{a.descricao && <div className="max-w-md truncate text-[11.5px] text-suave">{a.descricao}</div>}</td>
                  <td>{blocoDe(a.gatilhoTipo ?? "", "trigger")?.nome ?? a.gatilhoTipo ?? "—"}</td>
                  <td>{a.nos}</td>
                  <td>{a.execucoes}{a.erros7d > 0 && <Selo cor="vermelho" className="ml-2">{a.erros7d} erros</Selo>}</td>
                  <td className="text-suave">{a.ultimaExecucaoEm ? dataHora(a.ultimaExecucaoEm) : "—"}</td>
                  <td>{a.status === "active" ? <Selo cor="verde">Ativada</Selo> : a.status === "draft" ? <Selo>Rascunho</Selo> : <Selo cor="ambar">Desativada</Selo>}</td>
                  <td className="w-24 pr-3 text-right">
                    <button type="button" title="Duplicar" onClick={() => executar(() => post(`/automacoes/${a.id}/duplicar`), "Duplicada").then(recarregar)} className="rounded-lg p-1.5 text-suave hover:bg-fundo"><Copy className="size-4" /></button>
                    <button type="button" title="Apagar" onClick={async () => { if (await confirmar(`Apagar "${a.nome}"?`, { perigo: true, botao: "Apagar" })) executar(() => del(`/automacoes/${a.id}`), "Apagada").then(recarregar); }} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {nova && <NovaAutomacao pastas={dados?.pastas ?? []} pasta={pasta} aoFechar={() => setNova(false)} />}
      {novaPasta && <NovaPasta aoFechar={() => { setNovaPasta(false); recarregar(); }} />}
    </div>
  );
}

function NovaAutomacao({ pasta, aoFechar }: { pastas: any[]; pasta: string | null; aoFechar: () => void }) {
  const [nome, setNome] = useState("");
  const [modelo, setModelo] = useState<number | null>(null);
  const navigate = useNavigate();
  const { executar, carregando } = useAcao();
  return (
    <Modal titulo="Nova automação" aoFechar={aoFechar} rodape={
      <Botao carregando={carregando} disabled={!nome.trim()} onClick={() => executar(() => post<any>("/automacoes", { nome, pastaId: pasta, grafo: modelo == null ? undefined : MODELOS[modelo].grafo })).then((a) => a && navigate({ to: "/automacoes/$id", params: { id: a.id } }))}>Criar e abrir editor</Botao>}>
      <Campo rotulo="Nome"><Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Reativar clientes frios" /></Campo>
      <div className="mt-4 text-[12.5px] font-semibold">Começar de um modelo (opcional)</div>
      <div className="mt-2 flex flex-col gap-2">
        {MODELOS.map((m, i) => (
          <button key={m.nome} type="button" onClick={() => { setModelo(modelo === i ? null : i); if (!nome) setNome(m.nome); }}
            className={`rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium ${modelo === i ? "border-laranja bg-orange-50" : "border-linha"}`}>{m.nome}</button>
        ))}
      </div>
    </Modal>
  );
}

function NovaPasta({ aoFechar }: { aoFechar: () => void }) {
  const [nome, setNome] = useState("");
  const { executar } = useAcao();
  return (
    <Modal titulo="Nova pasta" aoFechar={aoFechar} rodape={<Botao onClick={() => executar(() => post("/automacoes/pastas", { nome })).then(aoFechar)}>Criar</Botao>}>
      <Campo rotulo="Nome"><Entrada value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
    </Modal>
  );
}
