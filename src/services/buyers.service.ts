import { http } from "@/lib/api/client";
import { expectArray, unwrapData, type Envelope } from "@/lib/api/envelope";
import type {
  AdminBuyerDocumentDownloadUrlResponse,
  AdminBuyerDocumentResponse,
  AdminBuyerListItemDto,
  AdminBuyerProfileDto,
  AdminBuyerReviewDocumentRequest,
  BuyerVerificationHistoryDto,
} from "@/api/types/user-organization";

const base = "/api/v1/admin/marketplace/buyers";
const seg = encodeURIComponent;

/**
 * Admin buyer identity verification (user-organization, AdminMarketplaceBuyersController, Q1–Q15).
 * Contract: docs/contracts/buyer-verification.md. Permissions: buyers.view / verify / reject / suspend.
 * expectedRowVersion must come from a fresh GET …/buyers/{id}.
 */
export const buyersService = {
  list: async (signal?: AbortSignal) => expectArray<AdminBuyerListItemDto>(unwrapData(await http.get<Envelope<AdminBuyerListItemDto[]>>(base, { signal }))),
  detail: async (buyerId: string, signal?: AbortSignal) => unwrapData<AdminBuyerProfileDto>(await http.get<Envelope<AdminBuyerProfileDto>>(`${base}/${seg(buyerId)}`, { signal })),
  documents: async (buyerId: string, signal?: AbortSignal) =>
    expectArray<AdminBuyerDocumentResponse>(unwrapData(await http.get<Envelope<AdminBuyerDocumentResponse[]>>(`${base}/${seg(buyerId)}/documents`, { signal }))),
  /** Private, short-lived signed URL for the identity file. */
  documentDownloadUrl: async (buyerId: string, documentId: string) =>
    unwrapData<AdminBuyerDocumentDownloadUrlResponse>(await http.get<Envelope<AdminBuyerDocumentDownloadUrlResponse>>(`${base}/${seg(buyerId)}/documents/${seg(documentId)}/download-url`)),
  /** VERIFY needs buyers.verify, REJECT needs buyers.reject and a reviewRemark. */
  reviewDocument: async (buyerId: string, documentId: string, body: AdminBuyerReviewDocumentRequest) =>
    unwrapData<AdminBuyerDocumentResponse>(await http.post<Envelope<AdminBuyerDocumentResponse>>(`${base}/${seg(buyerId)}/documents/${seg(documentId)}/review`, body)),
  history: async (buyerId: string, signal?: AbortSignal) =>
    expectArray<BuyerVerificationHistoryDto>(unwrapData(await http.get<Envelope<BuyerVerificationHistoryDto[]>>(`${base}/${seg(buyerId)}/history`, { signal }))),
  /** Approve: needs one qualifying identity document reviewed VERIFIED and current policy acceptances. */
  verify: async (buyerId: string, expectedRowVersion: string) =>
    unwrapData<AdminBuyerProfileDto>(await http.post<Envelope<AdminBuyerProfileDto>>(`${base}/${seg(buyerId)}/verify`, { expectedRowVersion })),
  /** Reason required (REJECTION_REASON_REQUIRED); shown to the buyer. */
  reject: async (buyerId: string, expectedRowVersion: string, reason: string) =>
    unwrapData<AdminBuyerProfileDto>(await http.post<Envelope<AdminBuyerProfileDto>>(`${base}/${seg(buyerId)}/reject`, { expectedRowVersion, reason: reason.trim() })),
  /** Q8 manual revocation. Reason required (SUSPENSION_REASON_REQUIRED). Immediately removes purchase rights. */
  suspend: async (buyerId: string, expectedRowVersion: string, reason: string) =>
    unwrapData<AdminBuyerProfileDto>(await http.post<Envelope<AdminBuyerProfileDto>>(`${base}/${seg(buyerId)}/suspend`, { expectedRowVersion, reason: reason.trim() })),
};
