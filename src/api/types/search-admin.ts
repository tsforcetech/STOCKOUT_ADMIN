/**
 * Search administration API types (services/search-discovery, /api/v1/admin/search/*).
 * Responses are bare camelCase DTOs (no envelope). Every endpoint requires the platform permission
 * `catalog:search:admin` (or a PLATFORM_SUPER_ADMIN / SUPER_ADMIN role claim) — AdminSearchPolicy in
 * Emcore.SearchDiscovery.Api/Authentication/SearchBuyerAuthenticationHandler.cs.
 * Contracts: Emcore.SearchDiscovery.Contracts/Admin/AdminSearchContracts.cs.
 */

/** ISO-8601 date-time string (UTC, may be serialised without an offset). */
type IsoDateTime = string;

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

/** C# Domain.Exceptions.SearchErrorCodes symbols the admin endpoints can emit (plus the auth/404 literals). */
export type SearchAdminErrorSymbol =
  | 'MARKETPLACE_SEARCH_INTERNAL_ERROR' // 50900, 500
  | 'MARKETPLACE_SEARCH_FILTER_INVALID' // 50901, 400 — pin / ranking validation
  | 'MARKETPLACE_SEARCH_SYNONYM_INVALID' // 50909, 400
  | 'MARKETPLACE_SEARCH_PIN_DUPLICATE' // 50910, 409
  | 'MARKETPLACE_SEARCH_REINDEX_IN_PROGRESS' // 50911, 409
  | 'MARKETPLACE_SEARCH_ADMIN_FORBIDDEN' // 50912, 403 (HandleForbiddenAsync on /api/v1/admin/*)
  | 'REINDEX_JOB_NOT_FOUND' // 404 from GET reindex/status (errorCode 404)
  | 'UNAUTHORIZED'; // 401 (errorCode 401)

/** C# Contracts.Search.SearchProblemDetailsDto. `title` === `errorSymbol`; `errorCode` is numeric. */
export interface SearchAdminProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  errorCode: number;
  errorSymbol: SearchAdminErrorSymbol | string;
  traceId: string | null;
}

// ---------------------------------------------------------------------------------------------
// 1. Ranking configuration (6-DEC-15) — GET/PUT /api/v1/admin/search/ranking
// ---------------------------------------------------------------------------------------------

/**
 * Keys accepted by PUT (SearchRankingAdminService.AllowedKeys, case-insensitive). Any other key → 400 FILTER_INVALID.
 * GET returns these 11 with built-in defaults when the SEARCH_RANKING_CONFIG table is empty.
 */
export const SEARCH_RANKING_KEYS = [
  'weight_title',
  'weight_brand',
  'weight_category',
  'weight_description',
  'weight_seller',
  'weight_attribute',
  'weight_exact_listing_number',
  'weight_prefix_listing_number',
  'weight_title_phrase',
  'boost_recency',
  'boost_verified_seller',
] as const;
export type SearchRankingKey = (typeof SEARCH_RANKING_KEYS)[number];

/** Inclusive server bounds for weightValue (SearchRankingAdminService.UpdateRankingConfigAsync). */
export const SEARCH_RANKING_WEIGHT_MIN = 0;
export const SEARCH_RANKING_WEIGHT_MAX = 100;

/** C# SearchRankingConfigItemDto. No version / rowVersion is exposed, so updates are last-write-wins. */
export interface SearchRankingConfigItem {
  configKey: string;
  weightValue: number;
  description: string;
  updatedAtUtc: IsoDateTime;
  updatedBy: string;
}

/** C# SearchRankingConfigResponse. */
export interface SearchRankingConfigResponse {
  items: SearchRankingConfigItem[];
}

/** C# UpdateSearchRankingWeightDto. */
export interface UpdateSearchRankingWeight {
  configKey: string;
  weightValue: number; // 0.0..100.0
}

/** C# UpdateSearchRankingConfigRequest. At least one weight required. Response: the full SearchRankingConfigResponse. */
export interface UpdateSearchRankingConfigRequest {
  weights: UpdateSearchRankingWeight[];
}

// ---------------------------------------------------------------------------------------------
// 2. Synonyms (6-DEC-15) — GET/POST /api/v1/admin/search/synonyms (no update / delete endpoints)
// ---------------------------------------------------------------------------------------------

/** C# SearchSynonymDto. termList is the normalised "a, b, c" string (lower-cased, trimmed). */
export interface SearchSynonym {
  synonymId: string;
  termList: string;
  isTwoWay: boolean;
  isActive: boolean;
  createdAtUtc: IsoDateTime;
  updatedAtUtc: IsoDateTime;
  createdBy: string;
  updatedBy: string;
}

/**
 * C# CreateSearchSynonymRequest. termList: comma-separated, ≤ 500 chars, ≥ 2 distinct terms, each ≤ 100 chars;
 * an active rule with the identical term set → 400 SYNONYM_INVALID. Response 201 SearchSynonymDto.
 */
export interface CreateSearchSynonymRequest {
  termList: string;
  isTwoWay: boolean; // default true
  isActive: boolean; // default true
}

/** Query for GET synonyms. page ≥ 1, pageSize clamped to 1..100 (default 50). Ordered by updatedAtUtc desc. */
export interface ListSearchSynonymsQuery {
  page?: number;
  pageSize?: number;
  activeOnly?: boolean;
}

/** C# SearchSynonymsListResponse. */
export interface SearchSynonymsListResponse {
  items: SearchSynonym[];
  totalCount: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------------------------
// 3. Pinned results (6-DEC-15) — GET/POST /api/v1/admin/search/pins (no update / delete endpoints)
// ---------------------------------------------------------------------------------------------

/** C# SearchPinnedResultDto. keyword is stored lower-cased. */
export interface SearchPinnedResult {
  pinId: string;
  keyword: string;
  listingId: string;
  slotPosition: number;
  isActive: boolean;
  createdAtUtc: IsoDateTime;
  updatedAtUtc: IsoDateTime;
  createdBy: string;
  updatedBy: string;
}

/**
 * C# CreateSearchPinnedResultRequest. keyword required, ≤ 200 chars; listingId non-empty GUID; slotPosition 1..50.
 * For an active pin, a taken slot or an already-pinned listing for the same keyword → 409 PIN_DUPLICATE. Response 201.
 */
export interface CreateSearchPinnedResultRequest {
  keyword: string;
  listingId: string;
  slotPosition: number; // default 1
  isActive: boolean; // default true
}

/** Query for GET pins. keyword is an EXACT match after trim + lower-case. pageSize clamped 1..100 (default 50). */
export interface ListSearchPinsQuery {
  keyword?: string;
  page?: number;
  pageSize?: number;
  activeOnly?: boolean;
}

/** C# SearchPinsListResponse. Ordered by keyword, slotPosition, updatedAtUtc desc. */
export interface SearchPinsListResponse {
  items: SearchPinnedResult[];
  totalCount: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------------------------
// 4. Blue/green reindexing (6-DEC-16) — POST reindex/start, GET reindex/status
// ---------------------------------------------------------------------------------------------

/**
 * SEARCH_INDEX_JOB.Status values for FULL_REINDEX jobs (SearchIndexJobRepository.cs / SearchReindexWorker.cs).
 * PENDING, CLAIMED and RUNNING count as "active" (only one may exist; another start → 409 REINDEX_IN_PROGRESS).
 */
export type ReindexJobStatus = 'PENDING' | 'CLAIMED' | 'RUNNING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED';
export const ACTIVE_REINDEX_STATUSES: readonly string[] = ['PENDING', 'CLAIMED', 'RUNNING'];

/** C# StartReindexRequest. Both optional: targetIndex defaults to "emcore-listings-v{yyyyMMddHHmmss}". */
export interface StartReindexRequest {
  targetIndex?: string;
  remarks?: string;
}

/** C# StartReindexResponse (HTTP 202). */
export interface StartReindexResponse {
  jobId: string;
  jobType: string; // "FULL_REINDEX"
  targetIndex: string;
  status: ReindexJobStatus | string;
  startedAtUtc: IsoDateTime;
  message: string;
}

/**
 * C# ReindexStatusResponse. GET without jobId returns the latest FULL_REINDEX job; 404 REINDEX_JOB_NOT_FOUND
 * when none exists (or the id is unknown). The worker overwrites `remarks` with its outcome — on FAILED it holds the
 * exception message.
 */
export interface ReindexStatusResponse {
  jobId: string;
  jobType: string;
  targetIndex: string;
  status: ReindexJobStatus | string;
  startedAtUtc: IsoDateTime;
  completedAtUtc: IsoDateTime | null;
  totalListings: number;
  processedListings: number;
  failureCount: number;
  progressPercentage: number; // 0..100, 2 dp
  createdBy: string;
  remarks: string | null;
}

// ---------------------------------------------------------------------------------------------
// 5. Zero-result analytics (6-DEC-17) — GET /api/v1/admin/search/analytics/zero-results
// ---------------------------------------------------------------------------------------------

/** Query for GET zero-results (controller defaults days=30, limit=50). See the service for the argument-order defect. */
export interface ZeroResultReportQuery {
  days: number;
  limit: number;
}

/** C# ZeroResultQuerySummaryDto. queryText is normalised (lower-cased, PII-filtered). */
export interface ZeroResultQuerySummary {
  queryText: string;
  searchCount: number;
  firstSeenAtUtc: IsoDateTime;
  lastSeenAtUtc: IsoDateTime;
}

/** C# ZeroResultAnalyticsReportResponse. Totals are computed over the returned items only. */
export interface ZeroResultAnalyticsReportResponse {
  items: ZeroResultQuerySummary[];
  totalTrackedQueries: number;
  totalZeroResultSearches: number;
}
