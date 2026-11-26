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

/** Push device registration (NotificationIntegration /devices). The raw FCM token is sent once and never echoed back. */
export type PushPlatform = "WEB" | "ANDROID" | "IOS";

export interface RegisterPushDeviceRequest {
  platform: PushPlatform;
  /** Stable per-browser id, 8–100 characters. */
  installationId: string;
  fcmToken: string;
  organizationId?: string | null;
}

export interface RegisterPushDeviceResultDto {
  deviceId: string;
  alreadyRegistered?: boolean;
}

/** Device metadata only: GET /devices never returns a token. */
export interface PushDeviceDto {
  deviceId: string;
  organizationId: string | null;
  platform: PushPlatform | string;
  installationId: string;
  registeredAtUtc: string;
  lastSeenAtUtc: string | null;
}

export interface RevokePushDevicesResultDto {
  revokedCount?: number;
  wasRevoked?: boolean;
}
