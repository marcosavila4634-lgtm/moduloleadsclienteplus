import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Clock, ExternalLink, KeyRound, Mail, Save, Settings, ShieldCheck, Sparkles, Store } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AreaTexto, Botao, Campo, Entrada, Interruptor, Selecao, useAcao } from "../../components/form";
import { DIAS, EditorHorarios } from "../../components/Horarios";
import { Abas, CabecalhoPagina, Card, Carregando, Dica, Selo, TituloCard, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { post, put, qs } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { dataHora, num } from "../../lib/formato";
import { useSessao } from "../../lib/sessao";
import { STATUS_PEDIDO } from "./pedidos.index";

type Aba = "empresa" | "atendimento" | "janela" | "loja" | "mensagens" | "ia" | "email" | "auditoria";
export const Route = createFileRoute("/_app/configuracoes")({
  validateSearch: (s: Record<string, unknown>): { aba?: Aba } => ({ aba: typeof s.aba === "string" ? (s.aba as Aba) : undefined }),
  component: Configuracoes,
});

function Configuracoes() {
  const { aba = "empresa" } = Route.useSearch();
  const navegar = Route.useNavigate();
  const { dados, setDados } = useDados<any>("/configuracoes");
  const { recarregar: recarregarSessao, pode } = useSessao();
  const [f, setF] = useState<any>(null);
  const { executar, carregando } = useAcao();
  useEffect(() => { if (dados) setF(structuredClone(dados)); }, [dados]);
  if (!f) return <Carregando />;
  const cfg = f.config;
  const secao = (k: string) => cfg[k] ?? {};
  const setSecao = (k: string, v: any) => setF({ ...f, config: { ...cfg, [k]: { ...secao(k), ...v } } });
  const alterado = JSON.stringify(f) !== JSON.stringify(dados);
  const salvar = () => executar(() => put<any>("/configuracoes", { nome: f.nome, fuso: f.fuso, horarioComercial: f.horarioComercial, config: cfg }), "Configurações salvas").then((r) => { if (r) { setDados(r); recarregarSessao(); } });
  const podeEditar = pode("admin");
  return (
    <div className="flex flex-col gap-4 pb-16">
      <CabecalhoPagina titulo="Configurações" icone={Settings} descricao="Tudo o que muda o jeito do sistema trabalhar para a sua empresa." />
      {!podeEditar && <Dica cor="laranja">Só administradores podem mudar as configurações.</Dica>}
      <Abas valor={aba} aoMudar={(a) => navegar({ search: { aba: a } })} abas={[
        { valor: "empresa", rotulo: "Empresa" }, { valor: "atendimento", rotulo: "Atendimento" }, { valor: "janela", rotulo: "Horário das mensagens" },
        { valor: "loja", rotulo: "Loja e pedidos" }, { valor: "mensagens", rotulo: "Mensagens automáticas" }, { valor: "ia", rotulo: "Inteligência artificial" },
        { valor: "email", rotulo: "E-mail" }, { valor: "auditoria", rotulo: "Auditoria" },
      ]} />
      {aba === "empresa" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-3">
            <TituloCard icone={Store}>Dados da empresa</TituloCard>
            <Campo rotulo="Nome"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
            <Campo rotulo="Fuso horário"><Selecao value={f.fuso} onChange={(e) => setF({ ...f, fuso: e.target.value })} opcoes={["America/Sao_Paulo", "America/Manaus", "America/Cuiaba", "America/Belem", "America/Fortaleza", "America/Recife", "America/Bahia", "America/Porto_Velho", "America/Rio_Branco", "America/Noronha"].map((z) => ({ valor: z, rotulo: z.replace("America/", "").replace("_", " ") }))} /></Campo>
            <Interruptor ligado={cfg.assinatura_atendente !== false} aoMudar={(v) => setF({ ...f, config: { ...cfg, assinatura_atendente: v } })} rotulo="Assinar mensagens com o nome do atendente" descricao="O cliente vê *Maria:* no começo da mensagem." />
            <div className="mt-2 grid grid-cols-2 gap-2 text-[12.5px]">
              {Object.entries({ Contatos: f.uso?.contatos, Usuários: f.uso?.usuarios, "Robôs de IA": f.uso?.agentes, Conexões: f.uso?.conexoes, Automações: f.uso?.automacoes }).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-fundo px-3 py-2"><div className="text-suave">{k}</div><div className="font-titulo text-[17px] font-bold">{num(v as number)}{f.limites?.[k === "Usuários" ? "usuarios" : k === "Conexões" ? "conexoes" : ""] ? <span className="text-[12px] font-normal text-suave"> / {f.limites[k === "Usuários" ? "usuarios" : "conexoes"]}</span> : null}</div></div>
              ))}
              <div className="rounded-xl bg-fundo px-3 py-2"><div className="text-suave">Plano</div><div className="font-titulo text-[17px] font-bold capitalize">{f.plano ?? "—"}</div></div>
            </div>
          </Card>
          <Card className="flex flex-col gap-3">
            <TituloCard icone={Clock}>Horário de funcionamento</TituloCard>
            <p className="text-[12.5px] text-suave">Usado pelo robô ("estamos fechados"), pela agenda e pelas automações com a condição "dentro do horário".</p>
            <EditorHorarios valor={f.horarioComercial ?? {}} aoMudar={(h) => setF({ ...f, horarioComercial: h })} />
          </Card>
        </div>
      )}
      {aba === "atendimento" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-3">
            <TituloCard>Distribuição de conversas</TituloCard>
            <Campo rotulo="Quando o robô passa para um humano, quem recebe?">
              <Selecao value={secao("distribuicao").modo ?? "manual"} onChange={(e) => setSecao("distribuicao", { modo: e.target.value })} opcoes={[
                { valor: "manual", rotulo: "Ninguém: fica na fila para alguém assumir" }, { valor: "rodizio", rotulo: "Rodízio: um de cada vez" }, { valor: "menos_ocupado", rotulo: "Quem estiver com menos conversas" }]} />
            </Campo>
            <p className="text-[12.5px] text-suave">Quem recebe e o limite de cada um se configuram em <Link to="/equipe" className="font-semibold text-laranja">Equipe</Link>.</p>
            <TituloCard>Tempo de resposta (SLA)</TituloCard>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Avisar se o cliente esperar mais de (min)"><Entrada type="number" value={secao("sla").primeira_resposta_min ?? 15} onChange={(e) => setSecao("sla", { primeira_resposta_min: Number(e.target.value) })} /></Campo>
              <Campo rotulo="Conversa parada há (min)"><Entrada type="number" value={secao("sla").alerta_inatividade_min ?? 60} onChange={(e) => setSecao("sla", { alerta_inatividade_min: Number(e.target.value) })} /></Campo>
            </div>
            <Campo rotulo="Janela de atribuição de vendas (dias)" dica="Uma venda conta para a campanha/anúncio se aconteceu até X dias depois do primeiro contato."><Entrada type="number" value={cfg.janela_atribuicao_dias ?? 7} onChange={(e) => setF({ ...f, config: { ...cfg, janela_atribuicao_dias: Number(e.target.value) } })} /></Campo>
          </Card>
          <Card className="flex flex-col gap-3">
            <TituloCard>Relatório no WhatsApp</TituloCard>
            <p className="text-[12.5px] text-suave">Receba um resumo (conversas, respostas da IA, vendas) no seu WhatsApp.</p>
            <Campo rotulo="WhatsApp que recebe"><Entrada value={secao("relatorio").telefone ?? ""} onChange={(e) => setSecao("relatorio", { telefone: e.target.value })} placeholder="(11) 99999-9999" /></Campo>
            <Interruptor ligado={!!secao("relatorio").diario} aoMudar={(v) => setSecao("relatorio", { diario: v })} rotulo="Todo dia" />
            {secao("relatorio").diario && <Campo rotulo="Hora"><Selecao value={String(secao("relatorio").hora_diario ?? 8)} onChange={(e) => setSecao("relatorio", { hora_diario: Number(e.target.value) })} opcoes={Array.from({ length: 24 }, (_, h) => ({ valor: String(h), rotulo: `${h}h` }))} /></Campo>}
            <Interruptor ligado={!!secao("relatorio").semanal} aoMudar={(v) => setSecao("relatorio", { semanal: v })} rotulo="Toda semana" />
            {secao("relatorio").semanal && (
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Dia"><Selecao value={String(secao("relatorio").dia ?? 1)} onChange={(e) => setSecao("relatorio", { dia: Number(e.target.value) })} opcoes={DIAS.map(([, n], i) => ({ valor: String(i + 1), rotulo: n }))} /></Campo>
                <Campo rotulo="Hora"><Selecao value={String(secao("relatorio").hora ?? 9)} onChange={(e) => setSecao("relatorio", { hora: Number(e.target.value) })} opcoes={Array.from({ length: 24 }, (_, h) => ({ valor: String(h), rotulo: `${h}h` }))} /></Campo>
              </div>
            )}
          </Card>
        </div>
      )}
      {aba === "janela" && <JanelaEnvio valor={secao("janela_envio")} aoMudar={(v) => setF({ ...f, config: { ...cfg, janela_envio: v } })} />}
      {aba === "loja" && <LojaPedidos cfg={cfg} secao={secao} setSecao={setSecao} />}
      {aba === "mensagens" && <Mensagens secao={secao} setSecao={setSecao} />}
      {aba === "ia" && <IA f={f} secao={secao} setSecao={setSecao} />}
      {aba === "email" && <Email secao={secao} setSecao={setSecao} />}
      {aba === "auditoria" && <Auditoria />}
      {alterado && podeEditar && aba !== "auditoria" && (
        <div className="fixed right-6 bottom-6 z-30 flex items-center gap-3 rounded-2xl bg-menu px-4 py-3 text-white shadow-2xl">
          <span className="text-[13px]">Você tem mudanças não salvas</span>
          <Botao variante="fantasma" className="!text-white/80" onClick={() => setF(structuredClone(dados))}>Desfazer</Botao>
          <Botao carregando={carregando} icone={<Save className="size-4" />} onClick={salvar}>Salvar</Botao>
        </div>
      )}
    </div>
  );
}

function JanelaEnvio({ valor, aoMudar }: { valor: any; aoMudar: (v: any) => void }) {
  const modo = valor.modo ?? "livre";
  const dias: string[] = valor.dias ?? [];
  const horarios: string[] = valor.horarios ?? ["15:00"];
  return (
    <Card className="flex max-w-3xl flex-col gap-4">
      <TituloCard icone={Clock}>Quando o robô e as automações podem mandar mensagens</TituloCard>
      <Dica>Exemplo: alguém clica no seu anúncio às 3h da manhã. Com a opção <b>"Só em horários fixos"</b> às 15:00, a mensagem automática fica guardada e só sai às 15h. Respostas que o próprio cliente pede na hora (conversa ativa) não esperam.</Dica>
      <div className="grid gap-2 sm:grid-cols-3">
        {[{ v: "livre", t: "A qualquer hora", d: "Envia na hora, 24h por dia." }, { v: "faixa", t: "Dentro de uma faixa", d: "Ex.: das 9h às 20h." }, { v: "fixo", t: "Só em horários fixos", d: "Ex.: às 10h e às 15h." }].map((o) => (
          <button key={o.v} type="button" onClick={() => aoMudar({ ...valor, modo: o.v })} className={`rounded-2xl border-2 p-3 text-left ${modo === o.v ? "border-laranja bg-laranja-claro" : "border-linha"}`}>
            <div className="font-semibold">{o.t}</div><div className="text-[12px] text-suave">{o.d}</div>
          </button>
        ))}
      </div>
      {modo === "faixa" && (
        <div className="grid max-w-sm grid-cols-2 gap-3">
          <Campo rotulo="Das"><Entrada type="time" value={valor.inicio ?? "09:00"} onChange={(e) => aoMudar({ ...valor, inicio: e.target.value })} /></Campo>
          <Campo rotulo="Até"><Entrada type="time" value={valor.fim ?? "20:00"} onChange={(e) => aoMudar({ ...valor, fim: e.target.value })} /></Campo>
        </div>
      )}
      {modo === "fixo" && (
        <Campo rotulo="Horários de envio">
          <div className="flex flex-wrap items-center gap-2">
            {horarios.map((h, i) => (
              <span key={i} className="flex items-center gap-1 rounded-xl bg-fundo px-2 py-1">
                <input type="time" value={h} onChange={(e) => aoMudar({ ...valor, horarios: horarios.map((x, j) => (j === i ? e.target.value : x)) })} className="bg-transparent" />
                {horarios.length > 1 && <button type="button" onClick={() => aoMudar({ ...valor, horarios: horarios.filter((_, j) => j !== i) })} className="text-suave hover:text-vermelho">×</button>}
              </span>
            ))}
            <Botao tamanho="sm" variante="secundario" onClick={() => aoMudar({ ...valor, horarios: [...horarios, "10:00"] })}>+ horário</Botao>
          </div>
        </Campo>
      )}
      {modo !== "livre" && (
        <Campo rotulo="Em quais dias (nenhum marcado = todos)">
          <div className="flex flex-wrap gap-2">
            {DIAS.map(([d, n]) => (
              <button key={d} type="button" onClick={() => aoMudar({ ...valor, dias: dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d] })} className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 ${dias.includes(d) ? "bg-laranja-gradiente text-white ring-transparent" : "ring-linha"}`}>{n}</button>
            ))}
          </div>
        </Campo>
      )}
    </Card>
  );
}

function SeletorTemplate({ valor, aoMudar, dica }: { valor?: string; aoMudar: (id: string | null) => void; dica?: string }) {
  const { dados } = useDados<any[]>("/conexoes/templates?status=APPROVED");
  return (
    <Campo rotulo="Template se passou de 24h (opcional)" dica={dica ?? "O WhatsApp exige template quando o cliente não fala com você há mais de 24 horas. Variáveis: {{1}} nome, {{2}} detalhe."}>
      <Selecao value={valor ?? ""} onChange={(e) => aoMudar(e.target.value || null)} vazio="Nenhum (não envia fora das 24h)" opcoes={(dados ?? []).map((t) => ({ valor: t.id, rotulo: t.nome }))} />
    </Campo>
  );
}

function Bloco({ titulo, ativo, aoAtivar, descricao, children }: { titulo: string; ativo?: boolean; aoAtivar?: (v: boolean) => void; descricao?: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div><div className="font-titulo text-[15px] font-bold">{titulo}</div>{descricao && <p className="text-[12.5px] text-suave">{descricao}</p>}</div>
        {aoAtivar && <Interruptor ligado={!!ativo} aoMudar={aoAtivar} />}
      </div>
      {(ativo ?? true) && children}
    </Card>
  );
}

function LojaPedidos({ cfg, secao, setSecao }: { cfg: any; secao: (k: string) => any; setSecao: (k: string, v: any) => void }) {
  const { me } = useSessao();
  const e = secao("entrega");
  const formas: string[] = e.formas_pagamento ?? ["pix", "combinar"];
  const st = secao("status_pedido");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Bloco titulo="Página da loja" descricao="Sua vitrine pública com catálogo, carrinho e checkout.">
        <div className="flex flex-wrap gap-2">
          <a href={`/loja/${me.loja?.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[13px] font-semibold text-laranja">{location.origin}/loja/{me.loja?.slug} <ExternalLink className="size-3.5" /></a>
          <Link to="/pagina" className="ml-auto text-[13px] font-semibold text-petroleo">Editar a página →</Link>
        </div>
      </Bloco>
      <Bloco titulo="Pix" descricao="Gera o Pix copia e cola dos pedidos, do robô e das automações.">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Chave Pix"><Entrada value={secao("pix").chave ?? ""} onChange={(ev) => setSecao("pix", { chave: ev.target.value })} placeholder="CPF, CNPJ, e-mail, celular ou aleatória" /></Campo>
          <Campo rotulo="Cidade do recebedor"><Entrada value={secao("pix").cidade ?? ""} onChange={(ev) => setSecao("pix", { cidade: ev.target.value })} placeholder="SAO PAULO" /></Campo>
        </div>
      </Bloco>
      <Bloco titulo="Entrega e pagamento">
        <div className="grid grid-cols-2 gap-3">
          <Interruptor ligado={e.entrega !== false} aoMudar={(v) => setSecao("entrega", { entrega: v })} rotulo="Entrega em casa" />
          <Interruptor ligado={!!e.retirada} aoMudar={(v) => setSecao("entrega", { retirada: v })} rotulo="Retirada na loja" />
          {e.entrega !== false && <>
            <Campo rotulo="Taxa de entrega (R$)"><Entrada type="number" value={e.taxa ?? 0} onChange={(ev) => setSecao("entrega", { taxa: Number(ev.target.value) })} /></Campo>
            <Campo rotulo="Frete grátis acima de (R$, 0 = nunca)"><Entrada type="number" value={e.gratis_acima ?? 0} onChange={(ev) => setSecao("entrega", { gratis_acima: Number(ev.target.value) })} /></Campo>
            <Campo rotulo="Prazo de entrega" className="col-span-2"><Entrada value={e.prazo ?? ""} onChange={(ev) => setSecao("entrega", { prazo: ev.target.value })} placeholder="Ex.: até 2 dias úteis" /></Campo>
          </>}
          {e.retirada && <Campo rotulo="Endereço de retirada" className="col-span-2"><Entrada value={e.endereco_retirada ?? ""} onChange={(ev) => setSecao("entrega", { endereco_retirada: ev.target.value })} /></Campo>}
        </div>
        <Campo rotulo="Formas de pagamento aceitas">
          <div className="flex flex-wrap gap-2">
            {[["pix", "Pix"], ["cartao_entrega", "Cartão na entrega"], ["dinheiro", "Dinheiro"], ["link", "Link de pagamento"], ["combinar", "Combinar no WhatsApp"]].map(([v, n]) => (
              <button key={v} type="button" onClick={() => setSecao("entrega", { formas_pagamento: formas.includes(v) ? formas.filter((x) => x !== v) : [...formas, v] })} className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 ${formas.includes(v) ? "bg-laranja-gradiente text-white ring-transparent" : "ring-linha"}`}>{n}</button>
            ))}
          </div>
        </Campo>
      </Bloco>
      <Bloco titulo="Aviso de status do pedido no WhatsApp" ativo={st.ativo !== false} aoAtivar={(v) => setSecao("status_pedido", { ativo: v })} descricao="O cliente recebe uma mensagem a cada mudança. Use {nome}, {numero}, {total}, {link}, {rastreio}.">
        {["aguardando_pagamento", "pago", "separando", "enviado", "pronto_retirada", "entregue", "cancelado"].map((s) => (
          <Campo key={s} rotulo={STATUS_PEDIDO[s]?.rotulo ?? s}>
            <AreaTexto rows={2} placeholder="(mensagem padrão)" value={st.mensagens?.[s] ?? ""} onChange={(ev) => setSecao("status_pedido", { mensagens: { ...(st.mensagens ?? {}), [s]: ev.target.value } })} />
          </Campo>
        ))}
        <SeletorTemplate valor={st.template_id} aoMudar={(id) => setSecao("status_pedido", { template_id: id })} dica="Variáveis: {{1}} nome, {{2}} número do pedido, {{3}} status." />
      </Bloco>
      <Bloco titulo="Estoque: avise-me quando chegar" descricao="Mensagem para quem entrou na lista de espera. Use {nome}, {produto}, {link}.">
        <AreaTexto rows={3} placeholder="Oi {nome}! 🎉 O produto *{produto}* que você pediu para avisar chegou. Garanta o seu: {link}" value={secao("estoque").mensagem_chegou ?? ""} onChange={(ev) => setSecao("estoque", { mensagem_chegou: ev.target.value })} />
        <SeletorTemplate valor={secao("estoque").template_id} aoMudar={(id) => setSecao("estoque", { template_id: id })} dica="Variáveis: {{1}} nome, {{2}} produto, {{3}} link." />
      </Bloco>
    </div>
  );
}

function Mensagens({ secao, setSecao }: { secao: (k: string) => any; setSecao: (k: string, v: any) => void }) {
  const c = secao("carrinho"), p = secao("pix_lembrete"), n = secao("nps"), a = secao("aniversario");
  return (
    <div className="flex flex-col gap-4">
      <Dica>Todas respeitam o <b>horário das mensagens</b> e não são enviadas para quem pediu para não receber. Use {"{primeiro_nome}"}, {"{nome}"} e as variáveis indicadas.</Dica>
      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco titulo="🛒 Carrinho abandonado" ativo={c.ativo !== false} aoAtivar={(v) => setSecao("carrinho", { ativo: v })} descricao="Para quem deixou produtos na sacola da loja e não finalizou.">
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Esperar (minutos)"><Entrada type="number" value={c.minutos ?? 60} onChange={(e) => setSecao("carrinho", { minutos: Number(e.target.value) })} /></Campo>
            <Campo rotulo="Máximo de lembretes"><Entrada type="number" value={c.max_avisos ?? 2} onChange={(e) => setSecao("carrinho", { max_avisos: Number(e.target.value) })} /></Campo>
          </div>
          <Campo rotulo="Mensagem ({itens}, {total}, {link})"><AreaTexto rows={3} placeholder="Oi {primeiro_nome}! Vi que você separou {itens} no nosso site e não finalizou..." value={c.mensagem ?? ""} onChange={(e) => setSecao("carrinho", { mensagem: e.target.value })} /></Campo>
          <SeletorTemplate valor={c.template_id} aoMudar={(id) => setSecao("carrinho", { template_id: id })} />
        </Bloco>
        <Bloco titulo="💸 Cobrança de Pix pendente" ativo={p.ativo !== false} aoAtivar={(v) => setSecao("pix_lembrete", { ativo: v })} descricao="Lembra quem fez o pedido e ainda não pagou o Pix.">
          <div className="grid grid-cols-3 gap-3">
            <Campo rotulo="Primeiro lembrete após (h)"><Entrada type="number" value={p.horas ?? 2} onChange={(e) => setSecao("pix_lembrete", { horas: Number(e.target.value) })} /></Campo>
            <Campo rotulo="Máx. lembretes"><Entrada type="number" value={p.max_lembretes ?? 2} onChange={(e) => setSecao("pix_lembrete", { max_lembretes: Number(e.target.value) })} /></Campo>
            <Campo rotulo="Cancelar após (h)"><Entrada type="number" value={p.cancelar_apos_horas ?? 72} onChange={(e) => setSecao("pix_lembrete", { cancelar_apos_horas: Number(e.target.value) })} /></Campo>
          </div>
          <Campo rotulo="Mensagem ({numero}, {total}) — o código Pix vai logo depois"><AreaTexto rows={3} placeholder="Oi {primeiro_nome}! Seu pedido *#{numero}* ({total}) ainda está aguardando o Pix..." value={p.mensagem ?? ""} onChange={(e) => setSecao("pix_lembrete", { mensagem: e.target.value })} /></Campo>
          <SeletorTemplate valor={p.template_id} aoMudar={(id) => setSecao("pix_lembrete", { template_id: id })} />
        </Bloco>
        <Bloco titulo="⭐ Pesquisa de satisfação (NPS)" ativo={n.ativo !== false} aoAtivar={(v) => setSecao("nps", { ativo: v })} descricao="Pergunta de 0 a 10 depois da entrega. Notas baixas avisam a equipe.">
          <Campo rotulo="Enviar quantos dias após a entrega"><Entrada type="number" value={n.dias ?? 2} onChange={(e) => setSecao("nps", { dias: Number(e.target.value) })} /></Campo>
          <Campo rotulo="Pergunta"><AreaTexto rows={2} placeholder="Oi {primeiro_nome}! De 0 a 10, quanto você recomendaria a nossa loja para um amigo?" value={n.mensagem ?? ""} onChange={(e) => setSecao("nps", { mensagem: e.target.value })} /></Campo>
          <Campo rotulo="Resposta para nota 9–10"><Entrada placeholder="Muito obrigado! 💜" value={n.resposta_promotor ?? ""} onChange={(e) => setSecao("nps", { resposta_promotor: e.target.value })} /></Campo>
          <Campo rotulo="Resposta para nota 7–8"><Entrada placeholder="Obrigado pela resposta!" value={n.resposta_neutro ?? ""} onChange={(e) => setSecao("nps", { resposta_neutro: e.target.value })} /></Campo>
          <Campo rotulo="Resposta para nota 0–6"><Entrada placeholder="Poxa, obrigado por avisar..." value={n.resposta_detrator ?? ""} onChange={(e) => setSecao("nps", { resposta_detrator: e.target.value })} /></Campo>
          <SeletorTemplate valor={n.template_id} aoMudar={(id) => setSecao("nps", { template_id: id })} />
        </Bloco>
        <Bloco titulo="🎂 Aniversário" ativo={!!a.ativo} aoAtivar={(v) => setSecao("aniversario", { ativo: v })} descricao="Parabéns automático no dia do aniversário do contato (com cupom, se quiser).">
          <Campo rotulo="Cupom de presente (opcional)"><Entrada value={a.cupom ?? ""} onChange={(e) => setSecao("aniversario", { cupom: e.target.value.toUpperCase() })} placeholder="NIVER10" /></Campo>
          <Campo rotulo="Mensagem ({cupom})"><AreaTexto rows={3} placeholder="Feliz aniversário, {primeiro_nome}! 🎉 Temos um presente pra você..." value={a.mensagem ?? ""} onChange={(e) => setSecao("aniversario", { mensagem: e.target.value })} /></Campo>
          <SeletorTemplate valor={a.template_id} aoMudar={(id) => setSecao("aniversario", { template_id: id })} />
        </Bloco>
        <Bloco titulo="🔁 Lembrete de recompra" descricao="Configure em cada produto quantos dias ele dura (ex.: ração 30 dias). A mensagem sai perto do fim.">
          <SeletorTemplate valor={secao("recompra").template_id} aoMudar={(id) => setSecao("recompra", { template_id: id })} dica="Variáveis: {{1}} nome, {{2}} produto." />
          <Link to="/catalogo" className="text-[13px] font-semibold text-laranja">Configurar nos produtos →</Link>
        </Bloco>
      </div>
    </div>
  );
}

function IA({ f, secao, setSecao }: { f: any; secao: (k: string) => any; setSecao: (k: string, v: any) => void }) {
  const ia = secao("ia");
  const [chave, setChave] = useState("");
  const [dias, setDias] = useState(30);
  const { dados: uso } = useDados<any>(`/configuracoes/uso-ia${qs({ dias })}`);
  const { executar, carregando } = useAcao();
  const cotacao = Number(ia.cotacao_dolar ?? 5.5);
  const reaisDeMicro = (m: number) => ((Number(m) / 1e6) * cotacao).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const total = (uso?.porTipo ?? []).reduce((s: number, t: any) => s + Number(t.custoMicroUsd), 0);
  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <TituloCard icone={KeyRound}>Chave da Anthropic (Claude)</TituloCard>
          <div className="flex flex-wrap gap-2">
            {ia.chave_configurada ? <Selo cor="verde">Chave própria configurada</Selo> : ia.chave_servidor ? <Selo cor="petroleo">Usando a chave da plataforma</Selo> : <Selo cor="vermelho">Sem chave — o robô não responde</Selo>}
          </div>
          <Campo rotulo={ia.chave_configurada ? "Trocar a chave" : "Colar chave (sk-ant-...)"}><Entrada type="password" value={chave} onChange={(e) => setChave(e.target.value)} placeholder="sk-ant-..." /></Campo>
          <div className="flex gap-2">
            <Botao carregando={carregando} disabled={!chave} onClick={() => executar(() => put("/configuracoes/segredo", { tipo: "ia", valor: chave }), "Chave salva com segurança").then((r) => r && location.reload())}>Salvar chave</Botao>
            {ia.chave_configurada && <Botao variante="fantasma" onClick={() => executar(() => put("/configuracoes/segredo", { tipo: "ia", valor: "" }), "Chave removida").then(() => location.reload())}>Remover</Botao>}
          </div>
          <p className="text-[12px] text-suave">Crie em console.anthropic.com → API Keys. Fica guardada com criptografia; ninguém consegue ver depois.</p>
        </Card>
        <Card className="flex flex-col gap-3">
          <TituloCard icone={Sparkles}>Análise dos leads</TituloCard>
          <Campo rotulo="Modelo usado na análise (score, resumo, memórias)">
            <Selecao value={ia.modelo_analise ?? "claude-haiku-4-5-20251001"} onChange={(e) => setSecao("ia", { modelo_analise: e.target.value })} opcoes={[
              { valor: "claude-haiku-4-5-20251001", rotulo: "Haiku 4.5 — mais barato" }, { valor: "claude-sonnet-5-5", rotulo: "Sonnet 5.5 — equilibrado" }, { valor: "claude-opus-5-5", rotulo: "Opus 5.5 — mais inteligente" }]} />
          </Campo>
          <Campo rotulo="Cotação do dólar (para mostrar custos em reais)"><Entrada type="number" step="0.01" value={ia.cotacao_dolar ?? 5.5} onChange={(e) => setSecao("ia", { cotacao_dolar: Number(e.target.value) })} /></Campo>
          <p className="text-[12px] text-suave">O modelo de cada robô se escolhe dentro do robô, em <Link to="/agentes" className="font-semibold text-laranja">Agentes de IA</Link>.</p>
        </Card>
      </div>
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between"><TituloCard icone={Bot}>Uso da IA</TituloCard><Selecao className="!w-32" value={String(dias)} onChange={(e) => setDias(Number(e.target.value))} opcoes={[{ valor: "7", rotulo: "7 dias" }, { valor: "30", rotulo: "30 dias" }, { valor: "90", rotulo: "90 dias" }]} /></div>
        {!uso ? <Carregando /> : (
          <>
            <div className="flex gap-6">
              <div><div className="text-[12px] text-suave">Custo no período</div><div className="font-titulo text-[24px] font-bold">{reaisDeMicro(total)}</div></div>
              <div><div className="text-[12px] text-suave">Neste mês</div><div className="font-titulo text-[24px] font-bold">{reaisDeMicro(f.uso?.iaMesMicroUsd ?? 0)}</div></div>
            </div>
            <div className="h-48">
              <ResponsiveContainer>
                <BarChart data={uso.porDia.map((d: any) => ({ dia: d.dia.slice(5).split("-").reverse().join("/"), custo: (Number(d.custoMicroUsd) / 1e6) * cotacao }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-linha)" />
                  <XAxis dataKey="dia" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `R$${v.toFixed(0)}`} />
                  <Tooltip formatter={(v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
                  <Bar dataKey="custo" fill="var(--color-laranja)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="w-full text-[13px]">
              <thead><tr className={cabecalhoTabela}><th className="py-2">Uso</th><th>Chamadas</th><th>Tokens (entrada/saída)</th><th>Do cache</th><th className="text-right">Custo</th></tr></thead>
              <tbody>{uso.porTipo.map((t: any) => (
                <tr key={t.tipo} className={linhaTabela}><td className="py-2 capitalize">{t.tipo}</td><td>{num(t.chamadas)}</td><td>{num(t.entrada)} / {num(t.saida)}</td><td>{num(t.cache)}</td><td className="text-right font-semibold">{reaisDeMicro(t.custoMicroUsd)}</td></tr>
              ))}</tbody>
            </table>
            {uso.erros.length > 0 && (
              <div className="rounded-xl bg-red-50 p-3 text-[12px]">
                <div className="mb-1 font-semibold text-vermelho">Últimos erros</div>
                {uso.erros.slice(0, 5).map((e: any, i: number) => <div key={i} className="truncate">{dataHora(e.createdAt)} · {e.tipo}: {e.erro}</div>)}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function Email({ secao, setSecao }: { secao: (k: string) => any; setSecao: (k: string, v: any) => void }) {
  const s = secao("smtp");
  const [senha, setSenha] = useState("");
  const [para, setPara] = useState("");
  const { executar, carregando } = useAcao();
  return (
    <Card className="flex max-w-2xl flex-col gap-3">
      <TituloCard icone={Mail}>Envio de e-mails (SMTP)</TituloCard>
      <p className="text-[12.5px] text-suave">Usado nos convites da equipe, recuperação de senha e automações com e-mail. Ex.: Gmail (smtp.gmail.com, porta 587, senha de app).</p>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Servidor"><Entrada value={s.host ?? ""} onChange={(e) => setSecao("smtp", { host: e.target.value })} placeholder="smtp.gmail.com" /></Campo>
        <Campo rotulo="Porta"><Entrada type="number" value={s.porta ?? 587} onChange={(e) => setSecao("smtp", { porta: Number(e.target.value) })} /></Campo>
        <Campo rotulo="Usuário"><Entrada value={s.usuario ?? ""} onChange={(e) => setSecao("smtp", { usuario: e.target.value })} /></Campo>
        <Campo rotulo="E-mail remetente"><Entrada value={s.remetente ?? ""} onChange={(e) => setSecao("smtp", { remetente: e.target.value })} /></Campo>
        <Campo rotulo="Nome do remetente" className="col-span-2"><Entrada value={s.nome_remetente ?? ""} onChange={(e) => setSecao("smtp", { nome_remetente: e.target.value })} /></Campo>
      </div>
      <div className="flex items-end gap-2">
        <Campo rotulo={s.senha_configurada ? "Senha (configurada — digite para trocar)" : "Senha"} className="flex-1"><Entrada type="password" value={senha} onChange={(e) => setSenha(e.target.value)} /></Campo>
        <Botao variante="secundario" disabled={!senha} carregando={carregando} onClick={() => executar(() => put("/configuracoes/segredo", { tipo: "smtp", valor: senha }), "Senha salva").then(() => setSenha(""))}>Salvar senha</Botao>
      </div>
      <p className="text-[12px] text-suave">Salve as outras configurações no botão laranja antes de testar.</p>
      <div className="flex items-end gap-2 border-t border-linha pt-3">
        <Campo rotulo="Testar enviando para" className="flex-1"><Entrada value={para} onChange={(e) => setPara(e.target.value)} placeholder="seu@email.com" /></Campo>
        <Botao carregando={carregando} onClick={() => executar(() => post("/configuracoes/testar-email", { para: para || undefined }), "E-mail de teste enviado! Confira a caixa de entrada.")}>Enviar teste</Botao>
      </div>
    </Card>
  );
}

function Auditoria() {
  const { dados } = useDados<any[]>("/configuracoes/auditoria");
  return (
    <Card className="!p-0">
      <div className="px-4 py-3"><TituloCard icone={ShieldCheck}>Quem mudou o quê</TituloCard></div>
      {!dados ? <Carregando /> : (
        <table className="w-full text-[13px]">
          <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Quando</th><th>Quem</th><th>Ação</th><th>Detalhes</th></tr></thead>
          <tbody>{dados.map((a) => (
            <tr key={a.id} className={linhaTabela}><td className="px-4 py-2 whitespace-nowrap">{dataHora(a.createdAt)}</td><td>{a.usuarioNome ?? "Sistema"}</td><td><Selo>{a.acao}</Selo></td><td className="max-w-lg truncate text-[12px] text-suave">{a.dados ? JSON.stringify(a.dados) : ""}</td></tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}

