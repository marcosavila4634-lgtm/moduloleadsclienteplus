import { useCallback, useEffect, useRef, useState } from "react";
import { get } from "./api";

/**
 * Carrega dados da API e recarrega quando o caminho muda.
 * recarregar() busca de novo sem piscar a tela (mantém os dados antigos).
 */
export function useDados<T>(caminho: string | null) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const atual = useRef(caminho);
  atual.current = caminho;

  const buscar = useCallback(async () => {
    if (!caminho) return;
    try {
      const d = await get<T>(caminho);
      if (atual.current === caminho) {
        setDados(d);
        setErro(null);
      }
    } catch (e) {
      if (atual.current === caminho) setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      if (atual.current === caminho) setCarregando(false);
    }
  }, [caminho]);

  useEffect(() => {
    setCarregando(true);
    buscar();
  }, [buscar]);

  return { dados, erro, carregando, recarregar: buscar, setDados };
}

/** Espera o usuário parar de digitar. */
export function useAtraso<T>(valor: T, ms = 350): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}
