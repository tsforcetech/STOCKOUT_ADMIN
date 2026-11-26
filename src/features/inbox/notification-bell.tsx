import { Link } from "react-router";
import { BellIcon } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth/auth-context";
import { badgeText } from "./notification-target";
import { useUnreadNotifications } from "./use-notifications";

/** Top-bar bell: opens the signed-in user's inbox; the badge shows unread count (hidden at 0, capped at 99+). */
export function NotificationBell() {
  const { status } = useAuth();
  const unread = useUnreadNotifications();
  if (status !== "authenticated") return null;
  const text = badgeText(unread.data?.unreadCount);
  return (
    <Link
      to="/inbox"
      aria-label={text ? `Notifications, ${text} unread` : "Notifications"}
      className="relative flex size-[38px] shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-muted"
    >
      <BellIcon className="size-[22px]" />
      {text && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white ring-2 ring-surface" aria-hidden>
          {text}
        </span>
      )}
    </Link>
  );
}
