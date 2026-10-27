import type { Icon } from "@phosphor-icons/react";
import {
  BellIcon,
  CalendarIcon,
  ClipboardTextIcon,
  ChecksIcon,
  FileIcon,
  FileMagnifyingGlassIcon,
  FlagBannerIcon,
  FoldersIcon,
  GavelIcon,
  HandshakeIcon,
  HeadsetIcon,
  LeafIcon,
  ListMagnifyingGlassIcon,
  ListNumbersIcon,
  PackageIcon,
  PlugIcon,
  ScalesIcon,
  ShoppingCartIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  StorefrontIcon,
  TagIcon,
  TruckIcon,
  UserCheckIcon,
  UserIcon,
  UserListIcon,
  UsersThreeIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import type { PermissionRequirement } from "@/lib/permissions/permissions";
import { PERMISSIONS as P } from "@/api/types/user-organization";

export interface NavItem {
  label: string;
  to: string;
  icon: Icon;
  /** Hidden when the signed-in user lacks this permission. */
  permission?: PermissionRequirement;
  /**
   * Present in the Figma information architecture but with no backend API yet. Rendered disabled
   * with a "Soon" tag so the IA is visible without presenting a non-working screen.
   */
  unavailable?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const CATALOG_VIEW = {
  anyOf: [P.CATALOG_CATEGORIES_VIEW, P.CATALOG_ATTRIBUTES_VIEW, P.CATALOG_BRANDS_VIEW, P.CATALOG_UNITS_VIEW, P.CATALOG_CONDITIONS_VIEW, P.CATALOG_GRADES_VIEW, P.INSPECTIONS_TEMPLATES_MANAGE],
} as const;

const TEAM_VIEW = { anyOf: [P.PLATFORM_USERS_VIEW, P.ROLES_VIEW, P.PERMISSIONS_VIEW] } as const;

/** Mirrors the Figma "Navigation" component (node 189:1691): groups, order, labels and icons. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { label: "Dashboard", to: "/", icon: SquaresFourIcon },
      { label: "Approvals", to: "/approvals", icon: GavelIcon, permission: { anyOf: [P.CATALOG_LISTINGS_REVIEW, P.SELLERS_VIEW, P.INSPECTIONS_VIEW] } },
      { label: "Tasks & Workflows", to: "/tasks", icon: ChecksIcon, unavailable: true },
    ],
  },
  {
    id: "marketplace",
    label: "Marketplace",
    items: [
      { label: "Listings", to: "/listings", icon: ListNumbersIcon, permission: { anyOf: [P.CATALOG_LISTINGS_VIEW, P.CATALOG_LISTINGS_REVIEW] } },
      { label: "Categories", to: "/catalog", icon: FoldersIcon, permission: CATALOG_VIEW },
      { label: "Price Guidance", to: "/price-guidance", icon: TagIcon, unavailable: true },
      { label: "Buyer Requests", to: "/buyer-requests", icon: UserListIcon, unavailable: true },
      { label: "Bids & Deals", to: "/deals", icon: HandshakeIcon, unavailable: true },
    ],
  },
  {
    id: "people",
    label: "People",
    items: [
      { label: "Sellers", to: "/sellers", icon: StorefrontIcon, permission: P.SELLERS_VIEW },
      { label: "Business changes", to: "/business-changes", icon: ClipboardTextIcon, permission: P.ORG_BUSINESS_CHANGES_VIEW },
      { label: "Buyers", to: "/buyers", icon: ShoppingCartIcon, unavailable: true },
      { label: "Inspectors", to: "/inspectors", icon: ListMagnifyingGlassIcon, unavailable: true },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { label: "Inspections", to: "/inspections", icon: UserCheckIcon, permission: P.INSPECTIONS_VIEW },
      { label: "Orders", to: "/orders", icon: PackageIcon, unavailable: true },
      { label: "Delivery", to: "/delivery", icon: TruckIcon, unavailable: true },
      { label: "Payments & Payouts", to: "/payments", icon: WalletIcon, unavailable: true },
      { label: "Green points", to: "/green-points", icon: LeafIcon, unavailable: true },
      { label: "Support & Disputes", to: "/support", icon: HeadsetIcon, unavailable: true },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    items: [
      { label: "Content & Banners", to: "/content", icon: FlagBannerIcon, unavailable: true },
      { label: "Notifications", to: "/notifications", icon: BellIcon, permission: P.NOTIFICATION_TEMPLATES_VIEW },
      { label: "Reports", to: "/reports", icon: FileIcon, unavailable: true },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { label: "Team & Access", to: "/team", icon: UsersThreeIcon, permission: TEAM_VIEW },
      { label: "Integrations", to: "/integrations", icon: PlugIcon, unavailable: true },
      { label: "UAE calendar", to: "/calendar", icon: CalendarIcon, permission: P.CALENDAR_VIEW },
      { label: "Policies", to: "/policies", icon: ScalesIcon, permission: { anyOf: [P.POLICIES_VIEW, P.POLICIES_MANAGE, P.POLICIES_PUBLISH] } },
      { label: "Audit Log", to: "/audit", icon: FileMagnifyingGlassIcon, unavailable: true },
      { label: "Settings", to: "/settings", icon: SlidersHorizontalIcon, permission: { anyOf: [P.SETTINGS_VIEW, P.FEATURE_FLAGS_VIEW] } },
      { label: "My Profile", to: "/account", icon: UserIcon },
    ],
  },
];

export const SHOW_UNAVAILABLE_MODULES = true;
