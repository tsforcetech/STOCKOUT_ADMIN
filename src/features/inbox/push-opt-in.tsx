import * as React from "react";
import { BellRingingIcon, BellSlashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import { disablePush, enablePush, isPushRegisteredFor, pushAvailability, type PushAvailability } from "@/lib/push/web-push";

/**
 * "Enable push notifications" for this browser. Permission is requested only when the button is clicked; a blocked
 * permission is explained instead of re-prompting. Hidden when push isn't configured for this build.
 */
export function PushOptIn() {
  const { user } = useAuth();
  const owner = user?.userId ?? null;
  const [availability, setAvailability] = React.useState<PushAvailability>(pushAvailability);
  const [on, setOn] = React.useState(() => isPushRegisteredFor(owner));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // The registration is restored in the background after sign-in; reflect it once it lands.
    const sync = () => {
      setAvailability(pushAvailability());
      setOn(isPushRegisteredFor(owner));
    };
    sync();
    const t = window.setTimeout(sync, 3000);
    window.addEventListener("focus", sync);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("focus", sync);
    };
  }, [owner]);

  if (availability === "unconfigured" || !owner) return null;

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await enablePush(owner);
      setAvailability(result);
      setOn(result === "granted");
    } catch (e) {
      setError(`Push notifications couldn't be switched on: ${getErrorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      await disablePush(owner);
    } catch (e) {
      setError(`This browser was switched off locally, but the server couldn't confirm it: ${getErrorMessage(e)}`);
    } finally {
      setOn(false);
      setBusy(false);
    }
  };

  let text: string;
  let action: React.ReactNode = null;
  if (availability === "unsupported" || availability === "insecure") {
    text = "This browser doesn't support push notifications. Everything still appears here.";
  } else if (availability === "denied") {
    text = "Notifications are blocked for this site in your browser settings. Allow them there, then come back to switch them on.";
  } else if (on) {
    text = "Push notifications are on for this browser. They only say “New notification” — details stay in STOCKOUT.";
    action = (
      <Button size="sm" variant="secondary" onClick={() => void disable()} loading={busy}>
        <BellSlashIcon /> Turn off
      </Button>
    );
  } else {
    text = "Get a browser notification when something needs your attention. Alerts never show order or payment details.";
    action = (
      <Button size="sm" onClick={() => void enable()} loading={busy}>
        <BellRingingIcon /> Enable push notifications
      </Button>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface-muted/60 p-3" aria-label="Browser push notifications" role="region">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{text}</p>
        {action}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
