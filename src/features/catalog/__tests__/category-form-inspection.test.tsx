import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithApp } from "@/test/render";
import { mockFetch } from "@/test/http";
import type { AdminCategoryResponse } from "@/api/types/catalog-taxonomy";
import { CategoryFormDialog } from "../components/category-form-dialog";

afterEach(() => vi.unstubAllGlobals());

const cat: AdminCategoryResponse = {
  categoryId: "c-1",
  code: "PLUMBING_PPR",
  slug: "ppr-pipes",
  description: "PPR pipes and fittings",
  displayOrder: 10,
  parentCategoryId: null,
  parentCategoryName: null,
  name: "PPR Pipes & Fittings",
  isActive: true,
  requiresPhysicalInspection: false,
  version: 3,
  createdAtUtc: "2026-10-19T10:00:00",
  updatedAtUtc: null,
};

describe("category form — physical inspection", () => {
  it("sends requiresPhysicalInspection when it's switched on", async () => {
    const { calls } = mockFetch([{ method: "PUT", path: "/api/v1/admin/catalog/categories/c-1", respond: () => ({ body: { success: true, data: { ...cat, requiresPhysicalInspection: true, version: 4 } } }) }]);
    renderWithApp([{ path: "/", element: <CategoryFormDialog open category={cat} allCategories={[cat]} onOpenChange={() => undefined} /> }], "/");
    const toggle = await screen.findByRole("switch", { name: "Requires physical inspection" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await vi.waitFor(() => expect(calls.some((c) => c.url.pathname === "/api/v1/admin/catalog/categories/c-1")).toBe(true));
    expect(calls.find((c) => c.url.pathname === "/api/v1/admin/catalog/categories/c-1")!.body).toMatchObject({ requiresPhysicalInspection: true, expectedVersion: 3 });
  });
});
