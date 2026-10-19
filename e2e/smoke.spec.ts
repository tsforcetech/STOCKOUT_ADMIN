import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Browser smoke tests against the production build.
 * NOTE: API calls are intercepted with page.route() — these tests verify routing, rendering, auth flow
 * wiring and responsive layout, NOT live backend behaviour (the gateway is not reachable from CI here).
 */

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function mockSession(page: Page, permissions: string[]) {
  // Registered first: Playwright gives later routes priority, so specific mocks below win.
  // Anything not mocked answers 403 so permission-gated widgets degrade visibly.
  await page.route("**/api/v1/**", (r) => json(r, { error: "FORBIDDEN", message: "Not mocked in smoke test" }, 403));
  await page.route("**/api/v1/auth/login", (r) => json(r, { accessToken: "a.eyJzaWQiOiJzMSJ9.c", refreshToken: "rt", expiresIn: 900, tokenType: "Bearer", mfaRequired: false, mfaChallengeToken: null }));
  await page.route("**/api/v1/auth/token/refresh", (r) => json(r, { accessToken: "a.eyJzaWQiOiJzMSJ9.c", refreshToken: "rt2", expiresIn: 900, tokenType: "Bearer" }));
  await page.route("**/api/v1/identity/me", (r) => json(r, { userId: "u1", email: "admin@stockout.test", emailVerified: true, mobile: "", mobileVerified: false, status: "Active", authTime: "", amr: "pwd", firstName: "Ada", lastName: "Admin", displayName: "Ada Admin" }));
  await page.route("**/api/v1/platform/me/permissions", (r) => json(r, { success: true, data: { userId: "u1", permissions } }));
  await page.route("**/api/v1/platform/me/roles", (r) => json(r, { success: true, data: { userId: "u1", roles: [] } }));
  await page.route("**/api/v1/admin/marketplace/sellers", (r) =>
    json(r, {
      success: true,
      data: [
        { sellerId: "11111111-1111-1111-1111-111111111111", organizationType: "BUSINESS", email: "", legalName: null, displayName: "Al Noor Building Materials", registrationNo: null, countryCode: "", defaultCurrency: "", status: "ACTIVE", verificationStatus: "PENDING", onboardingStatus: "SUBMITTED", profileLogoAssetId: null, submittedAtUtc: "2026-10-16T09:00:00", verifiedAtUtc: null, rejectedAtUtc: null, suspendedAtUtc: null, createdAtUtc: "0001-01-01T00:00:00", updatedAtUtc: "0001-01-01T00:00:00", rowVersion: "AAAAAAAAB9E=" },
      ],
    }),
  );
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("admin@stockout.test");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test("unauthenticated deep link redirects to login and back after sign-in", async ({ page }) => {
  await mockSession(page, ["sellers.view"]);
  await page.goto("/sellers");
  await expect(page).toHaveURL(/\/login\?next=%2Fsellers/);
  await expect(page.getByRole("heading", { name: "Welcome to StockOut" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("admin@stockout.test");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/sellers$/);
  await expect(page.getByRole("heading", { name: "Sellers", level: 1 })).toBeVisible();
  await expect(page.getByText("Al Noor Building Materials")).toBeVisible();
});

test("refreshing a protected route restores the session", async ({ page }) => {
  await mockSession(page, ["sellers.view"]);
  await signIn(page);
  await page.goto("/sellers");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sellers", level: 1 })).toBeVisible();
});

test("unknown routes render the 404 page inside the shell", async ({ page }) => {
  await mockSession(page, []);
  await signIn(page);
  await page.goto("/does-not-exist");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("navigation hides modules the user cannot access", async ({ page, isMobile }) => {
  test.skip(isMobile, "sidebar is a drawer on mobile");
  await mockSession(page, ["sellers.view"]);
  await signIn(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Sellers" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Team & Access" })).toHaveCount(0);
});

test("layout has no horizontal page overflow", async ({ page }) => {
  await mockSession(page, ["sellers.view"]);
  await signIn(page);
  await page.goto("/sellers");
  await expect(page.getByText("Al Noor Building Materials")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("no console errors on the login page", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("settings: grouped cards with in-place editing", async ({ page }, info) => {
  await mockSession(page, ["settings.view", "settings.update", "feature-flags.view", "feature-flags.update"]);
  const setting = (key: string, name: string, description: string, currentValue: string | null, defaultValue: string) => ({
    platformSettingId: key, key, name, description, category: "Inventory", valueType: "INTEGER", currentValue, defaultValue, effectiveValue: currentValue ?? defaultValue, isEditable: true, version: 3, updatedAtUtc: "2026-10-18T08:00:00",
  });
  await page.route("**/api/v1/platform/settings", (r) =>
    json(r, { success: true, data: [
      setting("listing.inventory.reservation.default-expiry-minutes", "Listing Reservation Default Expiry Minutes", "Default duration in minutes for temporary listing inventory reservations (valid range: 1-120).", null, "15"),
      setting("listing.inventory.reservation.max-expiry-minutes", "Listing Reservation Max Expiry Minutes", "Maximum duration in minutes a reservation may be held (valid range: 1-1440).", "120", "60"),
    ] }),
  );
  await page.route("**/api/v1/platform/feature-flags", (r) =>
    json(r, { success: true, data: [{ platformFeatureFlagId: "f1", key: "seller.subscription.enforcement.enabled", name: "Seller Subscription Enforcement", description: "Controls whether seller subscription enforcement is active.", isEnabled: false, defaultEnabled: false, version: 1, updatedAtUtc: null }] }),
  );
  let put: unknown = null;
  await page.route("**/api/v1/platform/settings/listing.inventory.reservation.default-expiry-minutes", async (r) => {
    put = r.request().postDataJSON();
    await json(r, { success: true, data: setting("listing.inventory.reservation.default-expiry-minutes", "Listing Reservation Default Expiry Minutes", "", "30", "15") });
  });

  await signIn(page);
  await page.goto("/settings");
  await expect(page.getByRole("region", { name: "Inventory" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Feature flags" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath(`settings-${info.project.name}.png`), fullPage: true });

  const input = page.getByLabel("Listing Reservation Default Expiry Minutes");
  await input.fill("abc");
  await expect(page.getByRole("alert")).toContainText("whole number");
  await input.fill("30");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => put).toEqual({ value: "30", expectedVersion: 3 });

  await page.getByRole("button", { name: /Feature flags/ }).click();
  await expect(page.getByRole("region", { name: "Inventory" })).toHaveCount(0);
});
