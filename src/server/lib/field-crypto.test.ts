import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("field-crypto — cifrado en reposo (P1-5)", () => {
  const OLD_ENV = process.env.DATA_ENCRYPTION_KEY;

  beforeEach(() => {
    vi.resetModules();
    process.env.DATA_ENCRYPTION_KEY = KEY;
  });

  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.DATA_ENCRYPTION_KEY;
    else process.env.DATA_ENCRYPTION_KEY = OLD_ENV;
  });

  it("roundtrip: decrypt(encrypt(x)) === x, formato v1:", async () => {
    const { encryptField, decryptField } = await import("./field-crypto");
    const enc = encryptField("whsec_secreto");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("whsec_secreto");
    expect(decryptField(enc)).toBe("whsec_secreto");
  });

  it("cifrados del mismo texto difieren (IV aleatorio)", async () => {
    const { encryptField } = await import("./field-crypto");
    expect(encryptField("a")).not.toBe(encryptField("a"));
  });

  it("legacy en claro pasa intacto (migración)", async () => {
    const { decryptField } = await import("./field-crypto");
    expect(decryptField("whsec_legacy")).toBe("whsec_legacy");
  });

  it("fieldEquals compara en tiempo constante y acepta legacy", async () => {
    const { encryptField, fieldEquals } = await import("./field-crypto");
    const enc = encryptField("abc");
    expect(fieldEquals(enc, "abc")).toBe(true);
    expect(fieldEquals(enc, "abd")).toBe(false);
    expect(fieldEquals("abc", "abc")).toBe(true);
  });

  it("ciphertext manipulado no descifra", async () => {
    const { encryptField, decryptField } = await import("./field-crypto");
    const enc = encryptField("abc").slice(0, -2) + "ff";
    expect(() => decryptField(enc)).toThrow();
  });

  it("sin clave: encrypt falla cerrado", async () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    const { encryptField } = await import("./field-crypto");
    expect(() => encryptField("abc")).toThrow(/DATA_ENCRYPTION_KEY/);
  });

  it("maskSecret enmascara sin exponer", async () => {
    const { encryptField, maskSecret } = await import("./field-crypto");
    expect(maskSecret(encryptField("whsec_largo_secreto"))).toBe("••••••••…");
    expect(maskSecret(null)).toBeNull();
  });
});
