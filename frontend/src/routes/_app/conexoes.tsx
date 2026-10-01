import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Copy, Plug, Plus, RefreshCw, Trash2, Unplug } from "lucide-react";
import { useState } from "react";
import { Botao, Campo, Entrada, Modal, Selecao, useAcao, useAvisos } from "../../components/form";
import { IconeInstagram, IconeWhatsApp } from "../../components/Icones";
import { CabecalhoPagina, Card, Carregando, Dica, Selo, Vazio } from "../../components/ui";
import { del, post, put } from "../../lib/api";
import { useDados } from "../../lib/dados";
import { num, relativo, telefone } from "../../lib/formato";

export const Route = createFileRoute("/_app/conexoes")({ component: Conexoes });

const QUALIDADE: Record<string, { rotulo: string; cor: "verde" | "ambar" | "vermelho" | "cinza" }> = { GREEN: { rotulo: "Qualidade alta", cor: "verde" }, YELLOW: { rotulo: "Qualidade média", cor: "ambar" }, RED: { rotulo: "Qualidade baixa", cor: "vermelho" } };

function Conexoes() {
  const { dados, recarregar } = useDados<any[]>("/conexoes");
  const { dados: webhook } = useDados<any>("/conexoes/webhook");
  const { dados: agentes } = useDados<any[]>("/agentes");
  const [nova, setNova] = useState<null | "whatsapp" | "instagram">(null);
  const [editar, setEditar] = useState<any>(null);
  const { executar } = useAcao();
  const { avisar, confirmar } = useAvisos();
  const copiar = (t: string) => { navigator.clipboard.writeText(t); avisar("Copiado!"); };
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Conexões" icone={Plug} descricao="Os canais por onde seus clientes conversam com você.">
        <Botao variante="secundario" icone={<IconeInstagram className="size-4" />} onClick={() => setNova("instagram")}>Conectar Instagram</Botao>
        <Botao icone={<IconeWhatsApp className="size-4" />} onClick={() => setNova("whatsapp")} data-tour="nova-conexao">Conectar WhatsApp</Botao>
      </CabecalhoPagina>
      {!dados ? <Carregando /> : dados.length === 0 ? (
        <Card><Vazio icone={Plug} titulo="Nenhum canal conectado" acao={<Botao icone={<Plus className="size-4" />} onClick={() => setNova("whatsapp")}>Conectar WhatsApp</Botao>}>Conecte o WhatsApp oficial para o robô e a equipe atenderem por aqui.</Vazio></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-tour="conexoes">
          {dados.map((c) => {
            const q = QUALIDADE[c.config?.qualidade];
            return (
              <Card key={c.id} className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className={`grid size-11 shrink-0 place-items-center rounded-full text-white ${c.tipo === "instagram" ? "bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]" : "bg-[#25d366]"}`}>
                    {c.tipo === "instagram" ? <IconeInstagram className="size-5" /> : <IconeWhatsApp className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-titulo font-bold">{c.nome}</div>
                    <div className="text-[12.5px] text-suave">{c.tipo === "instagram" ? `@${c.instagramUsuario ?? ""}` : telefone(c.telefone)}</div>
                  </div>
                  {c.status === "conectado" ? <Selo cor="verde">Conectado</Selo> : c.status === "erro" ? <Selo cor="vermelho">Com erro</Selo> : <Selo>{c.status === "desconectado" ? "Desconectado" : "Pendente"}</Selo>}
                </div>
                {c.ultimoErro && <div className="flex gap-2 rounded-xl bg-red-50 p-2.5 text-[12px] text-vermelho"><AlertTriangle className="size-4 shrink-0" />{c.ultimoErro}</div>}
                <div className="flex flex-wrap gap-1.5 text-[12px]">
                  {q && <Selo cor={q.cor}>{q.rotulo}</Selo>}
                  {c.config?.limite && <Selo>{String(c.config.limite).replace("TIER_", "Limite ").replace("K", " mil")}/dia</Selo>}
                  <Selo>{num(c.conversas)} conversas</Selo>
                  {c.ultimaMensagemEm && <Selo>última msg {relativo(c.ultimaMensagemEm)}</Selo>}
                </div>
                <Campo rotulo="Robô que atende este canal">
                  <Selecao value={c.agenteId ?? ""} vazio="Nenhum (só humanos)" opcoes={(agentes ?? []).map((a) => ({ valor: a.id, rotulo: `${a.nome}${a.status !== "active" ? " (pausado)" : ""}` }))}
                    onChange={(e) => executar(() => put(`/conexoes/${c.id}`, { agenteId: e.target.value || null }), "Robô atualizado").then(recarregar)} />
                </Campo>
                <div className="mt-auto flex flex-wrap gap-2 border-t border-linha pt-3">
                  <Botao tamanho="sm" variante="secundario" icone={<RefreshCw className="size-3.5" />} onClick={async () => {
                    const r = await executar(() => post<any>(`/conexoes/${c.id}/testar`));
                    if (r) avisar(r.ok ? "Tudo certo com a conexão ✅" : `Problema: ${r.erro}`, r.ok ? "ok" : "erro");
                    recarregar();
                  }}>Testar</Botao>
                  <Botao tamanho="sm" variante="secundario" onClick={() => setEditar({ ...c, token: "" })}>Editar</Botao>
                  {c.tipo === "whatsapp_cloud" && <Link to="/templates" className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-petroleo hover:bg-fundo">Templates</Link>}
                  {c.status === "conectado" && <Botao tamanho="sm" variante="fantasma" icone={<Unplug className="size-3.5" />} onClick={async () => { if (await confirmar("Desconectar? Mensagens deixam de chegar por aqui até reconectar.")) executar(() => post(`/conexoes/${c.id}/desconectar`), "Desconectado").then(recarregar); }}>Desconectar</Botao>}
                  <button type="button" className="ml-auto rounded-lg p-1.5 text-suave hover:text-vermelho" onClick={async () => { if (await confirmar("Apagar a conexão? As conversas continuam salvas.", { perigo: true, botao: "Apagar" })) executar(() => del(`/conexoes/${c.id}`), "Conexão apagada").then(recarregar); }}><Trash2 className="size-4" /></button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {webhook && (
        <Card className="flex flex-col gap-3">
          <div className="font-titulo font-bold">Dados do webhook (para o app da Meta)</div>
          <p className="text-[13px] text-suave">No painel do seu app em developers.facebook.com → WhatsApp → Configuração, e também em Instagram e Webhooks da Página, cole estes dados e assine os campos <b>messages</b>, <b>message_template_status_update</b>, <b>comments</b> e <b>leadgen</b>.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Campo rotulo="URL de retorno (callback)"><div className="flex gap-2"><Entrada readOnly value={webhook.url} /><Botao variante="secundario" onClick={() => copiar(webhook.url)}><Copy className="size-4" /></Botao></div></Campo>
            <Campo rotulo="Token de verificação"><div className="flex gap-2"><Entrada readOnly value={webhook.verifyToken || "(defina WHATSAPP_VERIFY_TOKEN no servidor)"} /><Botao variante="secundario" onClick={() => copiar(webhook.verifyToken)}><Copy className="size-4" /></Botao></div></Campo>
          </div>
          {webhook.url.startsWith("http://localhost") && <Dica cor="laranja">O endereço ainda é local. A Meta só consegue enviar mensagens para um endereço público com HTTPS — isso fica pronto quando o sistema for publicado.</Dica>}
          {!webhook.appConfigurado && <Dica cor="vermelho">A chave secreta do app da Meta (META_APP_SECRET) não está configurada no servidor. Sem ela, as mensagens recebidas não são aceitas por segurança.</Dica>}
        </Card>
      )}
      {nova === "whatsapp" && <NovoWhatsApp webhook={webhook} aoFechar={(ok) => { setNova(null); if (ok) recarregar(); }} />}
      {nova === "instagram" && <NovoInstagram aoFechar={(ok) => { setNova(null); if (ok) recarregar(); }} />}
      {editar && (
        <Modal titulo="Editar conexão" aoFechar={() => setEditar(null)} rodape={<Botao onClick={() => executar(() => put(`/conexoes/${editar.id}`, { nome: editar.nome, token: editar.token || undefined, config: editar.tipo === "instagram" ? { boas_vindas: editar.config?.boas_vindas } : undefined }), "Conexão salva").then((r) => { if (r) { setEditar(null); recarregar(); } })}>Salvar</Botao>}>
          <div className="flex flex-col gap-3">
            <Campo rotulo="Nome"><Entrada value={editar.nome} onChange={(e) => setEditar({ ...editar, nome: e.target.value })} /></Campo>
            <Campo rotulo="Novo token de acesso (só se precisar trocar)" dica="Use quando a conexão mostrar erro de token expirado."><Entrada type="password" value={editar.token} onChange={(e) => setEditar({ ...editar, token: e.target.value })} /></Campo>
            {editar.tipo === "instagram" && <Campo rotulo="Mensagem de boas-vindas (opcional)"><Entrada value={editar.config?.boas_vindas ?? ""} onChange={(e) => setEditar({ ...editar, config: { ...editar.config, boas_vindas: e.target.value } })} /></Campo>}
          </div>
        </Modal>
      )}
    </div>
  );
}

declare global { interface Window { FB?: any; fbAsyncInit?: () => void } }

function carregarFacebook(appId: string): Promise<any> {
  return new Promise((ok) => {
    if (window.FB) return ok(window.FB);
    window.fbAsyncInit = () => { window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v23.0" }); ok(window.FB); };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/pt_BR/sdk.js";
    s.async = true;
    document.body.appendChild(s);
  });
}

function NovoWhatsApp({ webhook, aoFechar }: { webhook: any; aoFechar: (ok?: boolean) => void }) {
  const [f, setF] = useState({ nome: "", phoneNumberId: "", wabaId: "", token: "" });
  const { executar, carregando } = useAcao();
  const { avisar } = useAvisos();
  const podeAutomatico = webhook?.appId && webhook?.configId && webhook?.appConfigurado;
  const automatico = async () => {
    const FB = await carregarFacebook(webhook.appId);
    let sessao: { phone_number_id?: string; waba_id?: string } = {};
    const ouvir = (ev: MessageEvent) => {
      if (!String(ev.origin).endsWith("facebook.com")) return;
      try { const d = JSON.parse(ev.data); if (d.type === "WA_EMBEDDED_SIGNUP" && d.event === "FINISH") sessao = d.data; } catch { /* outras mensagens */ }
    };
    window.addEventListener("message", ouvir);
    FB.login((r: any) => {
      window.removeEventListener("message", ouvir);
      const code = r?.authResponse?.code;
      if (!code) return avisar("Cadastro cancelado", "erro");
      setTimeout(() => {
        if (!sessao.phone_number_id) return avisar("A Meta não informou o número. Tente de novo ou use o modo manual.", "erro");
        executar(() => post("/conexoes/whatsapp/cadastro-meta", { code, phoneNumberId: sessao.phone_number_id, wabaId: sessao.waba_id, nome: f.nome || undefined }), "WhatsApp conectado! 🎉").then((x) => x && aoFechar(true));
      }, 800);
    }, { config_id: webhook.configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, sessionInfoVersion: "3" } });
  };
  return (
    <Modal titulo="Conectar WhatsApp oficial" largura="max-w-2xl" aoFechar={() => aoFechar()} rodape={
      <Botao carregando={carregando} onClick={() => executar(() => post("/conexoes/whatsapp", f), "WhatsApp conectado! 🎉").then((r) => r && aoFechar(true))}>Conectar</Botao>}>
      <div className="flex flex-col gap-4">
        {podeAutomatico && (
          <div className="flex items-center gap-3 rounded-2xl bg-[#25d366]/10 p-4">
            <CheckCircle2 className="size-6 text-[#1a9e4d]" />
            <div className="flex-1 text-[13px]"><b>Jeito mais fácil:</b> entre com o Facebook e escolha o número. A Meta faz o resto.</div>
            <Botao onClick={automatico} icone={<IconeWhatsApp className="size-4" />}>Entrar com o Facebook</Botao>
          </div>
        )}
        <Dica>
          <b>Modo manual — passo a passo:</b>
          <ol className="mt-1 ml-4 list-decimal space-y-0.5">
            <li>Entre em <b>developers.facebook.com</b> → seu app → <b>WhatsApp → Configuração da API</b>.</li>
            <li>Copie o <b>ID do número de telefone</b> e o <b>ID da conta do WhatsApp Business</b>.</li>
            <li>Em <b>business.facebook.com → Usuários do sistema</b>, gere um <b>token permanente</b> com as permissões <i>whatsapp_business_messaging</i> e <i>whatsapp_business_management</i>.</li>
            <li>Cole tudo aqui embaixo.</li>
          </ol>
        </Dica>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome (como aparece aqui)"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="WhatsApp Loja" /></Campo>
          <Campo rotulo="ID do número de telefone"><Entrada value={f.phoneNumberId} onChange={(e) => setF({ ...f, phoneNumberId: e.target.value })} /></Campo>
          <Campo rotulo="ID da conta do WhatsApp Business (WABA)"><Entrada value={f.wabaId} onChange={(e) => setF({ ...f, wabaId: e.target.value })} /></Campo>
          <Campo rotulo="Token de acesso permanente"><Entrada type="password" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} /></Campo>
        </div>
        <p className="text-[12px] text-suave">O token fica guardado com criptografia. Ao conectar, os templates aprovados já são importados.</p>
      </div>
    </Modal>
  );
}

function NovoInstagram({ aoFechar }: { aoFechar: (ok?: boolean) => void }) {
  const [f, setF] = useState({ nome: "", instagramId: "", paginaId: "", token: "", boasVindas: "" });
  const { executar, carregando } = useAcao();
  return (
    <Modal titulo="Conectar Instagram" largura="max-w-2xl" aoFechar={() => aoFechar()} rodape={
      <Botao carregando={carregando} onClick={() => executar(() => post("/conexoes/instagram", f), "Instagram conectado! 🎉").then((r) => r && aoFechar(true))}>Conectar</Botao>}>
      <div className="flex flex-col gap-4">
        <Dica>
          <b>Passo a passo:</b>
          <ol className="mt-1 ml-4 list-decimal space-y-0.5">
            <li>O Instagram precisa ser <b>profissional</b> e estar ligado a uma <b>Página do Facebook</b>.</li>
            <li>No app da Meta, adicione o produto <b>Instagram</b> e gere o <b>token da Página</b> com as permissões <i>instagram_manage_messages</i>, <i>instagram_manage_comments</i> e <i>pages_manage_metadata</i>.</li>
            <li>Copie o <b>ID da conta do Instagram</b> e o <b>ID da Página</b>.</li>
          </ol>
        </Dica>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome (opcional)"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
          <Campo rotulo="ID da conta do Instagram"><Entrada value={f.instagramId} onChange={(e) => setF({ ...f, instagramId: e.target.value })} /></Campo>
          <Campo rotulo="ID da Página do Facebook"><Entrada value={f.paginaId} onChange={(e) => setF({ ...f, paginaId: e.target.value })} /></Campo>
          <Campo rotulo="Token da Página"><Entrada type="password" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} /></Campo>
          <Campo rotulo="Mensagem de boas-vindas (opcional)" className="sm:col-span-2"><Entrada value={f.boasVindas} onChange={(e) => setF({ ...f, boasVindas: e.target.value })} /></Campo>
        </div>
      </div>
    </Modal>
  );
}
