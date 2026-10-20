import { http } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import type {
  CreateSearchPinnedResultRequest,
  CreateSearchSynonymRequest,
  ListSearchPinsQuery,
  ListSearchSynonymsQuery,
  ReindexStatusResponse,
  SearchPinnedResult,
  SearchPinsListResponse,
  SearchRankingConfigResponse,
  SearchSynonym,
  SearchSynonymsListResponse,
  StartReindexRequest,
  StartReindexResponse,
  UpdateSearchRankingConfigRequest,
  ZeroResultAnalyticsReportResponse,
  ZeroResultReportQuery,
} from "@/api/types/search-admin";

const BASE = "/api/v1/admin/search";

/**
 * search-discovery admin: /api/v1/admin/search/* (gateway route "search-admin-route").
 * Bare JSON responses (no envelope). Errors: SearchProblemDetailsDto { title, status, detail, errorCode (number), errorSymbol }.
 * All endpoints require `catalog:search:admin` (403 MARKETPLACE_SEARCH_ADMIN_FORBIDDEN otherwise).
 * Synonyms and pins are create-only: the API has no update, deactivate or delete actions.
 */
export const searchAdminService = {
  // Reindex (AdminSearchReindexController)
  startReindex: (body: StartReindexRequest) => http.post<StartReindexResponse>(`${BASE}/reindex/start`, body),

  /**
   * Latest FULL_REINDEX job (or a specific one). The controller answers 404 REINDEX_JOB_NOT_FOUND when no reindex
   * has ever been started — that is a real "no jobs" answer, so it resolves to null instead of an error.
   */
  reindexStatus: async (jobId?: string, signal?: AbortSignal): Promise<ReindexStatusResponse | null> => {
    try {
      return await http.get<ReindexStatusResponse>(`${BASE}/reindex/status`, { query: { jobId }, signal });
    } catch (error) {
      if (isApiError(error) && error.status === 404 && !jobId) return null;
      throw error;
    }
  },

  // Synonyms (AdminSearchSynonymsController)
  synonyms: (query: ListSearchSynonymsQuery, signal?: AbortSignal) =>
    http.get<SearchSynonymsListResponse>(`${BASE}/synonyms`, { query: { page: query.page, pageSize: query.pageSize, activeOnly: query.activeOnly || undefined }, signal }),
  createSynonym: (body: CreateSearchSynonymRequest) => http.post<SearchSynonym>(`${BASE}/synonyms`, body),

  // Pinned results (AdminSearchPinsController)
  pins: (query: ListSearchPinsQuery, signal?: AbortSignal) =>
    http.get<SearchPinsListResponse>(`${BASE}/pins`, {
      query: { keyword: query.keyword?.trim() || undefined, page: query.page, pageSize: query.pageSize, activeOnly: query.activeOnly || undefined },
      signal,
    }),
  createPin: (body: CreateSearchPinnedResultRequest) => http.post<SearchPinnedResult>(`${BASE}/pins`, body),

  // Ranking (AdminSearchRankingController). No version field: last write wins.
  ranking: (signal?: AbortSignal) => http.get<SearchRankingConfigResponse>(`${BASE}/ranking`, { signal }),
  updateRanking: (body: UpdateSearchRankingConfigRequest) => http.put<SearchRankingConfigResponse>(`${BASE}/ranking`, body),

  /**
   * Zero-result analytics. BACKEND DEFECT: AdminSearchAnalyticsController.cs:37 calls
   * GetZeroResultReportAsync(days, limit) but the signature is (top, days) (SearchAnalyticsService.cs:139), so the
   * server uses `days` as the row cap and `limit` as the window. Sending the same value for both returns a correct
   * "last N days" window both today and after the backend is fixed; the row cap then equals N.
   */
  zeroResults: (query: ZeroResultReportQuery, signal?: AbortSignal) =>
    http.get<ZeroResultAnalyticsReportResponse>(`${BASE}/analytics/zero-results`, { query: { days: query.days, limit: query.limit }, signal }),
};
