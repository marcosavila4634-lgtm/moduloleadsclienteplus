import { useCallback, useEffect, useState } from "react";
import { get, post } from "./api";

// Liga/desliga os avisos (Web Push) neste aparelho.

const suportado = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;

function chaveBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const bruto = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const saida = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) saida[i] = bruto.charCodeAt(i);
  return saida;
}

export function usePush() {
  const [ativo, setAtivo] = useState(false);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!suportado()) return;
    navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription()).then((s) => setAtivo(!!s && Notification.permission === "granted"));
  }, []);

  const ligar = useCallback(async () => {
    setCarregando(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") throw new Error("Você bloqueou os avisos. Libere nas configurações do navegador.");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const { chave } = await get<{ chave: string }>("/push/chave");
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(chave) }));
      await post("/push/inscrever", { ...sub.toJSON(), aparelho: navigator.userAgent });
      setAtivo(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Não foi possível ligar os avisos");
    } finally {
      setCarregando(false);
    }
  }, []);

  const desligar = useCallback(async () => {
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (sub) {
      await post("/push/cancelar", { endpoint: sub.endpoint }).catch(() => undefined);
      await sub.unsubscribe();
    }
    setAtivo(false);
  }, []);

  const testar = useCallback(() => { post("/push/testar").catch(() => undefined); }, []);

  return { suportado: suportado(), ativo, carregando, ligar, desligar, testar };
}
