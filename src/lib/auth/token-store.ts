import { env } from "@/config/env";

/**
 * Token storage.
 * The identity service returns tokens in the response body (no HttpOnly cookie is issued), so:
 *  - the access token lives in memory only (never persisted, never logged);
 *  - the refresh token is persisted in sessionStorage by default (tab-scoped, cleared when the tab
 *    closes) so a page reload can restore the session. VITE_REFRESH_TOKEN_STORAGE=local opts into
 *    localStorage for "remember me" behaviour.
 * If the backend later moves the refresh token to an HttpOnly cookie, only this file changes.
 */
const REFRESH_KEY = "stockout.admin.rt";

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms at which the access token expires. */
  expiresAt: number;
}

type Listener = (tokens: TokenSet | null) => void;

let current: TokenSet | null = null;
const listeners = new Set<Listener>();

function storage(): Storage | null {
  try {
    return env.refreshTokenStorage === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export const tokenStore = {
  get(): TokenSet | null {
    return current;
  },

  getAccessToken(): string | null {
    return current?.accessToken ?? null;
  },

  getPersistedRefreshToken(): string | null {
    try {
      return storage()?.getItem(REFRESH_KEY) ?? null;
    } catch {
      return null;
    }
  },

  set(accessToken: string, refreshToken: string, expiresInSeconds: number): void {
    // Refresh 30s early to avoid sending a token that expires in flight.
    const skewMs = Math.min(30_000, (expiresInSeconds * 1000) / 4);
    current = { accessToken, refreshToken, expiresAt: Date.now() + expiresInSeconds * 1000 - skewMs };
    try {
      storage()?.setItem(REFRESH_KEY, refreshToken);
    } catch {
      /* storage unavailable (private mode) — session simply won't survive reload */
    }
    listeners.forEach((l) => l(current));
  },

  clear(): void {
    current = null;
    try {
      storage()?.removeItem(REFRESH_KEY);
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l(null));
  },

  isAccessTokenExpired(): boolean {
    return !current || Date.now() >= current.expiresAt;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Decodes the JWT payload for display/claims only. Never used to make security decisions. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
