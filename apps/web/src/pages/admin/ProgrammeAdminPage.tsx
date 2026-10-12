import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownWideNarrow, MapPin, Mic, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ProgrammeItem } from '@birthday/types';
import { api } from '@/lib/api';
import { adminKeys, moveItem, useAdminMutation } from '@/lib/admin-api';
import { celebrationQuery, eventsQuery, programmeEventId, programmeQuery } from '@/lib/admin-queries';
import { formatClock } from '@/lib/utils';
import { AButton, FilterTabs, IconButton, PageHeader, Panel } from '@/components/admin/ui';
import { DataTable, type Column } from '@/components/admin/data-table';
import { ReorderButtons } from '@/components/admin/misc';
import { Confirm } from '@/components/admin/overlays';
import { ProgrammeItemDialog, formatProgrammeDate, programmeLine } from '@/components/admin/content/ProgrammeItemDialog';
import { useOptimisticReorder } from '@/components/admin/content/use-reorder';
import { zonedDate } from '@/components/admin/event/event-form';

type DialogState = { item: ProgrammeItem | null } | null;

const clock = (i: ProgrammeItem) => (i.endTime ? `${formatClock(i.startTime)} – ${formatClock(i.endTime)}` : formatClock(i.startTime));
const timeRange = (i: ProgrammeItem) => (i.date ? `${formatProgrammeDate(i.date)}, ${clock(i)}` : clock(i));

export default function ProgrammeAdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const events = useQuery(eventsQuery);
  const celebration = useQuery(celebrationQuery);
  const eventParam = searchParams.get('event');
  const eventId = programmeEventId(events.data, eventParam);
  const event = events.data?.find((e) => e.id === eventId);
  const multiple = (events.data?.length ?? 0) > 1;
  const timeZone = celebration.data?.timezone;
  const eventDay = event && timeZone ? zonedDate(event.startsAt, timeZone) : undefined;

  // An unknown event in the URL (deleted, mistyped): show the first one instead.
  useEffect(() => {
    if (eventParam && events.data && eventId !== eventParam) setSearchParams({}, { replace: true });
  }, [eventParam, eventId, events.data, setSearchParams]);

  const programme = programmeQuery(eventId ?? undefined);
  const query = useQuery({ ...programme, enabled: !!eventId });
  const items = useMemo(() => (query.data ? [...query.data].sort((a, b) => a.sortOrder - b.sortOrder) : undefined), [query.data]);

  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<ProgrammeItem | null>(null);

  const reorder = useOptimisticReorder<ProgrammeItem>(programme.queryKey, `/admin/events/${eventId}/programme/reorder`);
  const remove = useAdminMutation<void, ProgrammeItem>({
    mutationFn: (item) => api.delete(`/admin/events/${item.eventId}/programme/${item.id}`),
    invalidate: [adminKeys.programme, adminKeys.events],
    success: (_d, item) => `“${item.title}” was removed from the programme.`,
    onSuccess: () => setDeleting(null),
  });

  const move = (index: number, delta: -1 | 1) => {
    if (!items) return;
    const next = moveItem(items, index, delta);
    if (next !== items) reorder.mutate(next);
  };

  // Items without a date are on the event's day; compare day and time together.
  const when = (i: ProgrammeItem) => `${i.date ?? eventDay ?? ''}T${i.startTime}`;
  const byTime = items ? [...items].sort((a, b) => when(a).localeCompare(when(b))) : [];
  const outOfTimeOrder = !!items && byTime.some((item, i) => item.id !== items[i].id);

  const reorderCell = (item: ProgrammeItem) => {
    const index = items?.indexOf(item) ?? 0;
    return <ReorderButtons index={index} count={items?.length ?? 0} label={item.title} onMove={(d) => move(index, d)} />;
  };

  const actions = (item: ProgrammeItem) => (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton label={`Edit ${item.title}`} onClick={() => setDialog({ item })}>
        <Pencil aria-hidden />
      </IconButton>
      <IconButton label={`Delete ${item.title}`} variant="danger-ghost" onClick={() => setDeleting(item)}>
        <Trash2 aria-hidden />
      </IconButton>
    </div>
  );

  const details = (item: ProgrammeItem) =>
    (item.speaker || item.location) && (
      <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
        {item.speaker && (
          <span className="inline-flex items-center gap-1">
            <Mic className="size-3" aria-hidden />
            <span className="sr-only">Speaker:</span> {item.speaker}
          </span>
        )}
        {item.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" aria-hidden />
            <span className="sr-only">Location:</span> {item.location}
          </span>
        )}
      </p>
    );

  const columns: Column<ProgrammeItem>[] = [
    { id: 'order', header: <span className="sr-only">Order</span>, cell: reorderCell, className: 'w-20' },
    { id: 'time', header: 'Time', cell: (i) => <span className="whitespace-nowrap tabular-nums text-navy">{timeRange(i)}</span> },
    {
      id: 'title',
      header: 'Item',
      cell: (i) => (
        <div className="min-w-0 max-w-md">
          <p className="font-medium text-navy">{i.title}</p>
          {i.description && <p className="line-clamp-1 text-xs text-muted">{i.description}</p>}
          {details(i)}
        </div>
      ),
    },
    { id: 'actions', header: <span className="sr-only">Actions</span>, cell: actions, className: 'w-24' },
  ];

  const addButton = (
    <AButton variant="emerald" disabled={!eventId} onClick={() => setDialog({ item: null })}>
      <Plus aria-hidden /> Add item
    </AButton>
  );

  return (
    <>
      <PageHeader
        title="Programme"
        description={
          multiple ? 'The running order of each event, as guests see it on the programme page.' : 'The order of events on the day, as guests see it on the programme page.'
        }
        actions={addButton}
      />
      {multiple && events.data && (
        <FilterTabs
          label="Event"
          className="mb-3"
          value={eventId ?? ''}
          onChange={(id) => setSearchParams({ event: id })}
          tabs={events.data.map((e) => ({ value: e.id, label: e.name, count: e.programmeCount }))}
        />
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {outOfTimeOrder && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-[13px] text-navy">
              <span>The list is not in time order. Guests see it in the order shown here.</span>
              <AButton size="sm" loading={reorder.isPending} onClick={() => reorder.mutate(byTime)}>
                <ArrowDownWideNarrow aria-hidden /> Sort by start time
              </AButton>
            </div>
          )}
          <DataTable
            caption={event && multiple ? `Programme items for ${event.name}` : 'Programme items'}
            columns={columns}
            rows={eventId ? items : events.data ? [] : undefined}
            getRowId={(i) => i.id}
            loading={events.isPending || (!!eventId && query.isPending)}
            error={events.error ?? query.error}
            onRetry={() => void (events.error ? events.refetch() : query.refetch())}
            emptyTitle={eventId ? 'The programme is empty' : 'No events yet'}
            emptyDescription={eventId ? 'Add the first item, such as guest arrival.' : 'Add an event on the Events page first.'}
            emptyAction={eventId ? addButton : undefined}
            mobileCard={(i) => (
              <div>
                <p className="text-xs tabular-nums text-muted">{timeRange(i)}</p>
                <p className="font-medium text-navy">{i.title}</p>
                {details(i)}
                <div className="mt-1 flex items-center justify-between">
                  {reorderCell(i)}
                  {actions(i)}
                </div>
              </div>
            )}
          />
        </div>
        <Panel
          title="Preview"
          description={event && multiple ? `How the running order of ${event.name} reads.` : 'How the running order reads.'}
          className="lg:sticky lg:top-20 lg:self-start"
        >
          {items && items.length > 0 ? (
            <ol className="space-y-2 text-[13px]">
              {items.map((item) => (
                <li key={item.id} className="border-l-2 border-gold pl-3">
                  <p className="text-navy">{programmeLine(item)}</p>
                  {item.speaker && <p className="text-xs text-muted">With {item.speaker}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[13px] text-muted">{eventId && query.isPending ? 'Loading…' : 'Nothing to preview yet.'}</p>
          )}
        </Panel>
      </div>

      {dialog && eventId && (
        <ProgrammeItemDialog
          item={dialog.item}
          eventId={eventId}
          eventName={multiple ? event?.name : undefined}
          eventDay={eventDay}
          onClose={() => setDialog(null)}
        />
      )}

      <Confirm
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remove this programme item?"
        description={
          <>
            <strong>{deleting ? programmeLine(deleting) : ''}</strong> will be removed from the programme.
          </>
        }
        confirmLabel="Remove item"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </>
  );
}
