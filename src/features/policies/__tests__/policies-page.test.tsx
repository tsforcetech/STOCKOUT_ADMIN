import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PoliciesPage from "../policies-page";
import { RequireAuth } from "@/lib/auth/guards";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const terms = {
  policyDocumentId: "d-1",
  policyCode: "STK-POL-WEB-001",
  name: "Platform Terms of Use",
  description: null,
  audience: "ALL",
  isMandatory: true,
  policyRevisionId: "r-0",
  revisionCode: "Rev. 00",
  languageCode: "en",
  effectiveFromUtc: "2026-10-21T00:00:00",
  publishedAtUtc: "2026-10-21T00:00:00",
  status: "PUBLISHED",
  title: "STOCKOUT Platform Terms of Use",
  contentHash: "abc",
};
const routes = [{ element: <RequireAuth />, children: [{ path: "/policies", element: <PoliciesPage /> }] }, { path: "/login", element: <div>login</div> }];

describe("Policies page", () => {
  it("creates a draft from the published text and publishes it", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    let created: Record<string, unknown> | null = null;
    let published = "";
    mockFetch([
      ...sessionRoutes(["policies.view", "policies.manage", "policies.publish"]),
      { method: "GET", path: "/api/v1/policies", respond: () => ({ body: { success: true, data: [terms] } }) },
      { method: "GET", path: "/api/v1/policies/STK-POL-WEB-001", respond: () => ({ body: { success: true, data: { ...terms, content: "#### 1. Scope\n\nThese Terms apply." } } }) },
      {
        method: "POST",
        path: "/api/v1/policies/admin/revisions",
        respond: ({ body }) => {
          created = body as Record<string, unknown>;
          return { body: { success: true, data: { ...terms, ...created, policyRevisionId: "r-1", status: "DRAFT", content: created.content, contentHash: "def" } } };
        },
      },
      { method: "POST", path: "/api/v1/policies/admin/revisions/r-1/publish", respond: ({ url }) => ((published = url.pathname), { body: { success: true, data: null } }) },
    ]);
    const user = userEvent.setup();
    renderWithApp(routes, "/policies");
    expect(await screen.findByText("Platform Terms of Use")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New revision of Platform Terms of Use" }));
    const dialog = await screen.findByRole("dialog", { name: /New revision/ });
    expect(within(dialog).getByLabelText(/Revision/)).toHaveValue("Rev. 01");
    await user.click(within(dialog).getByRole("button", { name: "Start from published text" }));
    await waitFor(() => expect(within(dialog).getByLabelText(/Content/)).toHaveValue("#### 1. Scope\n\nThese Terms apply."));
    await user.type(within(dialog).getByLabelText(/Content/), " Updated.");
    await user.type(within(dialog).getByLabelText(/Effective from/), "2026-11-01T00:00");
    await user.click(within(dialog).getByRole("button", { name: "Create draft" }));
    await waitFor(() => expect(created).not.toBeNull());
    expect(created).toMatchObject({ policyCode: "STK-POL-WEB-001", revisionCode: "Rev. 01", languageCode: "en", title: "STOCKOUT Platform Terms of Use", content: "#### 1. Scope\n\nThese Terms apply. Updated." });
    expect(String(created!.effectiveFromUtc)).toMatch(/^2026-1[01]-\d\dT\d\d:00:00\.000Z$/);

    const drafts = await screen.findByRole("list", { name: "Draft revisions" });
    await user.click(within(drafts).getByRole("button", { name: /Publish/ }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(published).toBe("/api/v1/policies/admin/revisions/r-1/publish"));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Draft revisions" })).not.toBeInTheDocument());
  });

  it("is read-only without manage/publish permissions", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    mockFetch([...sessionRoutes(["policies.view"]), { method: "GET", path: "/api/v1/policies", respond: () => ({ body: { success: true, data: [terms] } }) }]);
    renderWithApp(routes, "/policies");
    expect(await screen.findByText("Platform Terms of Use")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New revision" })).not.toBeInTheDocument();
  });
});
