import { describe, expect, it } from "vitest";
import { decodeJwtPayload, tokenStore } from "../token-store";

function jwt(payload: object): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "RS256" })}.${b64(payload)}.sig`;
}

describe("tokenStore", () => {
  it("keeps the access token in memory and persists only the refresh token", () => {
    tokenStore.set("access", "refresh", 900);
    expect(tokenStore.getAccessToken()).toBe("access");
    expect(sessionStorage.getItem("stockout.admin.rt")).toBe("refresh");
    expect(JSON.stringify(sessionStorage)).not.toContain("access");
    tokenStore.clear();
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(tokenStore.getPersistedRefreshToken()).toBeNull();
  });

  it("marks tokens expired ahead of the real expiry", () => {
    tokenStore.set("a", "r", 0);
    expect(tokenStore.isAccessTokenExpired()).toBe(true);
  });

  it("decodes JWT payloads (display only)", () => {
    expect(decodeJwtPayload(jwt({ sid: "abc", email: "a@b.c" }))).toMatchObject({ sid: "abc" });
    expect(decodeJwtPayload("garbage")).toBeNull();
  });
});
