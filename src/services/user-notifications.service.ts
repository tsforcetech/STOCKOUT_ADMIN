import { http } from "@/lib/api/client";
import { unwrapData, type Envelope } from "@/lib/api/envelope";
import type { MarkAllReadResultDto, MarkReadResultDto, UnreadCountDto, UserNotificationPageDto } from "@/api/types/user-notifications";

const BASE = "/api/v1/notifications";

/**
 * The signed-in admin's own inbox (NotificationIntegration, same API as the marketplace). The user comes only from the
 * token. Not to be confused with notification TEMPLATES (/api/v1/admin/notification-templates).
 */
export const userNotificationsService = {
  list: async (q: { unreadOnly: boolean; page: number; pageSize: number }, signal?: AbortSignal) =>
    unwrapData<UserNotificationPageDto>(await http.get<Envelope<UserNotificationPageDto>>(`${BASE}?unreadOnly=${q.unreadOnly}&page=${q.page}&pageSize=${q.pageSize}`, { signal })),
  unreadCount: async (signal?: AbortSignal) => unwrapData<UnreadCountDto>(await http.get<Envelope<UnreadCountDto>>(`${BASE}/unread-count`, { signal })),
  markRead: async (id: string) => unwrapData<MarkReadResultDto>(await http.post<Envelope<MarkReadResultDto>>(`${BASE}/${encodeURIComponent(id)}/read`)),
  markAllRead: async () => unwrapData<MarkAllReadResultDto>(await http.post<Envelope<MarkAllReadResultDto>>(`${BASE}/read-all`)),
};

export const userNotificationKeys = {
  all: ["user-notifications"] as const,
  unread: ["user-notifications", "unread"] as const,
  list: (unreadOnly: boolean, page: number) => ["user-notifications", "list", unreadOnly, page] as const,
};
