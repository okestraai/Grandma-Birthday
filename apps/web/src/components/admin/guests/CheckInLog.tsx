import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import type { CheckInRecord, ReverseCheckInRequest } from '@birthday/types';
import { api } from '@/lib/api';
import { affects, useAdminMutation } from '@/lib/admin-api';
import { DEFAULT_CHECKIN_LIST_PARAMS, checkinListQuery, eventsQuery } from '@/lib/admin-queries';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { AButton, Panel, SwitchRow } from '../ui';
import { DataTable, Pagination, type Column } from '../data-table';
import { ReasonDialog } from '../overlays';
import { DateCell } from '../misc';

function StatusCell({ record }: { record: CheckInRecord }) {
  if (!record.reversedAt) return <Badge tone="success">Checked in</Badge>;
  return (
    <div className="space-y-0.5">
      <Badge tone="danger">Reversed</Badge>
      <p className="max-w-56 text-xs text-muted">
        {formatDateTime(record.reversedAt)}
        {record.reversedByName && ` by ${record.reversedByName}`}
        {record.reverseReason && <span className="block text-charcoal">“{record.reverseReason}”</span>}
      </p>
    </div>
  );
}

export function CheckInLog() {
  const { can } = useAuth();
  const canReverse = can('checkin:reverse');
  const events = useQuery({ ...eventsQuery, enabled: can('event:manage') });
  const multiple = (events.data?.length ?? 0) > 1;
  const [includeReversed, setIncludeReversed] = useState(DEFAULT_CHECKIN_LIST_PARAMS.includeReversed);
  const [page, setPage] = useState(DEFAULT_CHECKIN_LIST_PARAMS.page);
  const [pageSize, setPageSize] = useState(DEFAULT_CHECKIN_LIST_PARAMS.pageSize);
  const [reversing, setReversing] = useState<CheckInRecord | null>(null);

  const params = { page, pageSize, includeReversed };
  const log = useQuery({ ...checkinListQuery(params), placeholderData: keepPreviousData });

  const reverse = useAdminMutation<CheckInRecord, { id: string } & ReverseCheckInRequest>({
    mutationFn: ({ id, reason }) => api.post<CheckInRecord>(`/admin/checkins/${id}/reverse`, { reason }),
    invalidate: affects.checkins,
    success: (r) => `Check-in for ${r.guestName} reversed`,
    onSuccess: () => setReversing(null),
  });

  const columns: Column<CheckInRecord>[] = [
    { id: 'time', header: 'Time', cell: (r) => <DateCell iso={r.checkedInAt} /> },
    { id: 'guest', header: 'Guest', cell: (r) => <span className="font-medium text-navy">{r.guestName}</span> },
    ...(multiple ? [{ id: 'event', header: 'Event', cell: (r) => r.eventName } satisfies Column<CheckInRecord>] : []),
    { id: 'code', header: 'Code', cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { id: 'category', header: 'Category', hideBelow: 'lg', cell: (r) => r.categoryName ?? <span className="text-muted">—</span> },
    { id: 'party', header: 'Party', className: 'tabular-nums', cell: (r) => r.partySize },
    { id: 'by', header: 'Checked in by', hideBelow: 'lg', cell: (r) => r.checkedInByName ?? <span className="text-muted">—</span> },
    { id: 'status', header: 'Status', cell: (r) => <StatusCell record={r} /> },
    ...(canReverse
      ? [
          {
            id: 'actions',
            header: <span className="sr-only">Actions</span>,
            className: 'text-right',
            cell: (r: CheckInRecord) =>
              r.reversedAt ? null : (
                <AButton size="xs" variant="danger-ghost" onClick={() => setReversing(r)}>
                  <Undo2 aria-hidden /> Reverse check-in
                </AButton>
              ),
          } satisfies Column<CheckInRecord>,
        ]
      : []),
  ];

  return (
    <Panel
      id="checkin-log"
      title="Check-in log"
      description="Every arrival scanned or entered at the door."
      actions={
        <SwitchRow
          label="Include reversed"
          checked={includeReversed}
          onCheckedChange={(on) => {
            setIncludeReversed(on);
            setPage(1);
          }}
          className="py-0"
        />
      }
      bodyClassName="p-0 md:p-0"
    >
      <DataTable
        caption="Check-in log"
        className="p-3 md:p-0 [&>div]:rounded-none [&>div]:border-0"
        columns={columns}
        rows={log.data?.items}
        getRowId={(r) => r.id}
        loading={log.isLoading}
        error={log.error}
        onRetry={() => log.refetch()}
        emptyTitle="No check-ins yet"
        emptyDescription="Arrivals appear here once staff start scanning at the door."
        rowClassName={(r) => (r.reversedAt ? 'text-muted' : undefined)}
        mobileCard={(r) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-navy">{r.guestName}</p>
                <p className="text-xs text-muted">
                  {multiple && `${r.eventName} · `}
                  <span className="font-mono">{r.code}</span> · party of {r.partySize}
                  {r.categoryName && ` · ${r.categoryName}`}
                </p>
              </div>
              <StatusCell record={r} />
            </div>
            <p className="text-xs text-muted">
              {formatDateTime(r.checkedInAt)}
              {r.checkedInByName && ` by ${r.checkedInByName}`}
            </p>
            {canReverse && !r.reversedAt && (
              <AButton size="sm" variant="danger-ghost" onClick={() => setReversing(r)}>
                <Undo2 aria-hidden /> Reverse check-in
              </AButton>
            )}
          </div>
        )}
      />
      {log.data && (
        <Pagination
          className="px-3 pb-3"
          page={log.data.page}
          totalPages={log.data.totalPages}
          total={log.data.total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}

      <ReasonDialog
        open={reversing !== null}
        onOpenChange={(open) => !open && setReversing(null)}
        title="Reverse this check-in?"
        description={
          reversing ? `${reversing.guestName} (party of ${reversing.partySize}) will be marked as not arrived and can be checked in again.` : undefined
        }
        required
        minLength={3}
        maxLength={300}
        placeholder="e.g. Scanned the wrong guest by mistake"
        confirmLabel="Reverse check-in"
        loading={reverse.isPending}
        onConfirm={(reason) => reversing && reverse.mutate({ id: reversing.id, reason })}
      />
    </Panel>
  );
}
