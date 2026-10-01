import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList, MessageCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { AreaTexto, Botao, Campo, Entrada, Interruptor, Modal, Selecao, useAcao } from "../../components/form";
import { IconeInstagram } from "../../components/Icones";
import { Abas, CabecalhoPagina, Card, Carregando, Dica, Selo, Vazio, cabecalhoTabela, linhaTabela } from "../../components/ui";
import { del, post, put } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { dataHora, num } from "../../lib/formato";
import { textoTemplate } from "./templates";

type Aba = "instagram" | "formularios";
export const Route = createFileRoute("/_app/captacao")({
  validateSearch: (s: Record<string, unknown>): { aba?: Aba } => ({ aba: typeof s.aba === "string" ? (s.aba as Aba) : undefined }),
  component: Captacao,
});

function Captacao() {
  const { aba = "instagram" } = Route.useSearch();
  const navegar = Route.useNavigate();
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Captação de leads" icone={MessageCircle} descricao="Transforme comentários e formulários de anúncio em conversas." />
      <Abas valor={aba} aoMudar={(a) => navegar({ search: { aba: a } })} abas={[{ valor: "instagram", rotulo: "Comentário → Direct" }, { valor: "formularios", rotulo: "Formulários de anúncio (Meta)" }]} />
      {aba === "instagram" ? <Instagram /> : <Formularios />}
    </div>
  );
}

function Instagram() {
  const { dados, recarregar } = useDados<any>("/captacao/instagram");
  const { dados: conexoes } = useDados<any[]>("/conexoes");
  const [editar, setEditar] = useState<any>(null);
  const { executar } = useAcao();
  const igs = (conexoes ?? []).filter((c) => c.tipo === "instagram");
  if (!dados) return <Carregando />;
  return (
    <div className="flex flex-col gap-4">
      <Dica>Exemplo: no post você escreve <b>"Comente EU QUERO que te mando o link"</b>. Quem comentar recebe a resposta no comentário e uma mensagem no Direct na hora — e o robô continua a conversa.</Dica>
      <Card className="!p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="font-titulo font-bold">Gatilhos</div>
          {igs.length ? <Botao tamanho="sm" icone={<Plus className="size-4" />} onClick={() => setEditar({ conexaoId: igs[0].id, nome: "", midias: [], palavras: [], respostaComentario: "Te mandei no Direct! 📩", mensagemDirect: "Oi! Aqui está o link que você pediu 👇", iaAssume: true, ativo: true })}>Novo gatilho</Botao>
            : <Link to="/conexoes" className="text-[13px] font-semibold text-laranja">Conecte um Instagram primeiro →</Link>}
        </div>
        {dados.gatilhos.length === 0 ? <Vazio icone={IconeInstagram as any} titulo="Nenhum gatilho" /> : (
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Gatilho</th><th>Palavras</th><th>Posts</th><th>Disparos</th><th>Status</th><th></th></tr></thead>
            <tbody>{dados.gatilhos.map((g: any) => (
              <tr key={g.id} className={linhaTabela}>
                <td className="px-4 py-2.5"><div className="font-semibold">{g.nome}</div><div className="text-[12px] text-suave">{g.conexaoNome}</div></td>
                <td>{g.palavras?.length ? g.palavras.map((p: string) => <Selo key={p} className="mr-1">{p}</Selo>) : <span className="text-suave">Qualquer comentário</span>}</td>
                <td>{g.midias?.length ? `${g.midias.length} post(s)` : "Todos"}</td>
                <td className="font-semibold">{num(g.disparos)}</td>
                <td>{g.ativo ? <Selo cor="verde">Ativo</Selo> : <Selo>Pausado</Selo>}</td>
                <td className="pr-3 text-right"><button type="button" onClick={() => setEditar({ ...g, midias: g.midias ?? [], palavras: g.palavras ?? [] })} className="rounded-lg p-1.5 text-suave hover:bg-fundo"><Pencil className="size-4" /></button>
                  <button type="button" onClick={() => executar(() => del(`/captacao/instagram/${g.id}`), "Gatilho apagado").then(recarregar)} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      <Card className="!p-0">
        <div className="px-4 py-3 font-titulo font-bold">Últimos comentários</div>
        {dados.comentarios.length === 0 ? <Vazio icone={MessageCircle} titulo="Nenhum comentário recebido ainda" /> : (
          <table className="w-full text-[13px]"><tbody>{dados.comentarios.map((c: any) => (
            <tr key={c.id} className={linhaTabela}>
              <td className="px-4 py-2 whitespace-nowrap text-suave">{dataHora(c.createdAt)}</td><td className="font-semibold">@{c.usuario}</td><td className="max-w-md truncate">{c.texto}</td>
              <td>{c.directEnviado ? <Selo cor="verde">Direct enviado</Selo> : c.erro ? <Selo cor="vermelho" className="max-w-xs truncate">{c.erro}</Selo> : c.gatilhoId ? <Selo>Respondido</Selo> : <Selo>Sem gatilho</Selo>}</td>
            </tr>
          ))}</tbody></table>
        )}
      </Card>
      {editar && <EditorGatilho inicial={editar} igs={igs} aoFechar={(ok) => { setEditar(null); if (ok) recarregar(); }} />}
    </div>
  );
}

function EditorGatilho({ inicial, igs, aoFechar }: { inicial: any; igs: any[]; aoFechar: (ok?: boolean) => void }) {
  const [g, setG] = useState(inicial);
  const [palavra, setPalavra] = useState("");
  const [verPosts, setVerPosts] = useState(g.midias.length > 0);
  const { dados: posts } = useDados<any[]>(verPosts && g.conexaoId ? `/captacao/instagram/${g.conexaoId}/posts` : null);
  const { executar, carregando } = useAcao();
  return (
    <Modal titulo={g.id ? "Editar gatilho" : "Novo gatilho"} largura="max-w-2xl" aoFechar={() => aoFechar()} rodape={
      <Botao carregando={carregando} onClick={() => executar(() => (g.id ? put(`/captacao/instagram/${g.id}`, g) : post("/captacao/instagram", g)), "Gatilho salvo").then((r) => r && aoFechar(true))}>Salvar</Botao>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome"><Entrada value={g.nome} onChange={(e) => setG({ ...g, nome: e.target.value })} placeholder="Promo do vestido" /></Campo>
        <Campo rotulo="Conta"><Selecao value={g.conexaoId} onChange={(e) => setG({ ...g, conexaoId: e.target.value, midias: [] })} opcoes={igs.map((c) => ({ valor: c.id, rotulo: c.nome }))} /></Campo>
        <Campo rotulo="Palavras que disparam (vazio = qualquer comentário)" className="sm:col-span-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {g.palavras.map((p: string) => <button key={p} type="button" onClick={() => setG({ ...g, palavras: g.palavras.filter((x: string) => x !== p) })} className="rounded-full bg-petroleo px-2.5 py-1 text-[12px] font-semibold text-white">{p} ×</button>)}
            <Entrada className="!w-48" value={palavra} onChange={(e) => setPalavra(e.target.value)} placeholder="ex.: EU QUERO" onKeyDown={(e) => { if (e.key === "Enter" && palavra.trim()) { e.preventDefault(); setG({ ...g, palavras: [...g.palavras, palavra.trim()] }); setPalavra(""); } }} />
            <span className="text-[11.5px] text-suave">Enter para adicionar</span>
          </div>
        </Campo>
        <div className="sm:col-span-2">
          <Interruptor ligado={verPosts} aoMudar={(v) => { setVerPosts(v); if (!v) setG({ ...g, midias: [] }); }} rotulo="Só em posts específicos" descricao="Desligado: vale para todos os posts e reels." />
          {verPosts && (!posts ? <Carregando texto="Buscando seus posts no Instagram..." /> : (
            <div className="mt-2 grid max-h-64 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
              {posts.map((p: any) => {
                const on = g.midias.includes(p.id);
                return (
                  <button key={p.id} type="button" title={p.caption} onClick={() => setG({ ...g, midias: on ? g.midias.filter((x: string) => x !== p.id) : [...g.midias, p.id] })} className={`relative aspect-square overflow-hidden rounded-lg ring-2 ${on ? "ring-laranja" : "ring-transparent"}`}>
                    <img src={p.thumbnailUrl ?? p.thumbnail_url ?? p.mediaUrl ?? p.media_url} alt="" className="h-full w-full object-cover" />
                    {on && <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-laranja text-[11px] text-white">✓</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <Campo rotulo="Resposta pública no comentário (opcional)" className="sm:col-span-2"><Entrada value={g.respostaComentario ?? ""} onChange={(e) => setG({ ...g, respostaComentario: e.target.value })} /></Campo>
        <Campo rotulo="Mensagem no Direct" className="sm:col-span-2"><AreaTexto rows={3} value={g.mensagemDirect} onChange={(e) => setG({ ...g, mensagemDirect: e.target.value })} /></Campo>
        <Campo rotulo="Link (opcional)"><Entrada value={g.linkUrl ?? ""} onChange={(e) => setG({ ...g, linkUrl: e.target.value })} placeholder="https://..." /></Campo>
        <Campo rotulo="Texto do botão do link"><Entrada value={g.linkTexto ?? ""} onChange={(e) => setG({ ...g, linkTexto: e.target.value })} placeholder="Ver produto" /></Campo>
        <Campo rotulo="Etiqueta no contato (opcional)"><Entrada value={g.tag ?? ""} onChange={(e) => setG({ ...g, tag: e.target.value.toUpperCase() })} /></Campo>
        <div className="flex flex-col justify-end gap-2">
          <Interruptor ligado={g.iaAssume} aoMudar={(v) => setG({ ...g, iaAssume: v })} rotulo="O robô continua a conversa" />
          <Interruptor ligado={g.ativo} aoMudar={(v) => setG({ ...g, ativo: v })} rotulo="Ativo" />
        </div>
      </div>
    </Modal>
  );
}

function Formularios() {
  const { dados, recarregar } = useDados<any>("/captacao/formularios");
  const [editar, setEditar] = useState<any>(null);
  const { executar } = useAcao();
  if (!dados) return <Carregando />;
  return (
    <div className="flex flex-col gap-4">
      <Dica>Quando alguém preenche o formulário de um anúncio no Facebook/Instagram, o lead entra aqui na hora: vira contato, cai no funil e recebe uma mensagem no WhatsApp (por template, pois ainda não falou com você).</Dica>
      <Card className="!p-0">
        <div className="flex items-center justify-between px-4 py-3"><div className="font-titulo font-bold">Formulários ligados</div>
          <Botao tamanho="sm" icone={<Plus className="size-4" />} onClick={() => setEditar({ nome: "", paginaId: "", formularioId: "", token: "", tag: "LEAD ANÚNCIO", templateVariaveis: {}, iaAssume: true, ativo: true })}>Ligar formulário</Botao></div>
        {dados.formularios.length === 0 ? <Vazio icone={ClipboardList} titulo="Nenhum formulário ligado" /> : (
          <table className="w-full text-[13px]">
            <thead><tr className={cabecalhoTabela}><th className="px-4 py-2">Formulário</th><th>Página</th><th>Mensagem</th><th>Leads</th><th>Status</th><th></th></tr></thead>
            <tbody>{dados.formularios.map((f: any) => (
              <tr key={f.id} className={linhaTabela}>
                <td className="px-4 py-2.5 font-semibold">{f.nome}<div className="font-normal text-[12px] text-suave">{f.formularioId || "Todos os formulários da página"}</div></td>
                <td className="font-mono text-[12px]">{f.paginaId}{!f.tokenConfigurado && <Selo cor="vermelho" className="ml-1">sem token</Selo>}</td>
                <td>{f.templateNome ?? <span className="text-suave">Nenhuma</span>}</td>
                <td className="font-semibold">{num(f.leads)}</td>
                <td>{f.ativo ? <Selo cor="verde">Ativo</Selo> : <Selo>Pausado</Selo>}</td>
                <td className="pr-3 text-right"><button type="button" onClick={() => setEditar({ ...f, token: "" })} className="rounded-lg p-1.5 text-suave hover:bg-fundo"><Pencil className="size-4" /></button>
                  <button type="button" onClick={() => executar(() => del(`/captacao/formularios/${f.id}`), "Removido").then(recarregar)} className="rounded-lg p-1.5 text-suave hover:text-vermelho"><Trash2 className="size-4" /></button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      <Card className="!p-0">
        <div className="px-4 py-3 font-titulo font-bold">Leads recebidos</div>
        {dados.leads.length === 0 ? <Vazio icone={ClipboardList} titulo="Nenhum lead ainda" /> : (
          <table className="w-full text-[13px]"><tbody>{dados.leads.map((l: any) => (
            <tr key={l.id} className={linhaTabela}>
              <td className="px-4 py-2 whitespace-nowrap text-suave">{dataHora(l.createdAt)}</td>
              <td>{l.contatoId ? <Link to="/contatos/$id" params={{ id: l.contatoId }} className="font-semibold text-petroleo">{l.contatoNome ?? "Contato"}</Link> : "—"}</td>
              <td className="max-w-md truncate text-[12px] text-suave">{l.dados ? Object.entries(l.dados).map(([k, v]) => `${k}: ${v}`).join(" · ") : ""}</td>
              <td>{l.campanha}</td>
              <td>{l.mensagemEnviada ? <Selo cor="verde">WhatsApp enviado</Selo> : l.erro ? <Selo cor="vermelho" className="max-w-xs truncate">{l.erro}</Selo> : <Selo>Sem mensagem</Selo>}</td>
            </tr>
          ))}</tbody></table>
        )}
      </Card>
      {editar && <EditorFormulario inicial={editar} aoFechar={(ok) => { setEditar(null); if (ok) recarregar(); }} />}
    </div>
  );
}

function EditorFormulario({ inicial, aoFechar }: { inicial: any; aoFechar: (ok?: boolean) => void }) {
  const [f, setF] = useState(inicial);
  const { dados: conexoes } = useDados<any[]>("/conexoes");
  const { dados: templates } = useDados<any[]>("/conexoes/templates?status=APPROVED");
  const { dados: funis } = useDados<any[]>("/crm/funis");
  const { executar, carregando } = useAcao();
  const tpl = (templates ?? []).find((t) => t.id === f.templateId);
  const vars = tpl ? [...new Set(textoTemplate(tpl).match(/\{\{(\d+)\}\}/g) ?? [])].map((v) => v.replace(/\D/g, "")) : [];
  return (
    <Modal titulo={f.id ? "Editar formulário" : "Ligar formulário de anúncio"} largura="max-w-2xl" aoFechar={() => aoFechar()} rodape={
      <Botao carregando={carregando} onClick={() => executar(() => (f.id ? put(`/captacao/formularios/${f.id}`, f) : post("/captacao/formularios", f)), "Formulário salvo").then((r) => r && aoFechar(true))}>Salvar</Botao>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo rotulo="ID da Página do Facebook"><Entrada value={f.paginaId} onChange={(e) => setF({ ...f, paginaId: e.target.value })} /></Campo>
        <Campo rotulo="ID do formulário (vazio = todos)"><Entrada value={f.formularioId ?? ""} onChange={(e) => setF({ ...f, formularioId: e.target.value })} /></Campo>
        <Campo rotulo={f.id ? "Token da página (só para trocar)" : "Token da página"} dica="Permissões: leads_retrieval e pages_manage_metadata."><Entrada type="password" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} /></Campo>
        <Campo rotulo="Funil"><Selecao value={f.funilId ?? ""} onChange={(e) => setF({ ...f, funilId: e.target.value || null })} vazio="Funil principal" opcoes={(funis ?? []).map((x) => ({ valor: x.id, rotulo: x.nome }))} /></Campo>
        <Campo rotulo="Etiqueta"><Entrada value={f.tag ?? ""} onChange={(e) => setF({ ...f, tag: e.target.value.toUpperCase() })} /></Campo>
        <Campo rotulo="WhatsApp que manda a primeira mensagem"><Selecao value={f.conexaoId ?? ""} onChange={(e) => setF({ ...f, conexaoId: e.target.value || null })} vazio="Não mandar mensagem" opcoes={(conexoes ?? []).filter((c) => c.tipo === "whatsapp_cloud").map((c) => ({ valor: c.id, rotulo: c.nome }))} /></Campo>
        {f.conexaoId && <Campo rotulo="Template"><Selecao value={f.templateId ?? ""} onChange={(e) => setF({ ...f, templateId: e.target.value || null, templateVariaveis: {} })} vazio="Escolha..." opcoes={(templates ?? []).filter((t) => t.conexaoId === f.conexaoId).map((t) => ({ valor: t.id, rotulo: t.nome }))} /></Campo>}
        {tpl && <div className="rounded-xl bg-fundo p-3 text-[12.5px] whitespace-pre-line sm:col-span-2">{textoTemplate(tpl)}</div>}
        {vars.map((n) => <Campo key={n} rotulo={`Valor de {{${n}}}`} dica="Use {primeiro_nome}, {nome} ou qualquer campo do formulário."><Entrada value={f.templateVariaveis?.[n] ?? ""} onChange={(e) => setF({ ...f, templateVariaveis: { ...f.templateVariaveis, [n]: e.target.value } })} /></Campo>)}
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Interruptor ligado={f.iaAssume} aoMudar={(v) => setF({ ...f, iaAssume: v })} rotulo="O robô atende quando o lead responder" />
          <Interruptor ligado={f.ativo} aoMudar={(v) => setF({ ...f, ativo: v })} rotulo="Ativo" />
        </div>
      </div>
    </Modal>
  );
}
