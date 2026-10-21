import { http } from "@/lib/api/client";
import { unwrapData, type Envelope } from "@/lib/api/envelope";
import type { AdminSellerDocumentDownloadUrlResponse, AdminSellerDocumentResponse, AdminSellerReviewAction, MarketplaceSellerDto } from "@/api/types/user-organization";

/**
 * Admin marketplace sellers (user-organization). Contract: docs/contracts/user-organization.md §6.1
 * Note: the list endpoint returns only status/verification fields; other fields are empty defaults.
 */
export const sellersService = {
  list: async (signal?: AbortSignal) => unwrapData<MarketplaceSellerDto[]>(await http.get<Envelope<MarketplaceSellerDto[]>>("/api/v1/admin/marketplace/sellers", { signal })),

  review: async (sellerId: string, action: AdminSellerReviewAction, expectedRowVersion: string) =>
    unwrapData<MarketplaceSellerDto>(
      await http.post<Envelope<MarketplaceSellerDto>>(`/api/v1/admin/marketplace/sellers/${encodeURIComponent(sellerId)}/verify`, { action, expectedRowVersion }),
    ),

  /** F2-E: KYC documents with short-lived download URLs (sellers.view). */
  documents: async (sellerId: string, signal?: AbortSignal) =>
    unwrapData<AdminSellerDocumentResponse[]>(
      await http.get<Envelope<AdminSellerDocumentResponse[]>>(`/api/v1/admin/marketplace/sellers/${encodeURIComponent(sellerId)}/documents`, { signal }),
    ),

  /** A fresh URL for one document (the list's URLs expire after 15 minutes). */
  documentDownloadUrl: async (sellerId: string, documentId: string) =>
    unwrapData<AdminSellerDocumentDownloadUrlResponse>(
      await http.get<Envelope<AdminSellerDocumentDownloadUrlResponse>>(
        `/api/v1/admin/marketplace/sellers/${encodeURIComponent(sellerId)}/documents/${encodeURIComponent(documentId)}/download-url`,
      ),
    ),

  /** `action` is ignored by the backend but must be non-empty. */
  suspend: async (sellerId: string, expectedRowVersion: string) =>
    unwrapData<MarketplaceSellerDto>(
      await http.post<Envelope<MarketplaceSellerDto>>(`/api/v1/admin/marketplace/sellers/${encodeURIComponent(sellerId)}/suspend`, { action: "SUSPEND", expectedRowVersion }),
    ),
};
