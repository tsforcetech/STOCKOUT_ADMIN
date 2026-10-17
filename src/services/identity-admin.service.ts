import { http } from "@/lib/api/client";
import type { AccountStatus, AdminUpdateUserStatusRequest, StandardSuccessResponse } from "@/api/types/identity";

/**
 * identity-access admin endpoints (/api/v1/identity/admin/*). Plain DTO responses, ProblemDetails errors.
 *
 * SECURITY NOTE (backend defect): these endpoints have NO server-side authorization — any
 * authenticated user may change any account's status. The UI gates them behind
 * `platform-users.disable`; that is a client-side restriction only.
 * Locked | Suspended | Closed revoke all of the user's sessions and refresh tokens.
 * Contract: docs/contracts/identity-access.md §4
 */
export const ACCOUNT_STATUSES: readonly AccountStatus[] = ["PendingVerification", "Active", "Locked", "Suspended", "Closed"];

export const identityAdminService = {
  /** PUT /api/v1/identity/admin/users/{id}/status. `userId` is still required in the body (non-nullable). */
  updateUserStatus: (userId: string, status: AccountStatus, reason: string) => {
    const body: AdminUpdateUserStatusRequest = { userId, status, reason };
    return http.put<StandardSuccessResponse>(`/api/v1/identity/admin/users/${encodeURIComponent(userId)}/status`, body);
  },
};
