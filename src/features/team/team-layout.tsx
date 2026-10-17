import { Navigate, NavLink, Outlet, useLocation } from "react-router";
import { EnvelopeSimpleIcon, UserCheckIcon, UserMinusIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { StatCards, type StatItem } from "@/components/common/stat-cards";
import { PermissionDenied } from "@/components/feedback/states";
import { useAccess } from "@/lib/auth/use-access";
import { cn } from "@/lib/utils/cn";
import { formatNumber } from "@/lib/utils/format";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import { useInvitationsQuery, useUsersQuery } from "./queries";

const PENDING_QUERY = { status: "Pending" } as const;

export default function TeamLayout() {
  const { can, isSuperAdmin } = useAccess();
  const location = useLocation();
  const canUsers = can(P.PLATFORM_USERS_VIEW);

  const tabs = [
    { to: "/team/users", label: "Users", allowed: canUsers },
    { to: "/team/invitations", label: "Invitations", allowed: canUsers },
    { to: "/team/roles", label: "Roles", allowed: can(P.ROLES_VIEW) },
    { to: "/team/admins", label: "Platform admins", allowed: isSuperAdmin },
  ].filter((t) => t.allowed);

  const users = useUsersQuery(canUsers);
  const pending = useInvitationsQuery(PENDING_QUERY, canUsers);

  // The index route lands on /team/users; send users without that permission to their first allowed tab.
  if (location.pathname.replace(/\/$/, "") === "/team/users" && !canUsers && tabs.length) {
    return <Navigate to={tabs[0].to} replace />;
  }

  const list = users.data ?? [];
  const usersUnavailable = !canUsers ? "Requires platform-users.view" : users.error ? "Unavailable" : undefined;
  const stats: StatItem[] = [
    { label: "Platform users", value: formatNumber(list.length), hint: "Users with platform access", icon: <UsersThreeIcon />, loading: users.isLoading, unavailable: usersUnavailable },
    { label: "Enabled", value: formatNumber(list.filter((u) => u.isEnabled).length), hint: "Can use the admin console", hintTone: "success", icon: <UserCheckIcon />, loading: users.isLoading, unavailable: usersUnavailable },
    { label: "Disabled", value: formatNumber(list.filter((u) => !u.isEnabled).length), hint: "Platform access revoked", icon: <UserMinusIcon />, loading: users.isLoading, unavailable: usersUnavailable },
    {
      label: "Pending invitations",
      value: formatNumber(pending.data?.length),
      hint: "Awaiting acceptance",
      icon: <EnvelopeSimpleIcon />,
      loading: pending.isLoading,
      unavailable: !canUsers ? "Requires platform-users.view" : pending.error ? "Unavailable" : undefined,
    },
  ];

  return (
    <>
      <PageHeader eyebrow="StockOut administration" title="Team & Access" description="Manage platform users, invitations, roles and permissions for the admin console." />
      {!tabs.length ? (
        <PermissionDenied />
      ) : (
        <>
          {canUsers && <StatCards className="mb-4" items={stats} />}
          <nav aria-label="Team & Access sections" className="mb-4 flex max-w-full gap-2 overflow-x-auto border-b border-border px-0 sm:px-3">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  cn(
                    "-mb-px whitespace-nowrap border-b-2 border-transparent px-2 pb-2 pt-1 text-sm text-foreground transition-colors hover:text-muted-foreground",
                    isActive && "border-action-border font-medium",
                  )
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
          <Outlet />
        </>
      )}
    </>
  );
}

