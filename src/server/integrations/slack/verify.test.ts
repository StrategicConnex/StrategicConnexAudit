import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { SLACK_MAX_TIMESTAMP_SKEW_SECONDS, verifySlackRequest } from "./verify";

const SECRET = "slack-signing-secret";
const NOW = 1_700_000_000;

function sign(body: string, timestamp: number, secret = SECRET): string {
  return `v0=${crypto.createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
}

function base(body = "text=status+p1", timestamp = NOW) {
  return {
    body,
    timestamp: String(timestamp),
    signature: sign(body, timestamp),
    signingSecret: SECRET,
    now: NOW,
  };
}

describe("verifySlackRequest", () => {
  it("acepta una firma correcta", () => {
    expect(verifySlackRequest(base())).toEqual({ ok: true });
  });

  it("rechaza sin signing secret configurado", () => {
    expect(verifySlackRequest({ ...base(), signingSecret: "" })).toEqual({
      ok: false,
      reason: "missing_secret",
    });
  });

  it("rechaza si faltan las cabeceras", () => {
    expect(verifySlackRequest({ ...base(), signature: null })).toEqual({
      ok: false,
      reason: "missing_headers",
    });
    expect(verifySlackRequest({ ...base(), timestamp: null })).toEqual({
      ok: false,
      reason: "missing_headers",
    });
  });

  it("rechaza firma manipulada", () => {
    expect(verifySlackRequest({ ...base(), signature: sign("otro cuerpo", NOW) })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rechaza si el cuerpo se reserializa (firma sobre el cuerpo CRUDO)", () => {
    const result = verifySlackRequest({ ...base(), body: "text=status+p1&extra=1" });
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rechaza timestamp viejo (anti-replay)", () => {
    const oldTs = NOW - SLACK_MAX_TIMESTAMP_SKEW_SECONDS - 1;
    expect(verifySlackRequest(base("text=help", oldTs))).toEqual({
      ok: false,
      reason: "stale_timestamp",
    });
  });

  it("rechaza timestamp futuro más allá de la ventana", () => {
    const future = NOW + SLACK_MAX_TIMESTAMP_SKEW_SECONDS + 1;
    expect(verifySlackRequest(base("text=help", future))).toEqual({
      ok: false,
      reason: "stale_timestamp",
    });
  });

  it("acepta justo en el borde de la ventana", () => {
    const edge = NOW - SLACK_MAX_TIMESTAMP_SKEW_SECONDS;
    expect(verifySlackRequest(base("text=help", edge))).toEqual({ ok: true });
  });

  it("rechaza timestamp no numérico", () => {
    expect(verifySlackRequest({ ...base(), timestamp: "abc" })).toEqual({
      ok: false,
      reason: "stale_timestamp",
    });
  });
});
