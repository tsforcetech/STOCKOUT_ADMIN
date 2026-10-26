import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SellersPage from "../sellers-page";
import { RequireAuth } from "@/lib/auth/guards";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";

afterEach(() => vi.unstubAllGlobals());

const SELLER_ID = "22222222-2222-2222-2222-222222222222";
const base = {
  sellerId: SELLER_ID,
  organizationType: "BUSINESS",
  email: "",
  legalName: "Gulf Surplus FZE",
  displayName: "Gulf Surplus",
  registrationNo: null,
  countryCode: "AE",
  defaultCurrency: "AED",
  status: "ACTIVE",
  verificationStatus: "PENDING",
  onboardingStatus: "SUBMITTED",
  profileLogoAssetId: null,
  submittedAtUtc: "2026-10-25T09:00:00",
  verifiedAtUtc: null,
  rejectedAtUtc: null,
  suspendedAtUtc: null,
  createdAtUtc: "2026-10-01T00:00:00",
  updatedAtUtc: "2026-10-25T00:00:00",
  rowVersion: "AAAAAAAAB9E=",
};
const detail = {
  ...base,
  tradeLicenseNumber: "FZ-88392",
  issuingAuthority: "HFZA",
  tradeLicenseIssuedAtUtc: "2024-06-01T00:00:00",
  tradeLicenseExpiresAtUtc: "2099-05-31T00:00:00",
  isVatRegistered: true,
  taxRegistrationNumber: "100998877600003",
  hasVatDeclaration: false,
  signatoryName: "A. Rahman",
  signatoryAuthorityRole: "Managing Director",
  bankName: "Mashreq Bank",
  bankIban: "AE070331234567890123456",
  missingDocumentCategories: [],
  mandatoryDocumentsComplete: true,
  pendingPolicies: [],
};
const doc = (id: string, documentType: string, over: Record<string, unknown> = {}) => ({
  sellerDocumentId: id,
  sellerId: SELLER_ID,
  documentType,
  fileAssetId: `f-${id}`,
  documentNumber: null,
  issuedAt: null,
  expiresAt: null,
  verificationStatus: "UNVERIFIED",
  createdAtUtc: "2026-10-24T10:00:00",
  downloadUrl: `https://media.example/${id}.pdf`,
  expiresAtUtc: "2999-01-01T00:00:00Z",
  ...over,
});

const routes = [{ element: <RequireAuth />, children: [{ path: "/sellers", element: <SellersPage /> }] }, { path: "/login", element: <div>login</div> }];

describe("Seller KYC review (PA-1B.1)", () => {
  it("shows the business profile, approval checks and history, and reviews a combined signatory document", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    const reviews: unknown[] = [];
    mockFetch([
      ...sessionRoutes(["sellers.view", "sellers.verify", "sellers.reject"]),
      { method: "GET", path: "/api/v1/admin/marketplace/sellers", respond: () => ({ body: { success: true, data: [base] } }) },
      { method: "GET", path: `/api/v1/admin/marketplace/sellers/${SELLER_ID}`, respond: () => ({ body: { success: true, data: detail } }) },
      {
        method: "GET",
        path: `/api/v1/admin/marketplace/sellers/${SELLER_ID}/documents`,
        respond: () => ({
          body: {
            success: true,
            data: [
              doc("d-1", "TRADE_LICENSE", { verificationStatus: "VERIFIED" }),
              doc("d-2", "VAT_CERTIFICATE_OR_DECLARATION"),
              doc("d-3", "SIGNATORY_POA_OR_PASSPORT", { containsSignatoryId: true, containsSignatoryAuthorityProof: true }),
            ],
          },
        }),
      },
      {
        method: "GET",
        path: `/api/v1/admin/marketplace/sellers/${SELLER_ID}/history`,
        respond: () => ({
          body: { success: true, data: [{ historyId: "h-1", sellerId: SELLER_ID, fromStatus: "UNVERIFIED", toStatus: "PENDING", reason: null, changedByUserId: "u-9", changedAtUtc: "2026-10-25T09:00:00", comments: "Seller submitted KYC" }] },
        }),
      },
      {
        method: "POST",
        path: /\/documents\/d-\d\/review$/,
        respond: ({ url, body }) => {
          reviews.push({ path: url.pathname, body });
          return { body: { success: true, data: doc("d-3", "SIGNATORY_POA_OR_PASSPORT", { verificationStatus: "VERIFIED" }) } };
        },
      },
    ]);
    const user = userEvent.setup();
    renderWithApp(routes, "/sellers");
    await user.click(await screen.findByText("Gulf Surplus"));
    const panel = await screen.findByRole("dialog");

    expect(await within(panel).findByText("FZ-88392")).toBeInTheDocument();
    expect(within(panel).getByText("Registered · TRN 100998877600003")).toBeInTheDocument();
    const checks = await within(panel).findByRole("list", { name: "Approval checks" });
    expect(within(checks).getByText("Trade licence: verified")).toBeInTheDocument();
    expect(within(checks).getByText("Signatory identity confirmed by a reviewer")).toBeInTheDocument();
    expect(within(checks).getByText(/general VAT upload still needs classification/)).toBeInTheDocument();
    expect(within(panel).getByText("Needs classification")).toBeInTheDocument();
    expect(await within(await within(panel).findByRole("list", { name: "Verification history" })).findByText("Seller submitted KYC")).toBeInTheDocument();

    // Generic VAT upload can't be verified without an explicit type.
    const vatRow = within(panel).getByText("VAT certificate or declaration").closest("li")!;
    await user.click(within(vatRow as HTMLElement).getByRole("button", { name: "Review" }));
    let review = await screen.findByRole("dialog", { name: "Review document" });
    await user.click(within(review).getByRole("button", { name: "Verify document" }));
    expect(await within(review).findByText(/Choose the exact document type/)).toBeInTheDocument();
    expect(reviews).toHaveLength(0);
    await user.click(within(review).getByRole("button", { name: "Cancel" }));

    // Combined signatory file: the reviewer confirms both elements explicitly.
    const sigRow = within(panel).getByText("Combined: ID and authority proof in one file").closest("li")!;
    expect(within(sigRow as HTMLElement).getByText(/Declared: identity \+ authority/)).toBeInTheDocument();
    await user.click(within(sigRow as HTMLElement).getByRole("button", { name: "Review" }));
    review = await screen.findByRole("dialog", { name: "Review document" });
    const id = within(review).getByRole("checkbox", { name: /Signatory identity/ });
    const auth = within(review).getByRole("checkbox", { name: /Authority to act/ });
    expect(id).not.toBeChecked();
    expect(auth).not.toBeChecked();
    await user.click(id);
    await user.click(auth);
    await user.type(within(review).getByRole("textbox"), "Checked against MOA");
    await user.click(within(review).getByRole("button", { name: "Verify document" }));
    await waitFor(() => expect(reviews).toHaveLength(1));
    expect(reviews[0]).toEqual({
      path: `/api/v1/admin/marketplace/sellers/${SELLER_ID}/documents/d-3/review`,
      body: { action: "VERIFY", reviewRemark: "Checked against MOA", verifiedSignatoryId: true, verifiedSignatoryAuthorityProof: true },
    });
  });

  it("requires a note to reject a document", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    const reviews: unknown[] = [];
    mockFetch([
      ...sessionRoutes(["sellers.view", "sellers.reject"]),
      { method: "GET", path: "/api/v1/admin/marketplace/sellers", respond: () => ({ body: { success: true, data: [base] } }) },
      { method: "GET", path: `/api/v1/admin/marketplace/sellers/${SELLER_ID}`, respond: () => ({ body: { success: true, data: detail } }) },
      { method: "GET", path: `/api/v1/admin/marketplace/sellers/${SELLER_ID}/documents`, respond: () => ({ body: { success: true, data: [doc("d-4", "BANK_IBAN_LETTER")] } }) },
      { method: "GET", path: `/api/v1/admin/marketplace/sellers/${SELLER_ID}/history`, respond: () => ({ body: { success: true, data: [] } }) },
      { method: "POST", path: /\/review$/, respond: ({ body }) => (reviews.push(body), { body: { success: true, data: doc("d-4", "BANK_IBAN_LETTER", { verificationStatus: "REJECTED" }) } }) },
    ]);
    const user = userEvent.setup();
    renderWithApp(routes, "/sellers");
    await user.click(await screen.findByText("Gulf Surplus"));
    const panel = await screen.findByRole("dialog");
    await user.click(await within(panel).findByRole("button", { name: "Review" }));
    const review = await screen.findByRole("dialog", { name: "Review document" });
    // Without sellers.verify the decision defaults to Reject.
    expect(within(review).getByRole("radio", { name: "Verify" })).toBeDisabled();
    await user.click(within(review).getByRole("button", { name: "Reject document" }));
    expect(await within(review).findByText(/Add a note/)).toBeInTheDocument();
    await user.type(within(review).getByRole("textbox"), "Letter is not on bank letterhead");
    await user.click(within(review).getByRole("button", { name: "Reject document" }));
    await waitFor(() => expect(reviews).toEqual([{ action: "REJECT", reviewRemark: "Letter is not on bank letterhead" }]));
  });
});
