import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AdminCategoryListQuery } from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { inspectionTemplatesService } from "@/services/inspection-templates.service";

/**
 * Query keys for the catalog module. Category mapping keys sit under the category detail key so
 * invalidating a category (its version changes on every mapping PUT) refreshes its mappings too.
 */
export const catalogKeys = {
  categories: ["catalog", "categories"] as const,
  categoryList: (query: AdminCategoryListQuery) => ["catalog", "categories", "list", query] as const,
  category: (id: string) => ["catalog", "categories", "detail", id] as const,
  categoryAttributes: (id: string) => ["catalog", "categories", "detail", id, "attributes"] as const,
  categoryBrands: (id: string) => ["catalog", "categories", "detail", id, "brands"] as const,
  categoryConditions: (id: string) => ["catalog", "categories", "detail", id, "conditions"] as const,
  categoryUnits: (id: string) => ["catalog", "categories", "detail", id, "units"] as const,
  attributes: ["catalog", "attributes"] as const,
  attributeOptions: (id: string) => ["catalog", "attributes", id, "options"] as const,
  brands: ["catalog", "brands"] as const,
  units: ["catalog", "units"] as const,
  conditions: ["catalog", "conditions"] as const,
  conditionGrades: (id: string) => ["catalog", "conditions", id, "grades"] as const,
  grades: ["catalog", "grades"] as const,
  templates: ["catalog", "inspection-templates"] as const,
  template: (id: string) => ["catalog", "inspection-templates", "detail", id] as const,
};

export function useCategoriesQuery(query: AdminCategoryListQuery = {}, enabled = true) {
  return useQuery({ queryKey: catalogKeys.categoryList(query), queryFn: ({ signal }) => catalogService.categories(query, signal), enabled, placeholderData: keepPreviousData });
}

export function useCategoryQuery(id: string, enabled = true) {
  return useQuery({ queryKey: catalogKeys.category(id), queryFn: ({ signal }) => catalogService.category(id, signal), enabled: enabled && Boolean(id) });
}

export function useAttributesQuery(enabled = true) {
  return useQuery({ queryKey: catalogKeys.attributes, queryFn: ({ signal }) => catalogService.attributes(signal), enabled });
}

export function useAttributeOptionsQuery(id: string, enabled = true) {
  return useQuery({ queryKey: catalogKeys.attributeOptions(id), queryFn: ({ signal }) => catalogService.attributeOptions(id, signal), enabled: enabled && Boolean(id) });
}

export function useBrandsQuery(enabled = true) {
  return useQuery({ queryKey: catalogKeys.brands, queryFn: ({ signal }) => catalogService.brands(signal), enabled });
}

export function useUnitsQuery(enabled = true) {
  return useQuery({ queryKey: catalogKeys.units, queryFn: ({ signal }) => catalogService.units(signal), enabled });
}

export function useConditionsQuery(enabled = true) {
  return useQuery({ queryKey: catalogKeys.conditions, queryFn: ({ signal }) => catalogService.conditions(signal), enabled });
}

export function useConditionGradesQuery(id: string, enabled = true) {
  return useQuery({ queryKey: catalogKeys.conditionGrades(id), queryFn: ({ signal }) => catalogService.conditionGrades(id, signal), enabled: enabled && Boolean(id) });
}

export function useGradesQuery(enabled = true) {
  return useQuery({ queryKey: catalogKeys.grades, queryFn: ({ signal }) => catalogService.grades(signal), enabled });
}

export function useTemplatesQuery(enabled = true) {
  return useQuery({ queryKey: catalogKeys.templates, queryFn: ({ signal }) => inspectionTemplatesService.list(signal), enabled });
}

export function useTemplateQuery(id: string, enabled = true) {
  return useQuery({ queryKey: catalogKeys.template(id), queryFn: ({ signal }) => inspectionTemplatesService.get(id, signal), enabled: enabled && Boolean(id) });
}
