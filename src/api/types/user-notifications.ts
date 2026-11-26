/**
 * BIV-NOTIF-02 in-app notification center (NotificationIntegration, via the Gateway). Mirrors
 * Contracts/Notifications/NotificationContracts.cs. Envelope { success, data }; errors { error, message }. UTC times.
 */
export type NotificationScope = "PERSONAL" | "ORGANIZATION";

export interface UserNotificationDto {
  notificationId: string;
  recipientOrganizationId: string | null;
  /** e.g. SEARCH_ALERT_MATCHED */
  notificationType: string;
  title: string;
  message: string;
  /** e.g. SAVED_SEARCH, BUYER_VERIFICATION */
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  /** Relative in-app path or null. Re-validated on the client before use. */
  navigationTarget: string | null;
  scope: NotificationScope | string;
  channel: string;
  deliveryStatus: string;
  isRead: boolean;
  readAtUtc: string | null;
  createdAtUtc: string;
}

export interface UserNotificationPageDto {
  items: UserNotificationDto[];
  page: number;
  pageSize: number;
  /** Rows matching the current filter. */
  totalCount: number;
  /** Unread rows in the same organization scope (independent of unreadOnly). */
  unreadCount: number;
}

export interface UnreadCountDto {
  unreadCount: number;
}
export interface MarkReadResultDto {
  notificationId: string;
  isRead: boolean;
  wasAlreadyRead: boolean;
}
export interface MarkAllReadResultDto {
  updatedCount: number;
}

/** pageSize must be 1–100 (NotificationInputValidator.MaxPageSize). */
export const NOTIFICATION_MAX_PAGE_SIZE = 100;
