import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AcceptInvitationPage from "../accept-invitation-page";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";

afterEach(() => vi.unstubAllGlobals());

const routes = [
  { path: "/platform/invitation", element: <AcceptInvitationPage /> },
  { path: "/login", element: <div>Login screen</div> },
  { path: "/", element: <div>Dashboard home</div> },
];
const signedIn = () => sessionStorage.setItem("stockout.admin.rt", "rt-1");

describe("AcceptInvitationPage", () => {
  it("asks visitors to log in and keeps the token in the return link", async () => {
    mockFetch([]);
    const { router } = renderWithApp(routes, "/platform/invitation?token=abc123");
    const login = await screen.findByRole("link", { name: "Log in to accept" });
    expect(login).toHaveAttribute("href", `/login?next=${encodeURIComponent("/platform/invitation?token=abc123")}`);
    expect(screen.getByRole("link", { name: /Create an account/ })).toHaveAttribute("href", expect.stringMatching(/\/register$/));
    await userEvent.click(login);
    expect(router.state.location.pathname).toBe("/login");
  });

  it("explains a link without a token", async () => {
    mockFetch([]);
    renderWithApp(routes, "/platform/invitation");
    expect(await screen.findByText("This link is incomplete")).toBeInTheDocument();
  });

  it("accepts for a signed-in user, reloads access and opens the console", async () => {
    signedIn();
    const { calls } = mockFetch([...sessionRoutes([]), { method: "POST", path: "/api/v1/platform/invitations/accept", respond: () => ({ body: { success: true, data: {} } }) }]);
    const { router } = renderWithApp(routes, "/platform/invitation?token=abc123");
    expect(await screen.findByText("admin@stockout.test")).toBeInTheDocument();
    const permsBefore = calls.filter((c) => c.url.pathname === "/api/v1/platform/me/permissions").length;
    await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByText("You're in")).toBeInTheDocument();
    expect(calls.find((c) => c.url.pathname === "/api/v1/platform/invitations/accept")!.body).toEqual({ token: "abc123" });
    expect(calls.filter((c) => c.url.pathname === "/api/v1/platform/me/permissions").length).toBeGreaterThan(permsBefore);
    await userEvent.click(screen.getByRole("button", { name: "Open the admin console" }));
    expect(router.state.location.pathname).toBe("/");
  });

  it("explains an email mismatch in plain words", async () => {
    signedIn();
    mockFetch([...sessionRoutes([]), { method: "POST", path: "/api/v1/platform/invitations/accept", respond: () => ({ status: 409, body: { error: "INVITATION_EMAIL_MISMATCH" } }) }]);
    renderWithApp(routes, "/platform/invitation?token=abc123");
    await userEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("sent to a different email address");
    expect(screen.getByRole("button", { name: "Log in with a different email" })).toBeInTheDocument();
  });
});
