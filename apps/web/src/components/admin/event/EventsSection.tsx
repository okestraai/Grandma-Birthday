import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { EyeOff, Info, ListOrdered, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import type { AdminEvent } from '@birthday/types';
import { api, errorMessage } from '@/lib/api';
import { adminKeys, moveItem, useAdminMutation } from '@/lib/admin-api';
import { categoriesQuery, eventsQuery } from '@/lib/admin-queries';
import { Badge } from '@/components/ui/badge';
import { AButton, IconButton, Panel } from '../ui';
import { DataTable, type Column } from '../data-table';
import { ReorderButtons } from '../misc';
import { Confirm } from '../overlays';
import { useOptimisticReorder } from '../content/use-reorder';
import { EventDialog } from './EventDialog';
import { formatEventWhen } from './event-form';

type DialogState = { event: AdminEvent | null } | null;

/** The celebration's events: add, edit, delete and reorder (GET/POST/PUT/DELETE /admin/events). */
export function EventsSection({ timeZone }: { timeZone: string }) {
  const query = useQuery(eventsQuery);
  const categories = useQuery(categoriesQuery);
  const events = query.data;

  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<AdminEvent | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reorder = useOptimisticReorder<AdminEvent>(adminKeys.events, '/admin/events/reorder');
  const remove = useAdminMutation<void, AdminEvent>({
    mutationFn: (event) => api.delete(`/admin/events/${event.id}`),
    invalidate: [adminKeys.events, adminKeys.celebration, adminKeys.programme, adminKeys.dashboard],
    success: (_d, event) => `“${event.name}” was deleted.`,
    toastError: false,
    onSuccess: () => setDeleting(null),
    // 409: the last event, or one guests replied to. The API says which.
    onError: (error) => setDeleteError(errorMessage(error)),
  });

  const openDelete = (event: AdminEvent | null) => {
    setDeleteError(null);
    setDeleting(event);
  };

  const move = (index: number, delta: -1 | 1) => {
    if (!events) return;
    const next = moveItem(events, index, delta);
    if (next !== events) reorder.mutate(next);
  };

  const categoryNames = (e: AdminEvent) =>
    e.invitedCategoryIds.map((id) => categories.data?.find((c) => c.id === id)).filter((c) => c !== undefined);

  const invited = (e: AdminEvent) => {
    const list = categoryNames(e);
    if (e.invitedCategoryIds.length === 0) return <Badge tone="neutral">Everyone</Badge>;
    return (
      <span className="flex flex-wrap gap-1">
        {list.map((c) => (
          <Badge key={c.id} tone="neutral" className="gap-1">
            {c.color && <span className="size-2 rounded-full ring-1 ring-black/10" style={{ backgroundColor: c.color }} aria-hidden />}
            {c.name}
          </Badge>
        ))}
      </span>
    );
  };

  const badges = (e: AdminEvent) =>
    (!e.rsvpEnabled || !e.isPublic) && (
      <span className="mt-1 flex flex-wrap gap-1">
        {!e.rsvpEnabled && (
          <Badge tone="info" className="gap-1">
            <Info className="size-3" aria-hidden /> Info only
          </Badge>
        )}
        {!e.isPublic && (
          <Badge tone="warning" className="gap-1">
            <EyeOff className="size-3" aria-hidden /> Hidden
          </Badge>
        )}
      </span>
    );

  const attending = (e: AdminEvent) => (
    <span className="whitespace-nowrap tabular-nums" title={`${e.attendingGuests} ${e.attendingGuests === 1 ? 'guest' : 'guests'} replied yes`}>
      {e.attendingPeople.toLocaleString()}
      <span className="text-muted">{e.capacity === null ? ' · no limit' : ` / ${e.capacity.toLocaleString()}`}</span>
    </span>
  );

  const programmeLink = (e: AdminEvent) => (
    <Link
      to={`/admin/programme?event=${encodeURIComponent(e.id)}`}
      className="inline-flex min-h-10 items-center gap-1 whitespace-nowrap text-[13px] font-medium text-emerald hover:underline md:min-h-0"
    >
      <ListOrdered className="size-3.5" aria-hidden />
      Programme ({e.programmeCount} {e.programmeCount === 1 ? 'item' : 'items'})
    </Link>
  );

  const reorderCell = (e: AdminEvent) => {
    const index = events?.indexOf(e) ?? 0;
    return <ReorderButtons index={index} count={events?.length ?? 0} label={e.name} onMove={(d) => move(index, d)} />;
  };

  const actions = (e: AdminEvent) => (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton label={`Edit ${e.name}`} onClick={() => setDialog({ event: e })}>
        <Pencil aria-hidden />
      </IconButton>
      <IconButton label={`Delete ${e.name}`} variant="danger-ghost" onClick={() => openDelete(e)}>
        <Trash2 aria-hidden />
      </IconButton>
    </div>
  );

  const columns: Column<AdminEvent>[] = [
    { id: 'order', header: <span className="sr-only">Order</span>, cell: reorderCell, className: 'w-20' },
    {
      id: 'event',
      header: 'Event',
      cell: (e) => (
        <div className="min-w-0 max-w-xs">
          <p className="font-medium text-navy">{e.name}</p>
          <p className="text-xs text-muted">{formatEventWhen(e.startsAt, e.endsAt, timeZone)}</p>
          {badges(e)}
        </div>
      ),
    },
    {
      id: 'venue',
      header: 'Venue',
      hideBelow: 'lg',
      cell: (e) => (
        <span>
          {e.venueName}
          {e.city && <span className="text-muted">, {e.city}</span>}
        </span>
      ),
    },
    { id: 'people', header: 'Attending', cell: attending },
    { id: 'invited', header: 'Invited', hideBelow: 'xl', cell: invited },
    { id: 'programme', header: <span className="sr-only">Programme</span>, hideBelow: 'lg', cell: programmeLink },
    { id: 'actions', header: <span className="sr-only">Actions</span>, cell: actions, className: 'w-24' },
  ];

  const addButton = (
    <AButton variant="emerald" onClick={() => setDialog({ event: null })}>
      <Plus aria-hidden /> Add event
    </AButton>
  );

  return (
    <Panel
      id="events"
      title="Events"
      description="Each gathering in the celebration, such as a service, a dinner or a brunch. Guests see them in this order."
      actions={addButton}
      bodyClassName="p-0 md:p-0"
    >
      <DataTable
        caption="Events"
        className="p-3 md:p-0 [&>div]:rounded-none [&>div]:border-0"
        columns={columns}
        rows={events}
        getRowId={(e) => e.id}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No events yet"
        emptyDescription="Add the first event, with its date and venue."
        emptyAction={addButton}
        mobileCard={(e) => (
          <div className="space-y-1.5">
            <div>
              <p className="font-medium text-navy">{e.name}</p>
              <p className="text-xs text-muted">{formatEventWhen(e.startsAt, e.endsAt, timeZone)}</p>
              <p className="flex items-center gap-1 text-xs text-muted">
                <MapPin className="size-3" aria-hidden />
                {e.venueName}
                {e.city && `, ${e.city}`}
              </p>
              {badges(e)}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>Attending {attending(e)}</span>
              {invited(e)}
            </div>
            {programmeLink(e)}
            <div className="flex items-center justify-between">
              {reorderCell(e)}
              {actions(e)}
            </div>
          </div>
        )}
      />

      {dialog && <EventDialog event={dialog.event} timeZone={timeZone} onClose={() => setDialog(null)} />}

      <Confirm
        open={!!deleting}
        onOpenChange={(open) => !open && openDelete(null)}
        title="Delete this event?"
        description={
          <>
            <p>
              <strong>{deleting?.name}</strong> and its programme will be deleted. This cannot be undone.
            </p>
            {deleteError && (
              <p role="alert" className="mt-2 rounded-lg bg-error/10 px-3 py-2 text-error">
                {deleteError}
              </p>
            )}
          </>
        }
        confirmLabel="Delete event"
        loading={remove.isPending}
        onConfirm={() => {
          setDeleteError(null);
          if (deleting) remove.mutate(deleting);
        }}
      />
    </Panel>
  );
}
