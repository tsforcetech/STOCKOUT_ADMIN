import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ApprovalsPage from "../approvals-page";
import { RequireAuth } from "@/lib/auth/guards";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";

afterEach(() => vi.unstubAllGlobals());

const SELLER_ID = "11111111-1111-1111-1111-111111111111";
const seller = (over: Record<string, unknown> = {}) => ({
  sellerId: SELLER_ID,
  organizationType: "BUSINESS",
  email: "",
  legalName: null,
  displayName: "Al Noor Building Materials",
  registrationNo: null,
  countryCode: "",
  defaultCurrency: "",
  status: "ACTIVE",
  verificationStatus: "PENDING",
  onboardingStatus: "SUBMITTED",
  profileLogoAssetId: null,
  submittedAtUtc: "2026-10-16T09:00:00",
  verifiedAtUtc: null,
  rejectedAtUtc: null,
  suspendedAtUtc: null,
  createdAtUtc: "0001-01-01T00:00:00",
  updatedAtUtc: "0001-01-01T00:00:00",
  rowVersion: "AAAAAAAAB9E=",
  ...over,
});

const routes = [{ element: <RequireAuth />, children: [{ path: "/approvals", element: <ApprovalsPage /> }] }, { path: "/login", element: <div>login</div> }];

describe("Approvals → Seller KYC", () => {
  it("opens the seller review from the queue and rejects with the row version", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    let rejected = false;
    const { calls } = mockFetch([
      ...sessionRoutes(["sellers.view", "sellers.verify", "sellers.reject"]),
      { method: "GET", path: "/api/v1/admin/marketplace/sellers", respond: () => ({ body: { success: true, data: [seller(rejected ? { verificationStatus: "REJECTED", onboardingStatus: "DRAFT" } : {})] } }) },
      {
        method: "GET",
        path: `/api/v1/admin/marketplace/sellers/${SELLER_ID}`,
        respond: () => ({ body: { success: true, data: seller({ legalName: "Al Noor Building Materials LLC", registrationNo: "CN-998877", countryCode: "AE", defaultCurrency: "AED" }) } }),
      },
      {
        method: "GET",
        path: `/api/v1/admin/marketplace/sellers/${SELLER_ID}/documents`,
        respond: () => ({
          body: {
            success: true,
            data: [
              {
                sellerDocumentId: "doc-1",
                sellerId: SELLER_ID,
                documentType: "Trade licence",
                fileAssetId: "f-1",
                documentNumber: "CN-12345",
                issuedAt: null,
                expiresAt: "2027-05-01T00:00:00",
                verificationStatus: "UNVERIFIED",
                createdAtUtc: "2026-10-19T12:58:15",
                downloadUrl: "https://media.example/doc-1.pdf?sig=1",
                expiresAtUtc: "2999-01-01T00:00:00Z",
              },
            ],
          },
        }),
      },
      {
        method: "POST",
        path: `/api/v1/admin/marketplace/sellers/${SELLER_ID}/verify`,
        respond: () => {
          rejected = true;
          return { body: { success: true, data: seller({ verificationStatus: "REJECTED" }) } };
        },
      },
    ]);
    renderWithApp(routes, "/approvals?tab=kyc");
    await userEvent.click(await screen.findByRole("button", { name: "Review KYC" }));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByRole("heading", { name: "Al Noor Building Materials" })).toBeInTheDocument();
    expect(within(panel).getByText(/Submitted for verification/)).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Approve KYC/ })).toBeInTheDocument();
    // Business details come from the admin seller detail endpoint (L16).
    expect(await within(panel).findByText("Al Noor Building Materials LLC")).toBeInTheDocument();
    expect(within(panel).getByText("CN-998877")).toBeInTheDocument();
    // KYC documents come from the admin documents endpoint, with a reviewer link.
    expect(await within(panel).findByText("Trade licence")).toBeInTheDocument();
    expect(within(panel).getByText(/No\. CN-12345/)).toBeInTheDocument();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    await userEvent.click(within(panel).getByRole("button", { name: "Open" }));
    expect(openSpy).toHaveBeenCalledWith("https://media.example/doc-1.pdf?sig=1", "_blank", "noopener,noreferrer");
    openSpy.mockRestore();
    await userEvent.click(within(panel).getByRole("button", { name: /Reject KYC/ }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(calls.find((c) => c.url.pathname.endsWith("/verify"))?.body).toEqual({ action: "REJECT", expectedRowVersion: "AAAAAAAAB9E=" }));
    expect(await screen.findByText("No sellers awaiting KYC")).toBeInTheDocument();
  });

  it("hides the decision buttons without verify/reject permissions", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    mockFetch([...sessionRoutes(["sellers.view"]), { method: "GET", path: "/api/v1/admin/marketplace/sellers", respond: () => ({ body: { success: true, data: [seller()] } }) }]);
    renderWithApp(routes, "/approvals?tab=kyc");
    expect(await screen.findByRole("button", { name: "Review KYC" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve KYC" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject KYC" })).not.toBeInTheDocument();
  });
});
