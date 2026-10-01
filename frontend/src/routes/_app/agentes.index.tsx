import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bot, Pause, Play, Plus } from "lucide-react";
import { useState } from "react";
import { Botao, Campo, Entrada, Modal, useAcao } from "../../components/form";
import { CabecalhoPagina, Card, Carregando, Dica, Selo, Vazio } from "../../components/ui";
import { post } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { reais } from "../../lib/formato";

export const Route = createFileRoute("/_app/agentes/")({ component: Agentes });

function Agentes() {
  const { dados, recarregar } = useDados<any[]>("/agentes");
  const [novo, setNovo] = useState(false);
  const { executar } = useAcao();
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Robôs de IA" icone={Bot} descricao="Vendedores virtuais que atendem seus clientes no WhatsApp e no Instagram, 24 horas por dia.">
        <Botao data-tour="novo-agente" icone={<Plus className="size-4" />} onClick={() => setNovo(true)}>Criar robô</Botao>
      </CabecalhoPagina>
      <Dica>Cada robô tem personalidade, instruções e conhecimento próprios. Ele responde sozinho, marca tags, move o cliente no funil, agenda, vende pelo catálogo e passa para um humano quando precisa.</Dica>
      {!dados ? <Carregando /> : dados.length === 0 ? (
        <Card><Vazio icone={Bot} titulo="Nenhum robô ainda" acao={<Botao onClick={() => setNovo(true)}>Criar meu primeiro robô</Botao>}>Crie seu vendedor virtual em 1 minuto.</Vazio></Card>
      ) : (
        <div data-tour="lista-agentes" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dados.map((a) => (
            <Card key={a.id} className="flex flex-col">
              <div className="flex items-start gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-white" style={{ background: a.cor }}><Bot className="size-6" /></span>
                <div className="min-w-0 flex-1">
                  <Link to="/agentes/$id" params={{ id: a.id }} className="font-titulo text-[17px] font-semibold hover:text-laranja">{a.nome}</Link>
                  <div className="text-[12.5px] text-suave capitalize">{a.papel.replace("_", "-")} · {a.empresa}</div>
                </div>
                {a.status === "active" ? <Selo cor="verde">● Ativo</Selo> : <Selo cor="cinza">Pausado</Selo>}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-fundo py-2"><div className="font-titulo text-lg font-bold">{a.conversas30d}</div><div className="text-[11px] text-suave">conversas 30d</div></div>
                <div className="rounded-xl bg-fundo py-2"><div className="font-titulo text-lg font-bold">{a.conexoes}</div><div className="text-[11px] text-suave">números</div></div>
                <div className="rounded-xl bg-fundo py-2"><div className="font-titulo text-[15px] font-bold">{reais((a.custoMesMicroUsd / 1_000_000) * 5.5)}</div><div className="text-[11px] text-suave">custo no mês*</div></div>
              </div>
              <div className="mt-4 flex gap-2">
                <Link to="/agentes/$id" params={{ id: a.id }} className="flex-1"><Botao variante="secundario" className="w-full">Configurar</Botao></Link>
                {a.status === "active"
                  ? <Botao variante="secundario" icone={<Pause className="size-4" />} onClick={() => executar(() => post(`/agentes/${a.id}/status`, { status: "paused" }), "Robô pausado").then(recarregar)}>Pausar</Botao>
                  : <Botao icone={<Play className="size-4" />} onClick={() => executar(() => post(`/agentes/${a.id}/status`, { status: "active" }), "Robô ativado").then(recarregar)}>Ativar</Botao>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <p className="text-[11.5px] text-suave">* Custo estimado da IA convertido com a cotação de Configurações → Inteligência Artificial.</p>
      {novo && <NovoAgente aoFechar={() => setNovo(false)} />}
    </div>
  );
}

function NovoAgente({ aoFechar }: { aoFechar: () => void }) {
  const { dados: modelos } = useDados<any[]>("/agentes/modelos");
  const [papel, setPapel] = useState("vendas");
  const [nome, setNome] = useState("");
  const navigate = useNavigate();
  const { executar, carregando } = useAcao();
  return (
    <Modal titulo="Criar robô de IA" aoFechar={aoFechar} largura="max-w-2xl" rodape={
      <Botao carregando={carregando} disabled={!nome.trim()} onClick={() => executar(() => post<any>("/agentes", { nome, papel }), "Robô criado").then((a) => a && navigate({ to: "/agentes/$id", params: { id: a.id } }))}>Criar e configurar</Botao>}>
      <Campo rotulo="Nome que o robô vai usar"><Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Ana, André, Lu" /></Campo>
      <div className="mt-4 text-[12.5px] font-semibold">O que ele vai fazer?</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {(modelos ?? []).map((m) => (
          <button key={m.papel} type="button" onClick={() => setPapel(m.papel)}
            className={`rounded-2xl border p-3 text-left transition ${papel === m.papel ? "border-laranja bg-orange-50" : "border-linha hover:border-laranja/50"}`}>
            <div className="font-titulo text-[14px] font-semibold">{m.nome}</div>
            <div className="text-[12.5px] text-suave">{m.descricao}</div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
