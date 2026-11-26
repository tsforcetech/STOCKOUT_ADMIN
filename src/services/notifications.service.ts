import { http } from "@/lib/api/client";
import { unwrapData, type Envelope } from "@/lib/api/envelope";
import type { MarkAllReadResultDto, MarkReadResultDto, UnreadCountDto, UserNotificationPageDto } from "@/api/types/notifications";

const BASE = "/api/v1/notifications";

/**
 * The signed-in user's notifications. The user comes only from the token: no recipient id is ever sent. Without
 * organizationId the server returns the user's personal and organization notifications together.
 * Browser push enrollment (/devices) lives in push-devices.service.ts.
 */
export const notificationsService = {
  list: async (q: { unreadOnly: boolean; page: number; pageSize: number }, signal?: AbortSignal) =>
    unwrapData<UserNotificationPageDto>(
      await http.get<Envelope<UserNotificationPageDto>>(`${BASE}?unreadOnly=${q.unreadOnly}&page=${q.page}&pageSize=${q.pageSize}`, { signal }),
    ),
  unreadCount: async (signal?: AbortSignal) => unwrapData<UnreadCountDto>(await http.get<Envelope<UnreadCountDto>>(`${BASE}/unread-count`, { signal })),
  markRead: async (notificationId: string) =>
    unwrapData<MarkReadResultDto>(await http.post<Envelope<MarkReadResultDto>>(`${BASE}/${encodeURIComponent(notificationId)}/read`)),
  markAllRead: async () => unwrapData<MarkAllReadResultDto>(await http.post<Envelope<MarkAllReadResultDto>>(`${BASE}/read-all`)),
};

export const notificationKeys = {
  all: ["notifications"] as const,
  unread: ["notifications", "unread-count"] as const,
  list: (unreadOnly: boolean, page: number) => ["notifications", "list", unreadOnly, page] as const,
};
