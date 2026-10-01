package br.com.clienteplus.crm.eventos;

import java.util.Map;
import java.util.UUID;

/**
 * Fatos do sistema que outras partes escutam (IA, automações, funil, tracking)
 * com CDI {@code @ObservesAsync}. Quem dispara não precisa conhecer quem escuta.
 */
public final class Eventos {

  private Eventos() {}

  /** Chegou mensagem do cliente. */
  public record MensagemRecebida(UUID storeId, UUID conversaId, UUID contatoId, UUID mensagemId, String texto, String tipo,
      boolean novaConversa, boolean novoContato, String botaoPayload) {}

  /** Mensagem enviada por nós (humano, IA, automação). */
  public record MensagemEnviada(UUID storeId, UUID conversaId, UUID contatoId, String remetente) {}

  public record TagAlterada(UUID storeId, UUID contatoId, UUID conversaId, String tag, boolean adicionada) {}

  public record StatusConversa(UUID storeId, UUID conversaId, UUID contatoId, String de, String para) {}

  public record NegocioEtapa(UUID storeId, UUID negocioId, UUID contatoId, UUID etapaDe, UUID etapaPara, String nomePara) {}

  public record ContatoCriado(UUID storeId, UUID contatoId, UUID conversaId) {}

  public record CompraRecebida(UUID storeId, UUID compraId, UUID contatoId, String status, double valor, String produto) {}

  public record EmailRecebido(UUID storeId, UUID conversaId, UUID contatoId, String assunto, String texto) {}

  /** Disparo manual/por API de uma automação para um contato. */
  public record ExecutarAutomacao(UUID storeId, UUID automacaoId, UUID contatoId, UUID conversaId, Map<String, Object> dados) {}
}
