import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequireAuth } from "@/lib/auth/guards";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";
import type { InspectionDetailDto } from "@/api/types/catalog-moderation";
import { InspectionActions } from "../detail/actions";

afterEach(() => vi.unstubAllGlobals());

const env = <T,>(data: T) => ({ body: { success: true, data } });
const user = (id: string, name: string, role: string) => ({ userId: id, email: `${name.toLowerCase()}@x.ae`, displayName: name, isEnabled: true, roles: [{ code: role, name: role }] });
const inspection = { inspectionId: "i-1", status: "PENDING", result: null, assignedInspectorUserId: null, rowVersion: "rv", responses: [], evidence: [], statusHistory: [], assignmentHistory: [] } as unknown as InspectionDetailDto;

describe("Assign inspector", () => {
  it("lists only users whose role grants inspections.perform, with a way to show everyone", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    mockFetch([
      ...sessionRoutes(["inspections.assign", "platform-users.view", "roles.view"]),
      {
        method: "GET",
        path: "/api/v1/platform/users",
        respond: () =>
          env([user("11111111-1111-1111-1111-111111111111", "Ina Inspector", "INSPECTION_001"), user("22222222-2222-2222-2222-222222222222", "Carl Cfo", "CFO")]),
      },
      {
        method: "GET",
        path: "/api/v1/platform/roles",
        respond: () =>
          env([
            { platformRoleId: "r-1", code: "INSPECTION_001", name: "INSPECTION", isActive: true, permissionCount: 2 },
            { platformRoleId: "r-2", code: "CFO", name: "CFO", isActive: true, permissionCount: 1 },
          ]),
      },
      { method: "GET", path: "/api/v1/platform/roles/r-1", respond: () => env({ code: "INSPECTION_001", permissions: [{ code: "inspections.view" }, { code: "inspections.perform" }] }) },
      { method: "GET", path: "/api/v1/platform/roles/r-2", respond: () => env({ code: "CFO", permissions: [{ code: "payments.view" }] }) },
    ]);
    renderWithApp([{ element: <RequireAuth />, children: [{ path: "/", element: <InspectionActions inspection={inspection} /> }] }, { path: "/login", element: <div>login</div> }], "/");
    await userEvent.click(await screen.findByRole("button", { name: /Assign inspector/ }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/Showing users whose role includes/)).toBeInTheDocument();
    const names = () => Array.from(dialog.querySelectorAll("select option")).map((o) => o.textContent);
    expect(names().some((n) => n?.includes("Ina Inspector"))).toBe(true);
    expect(names().some((n) => n?.includes("Carl Cfo"))).toBe(false);
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Show all platform users" }));
    expect(names().some((n) => n?.includes("Carl Cfo"))).toBe(true);
  });
});
