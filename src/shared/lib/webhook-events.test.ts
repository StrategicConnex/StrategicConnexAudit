/* ═══════════════════════════════════════════════════════════════════════════
   Catálogo de eventos webhook (Tanda 4 / B7)

   El bug que origina este módulo: la UI ofrecía `audit.completed` y
   `alert.triggered`, que ningún productor emitía → webhooks muertos. Estos
   tests impiden que vuelva a pasar:

   1. Todo id del catálogo aparece en las FUENTES que declara como emisores.
   2. Todo id del catálogo tiene etiqueta y descripción en es Y en en.
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_IDS,
  WEBHOOK_TEST_EVENT,
  DEFAULT_WEBHOOK_EVENTS,
  getWebhookEvent,
  isWebhookEvent,
  listWebhookEventIds,
  webhookEventDescriptionKey,
  webhookEventLabelKey,
} from "./webhook-events";

const es = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages/es.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages/en.json"), "utf8"));

describe("webhook-events — catálogo", () => {
  it("no tiene ids duplicados y expone todos en listWebhookEventIds", () => {
    const ids = listWebhookEventIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...WEBHOOK_EVENT_IDS].sort());
  });

  it("isWebhookEvent acepta solo ids del catálogo", () => {
    for (const id of WEBHOOK_EVENT_IDS) expect(isWebhookEvent(id)).toBe(true);
    // Los eventos fantasma que sí ofrece el módulo eliminado deben ser falsos.
    expect(isWebhookEvent("audit.completed")).toBe(false);
    expect(isWebhookEvent("alert.triggered")).toBe(false);
    expect(isWebhookEvent("")).toBe(false);
    expect(isWebhookEvent(undefined)).toBe(false);
  });

  it("el evento de prueba NO es suscribible", () => {
    expect(isWebhookEvent(WEBHOOK_TEST_EVENT)).toBe(false);
    expect(getWebhookEvent(WEBHOOK_TEST_EVENT)).toBeNull();
  });

  it("la suscripción por defecto apunta a eventos del catálogo", () => {
    expect(DEFAULT_WEBHOOK_EVENTS.length).toBeGreaterThan(0);
    for (const id of DEFAULT_WEBHOOK_EVENTS) expect(isWebhookEvent(id)).toBe(true);
  });

  it("cada evento declara al menos un emisor y un sample", () => {
    for (const def of WEBHOOK_EVENTS) {
      expect(def.emitters.length).toBeGreaterThan(0);
      expect(Object.keys(def.sample).length).toBeGreaterThan(0);
    }
  });
});

describe("webhook-events — guard anti-evento-fantasma", () => {
  it("todo evento del catálogo se emite de verdad en las fuentes que declara", () => {
    for (const def of WEBHOOK_EVENTS) {
      const found = def.emitters.some((relPath) => {
        const abs = path.resolve(process.cwd(), relPath);
        expect(fs.existsSync(abs), `emisor declarado inexistente: ${relPath}`).toBe(true);
        return fs.readFileSync(abs, "utf8").includes(`"${def.id}"`);
      });
      expect(found, `ningún emisor declara realmente el evento ${def.id}`).toBe(true);
    }
  });

  it("ningún evento del catálogo sobrevive solo como texto en la UI (fantasma)", () => {
    // La UI de Settings debe construir los checkboxes desde el catálogo: si
    // alguien vuelve a escribir un id a mano, este test no lo detecta, pero sí
    // detecta ids que ya no existen en el catálogo y siguen en el hook/route.
    const settingsTab = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/dashboard/tabs/SettingsTab.tsx"),
      "utf8",
    );
    for (const ghost of ["audit.completed", "alert.triggered"]) {
      expect(settingsTab.includes(`"${ghost}"`) || settingsTab.includes(`'${ghost}'`)).toBe(false);
    }
  });
});

describe("webhook-events — claves i18n", () => {
  it("cada evento tiene etiqueta y descripción en es y en", () => {
    for (const def of WEBHOOK_EVENTS) {
      const label = webhookEventLabelKey(def.id);
      const desc = webhookEventDescriptionKey(def.id);
      for (const [locale, bundle] of [["es", es], ["en", en]] as const) {
        const settings = bundle.settings as Record<string, string>;
        expect(settings[label], `${locale}.settings.${label}`).toBeTruthy();
        expect(settings[desc], `${locale}.settings.${desc}`).toBeTruthy();
      }
    }
  });
});
