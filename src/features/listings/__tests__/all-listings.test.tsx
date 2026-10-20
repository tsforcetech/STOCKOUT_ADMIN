import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListingsPage from "../listings-page";
import { RequireAuth } from "@/lib/auth/guards";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";

afterEach(() => vi.unstubAllGlobals());

const item = (over: Record<string, unknown> = {}) => ({
  listingId: "11111111-1111-1111-1111-111111111111",
  sellerId: "22222222-2222-2222-2222-222222222222",
  listingNumber: "LST-11111111",
  title: "Steel I-Beam S355",
  categoryId: "33333333-3333-3333-3333-333333333333",
  categoryName: "Structural Sections",
  status: "DRAFT",
  currentDraftVersionId: "44444444-4444-4444-4444-444444444444",
  currentDraftVersionStatus: "APPROVED",
  publishedVersionId: null,
  primaryFileAssetId: null,
  requiresPhysicalInspection: false,
  isApprovedAwaitingPublication: true,
  isApprovedAwaitingInitialPublication: true,
  isApprovedAwaitingReplacementPublication: false,
  createdAtUtc: "2026-10-20T08:00:00",
  updatedAtUtc: "2026-10-20T09:00:00",
  publishedAtUtc: null,
  ...over,
});

const routes = [
  { element: <RequireAuth />, children: [{ path: "/listings", element: <ListingsPage /> }, { path: "/listings/:listingId/versions/:versionId", element: <div>Review page</div> }] },
  { path: "/login", element: <div>login</div> },
];

function api() {
  return mockFetch([
    ...sessionRoutes(["catalog:listings:view"]),
    { method: "GET", path: "/api/v1/admin/catalog/categories", respond: () => ({ body: { success: true, data: [] } }) },
    {
      method: "GET",
      path: "/api/v1/admin/catalog/listings",
      respond: (req) => {
        const live = req.url.searchParams.get("status") === "PUBLISHED";
        const items = live ? [item({ title: "Rebar B500B", status: "PUBLISHED", isApprovedAwaitingPublication: false, currentDraftVersionId: null, currentDraftVersionStatus: null, publishedVersionId: "55555555-5555-5555-5555-555555555555" })] : [item()];
        return { body: { success: true, data: { items, page: 1, pageSize: Number(req.url.searchParams.get("pageSize") ?? 20), totalCount: items.length } } };
      },
    },
  ]);
}

describe("Listings → All listings", () => {
  it("lists every listing, filters by state and opens the right version", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    const { calls } = api();
    const { router } = renderWithApp(routes, "/listings");
    expect(await screen.findByText("Steel I-Beam S355")).toBeInTheDocument();
    expect(screen.getAllByText("Ready to publish").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("tab", { name: "Published" }));
    expect(await screen.findByText("Rebar B500B")).toBeInTheDocument();
    expect(calls.some((c) => c.url.pathname === "/api/v1/admin/catalog/listings" && c.url.searchParams.get("status") === "PUBLISHED" && c.url.searchParams.get("pageSize") === "20")).toBe(true);

    await userEvent.click(screen.getByText("Rebar B500B"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/listings/11111111-1111-1111-1111-111111111111/versions/55555555-5555-5555-5555-555555555555"));
  });

  it("switches to a grid of cards", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    api();
    renderWithApp(routes, "/listings");
    await screen.findByText("Steel I-Beam S355");
    await userEvent.click(screen.getByRole("button", { name: "Grid view" }));
    const card = (await screen.findByText("Steel I-Beam S355")).closest("button")!;
    expect(within(card).getByText(/Structural Sections · LST-11111111/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
