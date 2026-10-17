# Figma implementation notes

Source file: **StockOut** — `https://www.figma.com/design/kCkVUDyE4KVr3VchJZz5si/StockOut` (inspected through the
Figma MCP connection: variables, design context and screenshots).

## What was used

| Figma | Implementation |
|---|---|
| Variables (Surface/Text/Border/Primary/Red, radii, spacing) | `src/styles/globals.css` tokens |
| Fonts: Space Grotesk (headings), Geist (body) | `@fontsource-variable/space-grotesk`, `@fontsource-variable/geist` |
| Icon library page (Phosphor) | `@phosphor-icons/react` |
| Navigation component (189:1691) | `src/app/router/nav.ts`, `src/app/layouts/sidebar.tsx` |
| Dashboard frame (191:1967) top bar, canvas, stat cards (270:685) | `app-layout.tsx`, `header.tsx`, `components/common/stat-cards.tsx` |
| Login frame (385:2169) / Sign in card (385:2179) | `features/auth/auth-shell.tsx`, `login-page.tsx` |
| Approvals / Sellers / Categories list frames | `PageHeader` (eyebrow + H3), `SectionCard`, underline `Tabs`, `Toolbar`, `BulkBar`, `DataTable` (pagination with numbered pages), `RowAction`, `StatusBadge`, `EntityCell` |

Admin frames on Page 1: Login, Dashboard, Approvals, Tasks & Workflows, Listings, Categories, Price Guidance,
Buyer Requests, Bids & Deals, Sellers, Buyers, Inspectors, Inspections, Orders, Delivery, Payments & Payouts,
Green Points, Supports & Disputes, Team & Access, My Profile, Audit Log, Integrations, Settings, Error &
Unauthorised, Mobile. The "Buyer Screens" section is the buyer storefront, not the admin console.

## Assets that still need exporting

The Figma asset CDN (`www.figma.com/api/mcp/asset/...`) is blocked by the build environment's network policy,
so two raster assets could not be downloaded. Export them from Figma and drop them in `public/brand/`:

| File | Figma node | Used by |
|---|---|---|
| `public/brand/stockout-logo.png` | Logo `653:28631` (also "Main Logo" instances) | `components/common/logo.tsx` — falls back to a text wordmark until present |
| `public/brand/login-hero.png` | Login → Img Container `398:1793` (worker photo, transparent background) | `features/auth/auth-shell.tsx` — panel renders text-only until present |

## Deliberate deviations

* Figma screens contain illustrative numbers (GMV, tonnes delivered, trends "+12.8% vs last month"). The
  backend exposes no such metrics, so stat cards show only values computed from real API responses, with
  factual sub-lines instead of invented trends.
* Menu items whose backend APIs do not exist yet are shown disabled with a "Soon" tag (toggle with
  `SHOW_UNAVAILABLE_MODULES` in `nav.ts`) instead of linking to non-functional screens.
* The top-bar search is a ⌘K page switcher: there is no global data-search API for admins. The
  notification bell and help icon are omitted until notification/help APIs exist.
* A dark theme is derived from the light tokens (the Figma file defines light only).
