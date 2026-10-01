package br.com.clienteplus.crm.canais;

import br.com.clienteplus.crm.comum.Db;
import br.com.clienteplus.crm.comum.Erro;
import br.com.clienteplus.crm.comum.Json;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.UnaryOperator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Monta o envio de um template aprovado (HSM) com as variáveis preenchidas. */
@ApplicationScoped
public class Templates {

  private static final Pattern VAR = Pattern.compile("\\{\\{(\\d+)}}");

  @Inject Db db;

  /**
   * variaveis: {"1": "{nome}", "2": "texto"} — os valores passam por {@code preencher}
   * (troca {nome}, {telefone}...). Devolve o objeto "template" da Cloud API
   * com "_texto" (prévia legível para gravar na conversa).
   */
  public Map<String, Object> montar(UUID storeId, UUID templateId, Map<String, Object> variaveis, UnaryOperator<String> preencher) {
    Map<String, Object> t = db.obrigatorio("Template", "select * from crm_templates_whatsapp where id = ? and store_id = ?", templateId, storeId);
    if (!"APPROVED".equals(t.get("status"))) throw Erro.requisicao("O template " + t.get("nome") + " ainda não foi aprovado pela Meta");
    List<Object> componentes = new ArrayList<>();
    String previa = "";
    for (Object co : Json.l(t.get("componentes"))) {
      Map<String, Object> c = Json.m(co);
      String tipo = Json.s(c, "type", "").toUpperCase();
      String texto = Json.s(c, "text");
      if (("BODY".equals(tipo) || "HEADER".equals(tipo) && "TEXT".equalsIgnoreCase(Json.s(c, "format", ""))) && texto != null) {
        List<Object> params = new ArrayList<>();
        Matcher m = VAR.matcher(texto);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
          String chave = m.group(1);
          String valor = preencher.apply(Json.s(variaveis, ("HEADER".equals(tipo) ? "h" : "") + chave, Json.s(variaveis, chave, "")));
          if (valor == null || valor.isBlank()) valor = "-";
          params.add(Json.de("type", "text", "text", valor));
          m.appendReplacement(sb, Matcher.quoteReplacement(valor));
        }
        m.appendTail(sb);
        if (!params.isEmpty()) componentes.add(Json.de("type", tipo.toLowerCase(), "parameters", params));
        if ("BODY".equals(tipo)) previa = sb.toString();
      } else if ("HEADER".equals(tipo) && List.of("IMAGE", "VIDEO", "DOCUMENT").contains(Json.s(c, "format", "").toUpperCase())) {
        String link = preencher.apply(Json.s(variaveis, "midia", ""));
        if (link != null && !link.isBlank()) {
          String f = Json.s(c, "format").toLowerCase();
          componentes.add(Json.de("type", "header", "parameters", List.of(Json.de("type", f, f, Json.de("link", link)))));
        }
      }
    }
    Map<String, Object> out = Json.de("name", t.get("nome"), "language", Json.de("code", t.get("idioma")));
    if (!componentes.isEmpty()) out.put("components", componentes);
    out.put("_texto", previa.isBlank() ? "Template: " + t.get("nome") : previa);
    out.put("_template_id", templateId.toString());
    db.executa("update crm_templates_whatsapp set enviados = enviados + 1 where id = ?", templateId);
    return out;
  }
}
