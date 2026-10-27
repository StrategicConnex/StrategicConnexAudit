import { beforeEach, describe, expect, it } from "vitest";
import type { ChatSuggestion } from "@/shared/types/chat";
import {
  SUGGESTION_COOLDOWN_MS,
  dismissSuggestion,
  isSuggestionDismissed,
  markSuggestionShown,
  shouldShowSuggestion,
  suggestionDismissKey,
  suggestionShownKey,
  type StorageLike,
} from "./suggestion-state";

const FINGERPRINT_A = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const FINGERPRINT_B = "00112233445566778899aabbccddeeff";
const CONTEXT_ID = "inv-1";
const OTHER_CONTEXT_ID = "inv-2";
const NOW = Date.parse("2026-10-27T12:00:00Z");

function createStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function suggestion(fingerprint = FINGERPRINT_A): ChatSuggestion {
  return {
    fingerprint,
    findingIds: ["f-1"],
    investigationId: "inv-1",
    text: "Hay 1 hallazgo crítico reciente.",
    ctaLabel: "Ver plan de remediación",
  };
}

describe("suggestion-state", () => {
  let storage: ReturnType<typeof createStorage>;

  beforeEach(() => {
    storage = createStorage();
  });

  it("expone la primera sugerencia de un contexto", () => {
    expect(
      shouldShowSuggestion({ suggestion: suggestion(), contextId: CONTEXT_ID, storage, now: NOW }),
    ).toBe(true);
  });

  it("sin sugerencia no hay nada que exponer", () => {
    expect(
      shouldShowSuggestion({ suggestion: null, contextId: CONTEXT_ID, storage, now: NOW }),
    ).toBe(false);
  });

  it("respeta 24 h por contexto: dentro de la ventana no repite", () => {
    const s = suggestion();
    markSuggestionShown(s, CONTEXT_ID, storage, NOW);

    expect(
      shouldShowSuggestion({
        suggestion: s,
        contextId: CONTEXT_ID,
        storage,
        now: NOW + SUGGESTION_COOLDOWN_MS - 1,
      }),
    ).toBe(false);
  });

  it("vuelve a exponerse pasadas 24 h", () => {
    const s = suggestion();
    markSuggestionShown(s, CONTEXT_ID, storage, NOW);

    expect(
      shouldShowSuggestion({
        suggestion: s,
        contextId: CONTEXT_ID,
        storage,
        now: NOW + SUGGESTION_COOLDOWN_MS,
      }),
    ).toBe(true);
  });

  it("la frecuencia es independiente por contexto", () => {
    const s = suggestion();
    markSuggestionShown(s, CONTEXT_ID, storage, NOW);

    expect(
      shouldShowSuggestion({ suggestion: s, contextId: OTHER_CONTEXT_ID, storage, now: NOW }),
    ).toBe(true);
  });

  it("un fingerprint descartado no vuelve a mostrarse", () => {
    const s = suggestion();
    dismissSuggestion(s.fingerprint, storage);

    expect(isSuggestionDismissed(s.fingerprint, storage)).toBe(true);
    expect(
      shouldShowSuggestion({
        suggestion: s,
        contextId: CONTEXT_ID,
        storage,
        now: NOW + SUGGESTION_COOLDOWN_MS * 2,
      }),
    ).toBe(false);
  });

  it("un fingerprint nuevo puede mostrarse aunque el anterior se descartara", () => {
    markSuggestionShown(suggestion(FINGERPRINT_A), CONTEXT_ID, storage, NOW);
    dismissSuggestion(FINGERPRINT_A, storage);

    expect(
      shouldShowSuggestion({
        suggestion: suggestion(FINGERPRINT_B),
        contextId: CONTEXT_ID,
        storage,
        now: NOW,
      }),
    ).toBe(true);
    // El mismo conjunto descartado sigue silenciado dentro de la ventana.
    expect(
      shouldShowSuggestion({
        suggestion: suggestion(FINGERPRINT_A),
        contextId: CONTEXT_ID,
        storage,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("un fingerprint inválido nunca se expone y no se persiste al descartar", () => {
    const invalid = suggestion("<script>alert(1)</script>");

    expect(
      shouldShowSuggestion({ suggestion: invalid, contextId: CONTEXT_ID, storage, now: NOW }),
    ).toBe(false);

    dismissSuggestion(invalid.fingerprint, storage);
    markSuggestionShown(invalid, CONTEXT_ID, storage, NOW);

    expect(storage.data.size).toBe(0);
  });

  it("usa claves namespaced por fingerprint y contexto", () => {
    expect(suggestionDismissKey(FINGERPRINT_A)).toBe(
      `scaudit:chat:suggestion:dismissed:${FINGERPRINT_A}`,
    );
    expect(suggestionShownKey(CONTEXT_ID)).toBe(`scaudit:chat:suggestion:shown:${CONTEXT_ID}`);
  });

  it("marca la exposición con fingerprint y timestamp", () => {
    markSuggestionShown(suggestion(), CONTEXT_ID, storage, NOW);

    expect(JSON.parse(storage.getItem(suggestionShownKey(CONTEXT_ID)) ?? "null")).toEqual({
      fingerprint: FINGERPRINT_A,
      at: NOW,
    });
  });

  it("un registro corrupto no rompe la comprobación", () => {
    storage.setItem(suggestionShownKey(CONTEXT_ID), "{no-json");

    expect(
      shouldShowSuggestion({ suggestion: suggestion(), contextId: CONTEXT_ID, storage, now: NOW }),
    ).toBe(true);
  });
});
