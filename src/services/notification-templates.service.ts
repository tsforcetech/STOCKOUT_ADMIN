import { http } from "@/lib/api/client";
import { unwrapData } from "@/lib/api/envelope";
import type {
  CreateNotificationTemplateRequest,
  NotificationTemplateChannel,
  NotificationTemplateHistoryEnvelope,
  NotificationTemplateListEnvelope,
  NotificationTemplateListQuery,
  NotificationTemplateListResponse,
  NotificationTemplateSummaryEnvelope,
  NotificationTemplateSummaryResponse,
  NotificationTemplateTransitionEnvelope,
  NotificationTemplateVersionRef,
  NotificationTemplateVersionRefEnvelope,
  NotificationTemplateVersionResponse,
  NotificationTemplateVersionTransition,
  UpdateNotificationTemplateDraftRequest,
} from "@/api/types/notification-templates";

/**
 * notification-integration /api/v1/admin/notification-templates. Success: { success, data }.
 * Errors: { error, message } where message is "" except for FORBIDDEN.
 * The list is server-paginated (page/pageSize clamped 1..100); version history is a full array.
 * Contract: docs/contracts/files-notifications-search.md §B
 */
const BASE = "/api/v1/admin/notification-templates";
const seg = encodeURIComponent;
const templatePath = (templateCode: string, channel: NotificationTemplateChannel | string) => `${BASE}/${seg(templateCode)}/${seg(channel)}`;

export const notificationTemplatesService = {
  list: async (query: NotificationTemplateListQuery, signal?: AbortSignal) =>
    unwrapData<NotificationTemplateListResponse>(
      await http.get<NotificationTemplateListEnvelope>(BASE, {
        signal,
        query: {
          page: query.page,
          pageSize: query.pageSize,
          search: query.search,
          channel: query.channel,
          purpose: query.purpose,
          status: query.status,
        },
      }),
    ),

  get: async (templateCode: string, channel: string, signal?: AbortSignal) =>
    unwrapData<NotificationTemplateSummaryResponse>(await http.get<NotificationTemplateSummaryEnvelope>(templatePath(templateCode, channel), { signal })),

  /** All versions, newest first. There is no single-version GET. */
  versions: async (templateCode: string, channel: string, signal?: AbortSignal) =>
    unwrapData<NotificationTemplateVersionResponse[]>(await http.get<NotificationTemplateHistoryEnvelope>(`${templatePath(templateCode, channel)}/versions`, { signal })),

  /** Creates the template with version 1 in DRAFT. Responds 200 (not 201). */
  create: async (body: CreateNotificationTemplateRequest) =>
    unwrapData<NotificationTemplateVersionRef>(await http.post<NotificationTemplateVersionRefEnvelope>(BASE, body)),

  /** Copies the ACTIVE (else latest RETIRED) version into a new DRAFT. At most one draft per template. */
  createDraft: async (templateCode: string, channel: string) =>
    unwrapData<NotificationTemplateVersionRef>(await http.post<NotificationTemplateVersionRefEnvelope>(`${templatePath(templateCode, channel)}/versions`)),

  /** Full replacement of content + parameters of a DRAFT version. */
  updateDraft: async (templateCode: string, channel: string, versionId: string, body: UpdateNotificationTemplateDraftRequest) =>
    unwrapData<NotificationTemplateVersionRef>(
      await http.put<NotificationTemplateVersionRefEnvelope>(`${templatePath(templateCode, channel)}/versions/${seg(versionId)}`, body),
    ),

  /** DRAFT → ACTIVE; the previous ACTIVE version becomes RETIRED. */
  activate: async (templateCode: string, channel: string, versionId: string, expectedVersion: number) =>
    unwrapData<NotificationTemplateVersionTransition>(
      await http.post<NotificationTemplateTransitionEnvelope>(`${templatePath(templateCode, channel)}/versions/${seg(versionId)}/activate`, { expectedVersion }),
    ),

  /** ACTIVE → RETIRED. */
  retire: async (templateCode: string, channel: string, versionId: string, expectedVersion: number) =>
    unwrapData<NotificationTemplateVersionTransition>(
      await http.post<NotificationTemplateTransitionEnvelope>(`${templatePath(templateCode, channel)}/versions/${seg(versionId)}/retire`, { expectedVersion }),
    ),
};
