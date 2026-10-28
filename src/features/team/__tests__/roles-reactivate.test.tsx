import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequireAuth } from "@/lib/auth/guards";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";
import RolesPage from "../roles-page";

afterEach(() => vi.unstubAllGlobals());

const ok = (data: unknown) => ({ body: { success: true, data } });
const role = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  platformRoleId: id,
  code: name.replace(/\s/g, ""),
  name,
  description: null,
  isSystemRole: false,
  isActive: true,
  userCount: 1,
  permissionCount: 3,
  ...extra,
});
const routes = [{ element: <RequireAuth />, children: [{ path: "/team/roles", element: <RolesPage /> }] }, { path: "/login", element: <div>login</div> }];

describe("Role reactivation (L14)", () => {
  it("offers Reactivate only on inactive custom roles and refreshes the list", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    let roles = [role("r-1", "Inspection Officer", { isActive: false }), role("r-2", "Catalog Manager"), role("r-3", "Platform Admin", { isSystemRole: true, isActive: false })];
    let reactivated = "";
    mockFetch([
      ...sessionRoutes(["roles.view", "roles.update"]),
      { method: "GET", path: "/api/v1/platform/roles", respond: () => ok(roles) },
      {
        method: "POST",
        path: "/api/v1/platform/roles/r-1/reactivate",
        respond: ({ url }) => {
          reactivated = url.pathname;
          roles = roles.map((r) => (r.platformRoleId === "r-1" ? { ...r, isActive: true } : r));
          return ok({ ...roles[0], permissions: [] });
        },
      },
    ]);
    const user = userEvent.setup();
    renderWithApp(routes, "/team/roles");
    const row = (await screen.findByText("Inspection Officer")).closest("tr")!;
    expect(screen.getAllByRole("button", { name: "Reactivate role" })).toHaveLength(1);
    await user.click(within(row).getByRole("button", { name: "Reactivate role" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reactivate" }));
    await waitFor(() => expect(reactivated).toBe("/api/v1/platform/roles/r-1/reactivate"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reactivate role" })).not.toBeInTheDocument());
  });

  it("explains SYSTEM_ROLE_PROTECTED", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    mockFetch([
      ...sessionRoutes(["roles.view", "roles.activate"]),
      { method: "GET", path: "/api/v1/platform/roles", respond: () => ok([role("r-1", "Old Role", { isActive: false })]) },
      { method: "POST", path: "/api/v1/platform/roles/r-1/reactivate", respond: () => ({ status: 409, body: { error: "SYSTEM_ROLE_PROTECTED", message: "System roles cannot be modified or reactivated." } }) },
    ]);
    const user = userEvent.setup();
    renderWithApp(routes, "/team/roles");
    await user.click(await screen.findByRole("button", { name: "Reactivate role" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reactivate" }));
    expect(await screen.findByText(/System roles are protected/)).toBeInTheDocument();
  });

  it("hides Reactivate without roles.activate or roles.update", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    mockFetch([...sessionRoutes(["roles.view"]), { method: "GET", path: "/api/v1/platform/roles", respond: () => ok([role("r-1", "Old Role", { isActive: false })]) }]);
    renderWithApp(routes, "/team/roles");
    expect(await screen.findByText("Old Role")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reactivate role" })).not.toBeInTheDocument();
  });
});
