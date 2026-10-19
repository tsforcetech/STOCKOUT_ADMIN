import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { configureAuthHandlers, refreshSession } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { authService } from "@/services/auth.service";
import { platformService } from "@/services/platform.service";
import type {
  CurrentIdentityResponse,
  LoginResponse,
} from "@/api/types/identity";
import {
  buildAccessContext,
  type AccessContext,
} from "@/lib/permissions/permissions";
import { decodeJwtPayload, tokenStore } from "./token-store";

export type AuthStatus = "initializing" | "authenticated" | "anonymous";

export interface MfaChallenge {
  userId: string;
  challengeToken: string;
  emailOrMobile: string;
}

export type SignInResult =
  | { kind: "signed-in" }
  | { kind: "mfa-required"; challenge: MfaChallenge };

interface AuthContextValue {
  status: AuthStatus;
  user: CurrentIdentityResponse | null;
  access: AccessContext;
  /** Why the last session ended, shown on the login screen. */
  endReason: "expired" | "signed-out" | null;
  /** Permission/role load failure (user is signed in but access could not be resolved). */
  accessError: unknown;
  signIn: (emailOrMobile: string, password: string) => Promise<SignInResult>;
  verifyMfa: (challenge: MfaChallenge, code: string) => Promise<void>;
  resendMfa: (challenge: MfaChallenge) => Promise<MfaChallenge>;
  signOut: () => Promise<void>;
  /** Clears local session state without calling the API (e.g. after password change). */
  endSessionLocally: (reason: "expired" | "signed-out") => void;
  reloadAccess: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

const EMPTY_ACCESS = buildAccessContext([], []);

async function exchangeRefreshToken(): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    const refreshToken = tokenStore.getPersistedRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await authService.refresh(refreshToken);
      tokenStore.set(res.accessToken, res.refreshToken, res.expiresIn);
      return true;
    } catch (error) {
      // Gateway limits token refresh to 10/min per IP (shared by everyone behind one office IP). A 429 is
      // temporary: wait as told and retry instead of treating the user as signed out.
      if (isApiError(error) && error.status === 429 && attempt < 2) {
        await new Promise((r) =>
          setTimeout(r, Math.min(30, error.retryAfterSeconds ?? 10) * 1000),
        );
        continue;
      }
      // 401 = invalid/expired/reused refresh token. Network errors keep the token for a later retry.
      if (isApiError(error) && (error.status === 401 || error.status === 400))
        tokenStore.clear();
      return false;
    }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<AuthStatus>("initializing");
  const [user, setUser] = React.useState<CurrentIdentityResponse | null>(null);
  const [access, setAccess] = React.useState<AccessContext>(EMPTY_ACCESS);
  const [accessError, setAccessError] = React.useState<unknown>(null);
  const [endReason, setEndReason] = React.useState<
    "expired" | "signed-out" | null
  >(null);

  const endSessionLocally = React.useCallback(
    (reason: "expired" | "signed-out") => {
      tokenStore.clear();
      queryClient.clear();
      setUser(null);
      setAccess(EMPTY_ACCESS);
      setAccessError(null);
      setEndReason(reason);
      setStatus("anonymous");
    },
    [queryClient],
  );

  const loadAccess = React.useCallback(async () => {
    // Identity profile and platform permissions come from different services; load in parallel.
    const [me, perms, roles] = await Promise.allSettled([
      authService.me(),
      platformService.myPermissions(),
      platformService.myRoles(),
    ]);
    if (me.status === "rejected") throw me.reason;
    setUser(me.value);
    if (perms.status === "fulfilled") {
      setAccess(
        buildAccessContext(
          perms.value.permissions,
          roles.status === "fulfilled"
            ? roles.value.roles.map((r) => r.code)
            : [],
        ),
      );
      setAccessError(null);
    } else {
      setAccess(EMPTY_ACCESS);
      setAccessError(perms.reason);
    }
  }, []);

  const completeSignIn = React.useCallback(
    async (res: LoginResponse) => {
      tokenStore.set(res.accessToken, res.refreshToken, res.expiresIn);
      await loadAccess();
      setEndReason(null);
      setStatus("authenticated");
    },
    [loadAccess],
  );

  // Wire the HTTP client to this provider.
  React.useEffect(() => {
    configureAuthHandlers({
      refresh: exchangeRefreshToken,
      onSessionExpired: () => endSessionLocally("expired"),
    });
    return () => configureAuthHandlers(null);
  }, [endSessionLocally]);

  // Restore the session on first load.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokenStore.getPersistedRefreshToken()) {
        setStatus("anonymous");
        return;
      }
      const ok = await refreshSession();
      if (cancelled) return;
      if (!ok) {
        setStatus("anonymous");
        return;
      }
      try {
        await loadAccess();
        if (!cancelled) setStatus("authenticated");
      } catch (error) {
        if (cancelled || (isApiError(error) && error.kind === "aborted"))
          return;
        // Only an explicit auth rejection ends the session. Network/server failures keep the refresh
        // token so the next load can restore it (e.g. a reload while this request was in flight).
        if (
          isApiError(error) &&
          (error.kind === "unauthorized" || error.kind === "forbidden")
        )
          endSessionLocally("expired");
        else setStatus("anonymous");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAccess, endSessionLocally]);

  const signIn = React.useCallback(
    async (emailOrMobile: string, password: string): Promise<SignInResult> => {
      const res = await authService.login({ emailOrMobile, password });
      if (res.mfaRequired) {
        if (!res.userId || !res.mfaChallengeToken)
          throw new Error(
            "The server requested verification but did not return a challenge.",
          );
        return {
          kind: "mfa-required",
          challenge: {
            userId: res.userId,
            challengeToken: res.mfaChallengeToken,
            emailOrMobile,
          },
        };
      }
      await completeSignIn(res);
      return { kind: "signed-in" };
    },
    [completeSignIn],
  );

  const verifyMfa = React.useCallback(
    async (challenge: MfaChallenge, code: string) => {
      const res = await authService.verifyMfa({
        userId: challenge.userId,
        challengeToken: challenge.challengeToken,
        code,
        recoveryCode: null,
      });
      await completeSignIn(res);
    },
    [completeSignIn],
  );

  const resendMfa = React.useCallback(
    async (challenge: MfaChallenge): Promise<MfaChallenge> => {
      const res = await authService.resendMfa(
        challenge.userId,
        challenge.challengeToken,
      );
      // The old challenge is cancelled; verification must use the new id.
      if (!res.challengeId)
        throw new Error(
          "A new code could not be issued. Please sign in again.",
        );
      return { ...challenge, challengeToken: res.challengeId };
    },
    [],
  );

  const signOut = React.useCallback(async () => {
    // POST /auth/logout does not revoke the session (backend defect), so revoke the current
    // session id (JWT `sid`) explicitly. Best effort: local state is cleared regardless.
    const token = tokenStore.getAccessToken();
    const sid = token ? decodeJwtPayload(token)?.sid : undefined;
    if (typeof sid === "string" && sid) {
      try {
        await authService.revokeSession(sid);
      } catch {
        /* session may already be gone */
      }
    }
    endSessionLocally("signed-out");
  }, [endSessionLocally]);

  const reloadAccess = React.useCallback(async () => {
    await loadAccess();
  }, [loadAccess]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      access,
      endReason,
      accessError,
      signIn,
      verifyMfa,
      resendMfa,
      signOut,
      endSessionLocally,
      reloadAccess,
    }),
    [
      status,
      user,
      access,
      endReason,
      accessError,
      signIn,
      verifyMfa,
      resendMfa,
      signOut,
      endSessionLocally,
      reloadAccess,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
