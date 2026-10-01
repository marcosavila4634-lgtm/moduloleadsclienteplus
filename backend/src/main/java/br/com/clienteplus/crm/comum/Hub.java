package br.com.clienteplus.crm.comum;

import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.operators.multi.processors.BroadcastProcessor;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * Avisos em tempo real para o painel (nova mensagem, conversa mudou, negócio
 * mudou de etapa...). Cada evento leva o store_id e só vai para quem está
 * conectado naquela loja.
 */
@ApplicationScoped
public class Hub {

  public record Evento(UUID storeId, String tipo, Object dados) {}

  private final BroadcastProcessor<Evento> canal = BroadcastProcessor.create();

  public void emitir(UUID storeId, String tipo, Object dados) {
    canal.onNext(new Evento(storeId, tipo, dados));
  }

  public Multi<Map<String, Object>> assinar(UUID storeId) {
    Multi<Map<String, Object>> eventos = canal
        .filter(e -> storeId.equals(e.storeId()))
        .map(e -> Map.of("tipo", e.tipo(), "dados", e.dados() == null ? Map.of() : e.dados()));
    // "ping" a cada 25 s mantém a conexão viva atrás de proxies
    Multi<Map<String, Object>> ping = Multi.createFrom().ticks().every(Duration.ofSeconds(25)).map(t -> Map.of("tipo", "ping", "dados", Map.of()));
    return Multi.createBy().merging().streams(eventos, ping);
  }
}
