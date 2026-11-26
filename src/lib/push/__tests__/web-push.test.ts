import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch } from "@/test/http";

const fb = vi.hoisted(() => ({
  token: "tok-1",
  getToken: vi.fn(),
  deleteToken: vi.fn(async () => true),
  onMessage: vi.fn(() => () => {}),
}));

vi.mock("@/config/env", () => ({
  env: {
    apiBaseUrl: "",
    refreshTokenStorage: "local",
    requestTimeoutMs: 30_000,
    firebase: { enabled: true, vapidKey: "vapid-public", config: { apiKey: "k", authDomain: "d", projectId: "p", messagingSenderId: "1", appId: "a" } },
  },
}));
vi.mock("firebase/app", () => ({ getApps: () => [], initializeApp: () => ({}) }));
vi.mock("firebase/messaging", () => ({
  isSupported: async () => true,
  getMessaging: () => ({}),
  getToken: fb.getToken,
  deleteToken: fb.deleteToken,
  onMessage: fb.onMessage,
}));

import { disablePush, enablePush, getInstallationId, isPushRegisteredFor, pushAvailability, revokePushBeforeSignOut, syncPush } from "../web-push";

const ok = (data: unknown) => ({ body: { success: true, data } });

function stubBrowser(permission: NotificationPermission, requestResult: NotificationPermission = "granted") {
  const Notification: { permission: NotificationPermission; requestPermission: () => Promise<NotificationPermission> } = Object.assign(function Notification() {}, {
    permission,
    // Like a browser: the answer becomes the current permission.
    requestPermission: vi.fn(async () => (Notification.permission = requestResult)),
  });
  vi.stubGlobal("Notification", Notification);
  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register: vi.fn(async () => ({ active: {} })), ready: Promise.resolve({}), addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  return Notification;
}

function routes() {
  return mockFetch([
    { method: "POST", path: "/api/v1/notifications/devices", respond: () => ok({ deviceId: "d-1" }) },
    { method: "DELETE", path: /\/api\/v1\/notifications\/devices\/installations\/.+/, respond: () => ok({ revokedCount: 1 }) },
  ]);
}

beforeEach(() => {
  fb.token = "tok-1";
  fb.getToken.mockImplementation(async () => fb.token);
  fb.deleteToken.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("web push", () => {
  it("never prompts on its own and reports a blocked permission", async () => {
    const N = stubBrowser("denied");
    const { calls } = routes();
    expect(pushAvailability()).toBe("denied");
    expect(await enablePush("u-1")).toBe("denied");
    expect(await syncPush("u-1")).toBe(false);
    expect(N.requestPermission).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("opts in on click: asks permission, registers the token with a stable installation id", async () => {
    const N = stubBrowser("default");
    const { calls } = routes();
    expect(await enablePush("u-1")).toBe("granted");
    expect(N.requestPermission).toHaveBeenCalledOnce();
    const reg = calls.find((c) => c.method === "POST");
    expect(reg?.body).toEqual({ platform: "WEB", installationId: getInstallationId(), fcmToken: "tok-1" });
    expect(getInstallationId()).toMatch(/^web-[0-9a-f-]{36}$/);
    expect(isPushRegisteredFor("u-1")).toBe(true);
    expect(isPushRegisteredFor("u-2")).toBe(false);
  });

  it("re-registers only when the token rotates, and only for the user who opted in", async () => {
    stubBrowser("default");
    const { calls } = routes();
    await enablePush("u-1");
    stubBrowser("granted");
    expect(await syncPush("u-1")).toBe(true);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1); // unchanged token: no call
    fb.token = "tok-2";
    expect(await syncPush("u-1")).toBe(true);
    expect(calls.filter((c) => c.method === "POST").at(-1)?.body).toMatchObject({ fcmToken: "tok-2" });
    // Another user on this browser who never opted in: the old token is dropped, nothing is registered.
    expect(await syncPush("u-2")).toBe(false);
    expect(fb.deleteToken).toHaveBeenCalled();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
  });

  it("revokes the installation server-side before sign-out, then deletes the token; opt-in survives", async () => {
    stubBrowser("default");
    const { calls } = routes();
    await enablePush("u-1");
    await revokePushBeforeSignOut();
    const del = calls.find((c) => c.method === "DELETE");
    expect(del?.url.pathname).toBe(`/api/v1/notifications/devices/installations/${getInstallationId()}`);
    expect(fb.deleteToken).toHaveBeenCalledOnce();
    expect(isPushRegisteredFor("u-1")).toBe(false);
    // Signing back in restores push without a prompt.
    stubBrowser("granted");
    expect(await syncPush("u-1")).toBe(true);
  });

  it("turning off revokes and forgets the opt-in", async () => {
    stubBrowser("default");
    const { calls } = routes();
    await enablePush("u-1");
    await disablePush("u-1");
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
    stubBrowser("granted");
    expect(await syncPush("u-1")).toBe(false);
  });

  it("does nothing on sign-out when push was never used", async () => {
    stubBrowser("default");
    const { calls } = routes();
    await revokePushBeforeSignOut();
    expect(calls).toHaveLength(0);
  });
});
