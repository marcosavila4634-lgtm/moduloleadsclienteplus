import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, KeyRound } from "lucide-react";
import { useState } from "react";
import { Botao, Campo, Entrada } from "../components/form";
import { TelaEntrada } from "../components/layout/TelaEntrada";
import { post } from "../lib/api";

export const Route = createFileRoute("/redefinir/$token")({ component: Redefinir });

function Redefinir() {
  const { token } = Route.useParams();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  return (
    <TelaEntrada titulo="Criar nova senha" subtitulo="Use pelo menos 8 caracteres, com letras e números.">
      {ok ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="size-12 text-verde" />
          <p>Senha trocada! Já pode entrar com a senha nova.</p>
          <Link to="/login" className="font-semibold text-laranja hover:underline">Entrar</Link>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={async (e) => {
          e.preventDefault();
          if (senha !== confirma) return setErro("As senhas não são iguais");
          setErro(null);
          setCarregando(true);
          try { await post("/auth/redefinir", { token, senha }); setOk(true); } catch (e2) { setErro(e2 instanceof Error ? e2.message : "Tente de novo"); } finally { setCarregando(false); }
        }}>
          <Campo rotulo="Nova senha"><Entrada type="password" autoComplete="new-password" required value={senha} onChange={(e) => setSenha(e.target.value)} /></Campo>
          <Campo rotulo="Repita a nova senha"><Entrada type="password" autoComplete="new-password" required value={confirma} onChange={(e) => setConfirma(e.target.value)} /></Campo>
          {erro && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-vermelho">{erro}</div>}
          <Botao type="submit" carregando={carregando} className="!py-3" icone={<KeyRound className="size-4" />}>Salvar senha</Botao>
        </form>
      )}
    </TelaEntrada>
  );
}
