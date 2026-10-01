package br.com.clienteplus.crm.canais;

import br.com.clienteplus.crm.comum.Json;
import br.com.clienteplus.crm.ia.Horarios;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Janela de horário das mensagens automáticas (config da loja "janela_envio"):
 *   {"modo":"livre"}                                           qualquer hora
 *   {"modo":"faixa","inicio":"09:00","fim":"20:00","dias":[...]}   dentro da faixa
 *   {"modo":"fixo","horarios":["15:00"],"dias":[...]}              só nesses horários
 * dias: "seg".."dom" (vazio = todos).
 */
public final class JanelaEnvio {

  private JanelaEnvio() {}

  /** O horário permitido mais próximo a partir de {@code desejado} (ele mesmo, se já pode). */
  public static ZonedDateTime proximo(Map<String, Object> janela, ZonedDateTime desejado) {
    String modo = Json.s(janela, "modo", "livre");
    if ("livre".equals(modo)) return desejado;
    List<String> dias = Json.ls(janela, "dias");
    if ("faixa".equals(modo)) {
      LocalTime ini = hora(Json.s(janela, "inicio", "09:00")), fim = hora(Json.s(janela, "fim", "20:00"));
      ZonedDateTime t = desejado;
      for (int i = 0; i < 15; i++) {
        boolean diaOk = dias.isEmpty() || dias.contains(Horarios.dia(t.getDayOfWeek()));
        LocalTime h = t.toLocalTime();
        if (diaOk && !h.isBefore(ini) && h.isBefore(fim)) return t;
        if (diaOk && h.isBefore(ini)) return t.with(ini).withSecond(0).withNano(0);
        t = t.plusDays(1).with(ini).withSecond(0).withNano(0);
        if (dias.isEmpty() || dias.contains(Horarios.dia(t.getDayOfWeek()))) return t;
      }
      return desejado;
    }
    // fixo
    List<LocalTime> hs = new ArrayList<>();
    for (String s : Json.ls(janela, "horarios")) hs.add(hora(s));
    if (hs.isEmpty()) hs.add(LocalTime.of(15, 0));
    hs.sort(null);
    for (int d = 0; d < 15; d++) {
      ZonedDateTime dia = desejado.plusDays(d);
      if (!dias.isEmpty() && !dias.contains(Horarios.dia(dia.getDayOfWeek()))) continue;
      for (LocalTime h : hs) {
        ZonedDateTime c = dia.with(h).withSecond(0).withNano(0);
        // tolerância de 1 min para quem já está no horário
        if (!c.isBefore(desejado.minusMinutes(1))) return c.isBefore(desejado) ? desejado : c;
      }
    }
    return desejado;
  }

  private static LocalTime hora(String s) {
    try {
      return LocalTime.parse(s.length() == 4 ? "0" + s : s);
    } catch (Exception e) {
      return LocalTime.of(9, 0);
    }
  }
}
