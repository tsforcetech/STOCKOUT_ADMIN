import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { BellIcon } from "@phosphor-icons/react";
import { userNotificationKeys, userNotificationsService } from "@/services/user-notifications.service";
import { badgeText } from "./inbox-target";

/** Top-bar bell: the admin's own unread notifications (new orders, escalations, claims…); opens the inbox. */
export function NotificationBell() {
  const unread = useQuery({ queryKey: userNotificationKeys.unread, queryFn: ({ signal }) => userNotificationsService.unreadCount(signal), refetchInterval: 60_000, retry: false });
  const text = badgeText(unread.data?.unreadCount);
  return (
    <Link
      to="/inbox"
      aria-label={text ? `Notifications, ${text} unread` : "Notifications"}
      className="relative flex size-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-muted"
    >
      <BellIcon className="size-5" />
      {text && (
        <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white ring-2 ring-surface" aria-hidden>
          {text}
        </span>
      )}
    </Link>
  );
}
