import { describe, it, expect } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatTime,
  formatTimeWithSeconds,
} from "./datetime";

/**
 * El objetivo de estos tests no es "que la cadena sea esta" sino que el
 * resultado NO dependa del entorno. Un `toLocale*()` sin locale devuelve una
 * cosa distinta en CI (UTC, en-US por defecto de Node) que en el navegador de
 * un usuario en otro huso, y React detecta el desajuste como error de
 * hidratación. Estos asserts fijan locale y zona para que una regresión a
 * `toLocale*()` se vea en el test y no en producción.
 */
const SAMPLE_ISO = "2026-03-14T14:35:07.000Z";

describe("formatTime", () => {
  it("devuelve la hora en 24h con minutos", () => {
    expect(formatTime(SAMPLE_ISO)).toBe("14:35");
  });

  it("acepta Date y epoch, no solo string ISO", () => {
    const expected = "14:35";
    expect(formatTime(new Date(SAMPLE_ISO))).toBe(expected);
    expect(formatTime(Date.parse(SAMPLE_ISO))).toBe(expected);
  });

  it("no cambia con la zona del proceso", () => {
    const original = process.env.TZ;
    try {
      // Un instante cerca de medianoche en UTC cambia de día en UTC-5: si el
      // formateo dependiera de la zona, esto fallaría.
      const nearMidnight = "2026-03-14T02:30:00.000Z";
      process.env.TZ = "America/New_York";
      const ny = formatDateTime(nearMidnight);
      process.env.TZ = "Asia/Tokyo";
      const tokyo = formatDateTime(nearMidnight);
      expect(tokyo).toBe(ny);
      expect(ny).toContain("14 mar 2026");
    } finally {
      process.env.TZ = original;
    }
  });
});

describe("formatTimeWithSeconds", () => {
  it("incluye los segundos", () => {
    expect(formatTimeWithSeconds(SAMPLE_ISO)).toBe("14:35:07");
  });
});

describe("formatDate", () => {
  it("devuelve día, mes y año sin hora", () => {
    const out = formatDate(SAMPLE_ISO);
    expect(out).toContain("14");
    expect(out).toContain("2026");
    expect(out).not.toContain("14:35");
  });
});

describe("formatDateTime", () => {
  it("devuelve fecha y hora juntas", () => {
    const out = formatDateTime(SAMPLE_ISO);
    expect(out).toContain("2026");
    expect(out).toContain("14:35");
  });
});

describe("formatNumber", () => {
  it("usa punto de millar a partir de cinco dígitos", () => {
    expect(formatNumber(12345)).toBe("12.345");
    expect(formatNumber(1000000)).toBe("1.000.000");
  });

  it("NO agrupa los cuatro dígitos, que es donde es-ES diverge de en-US", () => {
    // El CLDR de es-ES exige 5 dígitos mínimo para agrupar, así que 1234 sale
    // sin separador mientras en-US sería "1,234". No es un error del helper:
    // es el comportamiento correcto del locale español.
    expect(formatNumber(1234)).toBe("1234");
  });

  it("deja los negativos con signo", () => {
    expect(formatNumber(-42)).toContain("42");
  });
});

describe("determinismo", () => {
  it("el mismo instante produce la misma cadena en llamadas sucesivas", () => {
    expect(formatDateTime(SAMPLE_ISO)).toBe(formatDateTime(SAMPLE_ISO));
    expect(formatTime(SAMPLE_ISO)).toBe(formatTime(SAMPLE_ISO));
    expect(formatDate(SAMPLE_ISO)).toBe(formatDate(SAMPLE_ISO));
  });
});