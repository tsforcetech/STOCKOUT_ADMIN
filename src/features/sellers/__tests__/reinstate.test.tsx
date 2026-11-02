import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SellersPage from "../sellers-page";
import { reinstateChecks } from "../reinstate-dialog";
import { RequireAuth } from "@/lib/auth/guards";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";
import type { AdminSellerDocumentResponse, MarketplaceSellerDto } from "@/api/types/user-organization";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

const ID = "33333333-3333-3333-3333-333333333333";
const suspended = {
  sellerId: ID, organizationType: "BUSINESS", email: "", legalName: "Disposable UAT FZE", displayName: "Disposable UAT", registrationNo: null, countryCode: "AE", defaultCurrency: "AED",
  status: "SUSPENDED", verificationStatus: "VERIFIED", onboardingStatus: "COMPLETED", profileLogoAssetId: null, submittedAtUtc: null, verifiedAtUtc: "2026-11-01T09:00:00", rejectedAtUtc: null,
  suspendedAtUtc: "2026-11-02T09:00:00", createdAtUtc: "2026-11-01T00:00:00", updatedAtUtc: "2026-11-02T09:00:00", rowVersion: "LIST-RV",
};
const detail = { ...suspended, rowVersion: "FRESH-RV", tradeLicenseExpiresAtUtc: "2099-01-01T00:00:00", isVatRegistered: true, suspensionReason: "UAT suspension check", missingDocumentCategories: [] };
const doc = (id: string, documentType: string, over: Record<string, unknown> = {}) => ({
  sellerDocumentId: id, sellerId: ID, documentType, fileAssetId: `f-${id}`, documentNumber: null, issuedAt: null, expiresAt: null, verificationStatus: "VERIFIED", createdAtUtc: "2026-11-01T10:00:00", downloadUrl: null, ...over,
});
const docs = [doc("1", "TRADE_LICENSE"), doc("2", "VAT_CERTIFICATE"), doc("3", "EMIRATES_ID", { verifiedSignatoryId: true }), doc("4", "POWER_OF_ATTORNEY", { verifiedSignatoryAuthorityProof: true }), doc("5", "BANK_IBAN_LETTER")];
const routes = [{ element: <RequireAuth />, children: [{ path: "/sellers", element: <SellersPage /> }] }, { path: "/login", element: <div>login</div> }];

function api(permissions: string[], reinstate: (body: unknown, n: number) => { status?: number; body?: unknown }) {
  let n = 0;
  let current = detail;
  return mockFetch([
    ...sessionRoutes(permissions),
    { method: "GET", path: "/api/v1/admin/marketplace/sellers", respond: () => ({ body: { success: true, data: [current.status === "ACTIVE" ? { ...suspended, status: "ACTIVE" } : suspended] } }) },
    { method: "GET", path: `/api/v1/admin/marketplace/sellers/${ID}`, respond: () => ({ body: { success: true, data: current } }) },
    { method: "GET", path: `/api/v1/admin/marketplace/sellers/${ID}/documents`, respond: () => ({ body: { success: true, data: docs } }) },
    { method: "GET", path: `/api/v1/admin/marketplace/sellers/${ID}/history`, respond: () => ({ body: { success: true, data: [] } }) },
    {
      method: "POST",
      path: `/api/v1/admin/marketplace/sellers/${ID}/reinstate`,
      respond: ({ body }) => {
        const r = reinstate(body, ++n);
        if (!r.status || r.status < 300) current = { ...detail, status: "ACTIVE", rowVersion: "AFTER-RV" };
        return r;
      },
    },
  ]);
}

describe("A5-R1 seller reinstatement", () => {
  it("is offered only with sellers.reinstate", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    localStorage.setItem("stockout.admin.rt", "rt-1");
    api(["sellers.view", "sellers.suspend"], () => ({ body: {} }));
    renderWithApp(routes, "/sellers");
    expect(await screen.findByText("Disposable UAT")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reinstate seller" })).not.toBeInTheDocument();
  });

  it("reinstates with the fresh rowVersion and a reason, then shows the seller as Active", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    localStorage.setItem("stockout.admin.rt", "rt-1");
    const { calls } = api(["sellers.view", "sellers.reinstate"], () => ({ body: { success: true, data: { ...detail, status: "ACTIVE", rowVersion: "AFTER-RV" } } }));
    const user = userEvent.setup();
    renderWithApp(routes, "/sellers");
    await user.click(await screen.findByRole("button", { name: "Reinstate seller" }));
    const dialog = await screen.findByRole("dialog", { name: "Reinstate seller?" });
    expect(await within(dialog).findByText("UAT suspension check")).toBeInTheDocument();
    expect(await within(dialog).findByText("Signatory authority verified and not expired")).toBeInTheDocument();

    // A blank or token reason is refused before any request.
    await user.click(within(dialog).getByRole("button", { name: /Reinstate seller/ }));
    expect(await within(dialog).findByText(/at least 10 characters/)).toBeInTheDocument();
    expect(calls.some((c) => c.url.pathname.endsWith("/reinstate"))).toBe(false);

    await user.type(within(dialog).getByLabelText(/Reason/), "Trade licence and all mandatory KYC documents rechecked and compliant.");
    await user.click(within(dialog).getByRole("button", { name: /Reinstate seller/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.url.pathname.endsWith("/reinstate"))?.body).toEqual({ expectedRowVersion: "FRESH-RV", reason: "Trade licence and all mandatory KYC documents rechecked and compliant." }),
    );
    expect(await screen.findByText(/reinstated \(ACTIVE\)/)).toBeInTheDocument();
    expect(calls.filter((c) => c.url.pathname.endsWith("/reinstate"))).toHaveLength(1);
  });

  it("keeps the reason and reloads the seller after a version conflict", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    localStorage.setItem("stockout.admin.rt", "rt-1");
    const { calls } = api(["sellers.view", "sellers.reinstate"], () => ({ status: 409, body: { success: false, error: { code: "MARKETPLACE_SELLER_VERSION_CONFLICT", message: "conflict" } } }));
    const user = userEvent.setup();
    renderWithApp(routes, "/sellers");
    await user.click(await screen.findByRole("button", { name: "Reinstate seller" }));
    const dialog = await screen.findByRole("dialog", { name: "Reinstate seller?" });
    const box = within(dialog).getByLabelText(/Reason/);
    await user.type(box, "All documents rechecked today.");
    const before = calls.filter((c) => c.method === "GET" && c.url.pathname.endsWith(ID)).length;
    await user.click(within(dialog).getByRole("button", { name: /Reinstate seller/ }));
    expect(await within(dialog).findByText(/Someone else changed this seller/)).toBeInTheDocument();
    expect(box).toHaveValue("All documents rechecked today.");
    await waitFor(() => expect(calls.filter((c) => c.method === "GET" && c.url.pathname.endsWith(ID)).length).toBeGreaterThan(before + 1));
  });

  it("explains a compliance refusal", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    localStorage.setItem("stockout.admin.rt", "rt-1");
    api(["sellers.view", "sellers.reinstate"], () => ({ status: 400, body: { title: "Validation", status: 400, code: "SELLER_LICENCE_EXPIRED" } }));
    const user = userEvent.setup();
    renderWithApp(routes, "/sellers");
    await user.click(await screen.findByRole("button", { name: "Reinstate seller" }));
    const dialog = await screen.findByRole("dialog", { name: "Reinstate seller?" });
    await user.type(within(dialog).getByLabelText(/Reason/), "All documents rechecked today.");
    await user.click(within(dialog).getByRole("button", { name: /Reinstate seller/ }));
    expect(await within(dialog).findByText(/trade licence has expired/)).toBeInTheDocument();
    expect(within(dialog).getByText(/retrying now will fail again/)).toBeInTheDocument();
  });
});

describe("reinstateChecks", () => {
  const s = detail as unknown as MarketplaceSellerDto;
  const d = docs as unknown as AdminSellerDocumentResponse[];
  it("passes a compliant suspended seller", () => {
    expect(reinstateChecks(s, d).every((c) => c.ok)).toBe(true);
  });
  it("flags expired documents and licence types the reinstate procedure does not accept", () => {
    const list = [doc("1", "COMMERCIAL_REGISTER"), ...d.slice(1).map((x, i) => (i === 3 ? { ...x, expiresAt: "2020-01-01T00:00:00" } : x))] as unknown as AdminSellerDocumentResponse[];
    const failed = reinstateChecks(s, list).filter((c) => !c.ok).map((c) => c.text);
    expect(failed).toEqual([expect.stringMatching(/type reinstatement doesn't accept/), expect.stringMatching(/^Bank letter: no verified/)]);
  });
});
