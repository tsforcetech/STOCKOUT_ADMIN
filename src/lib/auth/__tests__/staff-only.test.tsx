import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";
import { RedirectIfAuthenticated, RequireAuth } from "@/lib/auth/guards";
import LoginPage from "@/features/auth/login-page";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});

const routes = [
  { element: <RedirectIfAuthenticated />, children: [{ path: "/login", element: <LoginPage /> }] },
  { element: <RequireAuth />, children: [{ path: "/", element: <div>Admin console</div> }] },
];

describe("Admin portal is for platform staff only", () => {
  it("a restored buyer/seller session is signed out (server session revoked) before any console page renders", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    const { calls } = mockFetch([...sessionRoutes([]), { method: "POST", path: "/api/v1/auth/logout", respond: () => ({ status: 204 }) }]);
    renderWithApp(routes, "/");
    expect(await screen.findByText(/doesn't have access to StockOut Admin/)).toBeInTheDocument();
    expect(screen.queryByText("Admin console")).not.toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.url.pathname === "/api/v1/auth/logout")).toBe(true));
  });

  it("a restored staff session (any platform role) opens the console", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    mockFetch([...sessionRoutes([], [{ code: "PlatformSupport", name: "Support" }])]);
    renderWithApp(routes, "/");
    expect(await screen.findByText("Admin console")).toBeInTheDocument();
  });
});
