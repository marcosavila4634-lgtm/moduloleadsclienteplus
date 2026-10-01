package br.com.clienteplus.crm.auth;

import br.com.clienteplus.crm.comum.Erro;
import jakarta.enterprise.context.RequestScoped;
import java.util.List;
import java.util.UUID;

/** Quem está chamando a API e em qual loja (preenchido pelo {@link AuthFiltro}). */
@RequestScoped
public class Sessao {

  private static final List<String> NIVEIS = List.of("atendente", "supervisor", "admin", "dono");

  UUID usuarioId;
  String nome;
  String email;
  UUID storeId;
  String papel;
  UUID setorId;

  /** Preenchido pelo AuthFiltro (métodos, pois o bean é acessado por proxy). */
  public void definirUsuario(UUID id, String nome, String email) {
    this.usuarioId = id;
    this.nome = nome;
    this.email = email;
  }

  public void definirLoja(UUID storeId, String papel, UUID setorId) {
    this.storeId = storeId;
    this.papel = papel;
    this.setorId = setorId;
  }

  public UUID lojaOuNula() {
    return storeId;
  }

  public UUID usuario() {
    if (usuarioId == null) throw Erro.naoAutenticado("Faça login para continuar");
    return usuarioId;
  }

  public UUID loja() {
    if (storeId == null) throw Erro.proibido("Nenhuma empresa selecionada");
    return storeId;
  }

  public String papel() {
    return papel;
  }

  public String nome() {
    return nome;
  }

  public String email() {
    return email;
  }

  public UUID setor() {
    return setorId;
  }

  public boolean logado() {
    return usuarioId != null;
  }

  /** O papel atual é pelo menos o pedido (atendente < supervisor < admin < dono). */
  public boolean peloMenos(String minimo) {
    return papel != null && NIVEIS.indexOf(papel) >= NIVEIS.indexOf(minimo);
  }

  public void exigir(String minimo) {
    if (!peloMenos(minimo)) throw Erro.proibido("Você não tem permissão para esta ação");
  }
}
