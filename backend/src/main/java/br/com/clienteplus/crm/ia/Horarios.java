package br.com.clienteplus.crm.ia;

import br.com.clienteplus.crm.comum.Json;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.Map;

/** Horário comercial no formato {"seg":[["09:00","18:00"]], ..., "dom":[]}. */
public final class Horarios {

  private Horarios() {}

  public static String dia(DayOfWeek d) {
    return switch (d) {
      case MONDAY -> "seg";
      case TUESDAY -> "ter";
      case WEDNESDAY -> "qua";
      case THURSDAY -> "qui";
      case FRIDAY -> "sex";
      case SATURDAY -> "sab";
      case SUNDAY -> "dom";
    };
  }

  public static boolean aberto(Map<String, Object> horario, ZonedDateTime quando) {
    if (horario == null || horario.isEmpty()) return true;
    LocalTime t = quando.toLocalTime();
    for (Object faixa : Json.l(horario.get(dia(quando.getDayOfWeek())))) {
      var f = Json.l(faixa);
      if (f.size() < 2) continue;
      try {
        LocalTime ini = LocalTime.parse(String.valueOf(f.get(0)));
        LocalTime fim = LocalTime.parse(String.valueOf(f.get(1)));
        if (!t.isBefore(ini) && t.isBefore(fim)) return true;
      } catch (Exception ignorado) {
        // faixa mal preenchida: ignora
      }
    }
    return false;
  }
}
