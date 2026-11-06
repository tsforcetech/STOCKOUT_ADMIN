import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BuyersPage from "../buyers-page";
import { RequireAuth } from "@/lib/auth/guards";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";

afterEach(() => vi.unstubAllGlobals());

const B1 = "33333333-3333-4333-8333-333333333333";
const B2 = "44444444-4444-4444-8444-444444444444";
const listItem = (over: Record<string, unknown> = {}) => ({
  buyerId: B1, legalName: "", tradingName: "", fullName: "Aisha Rahman", documentType: "EMIRATES_ID", issuingCountry: "ARE", documentExpiresAtUtc: "2029-01-01T00:00:00",
  requiresReverification: false, reverificationReason: null, reverificationRequiredAtUtc: null, tradeLicenseNumber: "", issuingAuthority: "", tradeLicenseExpiresAtUtc: null, isVatRegistered: false, taxRegistrationNumber: null,
  orgStatus: "ACTIVE", verificationStatus: "SUBMITTED", submittedAtUtc: "2026-11-05T08:00:00", verifiedAtUtc: null, rejectedAtUtc: null, suspendedAtUtc: null,
  rejectionReason: null, suspensionReason: null, createdAtUtc: "2026-11-01T00:00:00", updatedAtUtc: "2026-11-05T08:00:00", rowVersion: "AAAAAAAAC00=", ...over,
});
const profile = (over: Record<string, unknown> = {}) => ({
  ...listItem(), organizationId: "o-1", organizationType: "INDIVIDUAL", issuingAuthority: null, tradeLicenseNumber: null, tradeLicenseIssuedAtUtc: null, hasVatDeclaration: false,
  signatoryName: null, signatoryEmail: null, signatoryPhone: null, signatoryAuthorityRole: null, businessContactEmail: null, businessContactPhone: null,
  addressLine1: null, addressLine2: null, city: null, stateOrEmirate: null, postalCode: null, countryCode: "ARE", defaultCurrency: "AED", bankName: null, bankAccountNumber: null,
  bankIban: null, bankSwiftCode: null, bankBeneficiaryName: null, canPurchase: false, mandatoryDocumentsComplete: false, missingDocumentCategories: [], pendingPolicies: [], documents: [],
  accountHolderUserId: "u-77", nationality: "ARE", documentNumber: "784-1990-1234567-1", mobileNumber: "+971501234567", residentialAddress: "Villa 12, Al Barsha, Dubai", ...over,
});
const idDoc = (over: Record<string, unknown> = {}) => ({
  buyerDocumentId: "d-1", buyerId: B1, documentType: "EMIRATES_ID", fileAssetId: "f-1", documentNumber: "784-1990-1234567-1", issuedAt: null, expiresAt: "2029-01-01T00:00:00",
  verificationStatus: "PENDING", reviewRemark: null, containsSignatoryId: null, containsSignatoryAuthorityProof: null, verifiedSignatoryId: null, verifiedSignatoryAuthorityProof: null,
  reviewedByUserId: null, reviewedAtUtc: null, createdAtUtc: "2026-11-05T07:55:00", downloadUrl: "https://media.example/d-1.pdf", expiresAtUtc: "2999-01-01T00:00:00Z", ...over,
});
const env = (data: unknown) => ({ body: { success: true, data } });
const routes = [{ element: <RequireAuth />, children: [{ path: "/buyers", element: <BuyersPage /> }] }, { path: "/login", element: <div>login</div> }];

describe("Admin buyers (one-ID verification, Q1–Q15)", () => {
  it("lists the review queue first and shows re-verification buyers on their own tab", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    mockFetch([
      ...sessionRoutes(["buyers.view"]),
      { method: "GET", path: "/api/v1/admin/marketplace/buyers", respond: () => env([listItem(), listItem({ buyerId: B2, fullName: "Omar Khan", verificationStatus: "VERIFIED", requiresReverification: true, submittedAtUtc: null })]) },
    ]);
    renderWithApp(routes, "/buyers");
    const table = await screen.findByRole("table", { name: "Buyers" });
    expect(await within(table).findByText("Aisha Rahman")).toBeInTheDocument(); // default tab: awaiting review
    expect(within(table).queryByText("Omar Khan")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Re-verification/ }));
    expect(await within(table).findByText("Omar Khan")).toBeInTheDocument();
    expect(within(table).getByText("Re-verify")).toBeInTheDocument();
  });

  it("verifies the ID document, then approves the buyer with a fresh rowVersion", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    let docStatus = "PENDING";
    const posts: Array<{ path: string; body: unknown }> = [];
    mockFetch([
      ...sessionRoutes(["buyers.view", "buyers.verify", "buyers.reject"]),
      { method: "GET", path: "/api/v1/admin/marketplace/buyers", respond: () => env([listItem()]) },
      { method: "GET", path: `/api/v1/admin/marketplace/buyers/${B1}`, respond: () => env(profile({ rowVersion: docStatus === "VERIFIED" ? "AAAAAAAAC1E=" : "AAAAAAAAC00=" })) },
      { method: "GET", path: `/api/v1/admin/marketplace/buyers/${B1}/documents`, respond: () => env([idDoc({ verificationStatus: docStatus })]) },
      { method: "GET", path: `/api/v1/admin/marketplace/buyers/${B1}/history`, respond: () => env([{ historyId: "h1", buyerId: B1, fromStatus: "DRAFT", toStatus: "SUBMITTED", reason: null, changedByUserId: "u-77", changedAtUtc: "2026-11-05T08:00:00", comments: null }]) },
      { method: "POST", path: `/api/v1/admin/marketplace/buyers/${B1}/documents/d-1/review`, respond: ({ body }) => (posts.push({ path: "review", body }), (docStatus = "VERIFIED"), env(idDoc({ verificationStatus: "VERIFIED" }))) },
      { method: "POST", path: `/api/v1/admin/marketplace/buyers/${B1}/verify`, respond: ({ body }) => (posts.push({ path: "verify", body }), env(profile({ verificationStatus: "VERIFIED", canPurchase: true }))) },
    ]);
    renderWithApp(routes, "/buyers");
    await userEvent.click(await screen.findByText("Aisha Rahman"));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("784-1990-1234567-1", { selector: "dd" })).toBeInTheDocument();
    expect(within(dialog).getByText("Villa 12, Al Barsha, Dubai")).toBeInTheDocument();
    expect(within(dialog).getByText(/Review target: within 2 business days/)).toBeInTheDocument();
    // Approve is disabled until the ID document is verified.
    expect(within(dialog).getByRole("button", { name: /Approve buyer/ })).toBeDisabled();
    await userEvent.click(await within(dialog).findByRole("button", { name: /Verify document/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Verify document" }));
    await waitFor(() => expect(posts[0]).toEqual({ path: "review", body: { action: "VERIFY", reviewRemark: null } }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /Approve buyer/ })).toBeEnabled());
    await userEvent.click(within(dialog).getByRole("button", { name: /Approve buyer/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(posts[1]).toEqual({ path: "verify", body: { expectedRowVersion: "AAAAAAAAC1E=" } }));
  });

  it("rejecting a document needs a note, and a version conflict shows a reload message", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    const posts: unknown[] = [];
    mockFetch([
      ...sessionRoutes(["buyers.view", "buyers.verify", "buyers.reject", "buyers.suspend"]),
      { method: "GET", path: "/api/v1/admin/marketplace/buyers", respond: () => env([listItem()]) },
      { method: "GET", path: `/api/v1/admin/marketplace/buyers/${B1}`, respond: () => env(profile()) },
      { method: "GET", path: `/api/v1/admin/marketplace/buyers/${B1}/documents`, respond: () => env([idDoc()]) },
      { method: "GET", path: `/api/v1/admin/marketplace/buyers/${B1}/history`, respond: () => env([]) },
      { method: "POST", path: `/api/v1/admin/marketplace/buyers/${B1}/documents/d-1/review`, respond: ({ body }) => (posts.push(body), env(idDoc({ verificationStatus: "REJECTED" }))) },
      { method: "POST", path: `/api/v1/admin/marketplace/buyers/${B1}/suspend`, respond: () => ({ status: 409, body: { status: 409, title: "Conflict", code: "MARKETPLACE_BUYER_VERSION_CONFLICT" } }) },
    ]);
    renderWithApp(routes, "/buyers");
    await userEvent.click(await screen.findByText("Aisha Rahman"));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(await within(dialog).findByRole("button", { name: /Reject document/ }));
    const confirm = await screen.findByRole("button", { name: "Reject document" });
    await userEvent.click(confirm); // note required
    expect(await screen.findByText("A reason is required.")).toBeInTheDocument();
    expect(posts).toEqual([]);
    await userEvent.type(screen.getByLabelText(/Note for the buyer/), "Photo is blurred; upload a clear copy.");
    await userEvent.click(confirm);
    await waitFor(() => expect(posts[0]).toEqual({ action: "REJECT", reviewRemark: "Photo is blurred; upload a clear copy." }));

    await userEvent.click(within(dialog).getByRole("button", { name: /Suspend/ }));
    await userEvent.type(await screen.findByLabelText(/Reason \(recorded on the buyer\)/), "ID expired; revoking purchase rights.");
    await userEvent.click(screen.getByRole("button", { name: "Suspend" }));
    expect(await screen.findByText(/The buyer changed since you opened it/)).toBeInTheDocument();
  });
});
