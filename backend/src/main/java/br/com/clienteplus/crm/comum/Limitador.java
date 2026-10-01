package br.com.clienteplus.crm.comum;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;

/** Limite simples de tentativas por chave (ex.: login por e-mail/IP) numa janela de tempo. */
@ApplicationScoped
public class Limitador {

  private final ConcurrentHashMap<String, Deque<Long>> mapa = new ConcurrentHashMap<>();

  /** Registra uma tentativa; lança 429 se passou de {@code max} na janela. */
  public void conferir(String chave, int max, long janelaSegundos) {
    long agora = System.currentTimeMillis();
    long corte = agora - janelaSegundos * 1000;
    Deque<Long> fila = mapa.computeIfAbsent(chave, k -> new ArrayDeque<>());
    synchronized (fila) {
      while (!fila.isEmpty() && fila.peekFirst() < corte) fila.pollFirst();
      if (fila.size() >= max) throw Erro.limite("Muitas tentativas. Espere alguns minutos e tente de novo.");
      fila.addLast(agora);
    }
    if (mapa.size() > 50_000) mapa.clear();
  }

  public void limpar(String chave) {
    mapa.remove(chave);
  }
}
