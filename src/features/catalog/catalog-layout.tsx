import { NavLink, Outlet } from "react-router";
import { CATALOG_TAXONOMY_PERMISSIONS as CT } from "@/api/types/catalog-taxonomy";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import { useAccess } from "@/lib/auth/use-access";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { to: "/catalog/categories", label: "Categories", permission: CT.categoriesView },
  { to: "/catalog/attributes", label: "Attributes", permission: CT.attributesView },
  { to: "/catalog/brands", label: "Brands", permission: CT.brandsView },
  { to: "/catalog/units", label: "Units", permission: CT.unitsView },
  { to: "/catalog/conditions", label: "Conditions", permission: CT.conditionsView },
  { to: "/catalog/grades", label: "Grades", permission: CT.gradesView },
  { to: "/catalog/templates", label: "Inspection templates", permission: P.INSPECTIONS_TEMPLATES_MANAGE },
] as const;

/** Catalog section shell: permission-filtered tab bar + the active catalog page. */
export default function CatalogLayout() {
  const { can } = useAccess();
  const tabs = TABS.filter((t) => can(t.permission));
  return (
    <div className="min-w-0">
      {tabs.length > 0 && (
        <nav aria-label="Catalog sections" className="mb-6 flex max-w-full gap-2 overflow-x-auto border-b border-border sm:mx-3">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                cn(
                  "-mb-px whitespace-nowrap border-b-2 px-2 pb-2 pt-1 text-sm text-foreground transition-colors hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isActive ? "border-action-border font-medium" : "border-transparent",
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      )}
      <Outlet />
    </div>
  );
}
