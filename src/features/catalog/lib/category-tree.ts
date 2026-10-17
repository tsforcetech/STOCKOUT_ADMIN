import type { AdminCategoryResponse } from "@/api/types/catalog-taxonomy";

/** The admin list is flat (adjacency list, no depth limit): tree helpers are client-side. */

export function indexCategories(list: readonly AdminCategoryResponse[]): Map<string, AdminCategoryResponse> {
  return new Map(list.map((c) => [c.categoryId, c]));
}

/** "Root › Child › Leaf" — guards against cycles in malformed data. */
export function categoryPath(id: string, byId: Map<string, AdminCategoryResponse>, separator = " › "): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.categoryId)) {
    seen.add(current.categoryId);
    names.unshift(current.name);
    current = current.parentCategoryId ? byId.get(current.parentCategoryId) : undefined;
  }
  return names.join(separator);
}

/** All descendant ids of `id` (used to stop a category being moved under itself). */
export function descendantIds(id: string, list: readonly AdminCategoryResponse[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const c of list) {
    if (!c.parentCategoryId) continue;
    const arr = children.get(c.parentCategoryId) ?? [];
    arr.push(c.categoryId);
    children.set(c.parentCategoryId, arr);
  }
  const result = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop() as string;
    if (result.has(next)) continue;
    result.add(next);
    stack.push(...(children.get(next) ?? []));
  }
  return result;
}

export function childCounts(list: readonly AdminCategoryResponse[]): Map<string, { total: number; active: number }> {
  const counts = new Map<string, { total: number; active: number }>();
  for (const c of list) {
    if (!c.parentCategoryId) continue;
    const entry = counts.get(c.parentCategoryId) ?? { total: 0, active: 0 };
    entry.total += 1;
    if (c.isActive) entry.active += 1;
    counts.set(c.parentCategoryId, entry);
  }
  return counts;
}

/** Categories sorted by their full path, for parent pickers. */
export function sortedByPath(list: readonly AdminCategoryResponse[]): Array<{ category: AdminCategoryResponse; path: string }> {
  const byId = indexCategories(list);
  return list.map((category) => ({ category, path: categoryPath(category.categoryId, byId) })).sort((a, b) => a.path.localeCompare(b.path));
}
