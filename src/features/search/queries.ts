import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { searchAdminService } from "@/services/search-admin.service";
import { ACTIVE_REINDEX_STATUSES, type ListSearchPinsQuery, type ListSearchSynonymsQuery } from "@/api/types/search-admin";

export const searchAdminKeys = {
  all: ["search-admin"] as const,
  reindex: (jobId?: string) => ["search-admin", "reindex", jobId ?? "latest"] as const,
  synonyms: (query: ListSearchSynonymsQuery) => ["search-admin", "synonyms", query] as const,
  synonymsAll: ["search-admin", "synonyms"] as const,
  pins: (query: ListSearchPinsQuery) => ["search-admin", "pins", query] as const,
  pinsAll: ["search-admin", "pins"] as const,
  ranking: ["search-admin", "ranking"] as const,
  zeroResults: (days: number) => ["search-admin", "zero-results", days] as const,
};

/** How often the Index tab polls while a reindex job is PENDING / CLAIMED / RUNNING. */
export const REINDEX_POLL_MS = 5000;

export const isActiveReindex = (status: string | null | undefined) => !!status && ACTIVE_REINDEX_STATUSES.includes(status.toUpperCase());

export function useReindexStatusQuery(jobId?: string) {
  return useQuery({
    queryKey: searchAdminKeys.reindex(jobId),
    queryFn: ({ signal }) => searchAdminService.reindexStatus(jobId, signal),
    refetchInterval: (query) => (isActiveReindex(query.state.data?.status) ? REINDEX_POLL_MS : false),
    refetchIntervalInBackground: false,
  });
}

export function useSynonymsQuery(query: ListSearchSynonymsQuery) {
  return useQuery({ queryKey: searchAdminKeys.synonyms(query), queryFn: ({ signal }) => searchAdminService.synonyms(query, signal), placeholderData: keepPreviousData });
}

export function usePinsQuery(query: ListSearchPinsQuery) {
  return useQuery({ queryKey: searchAdminKeys.pins(query), queryFn: ({ signal }) => searchAdminService.pins(query, signal), placeholderData: keepPreviousData });
}

export function useRankingQuery() {
  return useQuery({ queryKey: searchAdminKeys.ranking, queryFn: ({ signal }) => searchAdminService.ranking(signal) });
}

/** See searchAdminService.zeroResults: the window is sent as both `days` and `limit` (backend argument-order defect). */
export function useZeroResultsQuery(days: number) {
  return useQuery({
    queryKey: searchAdminKeys.zeroResults(days),
    queryFn: ({ signal }) => searchAdminService.zeroResults({ days, limit: days }, signal),
    placeholderData: keepPreviousData,
  });
}
