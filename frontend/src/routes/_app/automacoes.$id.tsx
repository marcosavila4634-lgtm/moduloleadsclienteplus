import { createFileRoute, Link } from "@tanstack/react-router";
import { addEdge, Background, Controls, Handle, MiniMap, Position, ReactFlow, useEdgesState, useNodesState, type Connection, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Copy, History, Play, Plus, Power, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AreaTexto, Botao, Campo, Entrada, Interruptor, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { Abas, Carregando, Selo } from "../../components/ui";
import { BLOCOS, blocoDe, resumoBloco, type Bloco, type CampoBloco } from "../../lib/automacoes";
import { get, post, put, qs } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { dataHora, telefone } from "../../lib/formato";

export const Route = createFileRoute("/_app/automacoes/$id")({ component: Editor });

type Dados = { kind: string; tipo: string; nome: string; config: any; stats?: { passagens: number; erros: number } };

function NoBloco({ data, selected }: NodeProps<Node<Dados>>) {
  const b = blocoDe(data.tipo, data.kind);
  const Icone = b?.icone ?? Play;
  const cor = b?.cor ?? "#6b7a80";
  const saidas: { id: string; rotulo: string; cor: string }[] =
    b?.saidas === "sim_nao" ? [{ id: "yes", rotulo: "Sim", cor: "#16a34a" }, { id: "no", rotulo: "Não", cor: "#e5484d" }]
    : b?.saidas === "resposta" ? [{ id: "resposta", rotulo: "Respondeu", cor: "#16a34a" }, { id: "timeout", rotulo: "Não respondeu", cor: "#e5484d" }]
    : b?.saidas === "casos" ? [...(data.config?.casos ?? []).map((c: any, i: number) => ({ id: c.id ?? `c${i}`, rotulo: c.valor || `Caso ${i + 1}`, cor: "#d97706" })), { id: "default", rotulo: "Outro", cor: "#6b7a80" }]
    : b?.saidas === "ramos" ? (data.config?.ramos ?? []).map((r: any, i: number) => ({ id: r.id ?? `r${i}`, rotulo: `${r.percentual ?? 0}%`, cor: "#d97706" }))
    : data.tipo === "end" ? [] : [{ id: "saida", rotulo: "", cor }];
  return (
    <div className={`w-[250px] rounded-2xl border-2 bg-white shadow-md transition ${selected ? "shadow-xl" : ""}`} style={{ borderColor: selected ? "#f47b20" : `${cor}55` }}>
      {data.kind !== "trigger" && <Handle type="target" position={Position.Left} className="!size-3 !border-2 !border-white !bg-suave" />}
      <div className="flex items-center gap-2 rounded-t-[14px] px-3 py-2 text-white" style={{ background: cor }}>
        <Icone className="size-4" />
        <span className="flex-1 truncate text-[12.5px] font-semibold">{data.nome || b?.nome}</span>
        <span className="text-[10px] opacity-80">{data.kind === "trigger" ? "GATILHO" : data.kind === "condition" ? "CONDIÇÃO" : "AÇÃO"}</span>
      </div>
      <div className="px-3 py-2 text-[12px] text-texto/80">{resumoBloco(data.tipo, data.config) || <span className="text-suave">{b?.descricao ?? data.tipo}</span>}</div>
      {data.stats && <div className="flex gap-3 border-t border-linha px-3 py-1 text-[10.5px] text-suave"><span>✔ {data.stats.passagens}</span>{data.stats.erros > 0 && <span className="text-vermelho">✖ {data.stats.erros}</span>}</div>}
      {saidas.map((s, i) => (
        <div key={s.id}>
          <Handle id={s.id} type="source" position={Position.Right} style={{ top: saidas.length === 1 ? "50%" : `${30 + (i * 60) / Math.max(1, saidas.length - 1)}%`, background: s.cor }} className="!size-3 !border-2 !border-white" />
          {s.rotulo && <span className="absolute -right-2 translate-x-full text-[10px] font-semibold" style={{ top: `calc(${saidas.length === 1 ? 50 : 30 + (i * 60) / Math.max(1, saidas.length - 1)}% - 8px)`, color: s.cor }}>{s.rotulo}</span>}
        </div>
      ))}
    </div>
  );
}

const tiposNo = { bloco: NoBloco };

function Editor() {
  const { id } = Route.useParams();
  const { dados: a, recarregar } = useDados<any>(`/automacoes/${id}`);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<Dados>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [aba, setAba] = useState<"editor" | "execucoes">("editor");
  const [nome, setNome] = useState("");
  const [repeticao, setRepeticao] = useState(0);
  const [executarAberto, setExecutarAberto] = useState(false);
  const [alterado, setAlterado] = useState(false);
  const { executar, carregando } = useAcao();
  const { avisar } = useAvisos();

  useEffect(() => {
    if (!a) return;
    setNome(a.nome);
    setRepeticao(a.intervaloRepeticaoHoras ?? 0);
    const stats = new Map((a.estatisticas ?? []).map((s: any) => [s.no, s]));
    setNodes((a.grafo.nodes ?? []).map((n: any) => ({
      id: n.id, type: "bloco", position: n.position ?? { x: 0, y: 0 },
      data: { kind: n.kind, tipo: n.type, nome: n.name, config: normalizarConfig(n), stats: stats.get(n.id) as any },
    })));
    setEdges((a.grafo.edges ?? []).map((e: any) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? (e.conditionResult ?? null), label: e.label, animated: true, style: { stroke: "#f47b20", strokeWidth: 2 } })));
  }, [a?.id]);

  const aoConectar = useCallback((c: Connection) => {
    setEdges((es) => addEdge({ ...c, id: `e-${c.source}-${c.sourceHandle ?? ""}-${c.target}`, animated: true, style: { stroke: "#f47b20", strokeWidth: 2 } }, es));
    setAlterado(true);
  }, []);

  const adicionar = (b: Bloco) => {
    const idNo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const cfg: any = {};
    b.campos.forEach((c) => c.padrao !== undefined && (cfg[c.chave] = c.padrao));
    if (b.tipo === "randomizer") cfg.ramos = [{ id: "a", percentual: 50 }, { id: "b", percentual: 50 }];
    const ultimo = nodes[nodes.length - 1];
    setNodes((ns) => [...ns, { id: idNo, type: "bloco", position: ultimo ? { x: ultimo.position.x + 320, y: ultimo.position.y } : { x: 80, y: 120 }, data: { kind: b.kind, tipo: b.tipo, nome: b.nome, config: cfg } }]);
    if (ultimo && b.kind !== "trigger") setEdges((es) => [...es, { id: `e-${ultimo.id}-${idNo}`, source: ultimo.id, target: idNo, sourceHandle: blocoDe(ultimo.data.tipo, ultimo.data.kind)?.saidas ? (blocoDe(ultimo.data.tipo, ultimo.data.kind)?.saidas === "sim_nao" ? "yes" : null) : "saida", animated: true, style: { stroke: "#f47b20", strokeWidth: 2 } }]);
    setSel(idNo);
    setAlterado(true);
  };

  const grafo = () => ({
    nodes: nodes.map((n) => ({ id: n.id, kind: n.data.kind, type: n.data.tipo, name: n.data.nome, config: n.data.config, position: n.position })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined, label: e.label })),
  });
  const salvar = () => executar(() => put(`/automacoes/${id}`, { nome, grafo: grafo(), intervaloRepeticaoHoras: repeticao }), "Automação salva").then((r) => { if (r) setAlterado(false); return r; });
  const selecionado = nodes.find((n) => n.id === sel);
  const webhook = useMemo(() => a && `${location.origin}/api/publico/automacoes/${a.id}/${a.gatilhoConfig?.token}`, [a]);

  if (!a) return <Carregando />;
  return (
    <div className="-mx-4 -mt-4 -mb-10 flex h-[calc(100vh-64px)] flex-col md:-mx-6">
      <div className="flex flex-wrap items-center gap-3 border-b border-linha bg-cartao px-4 py-2.5">
        <Link to="/automacoes" className="rounded-lg p-1.5 hover:bg-fundo"><ArrowLeft className="size-5" /></Link>
        <input value={nome} onChange={(e) => { setNome(e.target.value); setAlterado(true); }} className="min-w-0 flex-1 bg-transparent font-titulo text-[18px] font-bold outline-none" />
        <Abas valor={aba} aoMudar={setAba} abas={[{ valor: "editor", rotulo: "Editor" }, { valor: "execucoes", rotulo: "Execuções" }]} />
        <Botao variante="secundario" icone={<Play className="size-4" />} onClick={() => setExecutarAberto(true)}>Executar</Botao>
        <Botao variante={a.status === "active" ? "secundario" : "petroleo"} icone={<Power className="size-4" />}
          onClick={async () => { if (alterado) await salvar(); executar(() => post(`/automacoes/${id}/status`, { status: a.status === "active" ? "inactive" : "active" }), a.status === "active" ? "Desativada" : "Ativada! Já está funcionando.").then(recarregar); }}>
          {a.status === "active" ? "Desativar" : "Ativar"}
        </Botao>
        <Botao carregando={carregando} icone={<Save className="size-4" />} onClick={salvar}>{alterado ? "Salvar*" : "Salvar"}</Botao>
      </div>

      {aba === "execucoes" ? <Execucoes id={id} /> : (
        <div className="flex min-h-0 flex-1">
          <aside className="w-60 shrink-0 overflow-y-auto border-r border-linha bg-cartao p-3">
            {(["trigger", "condition", "action"] as const).map((k) => (
              <div key={k} className="mb-4">
                <div className="mb-1.5 text-[11px] font-bold tracking-wide text-suave uppercase">{k === "trigger" ? "Quando (gatilhos)" : k === "condition" ? "Se (condições)" : "Então (ações)"}</div>
                {BLOCOS.filter((b) => b.kind === k).map((b) => (
                  <button key={`${b.kind}-${b.tipo}`} type="button" onClick={() => adicionar(b)} title={b.descricao}
                    className="mb-1 flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[12.5px] font-medium hover:bg-fundo">
                    <span className="grid size-6 shrink-0 place-items-center rounded-lg text-white" style={{ background: b.cor }}><b.icone className="size-3.5" /></span>
                    {b.nome}
                    <Plus className="ml-auto size-3.5 text-suave" />
                  </button>
                ))}
              </div>
            ))}
          </aside>
          <div className="relative min-w-0 flex-1 bg-fundo">
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={tiposNo} onNodesChange={(c) => { onNodesChange(c); if (c.some((x) => x.type === "position" || x.type === "remove")) setAlterado(true); }}
              onEdgesChange={(c) => { onEdgesChange(c); setAlterado(true); }} onConnect={aoConectar} onNodeClick={(_, n) => setSel(n.id)} onPaneClick={() => setSel(null)}
              fitView deleteKeyCode={["Backspace", "Delete"]}>
              <Background color="#e0d6c4" gap={20} />
              <Controls />
              <MiniMap pannable zoomable nodeColor={(n: any) => blocoDe(n.data?.tipo, n.data?.kind)?.cor ?? "#999"} />
            </ReactFlow>
            {nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="rounded-2xl bg-white/90 px-6 py-4 text-center text-[13.5px] text-suave shadow">Comece escolhendo um <b className="text-petroleo">gatilho</b> na coluna da esquerda 👈<br />Depois vá adicionando as ações. Ligue os blocos arrastando das bolinhas.</div>
              </div>
            )}
          </div>
          {selecionado && (
            <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-linha bg-cartao">
              <div className="flex items-center justify-between border-b border-linha px-4 py-3">
                <span className="font-titulo text-[15px] font-semibold">{blocoDe(selecionado.data.tipo, selecionado.data.kind)?.nome ?? selecionado.data.tipo}</span>
                <button type="button" onClick={() => setSel(null)} className="rounded-lg p-1 text-suave hover:bg-fundo"><X className="size-4" /></button>
              </div>
              <div className="flex flex-col gap-3 p-4">
                <p className="text-[12.5px] text-suave">{blocoDe(selecionado.data.tipo, selecionado.data.kind)?.descricao}</p>
                {selecionado.data.kind === "trigger" && selecionado.data.tipo === "http_request" && (
                  <Campo rotulo="Endereço do webhook" dica="Outros sistemas chamam este endereço (POST, JSON). Mande 'telefone' e 'nome' para identificar o contato.">
                    <div className="flex gap-2"><Entrada readOnly value={webhook ?? ""} /><Botao variante="secundario" onClick={() => { navigator.clipboard.writeText(webhook ?? ""); avisar("Copiado"); }}><Copy className="size-4" /></Botao></div>
                  </Campo>
                )}
                <Campo rotulo="Nome do bloco"><Entrada value={selecionado.data.nome ?? ""} onChange={(e) => atualizarNo(setNodes, selecionado.id, { nome: e.target.value }, setAlterado)} /></Campo>
                {(blocoDe(selecionado.data.tipo, selecionado.data.kind)?.campos ?? []).map((c) => (
                  <CampoConfig key={c.chave} campo={c} valor={selecionado.data.config?.[c.chave]}
                    aoMudar={(v) => atualizarNo(setNodes, selecionado.id, { config: { ...selecionado.data.config, [c.chave]: v } }, setAlterado)} />
                ))}
                <Botao variante="fantasma" className="mt-2 !text-vermelho" icone={<Trash2 className="size-4" />}
                  onClick={() => { setNodes((ns) => ns.filter((n) => n.id !== selecionado.id)); setEdges((es) => es.filter((e) => e.source !== selecionado.id && e.target !== selecionado.id)); setSel(null); setAlterado(true); }}>
                  Remover bloco
                </Botao>
              </div>
            </aside>
          )}
        </div>
      )}
      {aba === "editor" && (
        <div className="flex items-center gap-3 border-t border-linha bg-cartao px-4 py-2 text-[12.5px] text-suave">
          <span>Não repetir para o mesmo contato por</span>
          <input type="number" min={0} value={repeticao} onChange={(e) => { setRepeticao(Number(e.target.value)); setAlterado(true); }} className="w-16 rounded-lg border border-linha px-2 py-1" />
          <span>horas (0 = sempre que acontecer)</span>
          <span className="ml-auto">Status: {a.status === "active" ? <Selo cor="verde">Ativada</Selo> : <Selo cor="ambar">Desativada</Selo>}</span>
        </div>
      )}
      {executarAberto && <ExecutarAgora id={id} aoFechar={() => setExecutarAberto(false)} />}
    </div>
  );
}

function atualizarNo(setNodes: any, id: string, parcial: Partial<Dados>, setAlterado: (v: boolean) => void) {
  setNodes((ns: Node<Dados>[]) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...parcial } } : n)));
  setAlterado(true);
}

/** Blocos "Ação" importados do Meppy guardam o tipo real em config.actionId. */
function normalizarConfig(n: any) {
  const c = { ...(n.config ?? {}) };
  if (n.type === "delay" && c.amount != null && c.quantidade == null) c.quantidade = c.amount;
  return c;
}

function CampoConfig({ campo, valor, aoMudar }: { campo: CampoBloco; valor: any; aoMudar: (v: any) => void }) {
  const { dados: tags } = useDados<any[]>(["tag", "tags"].includes(campo.tipo) ? "/contatos/tags" : null);
  const { dados: funis } = useDados<any[]>(["etapa", "funil"].includes(campo.tipo) ? "/crm/funis" : null);
  const { dados: agentes } = useDados<any[]>(campo.tipo === "agente" ? "/agentes" : null);
  const { dados: templates } = useDados<any[]>(campo.tipo === "template" ? "/conexoes/templates?status=APPROVED" : null);
  const { dados: equipe } = useDados<any>(["usuario", "setor"].includes(campo.tipo) ? "/equipe" : null);
  const { dados: conexoes } = useDados<any[]>(campo.tipo === "conexao" ? "/conexoes" : null);
  const { dados: camposC } = useDados<any[]>(campo.tipo === "campo" ? "/contatos/campos" : null);
  const R = (x: any) => <Campo rotulo={campo.rotulo} dica={campo.dica}>{x}</Campo>;
  switch (campo.tipo) {
    case "texto": return R(<Entrada value={valor ?? ""} onChange={(e) => aoMudar(e.target.value)} />);
    case "numero": return R(<Entrada type="number" value={valor ?? ""} onChange={(e) => aoMudar(e.target.value === "" ? null : Number(e.target.value))} />);
    case "hora": return R(<Entrada type="time" value={valor ?? ""} onChange={(e) => aoMudar(e.target.value || null)} />);
    case "area": return R(<AreaTexto rows={4} value={valor ?? ""} onChange={(e) => aoMudar(e.target.value)} />);
    case "booleano": return <Interruptor ligado={!!valor} aoMudar={aoMudar} rotulo={campo.rotulo} descricao={campo.dica} />;
    case "selecao": return R(<Selecao value={valor ?? ""} onChange={(e) => aoMudar(e.target.value)} opcoes={campo.opcoes ?? []} />);
    case "tag": return R(<Selecao vazio="Escolha" value={valor ?? ""} onChange={(e) => aoMudar(e.target.value)} opcoes={(tags ?? []).map((t) => ({ valor: t.nome, rotulo: t.nome }))} />);
    case "tags": return R(
      <div className="flex flex-wrap gap-1.5">
        {(tags ?? []).map((t) => {
          const l: string[] = valor ?? [];
          return <button key={t.id} type="button" onClick={() => aoMudar(l.includes(t.nome) ? l.filter((x) => x !== t.nome) : [...l, t.nome])} className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ${l.includes(t.nome) ? "bg-laranja text-white ring-laranja" : "ring-linha"}`}>{t.nome}</button>;
        })}
      </div>);
    case "funil": return R(<Selecao vazio="Funil padrão" value={valor ?? ""} onChange={(e) => aoMudar(e.target.value || null)} opcoes={(funis ?? []).map((f) => ({ valor: f.id, rotulo: f.nome }))} />);
    case "etapa": return R(<Selecao vazio="Escolha" value={valor ?? ""} onChange={(e) => aoMudar(e.target.value || null)} opcoes={(funis ?? []).flatMap((f) => f.etapas.map((e: any) => ({ valor: e.id, rotulo: `${f.nome} › ${e.nome}` })))} />);
    case "agente": return R(<Selecao vazio="Robô da conversa" value={valor ?? ""} onChange={(e) => aoMudar(e.target.value || null)} opcoes={(agentes ?? []).map((x) => ({ valor: x.id, rotulo: x.nome }))} />);
    case "template": return R(<Selecao vazio="Nenhum" value={valor ?? ""} onChange={(e) => aoMudar(e.target.value || null)} opcoes={(templates ?? []).map((t) => ({ valor: t.id, rotulo: t.nome }))} />);
    case "usuario": return R(<Selecao vazio="Qualquer" value={valor ?? ""} onChange={(e) => aoMudar(e.target.value || null)} opcoes={(equipe?.membros ?? []).map((m: any) => ({ valor: m.id, rotulo: m.nome }))} />);
    case "setor": return R(<Selecao vazio="Nenhum" value={valor ?? ""} onChange={(e) => aoMudar(e.target.value || null)} opcoes={(equipe?.setores ?? []).map((s: any) => ({ valor: s.id, rotulo: s.nome }))} />);
    case "conexao": return R(<Selecao vazio="Qualquer" value={valor ?? ""} onChange={(e) => aoMudar(e.target.value)} opcoes={(conexoes ?? []).map((c) => ({ valor: c.id, rotulo: c.nome }))} />);
    case "campo": return R(
      <Selecao value={valor ?? "mensagem"} onChange={(e) => aoMudar(e.target.value)} opcoes={[
        { valor: "mensagem", rotulo: "Última mensagem do cliente" }, { valor: "resposta", rotulo: "Resposta (depois de Esperar resposta)" }, { valor: "nome", rotulo: "Nome" }, { valor: "email", rotulo: "E-mail" },
        { valor: "contato.notas", rotulo: "Anotações" }, ...(camposC ?? []).map((c) => ({ valor: `campo.${c.chave}`, rotulo: `Campo: ${c.nome}` })), { valor: "var.minha_variavel", rotulo: "Variável do fluxo (var.)" },
      ]} />);
    case "dias": return R(
      <div className="flex flex-wrap gap-1">
        {["seg", "ter", "qua", "qui", "sex", "sab", "dom"].map((d) => {
          const l: string[] = valor ?? [];
          return <button key={d} type="button" onClick={() => aoMudar(l.includes(d) ? l.filter((x) => x !== d) : [...l, d])} className={`rounded-lg px-2 py-1 text-[12px] font-semibold ring-1 ${l.includes(d) ? "bg-petroleo text-white ring-petroleo" : "ring-linha"}`}>{d}</button>;
        })}
      </div>);
    case "mensagens": return <EditorMensagens valor={valor ?? []} aoMudar={aoMudar} />;
    case "opcoes": return R(
      <div className="flex flex-col gap-1.5">
        {(valor ?? []).map((o: any, i: number) => (
          <div key={i} className="flex gap-1.5"><Entrada maxLength={24} value={o.titulo} onChange={(e) => aoMudar((valor ?? []).map((x: any, j: number) => (j === i ? { ...x, titulo: e.target.value, id: x.id ?? `op${i + 1}` } : x)))} />
            <button type="button" onClick={() => aoMudar((valor ?? []).filter((_: any, j: number) => j !== i))} className="px-1 text-suave"><X className="size-4" /></button></div>
        ))}
        <Botao variante="secundario" tamanho="sm" onClick={() => aoMudar([...(valor ?? []), { id: `op${(valor ?? []).length + 1}`, titulo: "" }])}>+ Opção</Botao>
      </div>);
    case "casos": return R(
      <div className="flex flex-col gap-1.5">
        {(valor ?? []).map((c: any, i: number) => (
          <div key={i} className="flex gap-1.5">
            <select value={c.operador ?? "equals"} onChange={(e) => aoMudar(valor.map((x: any, j: number) => (j === i ? { ...x, operador: e.target.value } : x)))} className="w-28 rounded-lg border border-linha text-[12px]">
              <option value="equals">igual</option><option value="contains">contém</option><option value="starts_with">começa</option><option value="greater_than">maior</option><option value="less_than">menor</option>
            </select>
            <Entrada value={c.valor ?? ""} onChange={(e) => aoMudar(valor.map((x: any, j: number) => (j === i ? { ...x, valor: e.target.value } : x)))} />
            <button type="button" onClick={() => aoMudar(valor.filter((_: any, j: number) => j !== i))} className="px-1 text-suave"><X className="size-4" /></button>
          </div>
        ))}
        <Botao variante="secundario" tamanho="sm" onClick={() => aoMudar([...(valor ?? []), { id: `c${Date.now()}`, operador: "equals", valor: "" }])}>+ Caso</Botao>
      </div>);
    case "ramos": return R(
      <div className="flex flex-col gap-1.5">
        {(valor ?? []).map((r: any, i: number) => (
          <div key={i} className="flex items-center gap-1.5"><span className="w-16 text-[12px]">Caminho {String.fromCharCode(65 + i)}</span>
            <Entrada type="number" value={r.percentual} onChange={(e) => aoMudar(valor.map((x: any, j: number) => (j === i ? { ...x, percentual: Number(e.target.value) } : x)))} /> %</div>
        ))}
        <Botao variante="secundario" tamanho="sm" onClick={() => aoMudar([...(valor ?? []), { id: `r${Date.now()}`, percentual: 0 }])}>+ Caminho</Botao>
      </div>);
    case "cabecalhos": return R(
      <AreaTexto rows={3} value={Object.entries(valor ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n")} placeholder="Authorization: Bearer ..."
        onChange={(e) => aoMudar(Object.fromEntries(e.target.value.split("\n").filter((l) => l.includes(":")).map((l) => [l.split(":")[0].trim(), l.split(":").slice(1).join(":").trim()])))} />);
    default: return null;
  }
}

function EditorMensagens({ valor, aoMudar }: { valor: any[]; aoMudar: (v: any[]) => void }) {
  const lista = valor.length ? valor : [{ tipo: "text", texto: "" }];
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12.5px] font-semibold">Mensagens (enviadas em sequência)</span>
      {lista.map((m, i) => (
        <div key={i} className="rounded-xl border border-linha p-2">
          <div className="mb-1.5 flex gap-1.5">
            <select value={m.tipo} onChange={(e) => aoMudar(lista.map((x, j) => (j === i ? { ...x, tipo: e.target.value } : x)))} className="rounded-lg border border-linha px-1 py-1 text-[12px]">
              <option value="text">Texto</option><option value="image">Imagem</option><option value="audio">Áudio</option><option value="video">Vídeo</option><option value="document">Arquivo</option>
            </select>
            <button type="button" onClick={() => aoMudar(lista.filter((_, j) => j !== i))} className="ml-auto text-suave"><Trash2 className="size-4" /></button>
          </div>
          {m.tipo !== "text" && <MidiaCampo m={m} aoMudar={(x) => aoMudar(lista.map((y, j) => (j === i ? x : y)))} />}
          <AreaTexto rows={3} value={m.texto ?? ""} onChange={(e) => aoMudar(lista.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} placeholder={m.tipo === "text" ? "Oi {primeiro_nome}! ..." : "Legenda (opcional)"} />
        </div>
      ))}
      <Botao variante="secundario" tamanho="sm" onClick={() => aoMudar([...lista, { tipo: "text", texto: "" }])}>+ Mensagem</Botao>
      <span className="text-[11px] text-suave">Use {"{nome}"}, {"{primeiro_nome}"}, {"{telefone}"}, {"{campo.chave}"}.</span>
    </div>
  );
}

function MidiaCampo({ m, aoMudar }: { m: any; aoMudar: (m: any) => void }) {
  return (
    <label className="mb-1.5 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-linha-2 px-2 py-1.5 text-[12px]">
      {m.url ? `✔ ${m.nome ?? "arquivo"}` : "Escolher arquivo"}
      <input type="file" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const { enviarArquivo } = await import("../../lib/api");
        const r = await enviarArquivo(f);
        aoMudar({ ...m, url: r.url, mime: r.mime, nome: r.nome });
      }} />
    </label>
  );
}

function Execucoes({ id }: { id: string }) {
  const [status, setStatus] = useState("");
  const { dados, recarregar } = useDados<any[]>(`/automacoes/${id}/execucoes${qs({ status })}`);
  const [ver, setVer] = useState<any>(null);
  const { executar } = useAcao();
  const nomes: Record<string, [string, any]> = { running: ["Rodando", "azul"], waiting: ["Esperando", "ambar"], waiting_reply: ["Esperando resposta", "ambar"], done: ["Concluída", "verde"], error: ["Erro", "vermelho"], canceled: ["Cancelada", "cinza"] };
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-3 flex items-center gap-3">
        <Abas valor={status} aoMudar={setStatus} abas={[{ valor: "", rotulo: "Todas" }, { valor: "waiting", rotulo: "Esperando" }, { valor: "done", rotulo: "Concluídas" }, { valor: "error", rotulo: "Com erro" }]} />
        <Botao variante="secundario" tamanho="sm" icone={<History className="size-3.5" />} onClick={recarregar}>Atualizar</Botao>
      </div>
      <div className="overflow-hidden rounded-2xl border border-linha bg-cartao">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-linha text-left text-[11px] text-suave uppercase"><th className="px-4 py-2">Contato</th><th>Início</th><th>Situação</th><th>Passos</th><th>Retoma em</th><th></th></tr></thead>
          <tbody>
            {(dados ?? []).map((e) => (
              <tr key={e.id} className="border-b border-linha/60 last:border-0">
                <td className="px-4 py-2">{e.contatoNome ?? telefone(e.contatoTelefone) ?? "—"}</td>
                <td>{dataHora(e.createdAt)}</td>
                <td><Selo cor={nomes[e.status]?.[1] ?? "cinza"}>{nomes[e.status]?.[0] ?? e.status}</Selo>{e.erro && <div className="max-w-xs truncate text-[11px] text-vermelho">{e.erro}</div>}</td>
                <td>{e.passos?.length ?? 0}</td>
                <td>{e.retomarEm ? dataHora(e.retomarEm) : "—"}</td>
                <td className="pr-3 text-right">
                  <button type="button" onClick={() => setVer(e)} className="text-[12px] font-semibold text-laranja">Detalhes</button>
                  {["waiting", "waiting_reply"].includes(e.status) && <button type="button" onClick={() => executar(() => post(`/automacoes/execucoes/${e.id}/cancelar`), "Cancelada").then(recarregar)} className="ml-3 text-[12px] font-semibold text-suave">Cancelar</button>}
                </td>
              </tr>
            ))}
            {dados?.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-suave">Nenhuma execução ainda.</td></tr>}
          </tbody>
        </table>
      </div>
      {ver && (
        <Modal titulo="Passo a passo da execução" aoFechar={() => setVer(null)}>
          <ol className="flex flex-col gap-2">
            {(ver.passos ?? []).map((p: any, i: number) => (
              <li key={i} className={`rounded-xl px-3 py-2 text-[12.5px] ${p.ok ? "bg-fundo" : "bg-red-50 text-vermelho"}`}>
                <b>{i + 1}. {blocoDe(p.tipo)?.nome ?? p.tipo}</b> {p.saida && p.saida !== "saida" && <span className="text-suave">→ {p.saida}</span>} <span className="text-suave">· {dataHora(p.em)}</span>
                {p.erro && <div>{p.erro}</div>}
              </li>
            ))}
          </ol>
        </Modal>
      )}
    </div>
  );
}

function ExecutarAgora({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<any[]>([]);
  const { executar, carregando } = useAcao();
  useEffect(() => {
    if (busca.length < 2) return;
    const t = setTimeout(() => get<any>(`/contatos${qs({ busca, limite: 8 })}`).then((r) => setLista(r.itens)), 300);
    return () => clearTimeout(t);
  }, [busca]);
  return (
    <Modal titulo="Executar agora para um contato" aoFechar={aoFechar}>
      <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar contato..." />
      <div className="mt-3 flex flex-col gap-1">
        {lista.map((c) => (
          <button key={c.id} type="button" disabled={carregando} onClick={() => executar(() => post(`/automacoes/${id}/executar`, { contatoId: c.id }), "Automação iniciada para " + (c.nome ?? c.telefone)).then(aoFechar)}
            className="rounded-xl px-3 py-2 text-left text-[13px] hover:bg-fundo"><b>{c.nome ?? "Sem nome"}</b> <span className="text-suave">{telefone(c.telefone)}</span></button>
        ))}
      </div>
    </Modal>
  );
}
