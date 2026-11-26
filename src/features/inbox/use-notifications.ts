import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { notificationKeys, notificationsService } from "@/services/notifications.service";

/**
 * Unread badge: fetched on sign-in, on window focus and every 60 s while the tab is visible. Sign-out clears the
 * whole query cache, so no other user's (or revoked organization's) notifications are ever shown from cache.
 */
export function useUnreadNotifications() {
  const { status } = useAuth();
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: ({ signal }) => notificationsService.unreadCount(signal),
    enabled: status === "authenticated",
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    retry: 1,
  });
}
