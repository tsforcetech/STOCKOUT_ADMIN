import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { notificationTemplatesService } from "@/services/notification-templates.service";
import type { NotificationTemplateListQuery } from "@/api/types/notification-templates";

export const templateKeys = {
  all: ["notification-templates"] as const,
  list: (q: NotificationTemplateListQuery) => ["notification-templates", "list", q] as const,
  versions: (code: string, channel: string) => ["notification-templates", "versions", code, channel] as const,
};

export function useTemplatesQuery(query: NotificationTemplateListQuery) {
  return useQuery({ queryKey: templateKeys.list(query), queryFn: ({ signal }) => notificationTemplatesService.list(query, signal), placeholderData: keepPreviousData });
}

export function useTemplateVersionsQuery(code: string, channel: string, enabled = true) {
  return useQuery({ queryKey: templateKeys.versions(code, channel), queryFn: ({ signal }) => notificationTemplatesService.versions(code, channel, signal), enabled: enabled && Boolean(code && channel) });
}
