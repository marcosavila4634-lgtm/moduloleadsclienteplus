import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ErroApi, get, gravarLoja, gravarToken, lerLoja, ouvirEventos } from "./api";

// Quem está logado, em qual empresa, e o "rádio" de eventos em tempo real.

export type Empresa = { id: string; nome: string; slug: string; papel: string };
export type Me = {
  usuario: { id: string; nome: string; email: string; fotoUrl?: string | null; totpAtivo: boolean; integrado: boolean };
  empresas: Empresa[];
  loja: { id: string; nome: string; slug: string; fuso: string; horarioComercial: Record<string, string[][]>; config: any } | null;
  papel: "dono" | "admin" | "supervisor" | "atendente" | null;
  setorId?: string | null;
};

type Ctx = {
  me: Me;
  admin: boolean;
  recarregar: () => Promise<void>;
  trocarLoja: (id: string) => void;
  sair: () => void;
  pode: (minimo: "atendente" | "supervisor" | "admin" | "dono") => boolean;
  ouvir: (tipo: string, fn: (dados: any) => void) => () => void;
};

const Contexto = createContext<Ctx | null>(null);
const NIVEIS = ["atendente", "supervisor", "admin", "dono"];

export function ProvedorSessao({ inicial, admin, children }: { inicial: Me; admin: boolean; children: ReactNode }) {
  const [me, setMe] = useState(inicial);
  const ouvintes = useRef(new Map<string, Set<(d: any) => void>>());

  const recarregar = useCallback(async () => {
    setMe(await get<Me>("/auth/me"));
  }, []);

  useEffect(() => {
    if (!me.loja) return;
    return ouvirEventos((tipo, dados) => {
      ouvintes.current.get(tipo)?.forEach((f) => f(dados));
      ouvintes.current.get("*")?.forEach((f) => f({ tipo, dados }));
    });
  }, [me.loja?.id]);

  const ouvir = useCallback((tipo: string, fn: (d: any) => void) => {
    let s = ouvintes.current.get(tipo);
    if (!s) ouvintes.current.set(tipo, (s = new Set()));
    s.add(fn);
    return () => {
      s!.delete(fn);
    };
  }, []);

  const valor: Ctx = {
    me,
    admin,
    recarregar,
    trocarLoja: (id) => {
      gravarLoja(id);
      location.href = "/painel";
    },
    sair: () => {
      gravarToken(null);
      gravarLoja(null);
      location.href = "/login";
    },
    pode: (m) => me.papel != null && NIVEIS.indexOf(me.papel) >= NIVEIS.indexOf(m),
    ouvir,
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao() {
  const c = useContext(Contexto);
  if (!c) throw new Error("fora da sessão");
  return c;
}

/** Escuta um tipo de evento em tempo real enquanto o componente estiver na tela. */
export function useEvento(tipo: string, fn: (dados: any) => void) {
  const { ouvir } = useSessao();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => ouvir(tipo, (d) => ref.current(d)), [tipo, ouvir]);
}

export async function carregarSessao(): Promise<{ me: Me; admin: boolean }> {
  // aviso tocado com o app fechado abre já na empresa certa (?loja=...)
  const daUrl = new URLSearchParams(location.search).get("loja");
  if (daUrl && /^[0-9a-f-]{36}$/.test(daUrl)) gravarLoja(daUrl);
  let me: Me;
  try {
    me = await get<Me>("/auth/me");
  } catch (e) {
    // a empresa guardada no navegador não é mais desta pessoa (ex.: saiu da equipe): esquece e tenta de novo
    if (!(e instanceof ErroApi) || e.status !== 403 || !lerLoja()) throw e;
    gravarLoja(null);
    me = await get<Me>("/auth/me");
  }
  // se a empresa guardada não é mais acessível, usa a primeira
  const guardada = lerLoja();
  if (guardada && !me.empresas.some((e) => e.id === guardada)) {
    gravarLoja(null);
    me = await get<Me>("/auth/me");
  }
  if (!guardada && me.loja) gravarLoja(me.loja.id);
  const a = await get<{ admin: boolean }>("/plataforma/eu").catch(() => ({ admin: false }));
  return { me, admin: a.admin };
}
