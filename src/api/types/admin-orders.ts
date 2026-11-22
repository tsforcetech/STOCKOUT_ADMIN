/** BE-25 admin order monitoring (BiddingDeal via Gateway, handoff 21 Nov 2026). PlatformAdmin only. */

export interface PagedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface AdminOrdersSummaryDto {
  ordersPlacedToday: number;
  totalOrdersInPeriod: number;
  awaitingSellerConfirmation: number;
  sellerConfirmationOverdue: number;
  inFulfillment: number;
  completedOrders: number;
  cancelledOrders: number;
  paymentReconciliationRequired: number;
  evaluatedAtUtc: string;
  fromUtc: string | null;
  toUtc: string | null;
}

export interface AdminOrderSellerDto {
  subOrderId: string;
  subOrderNumber: string;
  sellerOrganizationId: string;
  sellerLegalName: string | null;
  sellerTradingName: string | null;
  subOrderTotal: number;
  status: string;
  fulfillmentStatus: string;
  fulfillmentMethod: string | null;
  confirmationDeadlineUtc: string | null;
  isEscalated: boolean;
  isOverdue: boolean;
}

export interface AdminOrderListItemDto {
  orderId: string;
  orderNumber: string;
  buyerUserId: string;
  buyerOrganizationId: string | null;
  buyerDisplayName: string | null;
  buyerEmail: string | null;
  buyerAccountType: string | null;
  sellers: AdminOrderSellerDto[];
  totalPayableAmount: number;
  currency: string;
  orderStatus: string;
  paymentStatus: string;
  paymentReference: string | null;
  paymentPreAuthAttemptId: string | null;
  preAuthInternalStatus: string | null;
  preAuthRecoveryStatus: string | null;
  authorizedAmount: number;
  capturedAmount: number;
  isPaymentCaptured: boolean;
  requiresPaymentReconciliation: boolean;
  createdAtUtc: string;
  earliestConfirmationDeadlineUtc: string | null;
}

export interface AdminOrderListQuery {
  page: number;
  pageSize: number;
  status?: string;
  paymentStatus?: string;
  sellerOrganizationId?: string;
  buyerOrganizationId?: string;
  fromUtc?: string;
  toUtc?: string;
  q?: string;
}

export interface AdminOrderLineDto {
  orderLineId: string;
  listingId: string;
  titleSnapshot: string | null;
  thumbnailUrlSnapshot: string | null;
  quantity: number;
  unitPrice: number;
  currency: string;
  taxAmount: number;
  lineSubtotal: number;
  lineTotal: number;
  isWholeLot: boolean;
}

export interface AdminStatusHistoryDto {
  fromStatus?: string | null;
  toStatus?: string | null;
  changedAtUtc?: string | null;
  changedBy?: string | null;
  reason?: string | null;
}

export interface AdminSubOrderDto {
  subOrderId: string;
  subOrderNumber: string;
  sellerOrganizationId: string;
  sellerLegalName: string | null;
  sellerTradingName: string | null;
  materialSubtotal: number;
  applicableMaterialVat: number;
  subOrderTotal: number;
  status: string;
  fulfillmentStatus: string;
  fulfillmentMethod: string | null;
  claimStatus: string | null;
  payoutEligibility: string | null;
  deliveredAtUtc: string | null;
  sellerConfirmedAtUtc: string | null;
  sellerRejectedAtUtc: string | null;
  sellerRejectionReason: string | null;
  confirmationDeadlineUtc: string | null;
  isEscalated: boolean;
  isOverdue: boolean;
  timeRemainingSeconds: number | null;
  /** Base64 sub-order rowversion; sent as expectedRowVersion on a delivery update. */
  rowVersion: string;
  items: AdminOrderLineDto[];
}

export interface AdminOrderDto {
  orderId: string;
  orderNumber: string;
  buyerUserId: string;
  buyerOrganizationId: string | null;
  orderDateUtc: string;
  currency: string;
  aggregateMaterialAmount: number;
  applicableMaterialVat: number;
  deliveryAmount: number;
  deliveryVatAmount: number;
  totalPayableAmount: number;
  status: string;
  paymentStatus: string;
  paymentReference: string | null;
  paymentAuthorizedAtUtc: string | null;
  rowVersion: string;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  subOrders: AdminSubOrderDto[];
}

export interface AdminOrderPaymentDto {
  attemptId: string | null;
  paymentIntentId: string | null;
  paymentProvider: string | null;
  captureMethod: string | null;
  orderPaymentStatus: string;
  providerStatus: string | null;
  internalStatus: string | null;
  recoveryStatus: string | null;
  reservationStatus: string | null;
  authorizedAmount: number;
  capturableAmount: number;
  capturedAmount: number;
  refundedAmount: number;
  currency: string;
  isProviderVerified: boolean;
  isPaymentCaptured: boolean;
  requiresReconciliation: boolean;
  paymentAuthorizedAtUtc: string | null;
  authorizationExpiresAtUtc: string | null;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface AdminReservationDto {
  reservationId: string;
  listingId: string;
  quantity: number;
  lineTotal: number;
  currency: string;
  reservationStatus: string;
  expiresAtUtc: string | null;
  postAuthHeldAtUtc: string | null;
  releasedAtUtc?: string | null;
  failureReason?: string | null;
}

export interface AdminOrderDetailDto {
  order: AdminOrderDto;
  buyer: { buyerUserId: string; buyerOrganizationId: string | null; buyerAccountType: string | null; displayName: string | null; email: string | null } | null;
  payment: AdminOrderPaymentDto | null;
  inventoryReservations: AdminReservationDto[];
  deliveryEvidence: unknown[];
  claims: unknown[];
  escalations: unknown[];
  acceptanceEvents: unknown[];
}

export interface AdminTimelineEventDto {
  eventId: string;
  eventType: string;
  category: string;
  description: string | null;
  actor: string | null;
  source: string | null;
  occurredAtUtc: string;
  subOrderNumber: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  referenceId: string | null;
}

export interface AdminOrderTimelineDto {
  orderId: string;
  orderNumber: string;
  currentOrderStatus: string;
  currentPaymentStatus: string;
  events: AdminTimelineEventDto[];
}

export interface AdminPaymentAuthorizationDto {
  attemptId: string;
  checkoutCorrelationId: string | null;
  cartId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  buyerUserId: string;
  buyerOrganizationId: string | null;
  buyerAccountType: string | null;
  paymentProvider: string | null;
  paymentIntentId: string | null;
  authorizedAmount: number;
  capturableAmount: number;
  currency: string;
  providerStatus: string | null;
  internalStatus: string;
  recoveryStatus: string | null;
  reservationStatus: string | null;
  isProviderVerified: boolean;
  failureCode: string | null;
  failureMessage: string | null;
  paymentAuthorizedAtUtc: string | null;
  authorizationExpiresAtUtc: string | null;
  cancelledAtUtc: string | null;
  createdAtUtc: string;
  updatedAtUtc: string | null;
}

export interface AdminPaymentAuthorizationQuery {
  page: number;
  pageSize: number;
  status?: string;
  recoveryStatus?: string;
  q?: string;
}

export interface AdminCancelResponse {
  cancelled: boolean;
  isIdempotentReplay: boolean;
  code: string;
  message: string;
}
