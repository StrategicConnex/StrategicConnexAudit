import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("portal-tokens — links firmados (B-4)", () => {
  const OLD_PORTAL = process.env.PORTAL_LINK_SECRET;
  const OLD_DATA = process.env.DATA_ENCRYPTION_KEY;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.PORTAL_LINK_SECRET;
    process.env.DATA_ENCRYPTION_KEY = "ab".repeat(32);
  });

  afterEach(() => {
    if (OLD_PORTAL === undefined) delete process.env.PORTAL_LINK_SECRET;
    else process.env.PORTAL_LINK_SECRET = OLD_PORTAL;
    if (OLD_DATA === undefined) delete process.env.DATA_ENCRYPTION_KEY;
    else process.env.DATA_ENCRYPTION_KEY = OLD_DATA;
  });

  it("firma y verifica (roundtrip)", async () => {
    const { signPortalToken, verifyPortalToken } = await import("./portal-tokens");
    const token = signPortalToken("p1", 3600);
    expect(verifyPortalToken(token)).toMatchObject({ projectId: "p1" });
  });

  it("rechaza token manipulado", async () => {
    const { signPortalToken, verifyPortalToken } = await import("./portal-tokens");
    const token = signPortalToken("p1", 3600);
    const evil = Buffer.from(JSON.stringify({ projectId: "p2", exp: 9999999999 })).toString("base64url");
    expect(verifyPortalToken(`${evil}.${token.split(".")[1]}`)).toBeNull();
  });

  it("rechaza expirados", async () => {
    const { signPortalToken, verifyPortalToken } = await import("./portal-tokens");
    const token = signPortalToken("p1", -10);
    expect(verifyPortalToken(token)).toBeNull();
  });

  it("rechaza formato inválido", async () => {
    const { verifyPortalToken } = await import("./portal-tokens");
    expect(verifyPortalToken("basura")).toBeNull();
    expect(verifyPortalToken("")).toBeNull();
  });
});
