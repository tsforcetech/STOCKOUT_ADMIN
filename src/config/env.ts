function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function firebaseWebPush() {
  const v = (x: string | undefined) => (x ?? "").trim();
  const config = {
    apiKey: v(import.meta.env.VITE_FIREBASE_API_KEY),
    authDomain: v(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: v(import.meta.env.VITE_FIREBASE_PROJECT_ID),
    messagingSenderId: v(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: v(import.meta.env.VITE_FIREBASE_APP_ID),
  };
  const vapidKey = v(import.meta.env.VITE_FIREBASE_VAPID_KEY);
  return { config, vapidKey, enabled: Object.values(config).every(Boolean) && !!vapidKey };
}

export const env = {
  /** Gateway origin. Empty string means same-origin `/api` (dev proxy or reverse proxy). */
  apiBaseUrl: trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? ""),
  refreshTokenStorage: (import.meta.env.VITE_REFRESH_TOKEN_STORAGE === "session" ? "session" : "local") as
    | "local"
    | "session",
  /** Public marketplace (buyer site), where people create a StockOut account before accepting an invitation. */
  marketplaceUrl: trimTrailingSlash(import.meta.env.VITE_MARKETPLACE_URL || "https://tsforcetech.github.io/STOCKOUT_BUYER"),
  requestTimeoutMs: 30_000,
  /** Browser push (FCM): public web config + public VAPID key only; offered only when all six are set. */
  firebase: firebaseWebPush(),
  isDev: import.meta.env.DEV,
} as const;
