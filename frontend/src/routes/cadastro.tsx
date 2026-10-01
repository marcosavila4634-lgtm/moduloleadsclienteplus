import { createFileRoute, Link } from "@tanstack/react-router";
import { Rocket } from "lucide-react";
import { useState } from "react";
import { Botao, Campo, Entrada } from "../components/form";
import { TelaEntrada } from "../components/layout/TelaEntrada";
import { gravarLoja, gravarToken, post } from "../lib/api";

export const Route = createFileRoute("/cadastro")({ component: Cadastro });

function Cadastro() {
  const [d, setD] = useState({ nome: "", email: "", senha: "", empresa: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const m = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const r = await post<{ token: string }>("/auth/cadastro", d);
      gravarToken(r.token);
      gravarLoja(null);
      location.href = "/painel";
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível criar a conta");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <TelaEntrada titulo="Criar sua conta" subtitulo="Em 1 minuto você já está atendendo pelo sistema.">
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Campo rotulo="Seu nome"><Entrada required value={d.nome} onChange={m("nome")} placeholder="Maria Silva" /></Campo>
        <Campo rotulo="Nome da empresa"><Entrada required value={d.empresa} onChange={m("empresa")} placeholder="Loja da Maria" /></Campo>
        <Campo rotulo="E-mail"><Entrada type="email" required value={d.email} onChange={m("email")} placeholder="voce@empresa.com" /></Campo>
        <Campo rotulo="Senha" dica="Pelo menos 8 caracteres, com letras e números.">
          <Entrada type="password" required value={d.senha} onChange={m("senha")} />
        </Campo>
        {erro && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-vermelho">{erro}</div>}
        <Botao type="submit" carregando={carregando} className="!py-3" icone={<Rocket className="size-4" />}>Criar conta</Botao>
        <p className="text-center text-sm text-suave">
          Já tem conta?{" "}
          <Link to="/login" className="font-semibold text-laranja hover:underline">Entrar</Link>
        </p>
      </form>
    </TelaEntrada>
  );
}
