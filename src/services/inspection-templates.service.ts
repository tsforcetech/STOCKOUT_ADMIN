import { http } from "@/lib/api/client";
import type {
  ChecklistTemplateDto,
  ChecklistTemplateItemDto,
  CreateChecklistTemplateRequest,
  ReplaceTemplateItemsRequest,
  UpdateChecklistTemplateRequest,
} from "@/api/types/catalog-moderation";

/**
 * Inspection checklist templates (catalog-listing): /api/v1/admin/catalog/inspection-templates.
 * Bodies are bare DTOs (NO { success, data } envelope). Every route, including GETs, requires
 * `inspections.templates.manage`.
 * Backend behaviour: list/create/update/activate/deactivate return `items: []` — only the detail
 * GET returns the template's items. Contract: docs/contracts/catalog-moderation-inspections.md §5
 */
const BASE = "/api/v1/admin/catalog/inspection-templates";
const seg = encodeURIComponent;

export const inspectionTemplatesService = {
  list: (signal?: AbortSignal) => http.get<ChecklistTemplateDto[]>(BASE, { signal }),
  get: (templateId: string, signal?: AbortSignal) => http.get<ChecklistTemplateDto>(`${BASE}/${seg(templateId)}`, { signal }),
  create: (body: CreateChecklistTemplateRequest) => http.post<ChecklistTemplateDto>(BASE, body),
  update: (templateId: string, body: UpdateChecklistTemplateRequest) => http.put<ChecklistTemplateDto>(`${BASE}/${seg(templateId)}`, body),
  activate: (templateId: string) => http.post<ChecklistTemplateDto>(`${BASE}/${seg(templateId)}/activate`),
  deactivate: (templateId: string) => http.post<ChecklistTemplateDto>(`${BASE}/${seg(templateId)}/deactivate`),
  /** Full replace (delete + insert). No rowVersion; allowed on active templates. */
  replaceItems: (templateId: string, body: ReplaceTemplateItemsRequest) => http.put<ChecklistTemplateItemDto[]>(`${BASE}/${seg(templateId)}/items`, body),
};
