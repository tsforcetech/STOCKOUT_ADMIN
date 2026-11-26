import * as React from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellIcon, CaretLeftIcon, CaretRightIcon, ChecksIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard, RefreshButton } from "@/components/common/section-card";
import { FilterPills } from "@/components/common/filter-pills";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";
import { fmtUtc } from "@/features/listings/shared";
import type { UserNotificationDto } from "@/api/types/user-notifications";
import { userNotificationKeys, userNotificationsService } from "@/services/user-notifications.service";
import { inboxHref } from "./inbox-target";

const PAGE = 20;

/** /inbox — the signed-in admin's own notifications (orders, escalations, claims). Not the templates page. */
export default function InboxPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const q = useQuery({ queryKey: userNotificationKeys.list(unreadOnly, page), queryFn: ({ signal }) => userNotificationsService.list({ unreadOnly, page, pageSize: PAGE }, signal), placeholderData: (p) => p });
  const [busyAll, setBusyAll] = React.useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: userNotificationKeys.all });

  const open = async (n: UserNotificationDto) => {
    if (!n.isRead) {
      try {
        await userNotificationsService.markRead(n.notificationId); // idempotent; wasAlreadyRead is fine
      } catch {
        /* still open it */
      }
      void refresh();
    }
    const to = inboxHref(n);
    if (to) navigate(to);
  };

  const markAll = async () => {
    setBusyAll(true);
    try {
      await userNotificationsService.markAllRead();
    } finally {
      setBusyAll(false);
      void refresh();
    }
  };

  const d = q.data;
  const pages = d ? Math.max(1, Math.ceil(d.totalCount / PAGE)) : 1;
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Inbox"
        description="Your notifications: new orders, seller escalations, claims and payment reviews."
        actions={
          <div className="flex gap-2">
            <RefreshButton onClick={() => void q.refetch()} spinning={q.isFetching} />
            <Button variant="secondary" onClick={() => void markAll()} loading={busyAll} disabled={!d?.unreadCount}>
              <ChecksIcon /> Mark all read
            </Button>
          </div>
        }
      />
      <SectionCard>
        <FilterPills
          className="mb-3"
          label="Show"
          value={unreadOnly ? "unread" : ""}
          onChange={(v) => (setUnreadOnly(v === "unread"), setPage(1))}
          items={[
            { value: "", label: "All" },
            { value: "unread", label: "Unread", count: d?.unreadCount, highlight: (d?.unreadCount ?? 0) > 0 },
          ]}
        />
        {q.isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !d?.items.length ? (
          <EmptyState icon={<BellIcon />} title={unreadOnly ? "No unread notifications" : "No notifications yet"} description="New orders, escalations and claims for your role appear here." />
        ) : (
          <ul className="divide-y divide-border" aria-label="Notifications">
            {d.items.map((n) => {
              const to = inboxHref(n);
              return (
                <li key={n.notificationId}>
                  <button
                    type="button"
                    onClick={() => void open(n)}
                    className={cn("flex w-full cursor-pointer gap-3 px-2 py-3 text-left transition-colors hover:bg-surface-muted", !n.isRead && "bg-info-soft/40")}
                    aria-label={`${n.isRead ? "" : "Unread: "}${n.title}`}
                  >
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.isRead ? "bg-transparent" : "bg-info")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm text-foreground", !n.isRead && "font-semibold")}>{n.title}</span>
                      <span className="block text-sm text-muted-foreground">{n.message}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {fmtUtc(n.createdAtUtc)}
                        {to ? " · Open" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {pages > 1 && (
          <div className="mt-3 flex items-center justify-end gap-2 text-sm">
            <span className="text-muted-foreground">
              Page {page} of {pages}
            </span>
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <CaretLeftIcon />
            </Button>
            <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <CaretRightIcon />
            </Button>
          </div>
        )}
      </SectionCard>
    </>
  );
}
