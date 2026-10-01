import { createFileRoute } from "@tanstack/react-router";
import { Copy, Link2, MousePointerClick, Plus, Radar, Target, Trash2 } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Botao, Campo, Entrada, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { CabecalhoPagina, Card, CardNumero, Carregando, Dica, TituloCard, Vazio, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { del, post, put, qs } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { num, reais } from "../../lib/formato";

export const Route = createFileRoute("/_app/tracking")({ component: Tracking });

export const CANAIS: Record<string, string> = {
  meta_ads: "Anúncio Meta (clique para WhatsApp)", instagram: "Instagram", instagram_comentario: "Comentário no Instagram", meta_lead_ads: "Formulário de anúncio",
  link: "Link rastreado", loja: "Página da loja", agenda: "Página de agendamento", google: "Google", organico: "Orgânico", disparo: "Disparo", sem_origem: "Sem origem identificada",
  inbound: "Cliente chamou direto", coexistence_history: "Histórico importado do WhatsApp", meta_post: "Post do Facebook/Instagram", automacao: "Automação", manual: "Criada pela equipe", ia: "Robô",
};

function Tracking() {
  const [dias, setDias] = useState(30);
  const { dados, recarregar } = useDados<any>(`/tracking/resumo${qs({ dias })}`);
  const [novo, setNovo] = useState(false);
  const [gasto, setGasto] = useState<any>(null);
  const { executar } = useAcao();
  const { avisar } = useAvisos();
  if (!dados) return <Carregando />;
  const copiar = (t: string) => { navigator.clipboard.writeText(t); avisar("Link copiado!"); };
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Tracking" icone={Radar} descricao="De onde vêm suas conversas e quais anúncios realmente vendem.">
        <Selecao className="!w-32" value={String(dias)} onChange={(e) => setDias(Number(e.target.value))} opcoes={[{ valor: "7", rotulo: "7 dias" }, { valor: "30", rotulo: "30 dias" }, { valor: "90", rotulo: "90 dias" }]} />
      </CabecalhoPagina>
      <div className="grid gap-4 sm:grid-cols-3">
        <CardNumero icone={Radar} rotulo="Conversas novas" valor={num(dados.conversas)} />
        <CardNumero icone={Target} cor="laranja" rotulo="Com origem identificada" valor={num(dados.comOrigem)} detalhe={dados.conversas ? `${Math.round((dados.comOrigem / dados.conversas) * 100)}% do total` : undefined} />
        <CardNumero icone={MousePointerClick} cor="ambar" rotulo="Cliques nos links" valor={num(dados.cliques)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <TituloCard>Conversas por dia</TituloCard>
          <div className="mt-3 h-64">
            <ResponsiveContainer>
              <BarChart data={dados.porDia.map((d: any) => ({ dia: d.dia.slice(5).split("-").reverse().join("/"), "Com origem": Number(d.comOrigem), "Sem origem": Number(d.semOrigem) }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-linha)" /><XAxis dataKey="dia" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Legend />
                <Bar dataKey="Com origem" stackId="a" fill="var(--color-laranja)" /><Bar dataKey="Sem origem" stackId="a" fill="var(--color-petroleo)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="!p-0">
          <div className="px-4 py-3"><TituloCard>Por canal</TituloCard></div>
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Canal</th><th>Conversas</th><th>Vendas</th><th className="pr-4 text-right">Receita</th></tr></thead>
            <tbody>{dados.porCanal.map((c: any) => <tr key={c.canal} className={linhaTabela}><td className="px-4 py-2">{CANAIS[c.canal] ?? c.canal}</td><td>{num(c.conversas)}</td><td>{num(c.vendas)}</td><td className="pr-4 text-right font-semibold">{reais(c.receita)}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>
      <Card className="!p-0">
        <div className="px-4 py-3"><TituloCard>Anúncios (clique para WhatsApp)</TituloCard></div>
        <div className="px-4 pb-3"><Dica>Os anúncios aparecem sozinhos quando alguém chega por eles. Informe quanto gastou em cada um para ver o retorno (ROAS).</Dica></div>
        {dados.anuncios.length === 0 ? <Vazio icone={Target} titulo="Nenhum anúncio identificado ainda" /> : (
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Anúncio</th><th>Conversas</th><th>Vendas</th><th>Receita</th><th>Gasto</th><th>Custo/conversa</th><th>ROAS</th><th></th></tr></thead>
            <tbody>{dados.anuncios.map((a: any) => (
              <tr key={a.id} className={linhaTabela}>
                <td className="px-4 py-2.5"><div className="flex items-center gap-2">{a.midiaUrl && <img src={a.midiaUrl} alt="" className="size-9 rounded-lg object-cover" />}<div className="min-w-0"><div className="max-w-xs truncate font-semibold">{a.titulo ?? a.adId}</div><div className="text-[12px] text-suave">{a.campanha ?? "—"}</div></div></div></td>
                <td>{num(a.conversas)}</td><td>{num(a.vendas)}</td><td className="font-semibold">{reais(a.receita)}</td><td>{a.gasto != null ? reais(a.gasto) : "—"}</td>
                <td>{a.gasto && a.conversas ? reais(a.gasto / a.conversas) : "—"}</td>
                <td className={`font-bold ${a.gasto && a.receita / a.gasto >= 1 ? "text-verde" : "text-vermelho"}`}>{a.gasto ? `${(a.receita / a.gasto).toFixed(1)}x` : "—"}</td>
                <td className="pr-3 text-right"><Botao tamanho="sm" variante="secundario" onClick={() => setGasto({ ...a })}>Informar gasto</Botao></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      <Card className="!p-0">
        <div className="flex items-center justify-between px-4 py-3"><TituloCard icone={Link2}>Links rastreados</TituloCard><Botao tamanho="sm" icone={<Plus className="size-4" />} onClick={() => setNovo(true)}>Novo link</Botao></div>
        <div className="px-4 pb-3"><Dica>Use um link diferente na bio, no Google, em panfletos... Quem clicar abre o WhatsApp e a conversa já chega marcada com a origem.</Dica></div>
        {dados.links.length === 0 ? <Vazio icone={Link2} titulo="Nenhum link" /> : (
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Nome</th><th>Link</th><th>Campanha</th><th>Cliques</th><th></th></tr></thead>
            <tbody>{dados.links.map((l: any) => (
              <tr key={l.id} className={linhaTabela}>
                <td className="px-4 py-2.5 font-semibold">{l.nome}</td>
                <td><button type="button" onClick={() => copiar(l.url)} className="flex items-center gap-1 font-mono text-[12px] text-petroleo hover:underline">{l.url} <Copy className="size-3.5" /></button></td>
                <td className="text-suave">{l.campanha ?? "—"}</td><td className="font-semibold">{num(l.cliques)}</td>
                <td className="pr-3 text-right"><button type="button" onClick={() => executar(() => del(`/tracking/links/${l.id}`), "Link apagado").then(recarregar)} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      {novo && <NovoLink aoFechar={(ok) => { setNovo(false); if (ok) recarregar(); }} />}
      {gasto && (
        <Modal titulo="Gasto do anúncio" aoFechar={() => setGasto(null)} rodape={<Botao onClick={() => executar(() => put(`/tracking/anuncios/${gasto.id}`, { gasto: gasto.gasto === "" ? null : Number(gasto.gasto), campanha: gasto.campanha, titulo: gasto.titulo }), "Salvo").then((r) => { if (r) { setGasto(null); recarregar(); } })}>Salvar</Botao>}>
          <div className="grid gap-3">
            <Campo rotulo="Nome do anúncio"><Entrada value={gasto.titulo ?? ""} onChange={(e) => setGasto({ ...gasto, titulo: e.target.value })} /></Campo>
            <Campo rotulo="Campanha"><Entrada value={gasto.campanha ?? ""} onChange={(e) => setGasto({ ...gasto, campanha: e.target.value })} /></Campo>
            <Campo rotulo="Quanto gastou no total (R$)" dica="Veja no Gerenciador de Anúncios da Meta."><Entrada type="number" step="0.01" value={gasto.gasto ?? ""} onChange={(e) => setGasto({ ...gasto, gasto: e.target.value })} /></Campo>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NovoLink({ aoFechar }: { aoFechar: (ok?: boolean) => void }) {
  const [f, setF] = useState({ nome: "", codigo: "", mensagem: "Olá! Quero saber mais.", campanha: "", origem: "link", destinoUrl: "", conexaoId: "" });
  const { dados: conexoes } = useDados<any[]>("/conexoes");
  const { executar, carregando } = useAcao();
  return (
    <Modal titulo="Novo link rastreado" aoFechar={() => aoFechar()} rodape={<Botao carregando={carregando} onClick={() => executar(() => post("/tracking/links", { ...f, codigo: f.codigo || undefined, conexaoId: f.conexaoId || null, destinoUrl: f.destinoUrl || null }), "Link criado").then((r) => r && aoFechar(true))}>Criar</Botao>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Link da bio" /></Campo>
        <Campo rotulo="Código (opcional)" dica="Fica no fim do link."><Entrada value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "") })} placeholder="bio" /></Campo>
        <Campo rotulo="Origem"><Selecao value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })} opcoes={["link", "instagram", "google", "organico"].map((v) => ({ valor: v, rotulo: CANAIS[v] }))} /></Campo>
        <Campo rotulo="Campanha (opcional)"><Entrada value={f.campanha} onChange={(e) => setF({ ...f, campanha: e.target.value })} /></Campo>
        <Campo rotulo="WhatsApp"><Selecao value={f.conexaoId} onChange={(e) => setF({ ...f, conexaoId: e.target.value })} vazio="O principal" opcoes={(conexoes ?? []).filter((c) => c.tipo === "whatsapp_cloud").map((c) => ({ valor: c.id, rotulo: c.nome }))} /></Campo>
        <Campo rotulo="Mensagem que já vem escrita" className="sm:col-span-2"><Entrada value={f.mensagem} onChange={(e) => setF({ ...f, mensagem: e.target.value })} /></Campo>
        <Campo rotulo="Ou levar para um site (opcional)" className="sm:col-span-2"><Entrada value={f.destinoUrl} onChange={(e) => setF({ ...f, destinoUrl: e.target.value })} placeholder="https://..." /></Campo>
      </div>
    </Modal>
  );
}
