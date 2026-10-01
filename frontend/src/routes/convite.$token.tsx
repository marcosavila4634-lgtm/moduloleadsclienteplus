import { createFileRoute } from "@tanstack/react-router";
import { UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Botao, Campo, Entrada } from "../components/form";
import { TelaEntrada } from "../components/layout/TelaEntrada";
import { Carregando } from "../components/ui";
import { get, gravarLoja, gravarToken, post } from "../lib/api";

export const Route = createFileRoute("/convite/$token")({ component: Convite });

type Info = { email: string; nome?: string; papel: string; empresa: string; temConta: boolean };

function Convite() {
  const { token } = Route.useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    get<Info>(`/auth/convite/${token}`)
      .then((i) => {
        setInfo(i);
        setNome(i.nome ?? "");
      })
      .catch((e) => setErro(e.message));
  }, [token]);

  const aceitar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    try {
      const r = await post<{ token: string; loja: string }>(`/auth/convite/${token}`, { nome, senha });
      gravarToken(r.token);
      gravarLoja(r.loja);
      location.href = "/painel";
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível aceitar");
    } finally {
      setCarregando(false);
    }
  };

  if (!info && !erro) return <Carregando />;
  return (
    <TelaEntrada titulo="Você foi convidado(a)!" subtitulo={info ? <>Para entrar na equipe <b>{info.empresa}</b> como <b>{info.papel}</b>.</> : undefined}>
      {!info ? (
        <div className="rounded-xl bg-red-50 px-3 py-3 text-sm font-medium text-vermelho">{erro}</div>
      ) : (
        <form onSubmit={aceitar} className="flex flex-col gap-4">
          <Campo rotulo="E-mail"><Entrada value={info.email} disabled /></Campo>
          {!info.temConta && <Campo rotulo="Seu nome"><Entrada required value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>}
          <Campo rotulo={info.temConta ? "Sua senha" : "Crie uma senha"} dica={info.temConta ? "Você já tem conta: use a sua senha." : "Pelo menos 8 caracteres, com letras e números."}>
            <Entrada type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Campo>
          {erro && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-vermelho">{erro}</div>}
          <Botao type="submit" carregando={carregando} className="!py-3" icone={<UserCheck className="size-4" />}>Aceitar convite e entrar</Botao>
        </form>
      )}
    </TelaEntrada>
  );
}
