import type { Messaging } from "firebase/messaging";
import { env } from "@/config/env";
import { newId } from "@/lib/utils/id";
import { pushDevicesService } from "@/services/push-devices.service";

/**
 * Browser push (Firebase Cloud Messaging) for the signed-in user.
 *
 * Lifecycle (STOCKOUT frontend handoff 26 Nov 2026 §6):
 *  - permission is only ever requested from an explicit click (enablePush), never on load;
 *  - the FCM token is registered with POST /notifications/devices with a stable per-browser installationId;
 *  - on every sign-in the token is re-checked and re-registered if it rotated (syncPush);
 *  - BEFORE sign-out the installation is revoked server-side, then the FCM token is deleted locally
 *    (revokePushBeforeSignOut), so a shared browser gets no pushes for the previous user;
 *  - if anything here fails the REST inbox keeps working: callers treat push as best effort.
 *
 * Firebase is loaded lazily, so anonymous visitors and users who never opt in don't download it.
 * Tokens are never logged.
 */

const INSTALLATION_KEY = "stockout.push.installation";
/** The token currently registered with the backend and the user it was registered for. */
const STATE_KEY = "stockout.push.state";
/** Users who switched push on in this browser (so it is restored after they sign in again). */
const OPT_IN_KEY = "stockout.push.optin";

export const PUSH_SW_FILE = "firebase-messaging-sw.js";

export type PushAvailability = "unconfigured" | "insecure" | "unsupported" | "denied" | "default" | "granted";

interface PushState {
  token: string;
  owner: string;
}

const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: push still works for this page view */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

function readState(): PushState | null {
  try {
    const v = JSON.parse(storage.get(STATE_KEY) ?? "null") as Partial<PushState> | null;
    return v && typeof v.token === "string" && typeof v.owner === "string" ? { token: v.token, owner: v.owner } : null;
  } catch {
    return null;
  }
}
const writeState = (s: PushState) => storage.set(STATE_KEY, JSON.stringify(s));
const clearState = () => storage.remove(STATE_KEY);

function readOptIns(): string[] {
  try {
    const v = JSON.parse(storage.get(OPT_IN_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function setOptIn(owner: string, on: boolean) {
  const rest = readOptIns().filter((x) => x !== owner);
  storage.set(OPT_IN_KEY, JSON.stringify(on ? [...rest, owner].slice(-10) : rest));
}

/** Stable per-browser id (8–100 chars) sent as installationId. Created on first use. */
export function getInstallationId(): string {
  const existing = storage.get(INSTALLATION_KEY);
  if (existing && /^[A-Za-z0-9_-]{8,100}$/.test(existing)) return existing;
  const id = `web-${newId()}`;
  storage.set(INSTALLATION_KEY, id);
  return id;
}

/** What the browser allows right now (sync; does not load Firebase). */
export function pushAvailability(): PushAvailability {
  if (!env.firebase.enabled) return "unconfigured";
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) return "insecure";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  return Notification.permission;
}

/** True when this browser currently holds a push registration for this user. */
export function isPushRegisteredFor(owner: string | null | undefined): boolean {
  const s = readState();
  return !!owner && !!s && s.owner === owner && pushAvailability() === "granted";
}

type FirebaseMessagingModule = typeof import("firebase/messaging");
let loaded: Promise<{ m: FirebaseMessagingModule; messaging: Messaging } | null> | null = null;

function loadMessaging() {
  loaded ??= (async () => {
    const [{ getApps, initializeApp }, m] = await Promise.all([import("firebase/app"), import("firebase/messaging")]);
    if (!(await m.isSupported())) return null;
    const app = getApps()[0] ?? initializeApp(env.firebase.config);
    return { m, messaging: m.getMessaging(app) };
  })().catch((e: unknown) => {
    loaded = null;
    throw e;
  });
  return loaded;
}

async function registerWorker(): Promise<ServiceWorkerRegistration> {
  const base = import.meta.env.BASE_URL || "/";
  const reg = await navigator.serviceWorker.register(`${base}${PUSH_SW_FILE}`, { scope: base });
  // getToken needs an active worker to subscribe with.
  if (!reg.active) await navigator.serviceWorker.ready;
  return reg;
}

async function currentToken(): Promise<string> {
  const fb = await loadMessaging();
  if (!fb) throw new PushUnsupportedError();
  const token = await fb.m.getToken(fb.messaging, { vapidKey: env.firebase.vapidKey, serviceWorkerRegistration: await registerWorker() });
  if (!token) throw new Error("The browser did not return a push token.");
  return token;
}

async function registerWithBackend(owner: string, token: string) {
  await pushDevicesService.register({ platform: "WEB", installationId: getInstallationId(), fcmToken: token });
  writeState({ token, owner });
}

/** Invalidates this browser's FCM token at Google, so nothing more is delivered to it whatever the server holds. */
async function dropLocalToken() {
  clearState();
  try {
    const fb = await loadMessaging();
    if (fb) await fb.m.deleteToken(fb.messaging);
  } catch {
    /* best effort */
  }
}

export class PushUnsupportedError extends Error {
  constructor() {
    super("This browser doesn't support push notifications.");
    this.name = "PushUnsupportedError";
  }
}

/**
 * Explicit opt-in. MUST be called from a user click (browsers only show the prompt for a user gesture).
 * Returns the resulting permission; throws if registration failed after permission was granted.
 */
export async function enablePush(owner: string): Promise<PushAvailability> {
  const availability = pushAvailability();
  if (availability !== "default" && availability !== "granted") return availability;
  const permission = availability === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return permission;
  await registerWithBackend(owner, await currentToken());
  setOptIn(owner, true);
  return "granted";
}

/** Switch push off for this browser: revoke server-side, then delete the FCM token. */
export async function disablePush(owner: string): Promise<void> {
  setOptIn(owner, false);
  try {
    await pushDevicesService.revokeInstallation(getInstallationId());
  } finally {
    await dropLocalToken();
  }
}

/**
 * After sign-in / app start: keep the registration current. Re-registers when the token rotated, when a different
 * user signed in on this browser (if that user opted in), or when permission was granted again. Returns true when
 * push is active for this user. Never prompts.
 */
export async function syncPush(owner: string): Promise<boolean> {
  const availability = pushAvailability();
  const state = readState();
  if (availability !== "granted") {
    // Permission withdrawn in browser settings: the old token is dead, forget it.
    if (state) await dropLocalToken();
    return false;
  }
  // A registration left by another user (session expired without a sign-out) must not carry over.
  if (state && state.owner !== owner) await dropLocalToken();
  if (!readOptIns().includes(owner)) return false;
  const token = await currentToken();
  const now = readState();
  if (!now || now.token !== token || now.owner !== owner) await registerWithBackend(owner, token);
  return true;
}

/**
 * Call BEFORE clearing the session on sign-out / account switch, while the access token is valid. Revokes this
 * browser installation server-side and deletes the FCM token. The user's opt-in is kept, so push resumes when they sign
 * in again. Never throws.
 */
export async function revokePushBeforeSignOut(): Promise<void> {
  const state = readState();
  const hasInstallation = !!storage.get(INSTALLATION_KEY);
  if (!state && !hasInstallation) return;
  try {
    await pushDevicesService.revokeInstallation(getInstallationId());
  } catch {
    /* the server may be unreachable; the token is still deleted below */
  }
  if (state) await dropLocalToken();
}

/** Session ended without a server call (expired / revoked elsewhere): stop delivery to this browser. Never throws. */
export async function dropPushOnSessionEnd(): Promise<void> {
  if (readState()) await dropLocalToken();
}

/** Foreground messages (the tab is visible: the browser shows no OS notification). Returns an unsubscribe function. */
export async function onForegroundPush(handler: () => void): Promise<() => void> {
  const fb = await loadMessaging();
  if (!fb) return () => {};
  // The payload is ignored on purpose: the inbox is refetched from the server instead.
  return fb.m.onMessage(fb.messaging, () => handler());
}

/** Clicks on a background notification arrive as a message from the service worker. */
export function onPushNotificationClick(handler: () => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => {};
  const listener = (e: MessageEvent) => {
    if ((e.data as { type?: unknown } | null)?.type === "STOCKOUT_OPEN_INBOX") handler();
  };
  navigator.serviceWorker.addEventListener("message", listener);
  return () => navigator.serviceWorker.removeEventListener("message", listener);
}
