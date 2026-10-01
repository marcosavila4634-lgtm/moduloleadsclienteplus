import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bot, BookOpen, Copy, FlaskConical, Pause, Play, Plus, RotateCcw, Save, Send, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AreaTexto, Botao, Campo, Entrada, Interruptor, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { Abas, Card, Carregando, Dica, Selo, TituloCard } from "../../components/ui";
import { del, enviarArquivo, post, put } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { dataHora, num, reais } from "../../lib/formato";

export const Route = createFileRoute("/_app/agentes/$id")({ component: EditorAgente });

type Aba = "identidade" | "instrucoes" | "conhecimento" | "comportamento" | "followup" | "conexoes" | "testar" | "metricas";
const GIRIAS = ["mano", "cara", "parceiro", "brother", "tmj", "show", "firmeza", "suave", "de boa", "top", "bora", "beleza"];

function EditorAgente() {
  const { id } = Route.useParams();
  const { dados: a, recarregar } = useDados<any>(`/agentes/${id}`);
  const [f, setF] = useState<any>(null);
  const [aba, setAba] = useState<Aba>("identidade");
  const { executar, carregando } = useAcao();
  const { confirmar } = useAvisos();
  useEffect(() => {
    if (a) setF({ nome: a.nome, papel: a.papel, empresa: a.empresa ?? "", cor: a.cor, descricao: a.descricao ?? "", modelo: a.modelo, limiteGastoCentavos: a.limiteGastoCentavos, config: { ...a.config } });
  }, [a?.id, a?.updatedAt]);
  if (!a || !f) return <Carregando />;
  const c = f.config;
  const setC = (k: string, v: unknown) => setF({ ...f, config: { ...c, [k]: v } });
  const h = c.handoffConfig ?? {};
  const salvar = () => executar(() => put(`/agentes/${id}`, f), "Robô salvo").then(recarregar);

  return (
    <div className="flex flex-col gap-4">
      <Link to="/agentes" className="flex w-fit items-center gap-1 text-[13px] font-semibold text-suave hover:text-texto"><ArrowLeft className="size-4" /> Robôs de IA</Link>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl text-white" style={{ background: f.cor }}><Bot className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="font-titulo text-[24px] font-bold">{f.nome}</h1>
          <div className="text-[13px] text-suave">Robô de IA · <span className="capitalize">{f.papel.replace("_", "-")}</span> · {a.status === "active" ? <span className="font-semibold text-verde">Ativo</span> : "Pausado"}</div>
        </div>
        <Botao variante="secundario" icone={<Copy className="size-4" />} onClick={() => executar(() => post(`/agentes/${id}/duplicar`), "Robô duplicado")}>Duplicar</Botao>
        {a.status === "active"
          ? <Botao variante="secundario" icone={<Pause className="size-4" />} onClick={() => executar(() => post(`/agentes/${id}/status`, { status: "paused" }), "Robô pausado").then(recarregar)}>Pausar</Botao>
          : <Botao variante="petroleo" icone={<Play className="size-4" />} onClick={() => executar(() => post(`/agentes/${id}/status`, { status: "active" }), "Robô ativado! Ele já responde nas conexões escolhidas.").then(recarregar)}>Ativar</Botao>}
        <Botao carregando={carregando} icone={<Save className="size-4" />} onClick={salvar}>Salvar alterações</Botao>
      </div>

      <Abas valor={aba} aoMudar={setAba} abas={[
        { valor: "identidade", rotulo: "Identidade" }, { valor: "instrucoes", rotulo: "Instruções" }, { valor: "conhecimento", rotulo: "Conhecimento" },
        { valor: "comportamento", rotulo: "Comportamento" }, { valor: "followup", rotulo: "Follow-up" }, { valor: "conexoes", rotulo: "Conexões" },
        { valor: "testar", rotulo: "🧪 Testar" }, { valor: "metricas", rotulo: "Métricas" },
      ]} />

      {aba === "identidade" && (
        <Card className="grid gap-4 md:grid-cols-2">
          <Campo rotulo="Nome" dica="Nome que o robô usa para se apresentar."><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
          <Campo rotulo="Nome da empresa" dica="Empresa que o robô representa."><Entrada value={f.empresa} onChange={(e) => setF({ ...f, empresa: e.target.value })} /></Campo>
          <Campo rotulo="Tipo">
            <Selecao value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value })} opcoes={[{ valor: "vendas", rotulo: "Vendas — conduz até fechar" }, { valor: "sdr", rotulo: "SDR — qualifica e passa" }, { valor: "suporte", rotulo: "Suporte" }, { valor: "atendimento", rotulo: "Atendimento" }, { valor: "pos_venda", rotulo: "Pós-venda" }, { valor: "personalizado", rotulo: "Personalizado" }]} />
          </Campo>
          <Campo rotulo="Gênero (jeito de falar)">
            <Selecao value={c.gender ?? "neutral"} onChange={(e) => setC("gender", e.target.value)} opcoes={[{ valor: "female", rotulo: "Feminino — acolhedora e empática" }, { valor: "male", rotulo: "Masculino — direto e descontraído" }, { valor: "neutral", rotulo: "Neutro" }]} />
          </Campo>
          <Campo rotulo="Personalidade" className="md:col-span-2"><AreaTexto rows={3} value={c.personality ?? ""} onChange={(e) => setC("personality", e.target.value)} placeholder="Ex.: Vendedor experiente, simpático, confiante, fala como um vendedor de loja de verdade." /></Campo>
          <Campo rotulo="Objetivo" className="md:col-span-2"><AreaTexto rows={3} value={c.objective ?? ""} onChange={(e) => setC("objective", e.target.value)} /></Campo>
          <Campo rotulo="Cor do robô"><input type="color" value={f.cor} onChange={(e) => setF({ ...f, cor: e.target.value })} className="h-10 w-20 rounded-xl" /></Campo>
          <Campo rotulo="Primeira mensagem (opcional)" dica="Ideia de cumprimento no primeiro contato."><Entrada value={c.greetingMessage ?? ""} onChange={(e) => setC("greetingMessage", e.target.value)} /></Campo>
        </Card>
      )}

      {aba === "instrucoes" && (
        <Card className="flex flex-col gap-4">
          <Dica>Escreva aqui tudo o que o robô precisa saber e como deve agir: produtos, preços, formas de pagamento, entrega, trocas, o passo a passo da venda. Quanto mais detalhado, melhor ele atende.</Dica>
          <Campo rotulo={<span className="flex items-center justify-between">Instruções da empresa <span className="text-[11px] font-normal text-suave">{num((c.customInstructions ?? "").length)} caracteres</span></span>}>
            <AreaTexto rows={18} value={c.customInstructions ?? ""} onChange={(e) => setC("customInstructions", e.target.value)} className="font-mono !text-[12.5px]" />
          </Campo>
          {a.instrucoesAnteriores && (
            <div className="flex items-center gap-3 text-[12.5px] text-suave">
              Versão anterior salva em {dataHora(a.instrucoesAnterioresEm)}.
              <Botao variante="secundario" tamanho="sm" icone={<RotateCcw className="size-3.5" />} onClick={() => executar(() => post(`/agentes/${id}/restaurar-instrucoes`), "Versão anterior restaurada").then(recarregar)}>Desfazer última mudança</Botao>
            </div>
          )}
          <Campo rotulo="Estilo de voz" dica="Como deve soar (ex.: frases curtas, natural, sem parecer robô)."><AreaTexto rows={4} value={c.voiceStyle ?? ""} onChange={(e) => setC("voiceStyle", e.target.value)} /></Campo>
          <Campo rotulo="Exemplos de conversa" dica="Cole conversas boas. O robô segue o estilo, sem copiar."><AreaTexto rows={8} value={c.voiceExamples ?? ""} onChange={(e) => setC("voiceExamples", e.target.value)} /></Campo>
          <Campo rotulo="Quando passar para um humano" dica="Situações em que o robô deve chamar alguém da equipe."><AreaTexto rows={4} value={c.handoffRules ?? ""} onChange={(e) => setC("handoffRules", e.target.value)} /></Campo>
        </Card>
      )}

      {aba === "conhecimento" && <Conhecimento agente={id} />}

      {aba === "comportamento" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-4">
            <TituloCard>Jeito de escrever</TituloCard>
            <Campo rotulo="Tom"><Selecao value={c.tone ?? "informal"} onChange={(e) => setC("tone", e.target.value)} opcoes={[{ valor: "informal", rotulo: "Informal (WhatsApp)" }, { valor: "neutro", rotulo: "Neutro e profissional" }, { valor: "formal", rotulo: "Formal" }]} /></Campo>
            <Campo rotulo="Letras"><Selecao value={c.capitalization ?? "normal"} onChange={(e) => setC("capitalization", e.target.value)} opcoes={[{ valor: "normal", rotulo: "Normal" }, { valor: "mixed", rotulo: "Como no celular (às vezes minúscula)" }, { valor: "lower", rotulo: "tudo minúsculo" }]} /></Campo>
            <Interruptor ligado={c.useEmojis !== false} aoMudar={(v) => setC("useEmojis", v)} rotulo="Usar emojis" />
            <Interruptor ligado={!!c.useSlang} aoMudar={(v) => setC("useSlang", v)} rotulo="Usar gírias" />
            {c.useSlang && (
              <div className="flex flex-wrap gap-1.5">
                {GIRIAS.map((g) => {
                  const lista: string[] = c.customSlang ?? [];
                  const on = lista.includes(g);
                  return <button key={g} type="button" onClick={() => setC("customSlang", on ? lista.filter((x) => x !== g) : [...lista, g])} className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ${on ? "bg-laranja text-white ring-laranja" : "bg-white ring-linha"}`}>{g}</button>;
                })}
              </div>
            )}
            <Interruptor ligado={c.splitMessages !== false} aoMudar={(v) => setC("splitMessages", v)} rotulo="Responder em mensagens curtas" descricao="Divide a resposta em várias mensagens, como uma pessoa digitando." />
            {c.splitMessages !== false && (
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Máx. de mensagens"><Entrada type="number" min={1} max={6} value={c.splitMaxBlocks ?? 3} onChange={(e) => setC("splitMaxBlocks", Number(e.target.value))} /></Campo>
                <Campo rotulo="Máx. letras por mensagem"><Entrada type="number" min={60} value={c.splitMaxChars ?? 200} onChange={(e) => setC("splitMaxChars", Number(e.target.value))} /></Campo>
              </div>
            )}
            <Campo rotulo="Esperar o cliente terminar de digitar (segundos)" dica="Se o cliente manda várias mensagens seguidas, o robô responde tudo de uma vez."><Entrada type="number" min={0} max={60} value={c.debounceSeconds ?? 8} onChange={(e) => setC("debounceSeconds", Number(e.target.value))} /></Campo>
          </Card>
          <Card className="flex flex-col gap-4">
            <TituloCard>O que o robô pode fazer sozinho</TituloCard>
            <Interruptor ligado={c.autoTags !== false} aoMudar={(v) => setC("autoTags", v)} rotulo="Marcar tags" descricao="Segue a descrição de cada tag." />
            <Interruptor ligado={c.autoMoveStages !== false} aoMudar={(v) => setC("autoMoveStages", v)} rotulo="Mover no funil de vendas" />
            <Interruptor ligado={c.visionEnabled !== false} aoMudar={(v) => setC("visionEnabled", v)} rotulo="Ver fotos e comprovantes" descricao="Lê imagens e PDFs que o cliente manda." />
            <Interruptor ligado={!!c.nativeCalendarEnabled} aoMudar={(v) => setC("nativeCalendarEnabled", v)} rotulo="Agendar horários" descricao="Consulta a Agenda e marca para o cliente." />
            <Campo rotulo="Chave Pix para cobrar (opcional)" dica="O robô gera o código Pix copia e cola com o valor."><Entrada value={c.pixKey ?? ""} onChange={(e) => setC("pixKey", e.target.value)} placeholder="CNPJ, e-mail, telefone ou chave aleatória" /></Campo>
            <TituloCard>Passar para humano quando</TituloCard>
            <Interruptor ligado={h.on_frustration !== false} aoMudar={(v) => setC("handoffConfig", { ...h, on_frustration: v })} rotulo="O cliente ficar irritado" />
            <Interruptor ligado={h.on_repeated_question !== false} aoMudar={(v) => setC("handoffConfig", { ...h, on_repeated_question: v })} rotulo="O cliente repetir a mesma pergunta" />
            <Interruptor ligado={h.on_no_answer !== false} aoMudar={(v) => setC("handoffConfig", { ...h, on_no_answer: v })} rotulo="O robô não souber responder" />
            <TituloCard>Horário</TituloCard>
            <Campo rotulo="Fora do horário comercial">
              <Selecao value={c.outOfHoursMode ?? "responder"} onChange={(e) => setC("outOfHoursMode", e.target.value)} opcoes={[{ valor: "responder", rotulo: "Responder normalmente (24h)" }, { valor: "mensagem", rotulo: "Mandar um aviso e esperar" }, { valor: "nao_responder", rotulo: "Não responder" }]} />
            </Campo>
            {c.outOfHoursMode === "mensagem" && <Campo rotulo="Aviso fora do horário"><AreaTexto value={c.outOfHoursMessage ?? ""} onChange={(e) => setC("outOfHoursMessage", e.target.value)} /></Campo>}
            <TituloCard>Inteligência</TituloCard>
            <Campo rotulo="Modelo da IA" dica="Claude Opus 5.5 é o mais inteligente. Os outros custam menos.">
              <Selecao value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} opcoes={[{ valor: "claude-opus-5-5", rotulo: "Claude Opus 5.5 (recomendado)" }, { valor: "claude-sonnet-5-5", rotulo: "Claude Sonnet 5.5 (mais barato)" }, { valor: "claude-haiku-4-5", rotulo: "Claude Haiku 4.5 (o mais barato)" }]} />
            </Campo>
            <Campo rotulo="Capricho da resposta"><Selecao value={c.effort ?? "medium"} onChange={(e) => setC("effort", e.target.value)} opcoes={[{ valor: "low", rotulo: "Rápido e econômico" }, { valor: "medium", rotulo: "Equilibrado" }, { valor: "high", rotulo: "Caprichado (mais caro)" }]} /></Campo>
            <Campo rotulo="Limite de gasto por mês (R$)" dica="Ao chegar no limite, as conversas vão para a equipe."><Entrada type="number" value={f.limiteGastoCentavos == null ? "" : f.limiteGastoCentavos / 100} onChange={(e) => setF({ ...f, limiteGastoCentavos: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) })} placeholder="Sem limite" /></Campo>
          </Card>
        </div>
      )}

      {aba === "followup" && (
        <Card className="flex max-w-3xl flex-col gap-4">
          <Dica>Quando o cliente para de responder, o robô retoma a conversa sozinho. Os envios respeitam também a <b>janela de horário</b> de Configurações (ex.: lead que chegou às 3h só recebe às 15h).</Dica>
          <Interruptor ligado={!!c.followUpEnabled} aoMudar={(v) => setC("followUpEnabled", v)} rotulo="Fazer follow-up automático" />
          {c.followUpEnabled && (
            <>
              <Campo rotulo="Esperar quantas horas antes de cada tentativa" dica="Separe por vírgula. Ex.: 1, 4, 24 = 1ª após 1 h, 2ª após 4 h, 3ª após 24 h.">
                <Entrada value={(c.followupDelays ?? [1, 4, 24]).join(", ")} onChange={(e) => setC("followupDelays", e.target.value.split(",").map((x) => Number(x.trim().replace(",", "."))).filter((x) => x > 0))} />
              </Campo>
              <div className="grid grid-cols-3 gap-3">
                <Campo rotulo="Máx. tentativas"><Entrada type="number" min={1} max={10} value={c.followUpMax ?? 3} onChange={(e) => setC("followUpMax", Number(e.target.value))} /></Campo>
                <Campo rotulo="A partir das (hora)"><Entrada type="number" min={0} max={23} value={c.followUpStartHour ?? 9} onChange={(e) => setC("followUpStartHour", Number(e.target.value))} /></Campo>
                <Campo rotulo="Até as (hora)"><Entrada type="number" min={1} max={24} value={c.followUpEndHour ?? 20} onChange={(e) => setC("followUpEndHour", Number(e.target.value))} /></Campo>
              </div>
              <Campo rotulo="Como escrever o follow-up"><AreaTexto value={c.followupCustomInstruction ?? ""} onChange={(e) => setC("followupCustomInstruction", e.target.value)} /></Campo>
              <Campo rotulo="Tag quando não responder depois de todas as tentativas" dica="Ex.: NÃO RESPONDEU — pode disparar uma automação."><Entrada value={c.followupFinalTag ?? ""} onChange={(e) => setC("followupFinalTag", e.target.value.toUpperCase())} /></Campo>
              <TemplateFollowUp valor={c.followupTemplateId} aoMudar={(v) => setC("followupTemplateId", v)} />
            </>
          )}
        </Card>
      )}

      {aba === "conexoes" && <ConexoesAgente agente={id} atuais={a.conexoes} aoMudar={recarregar} />}
      {aba === "testar" && <Testar agente={id} nome={f.nome} />}
      {aba === "metricas" && <Metricas agente={id} />}

      <div className="flex justify-end">
        <Botao variante="fantasma" className="!text-vermelho" icone={<Trash2 className="size-4" />} onClick={async () => { if (await confirmar("Apagar este robô?", { perigo: true, botao: "Apagar" })) executar(() => del(`/agentes/${id}`), "Robô apagado").then(() => history.back()); }}>Apagar robô</Botao>
      </div>
    </div>
  );
}

function TemplateFollowUp({ valor, aoMudar }: { valor?: string; aoMudar: (v: string | null) => void }) {
  const { dados } = useDados<any[]>("/conexoes/templates?status=APPROVED");
  return (
    <Campo rotulo="Template para depois de 24 h (opcional)" dica="O WhatsApp só deixa mandar template aprovado quando o cliente não fala há mais de 24 h.">
      <Selecao vazio="Não mandar depois de 24 h" value={valor ?? ""} onChange={(e) => aoMudar(e.target.value || null)} opcoes={(dados ?? []).map((t) => ({ valor: t.id, rotulo: t.nome }))} />
    </Campo>
  );
}

function Conhecimento({ agente }: { agente: string }) {
  const { dados, recarregar } = useDados<any>(`/agentes/${agente}/conhecimento`);
  const [editar, setEditar] = useState<any>(null);
  const { executar } = useAcao();
  if (!dados) return <Carregando />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Dica icone={BookOpen}>Perguntas frequentes e informações que o robô consulta antes de responder. Arquivos e fotos daqui o robô pode <b>enviar</b> ao cliente.</Dica>
        <div className="flex gap-2">
          <Botao variante="secundario" icone={<Upload className="size-4" />} onClick={() => setEditar({ tipo: "midia", titulo: "", quandoEnviar: "" })}>Arquivo / foto</Botao>
          <Botao icone={<Plus className="size-4" />} onClick={() => setEditar({ tipo: "faq", pergunta: "", conteudo: "" })}>Pergunta e resposta</Botao>
          <Botao variante="secundario" icone={<Plus className="size-4" />} onClick={() => setEditar({ tipo: "texto", titulo: "", conteudo: "" })}>Texto</Botao>
        </div>
      </div>
      <div className="text-[12px] text-suave">{num(dados.caracteres)} caracteres de conhecimento</div>
      <div className="grid gap-3 md:grid-cols-2">
        {dados.itens.map((k: any) => (
          <Card key={k.id} className={`!p-3.5 ${k.ativo ? "" : "opacity-60"}`}>
            <div className="flex items-start gap-2">
              <Selo cor={k.tipo === "faq" ? "petroleo" : k.tipo === "midia" ? "laranja" : "cinza"}>{k.tipo === "faq" ? "Pergunta" : k.tipo === "midia" ? "Arquivo" : "Texto"}</Selo>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold">{k.pergunta ?? k.titulo ?? "Sem título"}</div>
                <div className="mt-1 line-clamp-3 text-[12.5px] text-suave">{k.conteudo ?? k.quandoEnviar}</div>
              </div>
              <button type="button" onClick={() => setEditar(k)} className="text-[12px] font-semibold text-laranja">Editar</button>
            </div>
          </Card>
        ))}
      </div>
      {editar && (
        <Modal titulo="Conhecimento" aoFechar={() => setEditar(null)} largura="max-w-xl" rodape={
          <>
            {editar.id && <Botao variante="fantasma" className="mr-auto !text-vermelho" onClick={() => executar(() => del(`/agentes/${agente}/conhecimento/${editar.id}`), "Apagado").then(() => { setEditar(null); recarregar(); })}>Apagar</Botao>}
            <Botao onClick={() => executar(() => (editar.id ? put(`/agentes/${agente}/conhecimento/${editar.id}`, editar) : post(`/agentes/${agente}/conhecimento`, editar)), "Salvo").then((r) => { if (r) { setEditar(null); recarregar(); } })}>Salvar</Botao>
          </>}>
          <div className="flex flex-col gap-3">
            {editar.tipo === "faq" ? (
              <>
                <Campo rotulo="Pergunta do cliente"><Entrada value={editar.pergunta ?? ""} onChange={(e) => setEditar({ ...editar, pergunta: e.target.value, titulo: e.target.value })} placeholder="Vocês entregam?" /></Campo>
                <Campo rotulo="Resposta certa"><AreaTexto rows={5} value={editar.conteudo ?? ""} onChange={(e) => setEditar({ ...editar, conteudo: e.target.value })} /></Campo>
              </>
            ) : editar.tipo === "midia" ? (
              <>
                <Campo rotulo="Nome do arquivo (o robô vê este nome)"><Entrada value={editar.titulo ?? ""} onChange={(e) => setEditar({ ...editar, titulo: e.target.value })} placeholder="Catálogo de verão" /></Campo>
                <Campo rotulo="Quando enviar"><Entrada value={editar.quandoEnviar ?? ""} onChange={(e) => setEditar({ ...editar, quandoEnviar: e.target.value })} placeholder="Quando o cliente pedir o catálogo ou as opções" /></Campo>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-linha-2 p-4 text-[13px] hover:border-laranja">
                  <Upload className="size-5 text-laranja" /> {editar.arquivoUrl ? "Arquivo enviado ✔ (trocar)" : "Escolher arquivo"}
                  <input type="file" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const r = await enviarArquivo(f); setEditar({ ...editar, arquivoUrl: r.url, arquivoMime: r.mime, titulo: editar.titulo || r.nome }); } }} />
                </label>
              </>
            ) : (
              <>
                <Campo rotulo="Título"><Entrada value={editar.titulo ?? ""} onChange={(e) => setEditar({ ...editar, titulo: e.target.value })} /></Campo>
                <Campo rotulo="Conteúdo"><AreaTexto rows={8} value={editar.conteudo ?? ""} onChange={(e) => setEditar({ ...editar, conteudo: e.target.value })} /></Campo>
              </>
            )}
            <Interruptor ligado={editar.ativo !== false} aoMudar={(v) => setEditar({ ...editar, ativo: v })} rotulo="Ativo" />
          </div>
        </Modal>
      )}
    </div>
  );
}

function ConexoesAgente({ agente, atuais, aoMudar }: { agente: string; atuais: any[]; aoMudar: () => void }) {
  const { dados } = useDados<any[]>("/conexoes");
  const [sel, setSel] = useState<string[]>(atuais.map((c) => c.id));
  const { executar, carregando } = useAcao();
  return (
    <Card className="flex max-w-2xl flex-col gap-3">
      <p className="text-[13px] text-suave">Em quais números e contas o robô atende. As novas conversas dessas conexões começam com ele.</p>
      {(dados ?? []).map((c) => (
        <label key={c.id} className="flex items-center gap-3 rounded-xl border border-linha px-3 py-2.5">
          <input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} />
          <span className="flex-1 text-[13.5px] font-semibold">{c.nome}</span>
          <Selo cor={c.status === "conectado" ? "verde" : "cinza"}>{c.status}</Selo>
        </label>
      ))}
      {dados?.length === 0 && <p className="text-[13px]">Nenhuma conexão ainda. <Link to="/conexoes" className="font-semibold text-laranja">Conectar WhatsApp</Link></p>}
      <Botao carregando={carregando} onClick={() => executar(() => put(`/agentes/${agente}/conexoes`, { conexoes: sel }), "Conexões salvas").then(aoMudar)} className="self-start">Salvar conexões</Botao>
    </Card>
  );
}

function Testar({ agente, nome }: { agente: string; nome: string }) {
  const [msgs, setMsgs] = useState<{ de: "cliente" | "agente"; texto: string }[]>([]);
  const [texto, setTexto] = useState("");
  const [info, setInfo] = useState<any>(null);
  const { executar, carregando } = useAcao();
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => fim.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);
  const enviar = async () => {
    if (!texto.trim()) return;
    const nova = [...msgs, { de: "cliente" as const, texto }];
    setMsgs(nova);
    setTexto("");
    const r = await executar(() => post<any>(`/agentes/${agente}/testar`, { mensagens: nova }));
    if (r) {
      setMsgs([...nova, ...r.partes.map((p: string) => ({ de: "agente" as const, texto: p }))]);
      setInfo(r);
    }
  };
  return (
    <Card className="flex max-w-3xl flex-col gap-3">
      <Dica icone={FlaskConical}>Converse como se fosse um cliente. Nada é enviado de verdade e as ações (tags, funil) não acontecem no teste.</Dica>
      <div className="flex h-[420px] flex-col gap-2 overflow-y-auto rounded-2xl bg-[#f3eee4] p-4">
        {msgs.length === 0 && <div className="m-auto text-[13px] text-suave">Mande um "Oi, quanto custa?" para começar.</div>}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.de === "cliente" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-[13.5px] whitespace-pre-wrap ${m.de === "cliente" ? "bg-white ring-1 ring-linha" : "bg-petroleo text-white"}`}>
              {m.de === "agente" && <div className="mb-0.5 text-[11px] font-semibold text-white/80">🤖 {nome}</div>}{m.texto}
            </div>
          </div>
        ))}
        {carregando && <div className="flex justify-end"><span className="rounded-full bg-petroleo/10 px-3 py-1 text-[12px] text-petroleo">{nome} está digitando...</span></div>}
        <div ref={fim} />
      </div>
      <div className="flex gap-2">
        <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviar()} placeholder="Escreva como cliente..." />
        <Botao carregando={carregando} onClick={enviar} icone={<Send className="size-4" />}>Enviar</Botao>
        <Botao variante="secundario" onClick={() => { setMsgs([]); setInfo(null); }}>Limpar</Botao>
      </div>
      {info && <div className="text-[11.5px] text-suave">Respondeu em {(info.ms / 1000).toFixed(1)}s · {info.tokens.entrada} tokens de entrada ({info.tokens.cache} do cache) · {info.tokens.saida} de saída</div>}
    </Card>
  );
}

function Metricas({ agente }: { agente: string }) {
  const { dados: m } = useDados<any>(`/agentes/${agente}/metricas`);
  if (!m) return <Carregando />;
  const itens = [
    ["Conversas (30 dias)", num(m.conversas)], ["Mensagens enviadas", num(m.mensagens)], ["Resolvidas sem humano", num(m.resolvidasSemHumano)],
    ["Transferidas para humano", num(m.transferidas)], ["Decisões tomadas", num(m.decisoes)], ["Vendas influenciadas", num(m.vendas)],
    ["Receita influenciada", reais(m.receita)], ["Tempo médio de resposta", `${(m.tempoMedioMs / 1000).toFixed(1)}s`], ["Gasto no mês", reais(m.gastoMesCentavos / 100)],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {itens.map(([r, v]) => <Card key={r}><div className="text-[12px] text-suave">{r}</div><div className="mt-1 font-titulo text-[22px] font-bold">{v}</div></Card>)}
    </div>
  );
}
