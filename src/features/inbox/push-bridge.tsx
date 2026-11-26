import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/auth-context";
import { onForegroundPush, onPushNotificationClick, syncPush } from "@/lib/push/web-push";
import { notificationKeys } from "@/services/notifications.service";

/**
 * Keeps browser push in step with the session (renders nothing):
 *  - on sign-in, re-registers the device if this user opted in and the token rotated (never prompts);
 *  - a foreground push shows a generic toast and refetches the inbox and badge (no OS notification, so no duplicate);
 *  - a click on a background notification opens the inbox, which routes from the server's own record.
 * Push failures are swallowed: the REST notification center keeps working on its own.
 */
export function PushBridge({ openInbox }: { openInbox: () => void }) {
  const { status, user } = useAuth();
  const qc = useQueryClient();
  const owner = status === "authenticated" ? (user?.userId ?? null) : null;
  const openRef = React.useRef(openInbox);
  React.useEffect(() => {
    openRef.current = openInbox;
  }, [openInbox]);

  React.useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const refresh = () => void qc.invalidateQueries({ queryKey: notificationKeys.all });
    void (async () => {
      try {
        if (!(await syncPush(owner)) || cancelled) return;
        const off = await onForegroundPush(() => {
          refresh();
          toast("New notification", { description: "Open STOCKOUT to view it.", action: { label: "View", onClick: () => openRef.current() } });
        });
        if (cancelled) off();
        else unsubscribe = off;
      } catch (e) {
        console.warn("Push notifications unavailable:", e instanceof Error ? e.name : "error");
      }
    })();
    const offClick = onPushNotificationClick(() => {
      refresh();
      openRef.current();
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
      offClick();
    };
  }, [owner, qc]);

  return null;
}
