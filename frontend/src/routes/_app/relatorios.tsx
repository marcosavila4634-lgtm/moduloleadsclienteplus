import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Bot, Download, MessageSquare, Send, Smile, Timer, UserRound } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Botao, Selecao } from "../../components/form";
import { IconeInstagram, IconeWhatsApp } from "../../components/Icones";
import { Barra, CabecalhoPagina, Card, CardNumero, Carregando, TituloCard, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { baixar, qs } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { duracao, num, relativo, telefone } from "../../lib/formato";
import { useSessao } from "../../lib/sessao";

export const Route = createFileRoute("/_app/relatorios")({ component: Relatorios });

function Relatorios() {
  const [dias, setDias] = useState(7);
  const { dados } = useDados<any>(`/relatorios${qs({ dias })}`);
  const { pode } = useSessao();
  const [exportar, setExportar] = useState("conversas");
  if (!dados) return <Carregando />;
  const total = Number(dados.ia) + Number(dados.humano) || 1;
  const nps = dados.nps;
  const notaNps = nps.respostas ? Math.round(((nps.promotores - nps.detratores) / nps.respostas) * 100) : null;
  const maxTag = Math.max(...dados.tags.map((t: any) => Number(t.contatos)), 1);
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Relatórios" icone={BarChart3} descricao="Como está o atendimento: volume, robô x equipe, canais e satisfação.">
        <Selecao className="!w-32" value={String(dias)} onChange={(e) => setDias(Number(e.target.value))} opcoes={[{ valor: "1", rotulo: "Hoje" }, { valor: "7", rotulo: "7 dias" }, { valor: "30", rotulo: "30 dias" }, { valor: "90", rotulo: "90 dias" }]} />
        {pode("supervisor") && <>
          <Selecao className="!w-44" value={exportar} onChange={(e) => setExportar(e.target.value)} opcoes={[{ valor: "conversas", rotulo: "Conversas" }, { valor: "negocios", rotulo: "Negócios" }, { valor: "vendas", rotulo: "Vendas" }, { valor: "mensagens-dia", rotulo: "Mensagens por dia" }]} />
          <Botao variante="secundario" icone={<Download className="size-4" />} onClick={() => baixar(`/relatorios/csv${qs({ tipo: exportar, dias })}`, `${exportar}.csv`)}>Exportar planilha</Botao>
        </>}
      </CabecalhoPagina>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <CardNumero icone={MessageSquare} rotulo="Conversas" valor={num(dados.conversas)} />
        <CardNumero icone={Send} cor="laranja" rotulo="Mensagens recebidas" valor={num(dados.recebidas)} detalhe={`${num(dados.enviadas)} enviadas`} />
        <CardNumero icone={Bot} cor="ambar" rotulo="Respondidas pelo robô" valor={`${Math.round((Number(dados.ia) / total) * 100)}%`} detalhe={`${num(dados.ia)} mensagens`} />
        <CardNumero icone={Timer} cor="verde" rotulo="Tempo de resposta do robô" valor={Number(dados.tempoMedioIaMs) ? duracao(Number(dados.tempoMedioIaMs)) : "—"} />
        <CardNumero icone={Smile} cor={notaNps === null ? "petroleo" : notaNps >= 50 ? "verde" : notaNps >= 0 ? "ambar" : "vermelho"} rotulo="NPS (satisfação)" valor={notaNps === null ? "—" : String(notaNps)} detalhe={nps.respostas ? `${nps.respostas} respostas · média ${Number(nps.media).toFixed(1)}` : "Sem respostas no período"} />
      </div>
      <Card>
        <TituloCard>Mensagens por dia</TituloCard>
        <div className="mt-3 h-72">
          <ResponsiveContainer>
            <BarChart data={dados.porDia.map((d: any) => ({ dia: d.dia.slice(5).split("-").reverse().join("/"), Recebidas: Number(d.recebidas), Robô: Number(d.ia), Equipe: Number(d.humano) }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-linha)" /><XAxis dataKey="dia" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Legend />
              <Bar dataKey="Recebidas" fill="var(--color-petroleo)" radius={[4, 4, 0, 0]} /><Bar dataKey="Robô" fill="var(--color-laranja)" radius={[4, 4, 0, 0]} /><Bar dataKey="Equipe" fill="var(--color-ambar)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="!p-0">
          <div className="px-4 py-3"><TituloCard icone={Bot}>Robôs</TituloCard></div>
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Robô</th><th>Conversas</th><th>Mensagens</th><th>Tempo médio</th><th className="pr-4">Passou p/ humano</th></tr></thead>
            <tbody>{dados.porAgente.map((a: any) => <tr key={a.id} className={linhaTabela}><td className="px-4 py-2 font-semibold">{a.nome}</td><td>{num(a.conversas)}</td><td>{num(a.mensagens)}</td><td>{Number(a.tempoMs) ? duracao(Number(a.tempoMs)) : "—"}</td><td className="pr-4">{num(a.transferidas)}</td></tr>)}</tbody>
          </table>
        </Card>
        <Card className="!p-0">
          <div className="px-4 py-3"><TituloCard icone={UserRound}>Equipe</TituloCard></div>
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Pessoa</th><th>Conversas</th><th className="pr-4">Mensagens</th></tr></thead>
            <tbody>{dados.porAtendente.map((a: any) => <tr key={a.id} className={linhaTabela}><td className="px-4 py-2 font-semibold">{a.nome}</td><td>{num(a.conversas)}</td><td className="pr-4">{num(a.mensagens)}</td></tr>)}</tbody>
          </table>
        </Card>
        <Card className="!p-0">
          <div className="px-4 py-3"><TituloCard>Canais</TituloCard></div>
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Canal</th><th>Conversas</th><th>Recebidas</th><th>Enviadas</th><th className="pr-4">Última</th></tr></thead>
            <tbody>{dados.porConexao.map((c: any) => (
              <tr key={c.id} className={linhaTabela}><td className="px-4 py-2"><div className="flex items-center gap-2">{c.tipo === "instagram" ? <IconeInstagram className="size-4 text-[#dd2a7b]" /> : <IconeWhatsApp className="size-4 text-[#25d366]" />}<span className="font-semibold">{c.nome}</span><span className="text-[12px] text-suave">{telefone(c.telefone)}</span></div></td>
                <td>{num(c.conversas)}</td><td>{num(c.recebidas)}</td><td>{num(c.enviadas)}</td><td className="pr-4 text-suave">{c.ultima ? relativo(c.ultima) : "—"}</td></tr>
            ))}</tbody>
          </table>
        </Card>
        <Card className="flex flex-col gap-2">
          <TituloCard>Etiquetas mais usadas</TituloCard>
          {dados.tags.map((t: any) => (
            <div key={t.t} className="flex items-center gap-3 text-[13px]"><span className="w-40 shrink-0 truncate font-semibold">{t.t}</span><div className="flex-1"><Barra valor={Number(t.contatos)} total={maxTag} /></div><span className="w-14 text-right">{num(t.contatos)}</span></div>
          ))}
        </Card>
      </div>
    </div>
  );
}
