import { createFileRoute } from "@tanstack/react-router";
import { Bell, Building2, KeyRound, ShieldCheck, Upload, UserRound } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Botao, Campo, Entrada, useAcao, useAvisos } from "../../components/form";
import { Avatar, CabecalhoPagina, Card, Dica, Selo, TituloCard } from "../../components/ui";
import { enviarArquivo, post, put } from "../../lib/api";
import { usePush } from "../../lib/push";
import { useSessao } from "../../lib/sessao";

export const Route = createFileRoute("/_app/perfil")({ component: Perfil });

const PAPEIS: Record<string, string> = { dono: "Dono", admin: "Administrador", supervisor: "Supervisor", atendente: "Atendente" };

function Perfil() {
  const { me, recarregar, trocarLoja } = useSessao();
  const [nome, setNome] = useState(me.usuario.nome);
  const [foto, setFoto] = useState(me.usuario.fotoUrl ?? "");
  const [senhas, setSenhas] = useState({ atual: "", nova: "", confirma: "" });
  const [empresa, setEmpresa] = useState("");
  const { executar, carregando } = useAcao();
  const { avisar } = useAvisos();
  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina titulo="Meu perfil" icone={UserRound} descricao={me.usuario.email} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <TituloCard icone={UserRound}>Seus dados</TituloCard>
          <div className="flex items-center gap-4">
            <Avatar nome={nome} foto={foto || null} tamanho={64} />
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-linha-2 px-3 py-2 text-[13px]">
              <Upload className="size-4 text-laranja" /> Trocar foto
              <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const r = await enviarArquivo(f, true); setFoto(`/api/arquivos/p/${r.id}/${encodeURIComponent(r.nome)}`); }} />
            </label>
          </div>
          <Campo rotulo="Nome (aparece nas mensagens que você manda)"><Entrada value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
          <Botao className="self-start" carregando={carregando} onClick={() => executar(() => put("/auth/perfil", { nome, fotoUrl: foto || null }), "Perfil salvo").then(recarregar)}>Salvar</Botao>
        </Card>
        <Card className="flex flex-col gap-3">
          <TituloCard icone={KeyRound}>Trocar senha</TituloCard>
          <Campo rotulo="Senha atual"><Entrada type="password" autoComplete="current-password" value={senhas.atual} onChange={(e) => setSenhas({ ...senhas, atual: e.target.value })} /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Nova senha"><Entrada type="password" autoComplete="new-password" value={senhas.nova} onChange={(e) => setSenhas({ ...senhas, nova: e.target.value })} /></Campo>
            <Campo rotulo="Repita"><Entrada type="password" autoComplete="new-password" value={senhas.confirma} onChange={(e) => setSenhas({ ...senhas, confirma: e.target.value })} /></Campo>
          </div>
          <Botao className="self-start" disabled={!senhas.nova} onClick={() => {
            if (senhas.nova !== senhas.confirma) return avisar("As senhas não são iguais", "erro");
            executar(() => put("/auth/senha", { atual: senhas.atual, nova: senhas.nova }), "Senha trocada").then((r) => r && setSenhas({ atual: "", nova: "", confirma: "" }));
          }}>Trocar senha</Botao>
        </Card>
        <DoisFatores />
        <Notificacoes />
        <Card className="flex flex-col gap-3 lg:col-span-2">
          <TituloCard icone={Building2}>Suas empresas</TituloCard>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {me.empresas.map((e) => (
              <button key={e.id} type="button" onClick={() => e.id !== me.loja?.id && trocarLoja(e.id)} className={`flex items-center justify-between rounded-2xl border-2 p-3 text-left ${e.id === me.loja?.id ? "border-laranja bg-laranja-claro" : "border-linha hover:border-laranja/50"}`}>
                <div><div className="font-semibold">{e.nome}</div><div className="text-[12px] text-suave">{PAPEIS[e.papel]}</div></div>
                {e.id === me.loja?.id && <Selo cor="laranja">Atual</Selo>}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2 border-t border-linha pt-3">
            <Campo rotulo="Criar outra empresa" className="flex-1"><Entrada value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Nome da nova empresa" /></Campo>
            <Botao disabled={!empresa.trim()} onClick={() => executar(() => post<{ id: string }>("/auth/empresas", { nome: empresa }), "Empresa criada").then((r) => r && trocarLoja(r.id))}>Criar</Botao>
          </div>
        </Card>
      </div>
    </div>
  );
}

function DoisFatores() {
  const { me, recarregar } = useSessao();
  const [senha, setSenha] = useState("");
  const [prep, setPrep] = useState<{ segredo: string; uri: string } | null>(null);
  const [qr, setQr] = useState("");
  const [codigo, setCodigo] = useState("");
  const { executar, carregando } = useAcao();
  useEffect(() => { if (prep) QRCode.toDataURL(prep.uri, { width: 200, margin: 1 }).then(setQr); }, [prep]);
  const ativo = me.usuario.totpAtivo;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between"><TituloCard icone={ShieldCheck}>Verificação em duas etapas</TituloCard>{ativo ? <Selo cor="verde">Ligada</Selo> : <Selo>Desligada</Selo>}</div>
      <p className="text-[12.5px] text-suave">Além da senha, pede um código do app autenticador (Google Authenticator, Microsoft Authenticator...). Recomendado para donos e administradores.</p>
      {ativo ? (
        <div className="flex items-end gap-2">
          <Campo rotulo="Sua senha para desligar" className="flex-1"><Entrada type="password" value={senha} onChange={(e) => setSenha(e.target.value)} /></Campo>
          <Botao variante="perigo" carregando={carregando} onClick={() => executar(() => post("/auth/2fa/desativar", { senha }), "Verificação desligada").then((r) => { if (r) { setSenha(""); recarregar(); } })}>Desligar</Botao>
        </div>
      ) : !prep ? (
        <div className="flex items-end gap-2">
          <Campo rotulo="Sua senha" className="flex-1"><Entrada type="password" value={senha} onChange={(e) => setSenha(e.target.value)} /></Campo>
          <Botao carregando={carregando} onClick={() => executar(() => post<{ segredo: string; uri: string }>("/auth/2fa/preparar", { senha })).then((r) => r && setPrep(r))}>Ligar</Botao>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Dica>1. Abra o app autenticador e escaneie o QR Code (ou digite a chave). 2. Digite o código de 6 números que aparece.</Dica>
          <div className="flex items-center gap-4">
            {qr && <img src={qr} alt="QR Code" className="size-40 rounded-xl ring-1 ring-linha" />}
            <div className="min-w-0 text-[12px]"><div className="text-suave">Chave:</div><code className="break-all">{prep.segredo}</code></div>
          </div>
          <div className="flex items-end gap-2">
            <Campo rotulo="Código" className="flex-1"><Entrada inputMode="numeric" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} className="text-center text-xl tracking-[0.3em]" /></Campo>
            <Botao carregando={carregando} onClick={() => executar(() => post("/auth/2fa/ativar", { codigo }), "Verificação em duas etapas ligada! 🔒").then((r) => { if (r) { setPrep(null); setSenha(""); recarregar(); } })}>Confirmar</Botao>
          </div>
        </div>
      )}
    </Card>
  );
}

function Notificacoes() {
  const push = usePush();
  return (
    <Card className="flex flex-col gap-3">
      <TituloCard icone={Bell}>Avisos no celular e no computador</TituloCard>
      <p className="text-[12.5px] text-suave">Receba um aviso quando chegar conversa para você, mesmo com o sistema fechado. No celular, primeiro instale o app: no navegador, toque em <b>Compartilhar → Adicionar à Tela de Início</b> (iPhone) ou <b>⋮ → Instalar app</b> (Android).</p>
      {!push.suportado ? <Dica cor="laranja">Este navegador não aceita avisos. {location.protocol !== "https:" && "Os avisos só funcionam quando o sistema estiver publicado (https)."}</Dica>
        : push.ativo ? (
          <div className="flex items-center gap-2"><Selo cor="verde">Ligado neste aparelho</Selo><Botao tamanho="sm" variante="secundario" onClick={push.testar}>Testar</Botao><Botao tamanho="sm" variante="fantasma" onClick={push.desligar}>Desligar</Botao></div>
        ) : <Botao className="self-start" carregando={push.carregando} onClick={push.ligar} icone={<Bell className="size-4" />}>Ligar avisos neste aparelho</Botao>}
    </Card>
  );
}
