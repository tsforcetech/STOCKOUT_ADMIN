import { http } from "@/lib/api/client";
import { expectArray, unwrapData, type Envelope } from "@/lib/api/envelope";
import type { CreatePolicyRevisionRequest, PolicyDetailResponse, PolicySummaryResponse } from "@/api/types/policies";

/**
 * PA-1A policy administration (user-organization). Reads are public; creating a draft revision needs
 * policies.manage, publishing needs policies.publish (403 { error: "FORBIDDEN" } otherwise).
 */
const seg = encodeURIComponent;

export const policiesService = {
  list: async (lang: string, signal?: AbortSignal) =>
    expectArray<PolicySummaryResponse>(unwrapData(await http.get<Envelope<PolicySummaryResponse[]>>(`/api/v1/policies?lang=${seg(lang)}`, { signal }))),
  detail: async (code: string, lang: string, signal?: AbortSignal) =>
    unwrapData<PolicyDetailResponse>(await http.get<Envelope<PolicyDetailResponse>>(`/api/v1/policies/${seg(code)}?lang=${seg(lang)}`, { signal })),
  createRevision: async (body: CreatePolicyRevisionRequest) =>
    unwrapData<PolicyDetailResponse>(await http.post<Envelope<PolicyDetailResponse>>("/api/v1/policies/admin/revisions", body)),
  /** POL-1: every revision (any language) newest first, filtered by `status` (DRAFT | SCHEDULED | PUBLISHED | SUPERSEDED) and/or `policyCode`. policies.manage. */
  listRevisions: async (filter: { status?: string; policyCode?: string } = {}, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    if (filter.status) q.set("status", filter.status);
    if (filter.policyCode) q.set("policyCode", filter.policyCode);
    const qs = q.toString();
    return expectArray<PolicyDetailResponse>(unwrapData(await http.get<Envelope<PolicyDetailResponse[]>>(`/api/v1/policies/admin/revisions${qs ? `?${qs}` : ""}`, { signal })));
  },
  publishRevision: async (revisionId: string) => unwrapData<unknown>(await http.post<Envelope<unknown>>(`/api/v1/policies/admin/revisions/${seg(revisionId)}/publish`)),
};
