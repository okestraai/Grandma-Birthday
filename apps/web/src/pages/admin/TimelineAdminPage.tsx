import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { AdminTimelineEntry } from '@birthday/types';
import { api } from '@/lib/api';
import { adminKeys, moveItem, useAdminMutation } from '@/lib/admin-api';
import { timelineQuery } from '@/lib/admin-queries';
import { Badge } from '@/components/ui/badge';
import { AButton, IconButton, PageHeader } from '@/components/admin/ui';
import { DataTable, type Column } from '@/components/admin/data-table';
import { MediaThumb } from '@/components/admin/media';
import { ReorderButtons } from '@/components/admin/misc';
import { Confirm } from '@/components/admin/overlays';
import { MONTHS, TimelineEntryDialog, categoryLabel } from '@/components/admin/content/TimelineEntryDialog';
import { useOptimisticReorder } from '@/components/admin/content/use-reorder';

type DialogState = { entry: AdminTimelineEntry | null } | null;

const when = (e: AdminTimelineEntry) => (e.month ? `${MONTHS[e.month - 1]} ${e.year}` : String(e.year));

export default function TimelineAdminPage() {
  const query = useQuery(timelineQuery);
  const entries = useMemo(() => (query.data ? [...query.data].sort((a, b) => a.sortOrder - b.sortOrder) : undefined), [query.data]);

  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<AdminTimelineEntry | null>(null);

  const reorder = useOptimisticReorder<AdminTimelineEntry>(adminKeys.timeline, '/admin/timeline/reorder');
  const remove = useAdminMutation<void, AdminTimelineEntry>({
    mutationFn: (entry) => api.delete(`/admin/timeline/${entry.id}`),
    invalidate: [adminKeys.timeline],
    success: (_d, entry) => `“${entry.title}” was deleted.`,
    onSuccess: () => setDeleting(null),
  });

  const move = (index: number, delta: -1 | 1) => {
    if (!entries) return;
    const next = moveItem(entries, index, delta);
    if (next !== entries) reorder.mutate(next);
  };

  const actions = (entry: AdminTimelineEntry) => (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton label={`Edit ${entry.title}`} onClick={() => setDialog({ entry })}>
        <Pencil aria-hidden />
      </IconButton>
      <IconButton label={`Delete ${entry.title}`} variant="danger-ghost" onClick={() => setDeleting(entry)}>
        <Trash2 aria-hidden />
      </IconButton>
    </div>
  );

  const reorderCell = (entry: AdminTimelineEntry) => {
    const index = entries?.indexOf(entry) ?? 0;
    return <ReorderButtons index={index} count={entries?.length ?? 0} label={entry.title} onMove={(d) => move(index, d)} />;
  };

  const badges = (entry: AdminTimelineEntry) => (
    <div className="flex flex-wrap gap-1">
      <Badge tone="gold">{categoryLabel(entry.category)}</Badge>
      {entry.isPublished ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge>}
    </div>
  );

  const columns: Column<AdminTimelineEntry>[] = [
    { id: 'order', header: <span className="sr-only">Order</span>, cell: reorderCell, className: 'w-20' },
    {
      id: 'image',
      header: <span className="sr-only">Photo</span>,
      cell: (e) => <MediaThumb media={e.media} className="size-11 rounded-md" alt={e.media?.altText ?? ''} />,
      className: 'w-14',
    },
    { id: 'when', header: 'When', cell: (e) => <span className="whitespace-nowrap tabular-nums text-navy">{when(e)}</span> },
    {
      id: 'title',
      header: 'Moment',
      cell: (e) => (
        <div className="min-w-0 max-w-md">
          <p className="font-medium text-navy">{e.title}</p>
          {e.description && <p className="line-clamp-1 text-xs text-muted">{e.description}</p>}
        </div>
      ),
    },
    { id: 'category', header: 'Category', cell: (e) => <Badge tone="gold">{categoryLabel(e.category)}</Badge>, hideBelow: 'lg' },
    {
      id: 'status',
      header: 'Status',
      cell: (e) => (e.isPublished ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge>),
    },
    { id: 'actions', header: <span className="sr-only">Actions</span>, cell: actions, className: 'w-24' },
  ];

  return (
    <>
      <PageHeader
        title="Timeline"
        description="Moments from the celebrant’s life, shown in this order on the public timeline."
        actions={
          <AButton variant="emerald" onClick={() => setDialog({ entry: null })}>
            <Plus aria-hidden /> Add moment
          </AButton>
        }
      />
      <DataTable
        caption="Timeline moments"
        columns={columns}
        rows={entries}
        getRowId={(e) => e.id}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No timeline moments yet"
        emptyDescription="Add the first milestone, such as the year and place of birth."
        emptyAction={
          <AButton variant="emerald" onClick={() => setDialog({ entry: null })}>
            <Plus aria-hidden /> Add moment
          </AButton>
        }
        mobileCard={(e) => (
          <div className="flex gap-3">
            <MediaThumb media={e.media} className="size-14 shrink-0 rounded-md" alt={e.media?.altText ?? ''} />
            <div className="min-w-0 flex-1">
              <p className="text-xs tabular-nums text-muted">{when(e)}</p>
              <p className="font-medium text-navy">{e.title}</p>
              <div className="mt-1">{badges(e)}</div>
              <div className="mt-1 flex items-center justify-between">
                {reorderCell(e)}
                {actions(e)}
              </div>
            </div>
          </div>
        )}
      />

      {dialog && <TimelineEntryDialog entry={dialog.entry} onClose={() => setDialog(null)} />}

      <Confirm
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this moment?"
        description={
          <>
            <strong>{deleting?.title}</strong> will be removed from the timeline. Its photo stays in the media library.
          </>
        }
        confirmLabel="Delete moment"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </>
  );
}
