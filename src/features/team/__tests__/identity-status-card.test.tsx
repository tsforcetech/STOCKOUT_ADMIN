import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";
import { IdentityStatusCard } from "../identity-status-card";

afterEach(() => vi.unstubAllGlobals());

describe("IdentityStatusCard", () => {
  it("offers only the statuses the admin may set and has no stale security warning", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    mockFetch(sessionRoutes(["platform-users.disable"]));
    renderWithApp([{ path: "/", element: <IdentityStatusCard userId="u-9" userName="Sam" /> }], "/");
    await userEvent.click(await screen.findByRole("combobox"));
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options).toEqual(expect.arrayContaining(["Locked", "Suspended", "Closed"]));
    expect(options).not.toContain("Active");
    expect(screen.queryByText(/does not authorise this endpoint/)).not.toBeInTheDocument();
  });
});
