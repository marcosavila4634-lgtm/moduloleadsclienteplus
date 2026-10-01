import { createFileRoute, Link } from "@tanstack/react-router";
import { KeyRound, LogIn } from "lucide-react";
import { useState } from "react";
import { Botao, Campo, Entrada } from "../components/form";
import { TelaEntrada } from "../components/layout/TelaEntrada";
import { gravarLoja, gravarToken, post } from "../lib/api";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { voltar?: string } => ({ voltar: typeof s.voltar === "string" ? s.voltar : undefined }),
  component: Login,
});

function Login() {
  const { voltar } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [token2fa, setToken2fa] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      if (token2fa) {
        gravarToken(token2fa);
        const r = await post<{ token: string }>("/auth/2fa/entrar", { codigo });
        gravarToken(r.token);
      } else {
        const r = await post<{ token: string; precisa2fa?: boolean }>("/auth/login", { email, senha });
        if (r.precisa2fa) {
          setToken2fa(r.token);
          setCarregando(false);
          return;
        }
        gravarToken(r.token);
      }
      gravarLoja(null);
      location.href = voltar && voltar.startsWith("/") && !voltar.startsWith("/login") ? voltar : "/painel";
    } catch (e2) {
      if (token2fa) gravarToken(null);
      setErro(e2 instanceof Error ? e2.message : "Não foi possível entrar");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <TelaEntrada
      titulo={token2fa ? "Código de segurança" : "Entrar"}
      subtitulo={token2fa ? "Abra o app autenticador e digite o código de 6 números." : "Bem-vindo de volta! Entre com seu e-mail e senha."}
    >
      <form onSubmit={entrar} className="flex flex-col gap-4">
        {!token2fa ? (
          <>
            <Campo rotulo="E-mail">
              <Entrada type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
            </Campo>
            <Campo rotulo="Senha">
              <Entrada type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" />
            </Campo>
            <Link to="/esqueci" className="-mt-2 self-end text-[12.5px] font-semibold text-petroleo hover:underline">Esqueci minha senha</Link>
          </>
        ) : (
          <Campo rotulo="Código do autenticador">
            <Entrada inputMode="numeric" autoFocus maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              placeholder="123456" className="text-center text-2xl tracking-[0.4em]" />
          </Campo>
        )}
        {erro && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-vermelho">{erro}</div>}
        <Botao type="submit" carregando={carregando} className="!py-3" icone={token2fa ? <KeyRound className="size-4" /> : <LogIn className="size-4" />}>
          {token2fa ? "Confirmar" : "Entrar"}
        </Botao>
        {!token2fa && (
          <p className="text-center text-sm text-suave">
            Ainda não tem conta?{" "}
            <Link to="/cadastro" className="font-semibold text-laranja hover:underline">
              Criar conta grátis
            </Link>
          </p>
        )}
      </form>
    </TelaEntrada>
  );
}
