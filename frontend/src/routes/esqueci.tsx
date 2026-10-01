import { createFileRoute, Link } from "@tanstack/react-router";
import { MailCheck, Send } from "lucide-react";
import { useState } from "react";
import { Botao, Campo, Entrada } from "../components/form";
import { TelaEntrada } from "../components/layout/TelaEntrada";
import { post } from "../lib/api";

export const Route = createFileRoute("/esqueci")({ component: Esqueci });

function Esqueci() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  return (
    <TelaEntrada titulo="Esqueci minha senha" subtitulo="Digite seu e-mail. Vamos mandar um link para você criar uma senha nova.">
      {enviado ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="size-12 text-laranja" />
          <p className="text-[14px]">Se existir uma conta com <b>{email}</b>, o link chega em alguns minutos. Confira também a caixa de spam.</p>
          <Link to="/login" className="font-semibold text-laranja hover:underline">Voltar para o login</Link>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={async (e) => {
          e.preventDefault();
          setErro(null);
          setCarregando(true);
          try { await post("/auth/esqueci", { email }); setEnviado(true); } catch (e2) { setErro(e2 instanceof Error ? e2.message : "Tente de novo"); } finally { setCarregando(false); }
        }}>
          <Campo rotulo="E-mail"><Entrada type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" /></Campo>
          {erro && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-vermelho">{erro}</div>}
          <Botao type="submit" carregando={carregando} className="!py-3" icone={<Send className="size-4" />}>Mandar link</Botao>
          <Link to="/login" className="text-center text-sm font-semibold text-suave hover:underline">Voltar</Link>
        </form>
      )}
    </TelaEntrada>
  );
}
