import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequireAuth } from "@/lib/auth/guards";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";
import BusinessChangesPage from "../business-changes-page";
import CalendarPage from "../calendar-page";

afterEach(() => vi.unstubAllGlobals());

const ok = (data: unknown) => ({ body: { success: true, data } });
const change = {
  requestId: "r-1",
  organizationId: "o-1",
  organizationName: "Sharaco",
  organizationLegalName: "Sharaco Trading LLC",
  changeCategory: "BANK_ACCOUNT",
  status: "SUBMITTED",
  reason: "Moved banks",
  effectiveDate: "2026-10-24T00:00:00",
  reportingDeadlineUtc: "2026-10-30T00:00:00",
  isOverdue: false,
  previousValues: { bankName: "Mashreq" },
  proposedValues: { bankName: "ADCB" },
  submittedByUserId: "u-1",
  submittedAtUtc: "2026-10-26T18:40:00",
  reviewedByUserId: null,
  reviewedAtUtc: null,
  reviewNotes: null,
  createdAtUtc: "2026-10-26T18:00:00",
  updatedAtUtc: "2026-10-26T18:40:00",
  rowVersion: "AAAAAAAAAAE=",
  documents: [],
  history: [],
};
const routes = (path: string, el: React.ReactNode) => [{ element: <RequireAuth />, children: [{ path, element: el }] }, { path: "/login", element: <div>login</div> }];

describe("Admin business changes", () => {
  it("lists the paged queue in UAE time, warns about KYC re-check and requires a reason to reject", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    let rejected: unknown = null;
    mockFetch([
      ...sessionRoutes(["organizations.business_changes.view", "organizations.business_changes.approve", "organizations.business_changes.reject"]),
      { method: "GET", path: "/api/v1/admin/organizations/business-changes", respond: () => ok({ items: [change], totalCount: 1, pageNumber: 1, pageSize: 100 }) },
      { method: "POST", path: "/api/v1/admin/organizations/business-changes/r-1/reject", respond: ({ body }) => ((rejected = body), ok({ ...change, status: "REJECTED" })) },
    ]);
    const user = userEvent.setup();
    renderWithApp(routes("/business-changes", <BusinessChangesPage />), "/business-changes");
    expect(await screen.findByText("Sharaco Trading LLC")).toBeInTheDocument();
    expect(screen.getByText("30 Oct 2026, 04:00 GST")).toBeInTheDocument();
    await user.click(screen.getByText("Sharaco Trading LLC"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/sends the company back to KYC/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /Reject/ }));
    await user.click(within(dialog).getByRole("button", { name: "Reject change" }));
    expect(await within(dialog).findByText(/Enter a reason/)).toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox"), "Bank letter is unsigned");
    await user.click(within(dialog).getByRole("button", { name: "Reject change" }));
    await waitFor(() => expect(rejected).toEqual({ rejectionReason: "Bank letter is unsigned" }));
  });
});

describe("Admin UAE calendar", () => {
  it("confirms a provisional holiday only with complete official evidence and attestation", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    let confirmed: unknown = null;
    const year = new Date().getFullYear();
    mockFetch([
      ...sessionRoutes(["organizations.calendar.view", "organizations.calendar.manage", "organizations.calendar.holidays.confirm"]),
      {
        method: "GET",
        path: "/api/v1/admin/calendar/configuration",
        respond: () => ok({ calendarConfigId: "c-1", calendarCode: "UAE_STANDARD", calendarName: "UAE Federal Standard Business Calendar", weekendDays: "6,0", maxSupportedYear: 2027, maxApprovedYear: 2026, isActive: true, updatedAtUtc: "2026-10-27T10:51:47" }),
      },
      {
        method: "GET",
        path: "/api/v1/admin/calendar/holidays",
        respond: () =>
          ok([
            { publicHolidayId: "h-1", calendarCode: "UAE_STANDARD", holidayCode: "EID", holidayName: "Eid Al Adha Day 1", holidayDate: `${year}-06-17T00:00:00`, isObserved: true, isOverride: false, isOfficiallyConfirmed: false, approvalStatus: "PROVISIONAL", sourceReference: null, confirmedAtUtc: null, updatedAtUtc: "2026-10-01T00:00:00" },
          ]),
      },
      { method: "POST", path: "/api/v1/admin/calendar/holidays/h-1/confirm", respond: ({ body }) => ((confirmed = body), ok({})) },
    ]);
    const user = userEvent.setup();
    renderWithApp(routes("/calendar", <CalendarPage />), "/calendar");
    expect(await screen.findByText("Saturday & Sunday")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Confirm/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Issuing authority/), "UAE Cabinet");
    await user.type(within(dialog).getByLabelText(/Reference/), "CAB-RES-2026-27");
    await user.type(within(dialog).getByLabelText(/Decree or announcement title/), "Cabinet Resolution No. 27 of 2026");
    await user.type(within(dialog).getByLabelText(/Publication date/), "2026-05-19");
    await user.type(within(dialog).getByLabelText(/How you verified/), "Checked the Federal Gazette entry.");
    await user.type(within(dialog).getByLabelText(/Official publication URL/), "https://example.com/x");
    await user.click(within(dialog).getByRole("button", { name: /Confirm holiday/ }));
    expect(await within(dialog).findByText(/real official publication URL/)).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText(/Official publication URL/));
    await user.click(within(dialog).getByRole("button", { name: /Confirm holiday/ }));
    expect(await within(dialog).findByText(/Tick the attestation/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: /Confirm holiday/ }));
    await waitFor(() =>
      expect(confirmed).toEqual({
        sourceAuthority: "UAE Cabinet",
        sourceDocumentTitle: "Cabinet Resolution No. 27 of 2026",
        publicationReferenceNumber: "CAB-RES-2026-27",
        publicationDate: "2026-05-19",
        verificationRemarks: "Checked the Federal Gazette entry.",
        attestationConfirmed: true,
        officialPublicationUrl: null,
        evidenceMediaAssetId: null,
      }),
    );
  });
});
