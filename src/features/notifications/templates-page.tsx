import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { BellIcon, PlusIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard, Toolbar, RefreshButton } from "@/components/common/section-card";
import { EntityCell } from "@/components/common/entity-cell";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { useUrlState } from "@/hooks/use-url-state";
import { humanize } from "@/lib/utils/format";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import type { NotificationTemplateChannel, NotificationTemplateListQuery, NotificationTemplatePurpose, NotificationTemplateStatus, NotificationTemplateSummaryResponse } from "@/api/types/notification-templates";
import { formatUtcDateTime } from "@/features/team/utc";
import { useTemplatesQuery } from "./queries";
import { CHANNEL_LABEL, CHANNELS, PURPOSES, STATUSES } from "./template-rules";
import { TemplateDetailDialog } from "./template-detail-dialog";
import { TemplateFormDialog, type TemplateFormTarget } from "./template-form-dialog";

function TemplatesContent() {
  const { can } = useAccess();
  const [state, setState] = useUrlState({ page: 1, pageSize: 20, search: "", channel: "", purpose: "", status: "" });
  const [detail, setDetail] = React.useState<NotificationTemplateSummaryResponse | null>(null);
  const [formTarget, setFormTarget] = React.useState<TemplateFormTarget | null>(null);

  const listQuery = React.useMemo<NotificationTemplateListQuery>(
    () => ({
      page: state.page,
      pageSize: state.pageSize,
      search: state.search.trim() || undefined,
      channel: (state.channel || undefined) as NotificationTemplateChannel | undefined,
      purpose: (state.purpose || undefined) as NotificationTemplatePurpose | undefined,
      status: (state.status || undefined) as NotificationTemplateStatus | undefined,
    }),
    [state.page, state.pageSize, state.search, state.channel, state.purpose, state.status],
  );
  const query = useTemplatesQuery(listQuery);
  const filtered = Boolean(listQuery.search || listQuery.channel || listQuery.purpose || listQuery.status);

  const columns = React.useMemo<ColumnDef<NotificationTemplateSummaryResponse, unknown>[]>(
    () => [
      { id: "code", header: "Template", cell: ({ row }) => <EntityCell icon={<BellIcon />} title={<span className="font-mono">{row.original.templateCode}</span>} /> },
      { id: "channel", header: "Channel", cell: ({ row }) => <Badge>{CHANNEL_LABEL[row.original.channel] ?? row.original.channel}</Badge> },
      { id: "purpose", header: "Purpose", cell: ({ row }) => humanize(row.original.purpose) },
      {
        id: "active",
        header: "Active version",
        cell: ({ row }) =>
          row.original.activeVersionNumber !== null ? (
            <Badge tone="success" dot>
              v{row.original.activeVersionNumber}
            </Badge>
          ) : (
            <span className="text-muted-foreground">None</span>
          ),
      },
      { id: "created", header: "Created", cell: ({ row }) => formatUtcDateTime(row.original.createdAtUtc) },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        eyebrow="StockOut administration"
        title="Notifications"
        description="Manage notification templates per channel: draft, review, activate and retire versions."
        actions={
          can(P.NOTIFICATION_TEMPLATES_CREATE) && (
            <Button variant="action" onClick={() => setFormTarget({ mode: "create" })}>
              Create template <PlusIcon />
            </Button>
          )
        }
      />
      <SectionCard>
        <Toolbar
          left={<SearchInput value={state.search} onChange={(search) => setState({ search }, { resetPage: true })} placeholder="Search template code…" />}
          right={
            <>
              <NativeSelect className="h-[38px] w-36" value={state.channel} onChange={(e) => setState({ channel: e.target.value }, { resetPage: true })} aria-label="Channel">
                <option value="">All channels</option>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABEL[c]}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect className="h-[38px] w-40" value={state.purpose} onChange={(e) => setState({ purpose: e.target.value }, { resetPage: true })} aria-label="Purpose">
                <option value="">All purposes</option>
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {humanize(p)}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect className="h-[38px] w-44" value={state.status} onChange={(e) => setState({ status: e.target.value }, { resetPage: true })} aria-label="Has a version with status">
                <option value="">Any version status</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    Has {humanize(s).toLowerCase()} version
                  </option>
                ))}
              </NativeSelect>
              <RefreshButton onClick={() => query.refetch()} spinning={query.isFetching} />
            </>
          }
        />
        <DataTable
          caption="Notification templates"
          columns={columns}
          data={query.data?.items}
          getRowId={(t) => t.templateId}
          isLoading={query.isLoading}
          isFetching={query.isFetching && !query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          onRowClick={setDetail}
          pagination={{
            page: query.data?.page ?? state.page,
            pageSize: query.data?.pageSize ?? state.pageSize,
            totalCount: query.data?.totalCount ?? 0,
            onPageChange: (page) => setState({ page }),
            onPageSizeChange: (pageSize) => setState({ pageSize, page: 1 }),
          }}
          emptyTitle={filtered ? "No templates match these filters" : "No notification templates yet"}
          emptyDescription={filtered ? "The status filter matches templates having any version in that status." : undefined}
        />
        <p className="mt-3 text-xs text-muted-foreground">Seeded roles only grant notification-templates.view; create/update/activate/retire require those permissions to be added to a role.</p>
      </SectionCard>

      <TemplateDetailDialog template={detail} onOpenChange={(o) => !o && setDetail(null)} />
      <TemplateFormDialog
        target={formTarget}
        onOpenChange={(o) => !o && setFormTarget(null)}
        onCreated={(templateCode, channel) => setState({ search: templateCode, channel, page: 1 })}
      />
    </>
  );
}

export default function NotificationTemplatesPage() {
  return (
    <RequirePermission permission={P.NOTIFICATION_TEMPLATES_VIEW}>
      <TemplatesContent />
    </RequirePermission>
  );
}
