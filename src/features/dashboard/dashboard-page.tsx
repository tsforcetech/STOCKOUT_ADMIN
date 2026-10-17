import * as React from "react";
import { Link, useNavigate } from "react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  CaretRightIcon,
  CheckCircleIcon,
  GavelIcon,
  HourglassIcon,
  ListChecksIcon,
  QuestionIcon,
  SealCheckIcon,
  StorefrontIcon,
  UserCheckIcon,
  UsersThreeIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { StatCards } from "@/components/common/stat-cards";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/misc";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { ColumnChart, BarList } from "@/components/charts/bar-charts";
import { useAuth } from "@/lib/auth/auth-context";
import { useAccess } from "@/lib/auth/use-access";
import { formatDateTime, formatNumber, humanize } from "@/lib/utils/format";
import { moderationService } from "@/services/moderation.service";
import { inspectionsService } from "@/services/inspections.service";
import { platformService } from "@/services/platform.service";
import { authService } from "@/services/auth.service";
import { useSellersQuery } from "@/features/sellers/sellers-page";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import type { InspectionStatus } from "@/api/types/catalog-moderation";

const INSPECTION_STATUSES: InspectionStatus[] = ["PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

/** Backend timestamps without an offset are UTC by convention. */
function parseUtc(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
}

function waitingLabel(fromUtc: string | null | undefined): string {
  const ms = Date.now() - parseUtc(fromUtc);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} hr`;
  return `${Math.floor(h / 24)} days`;
}

function CardHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <p className="text-sm text-foreground">{eyebrow}</p>
        <h2 className="font-heading text-2xl font-bold leading-7 text-foreground">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function ViewAll({ to }: { to: string }) {
  return (
    <Button asChild variant="secondary" size="sm" className="shrink-0">
      <Link to={to}>
        View all <CaretRightIcon />
      </Link>
    </Button>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { can } = useAccess();
  const navigate = useNavigate();

  const canListings = can(P.CATALOG_LISTINGS_REVIEW);
  const canSellers = can(P.SELLERS_VIEW);
  const canInspections = can(P.INSPECTIONS_VIEW);
  const canUsers = can(P.PLATFORM_USERS_VIEW);

  const moderation = useQuery({
    queryKey: ["dashboard", "moderation-queue"],
    queryFn: ({ signal }) => moderationService.queue({ page: 1, pageSize: 6 }, signal),
    enabled: canListings,
  });
  const sellers = useSellersQuery(canSellers);
  const inspectionCounts = useQueries({
    queries: INSPECTION_STATUSES.map((status) => ({
      queryKey: ["dashboard", "inspections", status],
      queryFn: ({ signal }: { signal: AbortSignal }) => inspectionsService.queue({ status, page: 1, pageSize: 1 }, signal),
      enabled: canInspections,
    })),
  });
  const users = useQuery({ queryKey: ["platform", "users"], queryFn: ({ signal }) => platformService.users(signal), enabled: canUsers });
  const activity = useQuery({
    queryKey: ["dashboard", "my-activity"],
    queryFn: ({ signal }) => authService.accountActivity({ page: 1, pageSize: 5 }, signal),
    staleTime: 60_000,
  });

  const sellerList = sellers.data ?? [];
  const pendingKyc = sellerList.filter((s) => s.verificationStatus === "PENDING" && (s.onboardingStatus === "SUBMITTED" || s.onboardingStatus === "UNDER_REVIEW"));
  const inspectionByStatus = Object.fromEntries(INSPECTION_STATUSES.map((s, i) => [s, inspectionCounts[i]?.data?.totalCount])) as Record<InspectionStatus, number | undefined>;
  const inspectionsLoading = inspectionCounts.some((q) => q.isLoading);
  const inspectionsError = inspectionCounts.find((q) => q.error)?.error;
  const openInspections = (inspectionByStatus.PENDING ?? 0) + (inspectionByStatus.ASSIGNED ?? 0) + (inspectionByStatus.IN_PROGRESS ?? 0);

  // Work queue: listings under review + sellers awaiting KYC, oldest first (real records only).
  const workQueue = React.useMemo(() => {
    const rows: Array<{ id: string; title: string; code: string; type: "LISTING" | "SELLER KYC"; since: string | null; to: string }> = [];
    for (const item of moderation.data?.items ?? []) {
      rows.push({ id: `l-${item.listingVersionId}`, title: item.title, code: `${item.categoryName} · v${item.versionNumber}`, type: "LISTING", since: item.submittedAtUtc, to: `/listings/${item.listingId}/versions/${item.listingVersionId}` });
    }
    for (const s of pendingKyc) {
      rows.push({ id: `s-${s.sellerId}`, title: s.displayName ?? "Unnamed seller", code: humanize(s.organizationType), type: "SELLER KYC", since: s.submittedAtUtc, to: "/sellers?tab=pending" });
    }
    return rows.sort((a, b) => (parseUtc(a.since) || 0) - (parseUtc(b.since) || 0)).slice(0, 6);
  }, [moderation.data, pendingKyc]);

  const now = new Date();
  const eyebrow = `${now.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "2-digit" })} | ${now.toLocaleDateString(undefined, { weekday: "long" })}`;
  const firstName = user?.firstName || user?.displayName?.split(" ")[0];

  const nothingPermitted = !canListings && !canSellers && !canInspections && !canUsers;

  return (
    <>
      <PageHeader eyebrow={eyebrow} title={firstName ? `Welcome back, ${firstName}` : "Dashboard"} />

      <StatCards
        className="mb-6"
        items={[
          {
            label: "Listings awaiting review",
            value: formatNumber(moderation.data?.totalCount),
            hint: "Moderation queue",
            icon: <ListChecksIcon />,
            loading: moderation.isLoading,
            unavailable: !canListings ? "No access" : moderation.error ? "Unavailable" : undefined,
          },
          {
            label: "Seller KYC pending",
            value: formatNumber(pendingKyc.length),
            hint: `${formatNumber(sellerList.length)} sellers in total`,
            icon: <GavelIcon />,
            loading: sellers.isLoading,
            unavailable: !canSellers ? "No access" : sellers.error ? "Unavailable" : undefined,
          },
          {
            label: "Open inspections",
            value: formatNumber(openInspections),
            hint: `${formatNumber(inspectionByStatus.IN_PROGRESS ?? 0)} in progress`,
            icon: <UserCheckIcon />,
            loading: inspectionsLoading,
            unavailable: !canInspections ? "No access" : inspectionsError ? "Unavailable" : undefined,
          },
          {
            label: "Platform users",
            value: formatNumber(users.data?.length),
            hint: `${formatNumber(users.data?.filter((u) => !u.isEnabled).length ?? 0)} disabled`,
            icon: <UsersThreeIcon />,
            loading: users.isLoading,
            unavailable: !canUsers ? "No access" : users.error ? "Unavailable" : undefined,
          },
        ]}
      />

      {nothingPermitted && (
        <SectionCard className="mb-6">
          <EmptyState
            title="Your account has no admin permissions yet"
            description="Ask a platform super admin to assign you a role in Team & Access. Your profile and security settings are still available."
            action={
              <Button asChild variant="secondary">
                <Link to="/account">Open my profile</Link>
              </Button>
            }
          />
        </SectionCard>
      )}

      <div className={canInspections && canSellers ? "mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.55fr_1fr]" : "mb-6 grid grid-cols-1 gap-6"}>
        {canInspections && (
          <SectionCard>
            <CardHeading eyebrow="Operations" title="Inspection pipeline" action={<ViewAll to="/inspections" />} />
            {inspectionsError ? (
              <ErrorState error={inspectionsError} onRetry={() => inspectionCounts.forEach((q) => q.refetch())} />
            ) : inspectionsLoading ? (
              <Skeleton className="h-[248px] w-full" />
            ) : (
              <ColumnChart
                label="Inspections by status"
                data={INSPECTION_STATUSES.map((s) => ({ key: s, label: humanize(s), value: inspectionByStatus[s] ?? 0, onSelect: () => navigate(`/inspections?status=${s}`) }))}
              />
            )}
          </SectionCard>
        )}
        {canSellers && (
          <SectionCard>
            <CardHeading eyebrow="People" title="Seller verification" action={<ViewAll to="/sellers" />} />
            {sellers.error ? (
              <ErrorState error={sellers.error} onRetry={() => sellers.refetch()} />
            ) : sellers.isLoading ? (
              <Skeleton className="h-[248px] w-full" />
            ) : sellerList.length === 0 ? (
              <EmptyState icon={<StorefrontIcon />} title="No sellers yet" />
            ) : (
              <BarList
                label="Sellers by KYC status"
                data={[
                  { key: "VERIFIED", label: "Verified", value: sellerList.filter((s) => s.verificationStatus === "VERIFIED").length, icon: <SealCheckIcon />, onSelect: () => navigate("/sellers?tab=verified") },
                  { key: "PENDING", label: "Pending review", value: sellerList.filter((s) => s.verificationStatus === "PENDING").length, icon: <HourglassIcon />, onSelect: () => navigate("/sellers?tab=pending") },
                  { key: "UNVERIFIED", label: "Not submitted", value: sellerList.filter((s) => s.verificationStatus === "UNVERIFIED").length, icon: <QuestionIcon /> },
                  { key: "REJECTED", label: "Rejected", value: sellerList.filter((s) => s.verificationStatus === "REJECTED").length, icon: <XCircleIcon />, onSelect: () => navigate("/sellers?tab=rejected") },
                ]}
              />
            )}
          </SectionCard>
        )}
      </div>

      <div className={canListings || canSellers ? "grid grid-cols-1 gap-6 xl:grid-cols-[1.55fr_1fr]" : "grid grid-cols-1 gap-6"}>
        {(canListings || canSellers) && (
          <SectionCard>
            <CardHeading eyebrow="Work Queue" title="Awaiting Your Approval" action={<ViewAll to="/approvals" />} />
            {moderation.isLoading || sellers.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : moderation.error && sellers.error ? (
              <ErrorState error={moderation.error} onRetry={() => { moderation.refetch(); sellers.refetch(); }} />
            ) : workQueue.length === 0 ? (
              <EmptyState icon={<CheckCircleIcon />} title="All caught up" description="No listings or seller verifications are waiting for review." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[560px] text-sm">
                  <caption className="sr-only">Items awaiting approval</caption>
                  <thead className="bg-surface-muted">
                    <tr>
                      <th scope="col" className="h-11 px-4 text-left font-medium text-foreground">Item</th>
                      <th scope="col" className="h-11 px-4 text-left font-medium text-foreground">Type</th>
                      <th scope="col" className="h-11 px-4 text-left font-medium text-foreground">Waiting</th>
                      <th scope="col" className="h-11 px-4 text-right font-medium text-foreground"><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {workQueue.map((row) => (
                      <tr key={row.id} className="cursor-pointer transition-colors hover:bg-surface-muted/70" onClick={() => navigate(row.to)}>
                        <td className="h-[60px] px-4">
                          <div className="max-w-[300px] truncate text-foreground">{row.title}</div>
                          <div className="text-xs text-muted-foreground">{row.code}</div>
                        </td>
                        <td className="px-4">
                          <Badge tone="outline">{row.type}</Badge>
                        </td>
                        <td className="px-4 text-foreground" title={formatDateTime(row.since)}>{waitingLabel(row.since)}</td>
                        <td className="px-4 text-right">
                          <Link to={row.to} onClick={(e) => e.stopPropagation()} aria-label={`Open ${row.title}`} className="inline-flex rounded p-1 hover:bg-surface-muted">
                            <CaretRightIcon className="size-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {moderation.error && !sellers.error && <p className="mt-3 text-xs text-muted-foreground">Listings could not be loaded; showing seller verifications only.</p>}
          </SectionCard>
        )}

        <SectionCard>
          <CardHeading eyebrow="Live Activity" title="Your Recent Activity" action={<ViewAll to="/account/security" />} />
          {activity.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : activity.error ? (
            <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
          ) : !activity.data?.items.length ? (
            <EmptyState title="No recent activity" />
          ) : (
            <ul className="space-y-3">
              {activity.data.items.map((e) => (
                <li key={e.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-3 text-sm">
                  {e.success ? <CheckCircleIcon className="size-5 shrink-0 text-success" aria-label="Succeeded" /> : <XCircleIcon className="size-5 shrink-0 text-danger" aria-label="Failed" />}
                  <span className="min-w-0 flex-1 truncate text-foreground">{humanize(e.eventType)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(e.occurredAtUtc)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
