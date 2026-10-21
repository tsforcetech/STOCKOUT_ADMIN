import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithApp } from "@/test/render";
import { mockFetch } from "@/test/http";
import type { ListingModerationDetailResponse } from "@/api/types/catalog-moderation";
import { MediaList } from "../review/version-comparison";
import { SignedFileLink, urlFresh } from "../shared";

afterEach(() => vi.unstubAllGlobals());

const detail = {
  candidateVersion: { listingId: "l-1", listingVersionId: "v-1" },
  mediaAssets: [
    { listingMediaAssetId: "m-1", fileAssetId: "f-1", isPrimary: true, displayOrder: 1, downloadUrl: "https://media.example/f-1.jpg?sig=a", expiresAtUtc: "2999-01-01T00:00:00Z" },
    { listingMediaAssetId: "m-2", fileAssetId: "f-2", isPrimary: false, displayOrder: 2, downloadUrl: "https://media.example/f-2.jpg?sig=old", expiresAtUtc: "2000-01-01T00:00:00Z" },
  ],
} as unknown as ListingModerationDetailResponse;

describe("reviewer media (F2-E)", () => {
  it("treats URLs near expiry as stale", () => {
    expect(urlFresh("u", "2999-01-01T00:00:00")).toBe(true);
    expect(urlFresh("u", "2000-01-01T00:00:00")).toBe(false);
    expect(urlFresh("u", null)).toBe(true);
    expect(urlFresh(null, null)).toBe(false);
  });

  it("shows the signed URL and fetches a fresh one when it has expired or fails", async () => {
    const { calls } = mockFetch([
      {
        method: "GET",
        path: /\/media\/m-2\/download-url$/,
        respond: () => ({ body: { listingId: "l-1", listingVersionId: "v-1", listingMediaAssetId: "m-2", fileAssetId: "f-2", downloadUrl: "https://media.example/f-2.jpg?sig=new", expiresAtUtc: null } }),
      },
    ]);
    renderWithApp([{ path: "/", element: <MediaList detail={detail} /> }], "/");
    const first = await screen.findByAltText("Listing photo 1");
    expect(first).toHaveAttribute("src", "https://media.example/f-1.jpg?sig=a");
    // The second URL had expired, so a fresh one is requested before showing it.
    await waitFor(() => expect(screen.getByAltText("Listing photo 2")).toHaveAttribute("src", "https://media.example/f-2.jpg?sig=new"));
    expect(calls.some((c) => c.url.pathname.endsWith("/media/m-2/download-url"))).toBe(true);
    // A broken signed URL falls back to a refreshed one.
    fireEvent.error(first);
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith("/media/m-1/download-url"))).toBe(true));
  });

  it("SignedFileLink refreshes an expired link before opening it", async () => {
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() } as unknown as Window;
    const openSpy = vi.spyOn(window, "open").mockReturnValue(tab);
    const refresh = vi.fn().mockResolvedValue({ downloadUrl: "https://media.example/doc.pdf?sig=new" });
    renderWithApp([{ path: "/", element: <SignedFileLink url="https://media.example/doc.pdf?sig=old" expiresAtUtc="2000-01-01T00:00:00Z" refresh={refresh} /> }], "/");
    await userEvent.click(await screen.findByRole("button", { name: "Open" }));
    await waitFor(() => expect(tab.location.href).toBe("https://media.example/doc.pdf?sig=new"));
    expect(refresh).toHaveBeenCalledOnce();
    openSpy.mockRestore();
  });
});
