import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListingsPage from "../listings-page";
import { RequireAuth } from "@/lib/auth/guards";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";

afterEach(() => vi.unstubAllGlobals());

const L1 = "11111111-1111-1111-1111-111111111111";
const L2 = "22222222-1111-1111-1111-111111111111";
const L3 = "33333333-1111-1111-1111-111111111111";
const V = (l: string) => `${l.slice(0, 8)}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
const queueItem = (l: string, title: string, inspection = false) => ({
  listingId: l, listingVersionId: V(l), versionNumber: 1, title, categoryId: "c-1", categoryName: "Cables", sellerId: "s-1", pricingMode: "FIXED_PRICE",
  basePrice: 10, currency: "AED", submittedAtUtc: "2026-11-17T08:00:00", requiresPhysicalInspection: inspection,
});
const detail = (l: string, status: string) => ({ candidateVersion: { listingId: l, listingVersionId: V(l), versionStatus: status, listingRowVersion: `rv-${l.slice(0, 2)}`, categoryRequiresPhysicalInspection: l === L2 }, candidateAttributes: [], mediaAssets: [], publishedVersion: null, publishedAttributes: [], history: [] });
const routes = [
  { element: <RequireAuth />, children: [{ path: "/listings", element: <ListingsPage /> }] },
  { path: "/login", element: <div>login</div> },
];

describe("Listings → fast approval", () => {
  it("approves the selected queue items one by one: no-inspection ones are published, inspection ones go to inspection, changed ones are skipped", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    const status: Record<string, string> = { [L1]: "UNDER_REVIEW", [L2]: "UNDER_REVIEW", [L3]: "CHANGES_REQUIRED" };
    const { calls } = mockFetch([
      ...sessionRoutes(["catalog:listings:review", "catalog:listings:approve", "catalog:listings:publish"]),
      { method: "GET", path: "/api/v1/admin/catalog/listings/moderation/queue", respond: () => ({ body: { totalCount: 3, page: 1, pageSize: 20, items: [queueItem(L1, "Copper cable"), queueItem(L2, "Fire pump", true), queueItem(L3, "Old item")] } }) },
      { method: "GET", path: /\/versions\/[^/]+\/moderation$/, respond: ({ url }) => { const l = url.pathname.split("/")[6]; return { body: detail(l, status[l]) }; } },
      {
        method: "POST",
        path: /\/moderation\/decide$/,
        respond: ({ url }) => {
          const l = url.pathname.split("/")[6];
          const insp = l === L2;
          status[l] = insp ? "INSPECTION_REQUIRED" : "APPROVED";
          return { body: { moderationId: "m", listingId: l, listingVersionId: V(l), decision: "APPROVE", versionStatus: status[l], inspectionId: insp ? "i-1" : null, inspectionNo: insp ? "INS-0007" : null, reviewedAtUtc: "", rowVersion: `new-${l.slice(0, 2)}` } };
        },
      },
      { method: "GET", path: /\/publication-eligibility$/, respond: () => ({ body: { listingId: L1, candidateVersionId: V(L1), isEligible: true, gates: {}, blockers: [] } }) },
      { method: "POST", path: /\/publish$/, respond: () => ({ body: { listingId: L1, publishedVersionId: V(L1), rowVersion: "p" } }) },
    ]);
    renderWithApp(routes, "/listings?tab=queue");
    await screen.findByText("Copper cable");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all rows on this page" }));
    await userEvent.click(screen.getByRole("button", { name: "Approve Selected" }));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText(/1 of these is in a category that needs a physical inspection/)).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole("button", { name: "Approve 3" }));
    expect(await within(dlg).findByText(/Finished: 2 done, 1 skipped/)).toBeInTheDocument();
    expect(within(dlg).getByText("Approved and published.")).toBeInTheDocument();
    expect(within(dlg).getByText("Approved, sent for inspection (INS-0007).")).toBeInTheDocument();
    expect(within(dlg).getByText(/No longer under review/)).toBeInTheDocument();

    const decides = calls.filter((c) => c.method === "POST" && c.url.pathname.endsWith("/decide"));
    expect(decides).toHaveLength(2); // the changed listing is never decided
    expect(decides[0].body).toEqual({ decision: "APPROVE", reasonCode: null, sellerNotes: null, internalNotes: null, requiresInspectionOverride: null, expectedRowVersion: "rv-11" });
    const publishes = calls.filter((c) => c.method === "POST" && c.url.pathname.endsWith("/publish"));
    expect(publishes).toHaveLength(1); // only the no-inspection listing
    expect(publishes[0].body).toEqual({ expectedRowVersion: "new-11" });
  });

  it("without approve permission there is no selection or bulk action", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    mockFetch([
      ...sessionRoutes(["catalog:listings:review"]),
      { method: "GET", path: "/api/v1/admin/catalog/listings/moderation/queue", respond: () => ({ body: { totalCount: 1, page: 1, pageSize: 20, items: [queueItem(L1, "Copper cable")] } }) },
    ]);
    renderWithApp(routes, "/listings?tab=queue");
    await screen.findByText("Copper cable");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("publishes selected ready-to-publish listings, skipping ones that fail a publication check", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    const item = (l: string, title: string) => ({
      listingId: l, sellerId: "s-1", listingNumber: `LST-${l.slice(0, 8)}`, title, categoryId: "c-1", categoryName: "Cables", status: "DRAFT", currentDraftVersionId: V(l), currentDraftVersionStatus: "APPROVED",
      publishedVersionId: null, primaryFileAssetId: null, requiresPhysicalInspection: true, isApprovedAwaitingPublication: true, isApprovedAwaitingInitialPublication: true, isApprovedAwaitingReplacementPublication: false,
      createdAtUtc: "2026-11-10T08:00:00", updatedAtUtc: null, publishedAtUtc: null,
    });
    const { calls } = mockFetch([
      ...sessionRoutes(["catalog:listings:view", "catalog:listings:publish"]),
      { method: "GET", path: "/api/v1/admin/catalog/categories", respond: () => ({ body: { success: true, data: [] } }) },
      { method: "GET", path: "/api/v1/admin/catalog/listings", respond: () => ({ body: { success: true, data: { items: [item(L1, "Inspected cable"), item(L2, "Inspected pump")], page: 1, pageSize: 20, totalCount: 2 } } }) },
      { method: "GET", path: /\/versions\/[^/]+\/moderation$/, respond: ({ url }) => ({ body: detail(url.pathname.split("/")[6], "APPROVED") }) },
      { method: "GET", path: /\/publication-eligibility$/, respond: ({ url }) => (url.pathname.includes(L2) ? { body: { isEligible: false, gates: {}, blockers: ["Primary image missing"] } } : { body: { isEligible: true, gates: {}, blockers: [] } }) },
      { method: "POST", path: /\/publish$/, respond: () => ({ body: { rowVersion: "p" } }) },
    ]);
    renderWithApp(routes, "/listings?view=ready");
    await screen.findByText("Inspected cable");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all rows on this page" }));
    await userEvent.click(screen.getByRole("button", { name: "Publish Selected" }));
    const dlg = await screen.findByRole("dialog");
    await userEvent.click(within(dlg).getByRole("button", { name: "Publish 2" }));
    expect(await within(dlg).findByText(/Finished: 1 done, 1 skipped/)).toBeInTheDocument();
    expect(within(dlg).getByText("Primary image missing")).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((c) => c.method === "POST" && c.url.pathname.endsWith("/publish"))).toHaveLength(1));
    expect(calls.find((c) => c.url.pathname.endsWith("/publish"))?.body).toEqual({ expectedRowVersion: "rv-11" });
  });

  it("approves from All listings → Under review in the grid, and shows draft photos through the reviewer link", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    const item = (l: string, title: string, over: object = {}) => ({
      listingId: l, sellerId: "s-1", listingNumber: `LST-${l.slice(0, 8)}`, title, categoryId: "c-1", categoryName: "GI fittings", status: "DRAFT", currentDraftVersionId: V(l), currentDraftVersionStatus: "UNDER_REVIEW",
      publishedVersionId: null, primaryFileAssetId: `f-${l.slice(0, 2)}`, requiresPhysicalInspection: false, isApprovedAwaitingPublication: false, isApprovedAwaitingInitialPublication: false, isApprovedAwaitingReplacementPublication: false,
      createdAtUtc: "2026-11-17T08:00:00", updatedAtUtc: null, publishedAtUtc: null, ...over,
    });
    const status: Record<string, string> = { [L1]: "UNDER_REVIEW", [L2]: "UNDER_REVIEW" };
    const { calls } = mockFetch([
      ...sessionRoutes(["catalog:listings:view", "catalog:listings:review", "catalog:listings:approve"]),
      { method: "GET", path: "/api/v1/admin/catalog/categories", respond: () => ({ body: { success: true, data: [] } }) },
      { method: "GET", path: "/api/v1/admin/catalog/listings", respond: () => ({ body: { success: true, data: { items: [item(L1, "1 GI TEE"), item(L2, "2 GI ELBOW")], page: 1, pageSize: 20, totalCount: 2 } } }) },
      {
        method: "GET",
        path: /\/versions\/[^/]+\/moderation$/,
        respond: ({ url }) => {
          const l = url.pathname.split("/")[6];
          return { body: { ...detail(l, status[l]), mediaAssets: [{ listingMediaAssetId: "m", fileAssetId: `f-${l.slice(0, 2)}`, isPrimary: true, displayOrder: 1, downloadUrl: `https://media.example/${l.slice(0, 2)}.jpg?sig=1`, expiresAtUtc: "2999-01-01T00:00:00Z" }] } };
        },
      },
      { method: "POST", path: /\/moderation\/decide$/, respond: ({ url }) => { const l = url.pathname.split("/")[6]; status[l] = "APPROVED"; return { body: { listingId: l, listingVersionId: V(l), decision: "APPROVE", versionStatus: "APPROVED", inspectionId: null, inspectionNo: null, reviewedAtUtc: "", rowVersion: "n" } }; } },
    ]);
    const { container } = renderWithApp(routes, "/listings?view=review&layout=grid");
    await screen.findByText("1 GI TEE");
    // Draft photos aren't public: the card uses the reviewer's presigned URL instead of the public file route.
    await waitFor(() => expect(container.querySelector('img[src="https://media.example/11.jpg?sig=1"]')).not.toBeNull());
    expect(container.querySelector('img[src*="/api/v1/files/"]')).toBeNull();

    await userEvent.click(screen.getByRole("checkbox", { name: "Select 1 GI TEE" }));
    await userEvent.click(screen.getByRole("button", { name: "Approve Selected" }));
    const dlg = await screen.findByRole("dialog");
    await userEvent.click(within(dlg).getByRole("button", { name: "Approve 1" }));
    expect(await within(dlg).findByText(/Finished: 1 done/)).toBeInTheDocument();
    expect(calls.filter((c) => c.url.pathname.endsWith("/decide")).map((c) => c.url.pathname.split("/")[6])).toEqual([L1]);
  });
});
