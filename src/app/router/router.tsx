import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { AppLayout } from "@/app/layouts/app-layout";
import { RedirectIfAuthenticated, RequireAuth } from "@/lib/auth/guards";
import { RouteError } from "./route-error";

/** Lazily loads a page module's default export (route-level code splitting). */
const page = (loader: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await loader()).default });

const appRoutes: RouteObject[] = [
  { index: true, lazy: page(() => import("@/features/dashboard/dashboard-page")), handle: { crumb: "Dashboard" } },
  { path: "approvals", lazy: page(() => import("@/features/approvals/approvals-page")), handle: { crumb: "Approvals" } },
  {
    path: "listings",
    handle: { crumb: "Listings" },
    children: [
      { index: true, lazy: page(() => import("@/features/listings/listings-page")) },
      { path: ":listingId/versions/:versionId", lazy: page(() => import("@/features/listings/listing-review-page")), handle: { crumb: "Review" } },
    ],
  },
  {
    path: "catalog",
    handle: { crumb: "Catalog" },
    lazy: page(() => import("@/features/catalog/catalog-layout")),
    children: [
      { index: true, element: <Navigate to="categories" replace /> },
      { path: "categories", lazy: page(() => import("@/features/catalog/categories-page")), handle: { crumb: "Categories" } },
      { path: "categories/:categoryId", lazy: page(() => import("@/features/catalog/category-detail-page")), handle: { crumb: "Category" } },
      { path: "attributes", lazy: page(() => import("@/features/catalog/attributes-page")), handle: { crumb: "Attributes" } },
      { path: "brands", lazy: page(() => import("@/features/catalog/brands-page")), handle: { crumb: "Brands" } },
      { path: "units", lazy: page(() => import("@/features/catalog/units-page")), handle: { crumb: "Units" } },
      { path: "conditions", lazy: page(() => import("@/features/catalog/conditions-page")), handle: { crumb: "Conditions" } },
      { path: "grades", lazy: page(() => import("@/features/catalog/grades-page")), handle: { crumb: "Grades" } },
      { path: "templates", lazy: page(() => import("@/features/catalog/templates-page")), handle: { crumb: "Inspection templates" } },
    ],
  },
  { path: "sellers", lazy: page(() => import("@/features/sellers/sellers-page")), handle: { crumb: "Sellers" } },
  {
    path: "inspections",
    handle: { crumb: "Inspections" },
    children: [
      { index: true, lazy: page(() => import("@/features/inspections/inspections-page")) },
      { path: ":inspectionId", lazy: page(() => import("@/features/inspections/inspection-detail-page")), handle: { crumb: "Inspection" } },
    ],
  },
  { path: "notifications", lazy: page(() => import("@/features/notifications/templates-page")), handle: { crumb: "Notification templates" } },
  {
    path: "team",
    handle: { crumb: "Team & Access" },
    lazy: page(() => import("@/features/team/team-layout")),
    children: [
      { index: true, element: <Navigate to="users" replace /> },
      { path: "users", lazy: page(() => import("@/features/team/users-page")), handle: { crumb: "Users" } },
      { path: "users/:userId", lazy: page(() => import("@/features/team/user-detail-page")), handle: { crumb: "User" } },
      { path: "invitations", lazy: page(() => import("@/features/team/invitations-page")), handle: { crumb: "Invitations" } },
      { path: "roles", lazy: page(() => import("@/features/team/roles-page")), handle: { crumb: "Roles" } },
      { path: "roles/:roleId", lazy: page(() => import("@/features/team/role-detail-page")), handle: { crumb: "Role" } },
      { path: "admins", lazy: page(() => import("@/features/team/admins-page")), handle: { crumb: "Platform admins" } },
    ],
  },
  { path: "settings", lazy: page(() => import("@/features/settings/settings-page")), handle: { crumb: "Settings" } },
  {
    path: "account",
    handle: { crumb: "My Profile" },
    children: [
      { index: true, lazy: page(() => import("@/features/account/profile-page")) },
      { path: "security", lazy: page(() => import("@/features/account/security-page")), handle: { crumb: "Security" } },
    ],
  },
  { path: "*", lazy: page(() => import("@/features/errors/not-found-page")), handle: { crumb: "Not found" } },
];

export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      {
        element: <RedirectIfAuthenticated />,
        children: [
          { path: "login", lazy: page(() => import("@/features/auth/login-page")) },
          { path: "forgot-password", lazy: page(() => import("@/features/auth/forgot-password-page")) },
        ],
      },
      { path: "reset-password", lazy: page(() => import("@/features/auth/reset-password-page")) },
      {
        element: <RequireAuth />,
        children: [{ path: "/", element: <AppLayout />, errorElement: <RouteError />, children: appRoutes }],
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" });
}
