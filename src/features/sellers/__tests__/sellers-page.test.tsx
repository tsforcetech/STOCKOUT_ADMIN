import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SellersPage from "../sellers-page";
import { RequireAuth } from "@/lib/auth/guards";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";

afterEach(() => vi.unstubAllGlobals());

const seller = (over: Record<string, unknown>) => ({
  sellerId: "11111111-1111-1111-1111-111111111111",
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

const routes = [{ element: <RequireAuth />, children: [{ path: "/sellers", element: <SellersPage /> }] }, { path: "/login", element: <div>login</div> }];

describe("SellersPage", () => {
  it("renders real seller data with stats computed from the list", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    mockFetch([
      ...sessionRoutes(["sellers.view"]),
      {
        method: "GET",
        path: "/api/v1/admin/marketplace/sellers",
        respond: () => ({ body: { success: true, data: [seller({}), seller({ sellerId: "22222222-2222-2222-2222-222222222222", displayName: "Gulf MEP Supplies", verificationStatus: "VERIFIED", onboardingStatus: "COMPLETED" })] } }),
      },
    ]);
    renderWithApp(routes, "/sellers");
    expect(await screen.findByText("Al Noor Building Materials")).toBeInTheDocument();
    expect(screen.getByText("Gulf MEP Supplies")).toBeInTheDocument();
    // No approve buttons without sellers.verify permission.
    expect(screen.queryByRole("button", { name: "Approve KYC" })).not.toBeInTheDocument();
  });

  it("approves a pending seller with the row version and refreshes", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    let approved = false;
    const { calls } = mockFetch([
      ...sessionRoutes(["sellers.view", "sellers.verify"]),
      { method: "GET", path: "/api/v1/admin/marketplace/sellers", respond: () => ({ body: { success: true, data: [seller(approved ? { verificationStatus: "VERIFIED", onboardingStatus: "COMPLETED" } : {})] } }) },
      {
        method: "POST",
        path: "/api/v1/admin/marketplace/sellers/11111111-1111-1111-1111-111111111111/verify",
        respond: () => {
          approved = true;
          return { body: { success: true, data: seller({ verificationStatus: "VERIFIED" }) } };
        },
      },
    ]);
    renderWithApp(routes, "/sellers");
    await userEvent.click(await screen.findByRole("button", { name: "Approve KYC" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith("/verify"))).toBe(true));
    expect(calls.find((c) => c.url.pathname.endsWith("/verify"))?.body).toEqual({ action: "APPROVE", expectedRowVersion: "AAAAAAAAB9E=" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Approve KYC" })).not.toBeInTheDocument());
  });

  it("shows an error state with retry when the API fails", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    mockFetch([...sessionRoutes(["sellers.view"]), { method: "GET", path: "/api/v1/admin/marketplace/sellers", respond: () => ({ status: 503 }) }]);
    renderWithApp(routes, "/sellers");
    expect(await screen.findByText("Couldn't load this data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
  });
});
