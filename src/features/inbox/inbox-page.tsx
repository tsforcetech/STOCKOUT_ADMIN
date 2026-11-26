import * as React from "react";
import { useNavigate } from "react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellIcon, BuildingsIcon, CheckIcon, CircleNotchIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/misc";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { cn } from "@/lib/utils/cn";
import { formatDateTime, formatNumber } from "@/lib/utils/format";
import { getErrorMessage } from "@/lib/api/errors";
import { notificationKeys, notificationsService } from "@/services/notifications.service";
import type { UserNotificationDto } from "@/api/types/notifications";
import { notificationHref } from "./notification-target";
import { PushOptIn } from "./push-opt-in";

const PAGE_SIZE = 20;

/** /inbox: the signed-in admin's own in-app notifications (order monitoring, escalations, claims, finance alerts). */
export default function InboxPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const q = useQuery({
    queryKey: notificationKeys.list(unreadOnly, page),
    queryFn: ({ signal }) => notificationsService.list({ unreadOnly, page, pageSize: PAGE_SIZE }, signal),
    // A failed refresh keeps the list on screen (with a notice) instead of emptying it.
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const data = q.data;
  const pages = data ? Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE)) : 1;
  const refresh = () => qc.invalidateQueries({ queryKey: notificationKeys.all });

  const open = async (n: UserNotificationDto) => {
    const href = notificationHref(n);
    if (!n.isRead) {
      setBusy(n.notificationId);
      setActionError(null);
      try {
        await notificationsService.markRead(n.notificationId);
        void refresh();
      } catch (e) {
        setActionError(getErrorMessage(e));
      } finally {
        setBusy(null);
      }
    }
    if (href) navigate(href);
  };

  const readAll = async () => {
    setBusy("all");
    setActionError(null);
    try {
      await notificationsService.markAllRead();
      await refresh();
    } catch (e) {
      setActionError(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const tab = (value: boolean, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={unreadOnly === value}
      onClick={() => (setUnreadOnly(value), setPage(1))}
      className={cn("rounded-full px-4 py-1.5 text-sm font-medium transition-colors", unreadOnly === value ? "bg-foreground text-surface" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Inbox" description="Your own notifications: new orders, seller escalations, claims and, for Finance, reconciliation approvals." />
      <SectionCard>
        <PushOptIn />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Show" className="inline-flex rounded-full bg-surface-muted p-1">
            {tab(false, "All")}
            {tab(true, `Unread${data?.unreadCount ? ` (${formatNumber(data.unreadCount)})` : ""}`)}
          </div>
          <Button variant="ghost" size="sm" onClick={() => void readAll()} loading={busy === "all"} disabled={!data?.unreadCount || !!busy}>
            <CheckIcon /> Mark all as read
          </Button>
        </div>

        {actionError && (
          <p role="alert" className="mb-3 rounded-lg bg-danger-soft p-3 text-sm text-danger-soft-foreground">
            {actionError}
          </p>
        )}
        {q.error && data && (
          <p role="status" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning-soft-foreground">
            We couldn't refresh your notifications. Showing the last ones we loaded.
            <button type="button" className="font-medium underline underline-offset-4" onClick={() => void q.refetch()}>
              Try again
            </button>
          </p>
        )}

        {q.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : q.error && !data ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !data?.items.length ? (
          <EmptyState icon={<BellIcon className="size-6" />} title={unreadOnly ? "No unread notifications" : "No notifications yet"} description={unreadOnly ? "You're all caught up." : "Order, escalation and claim alerts for your role will appear here."} />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Notifications">
            {data.items.map((n) => {
              const href = notificationHref(n);
              return (
                <li key={n.notificationId}>
                  <button
                    type="button"
                    onClick={() => void open(n)}
                    disabled={busy === n.notificationId}
                    className={cn("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted", !n.isRead && "bg-action-soft/40")}
                    aria-label={`${n.isRead ? "" : "Unread: "}${n.title}`}
                  >
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.isRead ? "bg-transparent" : "bg-danger")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={cn("text-sm text-foreground", !n.isRead && "font-bold")}>{n.title}</span>
                        {n.scope === "ORGANIZATION" && (
                          <Badge tone="neutral">
                            <BuildingsIcon className="size-3.5" aria-hidden /> Organization
                          </Badge>
                        )}
                      </span>
                      {n.message && <span className="mt-0.5 block text-sm text-muted-foreground">{n.message}</span>}
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {formatDateTime(n.createdAtUtc)}
                        {href && " · Open"}
                      </span>
                    </span>
                    {busy === n.notificationId && <CircleNotchIcon className="size-4 animate-spin" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3 text-sm">
            <Button size="sm" variant="secondary" disabled={page <= 1 || q.isFetching} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-muted-foreground">
              Page {page} of {pages}
            </span>
            <Button size="sm" variant="secondary" disabled={page >= pages || q.isFetching} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
