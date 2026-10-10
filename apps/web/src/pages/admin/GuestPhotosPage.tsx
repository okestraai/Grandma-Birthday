import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { LIVE_REFRESH_MS } from '@/lib/query';
import { LiveRefresh } from '@/components/admin/live-refresh';
import { Check, Eye, FolderInput, Trash2, X } from 'lucide-react';
import type { AdminMedia, BulkMediaRequest, ModerationStatus } from '@birthday/types';
import { DEFAULT_GUEST_PHOTO_PARAMS, mediaListQuery, mediaStatsQuery } from '@/lib/admin-queries';
import { AButton, BulkBar, FilterTabs, IconButton, PageHeader } from '@/components/admin/ui';
import { DataTable, Pagination, type Column } from '@/components/admin/data-table';
import { Confirm } from '@/components/admin/overlays';
import { MediaThumb } from '@/components/admin/media';
import { DateCell, ModerationBadge } from '@/components/admin/misc';
import { formatSize, itemsLabel, useBulkMedia } from '@/components/admin/media/actions';
import { MoveToAlbumDialog } from '@/components/admin/media/MoveToAlbumDialog';
import { MediaLightbox, type LightboxKey } from '@/components/admin/media/MediaLightbox';
import { ActionGuide } from '@/components/admin/action-guide';
import { GUEST_PHOTO_ACTIONS } from '@/components/admin/action-guide-content';

const TAB_LABEL: Record<ModerationStatus, string> = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' };
const ACTION_STATUS: Partial<Record<BulkMediaRequest['action'], ModerationStatus>> = { APPROVE: 'APPROVED', REJECT: 'REJECTED' };

function uploaderLabel(media: AdminMedia): string {
  return media.uploaderName?.trim() || 'Anonymous guest';
}

export default function GuestPhotosPage() {
  const [status, setStatus] = useState<ModerationStatus>(DEFAULT_GUEST_PHOTO_PARAMS.status);
  const [page, setPage] = useState<number>(DEFAULT_GUEST_PHOTO_PARAMS.page);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_GUEST_PHOTO_PARAMS.pageSize);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [albumIds, setAlbumIds] = useState<string[] | null>(null);

  const stats = useQuery({ ...mediaStatsQuery, refetchInterval: LIVE_REFRESH_MS });

  const params = { ...DEFAULT_GUEST_PHOTO_PARAMS, status, page, pageSize };
  const list = useQuery({
    ...mediaListQuery(params),
    placeholderData: keepPreviousData,
    // New uploads from the party appear without a reload.
    refetchInterval: LIVE_REFRESH_MS,
  });

  // Filters or page changed: start a fresh selection.
  useEffect(() => {
    setSelected(new Set());
    setHidden(new Set());
  }, [status, page, pageSize]);

  // The last item on a later page was moderated away: step back.
  useEffect(() => {
    if (list.data && list.data.totalPages > 0 && page > list.data.totalPages) setPage(list.data.totalPages);
  }, [list.data, page]);

  const rows = useMemo(() => list.data?.items.filter((m) => !hidden.has(m.id)), [list.data, hidden]);

  useEffect(() => {
    if (previewIndex !== null && rows && rows.length === 0 && !list.isFetching) setPreviewIndex(null);
  }, [previewIndex, rows, list.isFetching]);

  const bulk = useBulkMedia({
    success: (result, vars) => {
      const n = itemsLabel(result.affected);
      if (vars.action === 'APPROVE') return vars.albumId ? `Approved and added ${n} to the album` : `Approved ${n}`;
      if (vars.action === 'REJECT') return `Rejected ${n}`;
      if (vars.action === 'DELETE') return `Deleted ${n}`;
      return `Moved ${n} to the album`;
    },
    onSuccess: (_, vars) => {
      const leaves = vars.action === 'DELETE' || (ACTION_STATUS[vars.action] !== undefined && ACTION_STATUS[vars.action] !== status);
      if (leaves) setHidden((prev) => new Set([...prev, ...vars.ids]));
      setSelected((prev) => {
        const next = new Set(prev);
        vars.ids.forEach((id) => next.delete(id));
        return next;
      });
      setDeleteIds(null);
      setAlbumIds(null);
    },
  });

  const run = (ids: string[], action: BulkMediaRequest['action'], albumId?: string | null) => {
    if (ids.length === 0) return;
    bulk.mutate(albumId === undefined ? { ids, action } : { ids, action, albumId });
  };

  const counts = stats.data?.guestUploads;
  const storage = stats.data?.storage;
  const selectedIds = [...selected];
  const inPending = status === 'PENDING';

  const openPreview = (media: AdminMedia) => {
    const index = rows?.findIndex((m) => m.id === media.id) ?? -1;
    if (index >= 0) setPreviewIndex(index);
  };

  const rowActions = (m: AdminMedia) => (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton label={`Preview photo from ${uploaderLabel(m)}`} onClick={() => openPreview(m)}>
        <Eye aria-hidden />
      </IconButton>
      {m.status !== 'APPROVED' && (
        <IconButton label="Approve" className="text-emerald hover:bg-emerald/10" disabled={bulk.isPending} onClick={() => run([m.id], 'APPROVE')}>
          <Check aria-hidden />
        </IconButton>
      )}
      {m.status !== 'REJECTED' && (
        <IconButton label="Reject" disabled={bulk.isPending} onClick={() => run([m.id], 'REJECT')}>
          <X aria-hidden />
        </IconButton>
      )}
      <IconButton label="Add to album" onClick={() => setAlbumIds([m.id])}>
        <FolderInput aria-hidden />
      </IconButton>
      <IconButton label="Delete" variant="danger-ghost" onClick={() => setDeleteIds([m.id])}>
        <Trash2 aria-hidden />
      </IconButton>
    </div>
  );

  const columns: Column<AdminMedia>[] = [
    {
      id: 'photo',
      header: 'Photo',
      cell: (m) => (
        <button
          type="button"
          onClick={() => openPreview(m)}
          className="block overflow-hidden rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-rich"
          aria-label={`Preview photo from ${uploaderLabel(m)}`}
        >
          <MediaThumb media={m} className="size-14" />
        </button>
      ),
      className: 'w-20',
    },
    {
      id: 'uploader',
      header: 'Uploader',
      cell: (m) => (
        <div className="min-w-0 max-w-xs">
          <p className={m.uploaderName ? 'font-medium text-navy' : 'text-muted'}>{uploaderLabel(m)}</p>
          {m.uploaderMessage && (
            <p className="truncate text-xs italic text-muted" title={m.uploaderMessage}>
              “{m.uploaderMessage}”
            </p>
          )}
        </div>
      ),
    },
    { id: 'album', header: 'Album', cell: (m) => m.albumTitle ?? <span className="text-muted">No album</span>, hideBelow: 'lg' },
    { id: 'status', header: 'Status', cell: (m) => <ModerationBadge status={m.status} /> },
    { id: 'uploaded', header: 'Uploaded', cell: (m) => <DateCell iso={m.createdAt} />, hideBelow: 'md' },
    { id: 'actions', header: <span className="sr-only">Actions</span>, cell: rowActions, headerClassName: 'text-right' },
  ];

  const keys: LightboxKey[] = [
    { key: 'a', hint: 'A', label: 'Approve', run: (m) => run([m.id], 'APPROVE'), disabled: (m) => m.status === 'APPROVED' || bulk.isPending },
    { key: 'r', hint: 'R', label: 'Reject', run: (m) => run([m.id], 'REJECT'), disabled: (m) => m.status === 'REJECTED' || bulk.isPending },
    { key: 'Delete', hint: 'Del', label: 'Delete', run: (m) => setDeleteIds([m.id]) },
  ];

  const summary = counts
    ? `Pending: ${counts.pending} · Approved: ${counts.approved} · Rejected: ${counts.rejected}${
        storage ? ` · Storage: ${formatSize(storage.usedBytes)} / ${formatSize(storage.quotaBytes)}` : ''
      }`
    : null;

  // Pending items get approved into the album; others are only moved.
  const albumActionApproves = inPending;

  return (
    <>
      <PageHeader
        title="Guest photos"
        description="Review photos and videos guests uploaded from the QR page. Only approved items appear in the public gallery."
        actions={
          <LiveRefresh
            updatedAt={list.dataUpdatedAt}
            fetching={list.isFetching}
            onRefresh={() => {
              void list.refetch();
              void stats.refetch();
            }}
          />
        }
      />
      <ActionGuide page="guest-photos" rows={GUEST_PHOTO_ACTIONS} />

      <p className="mb-4 text-[13px] tabular-nums text-charcoal" aria-live="polite" data-testid="guest-photo-summary">
        {summary ?? (stats.isError ? 'Counts could not be loaded.' : <span className="inline-block h-4 w-80 max-w-full animate-pulse rounded bg-navy/[0.06]" aria-hidden />)}
      </p>

      <FilterTabs
        label="Moderation status"
        className="mb-3"
        value={status}
        onChange={(value) => {
          setStatus(value);
          setPage(1);
          setPreviewIndex(null);
        }}
        tabs={(['PENDING', 'APPROVED', 'REJECTED'] as const).map((value) => ({
          value,
          label: TAB_LABEL[value],
          count: counts ? counts[value.toLowerCase() as 'pending' | 'approved' | 'rejected'] : undefined,
        }))}
      />

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        {status !== 'APPROVED' && (
          <AButton size="sm" variant="emerald" disabled={bulk.isPending} onClick={() => run(selectedIds, 'APPROVE')}>
            <Check aria-hidden /> Approve selected
          </AButton>
        )}
        {status !== 'REJECTED' && (
          <AButton size="sm" disabled={bulk.isPending} onClick={() => run(selectedIds, 'REJECT')}>
            <X aria-hidden /> Reject selected
          </AButton>
        )}
        <AButton size="sm" disabled={bulk.isPending} onClick={() => setAlbumIds(selectedIds)}>
          <FolderInput aria-hidden /> Add to album
        </AButton>
        <AButton size="sm" variant="danger-ghost" disabled={bulk.isPending} onClick={() => setDeleteIds(selectedIds)}>
          <Trash2 aria-hidden /> Delete selected
        </AButton>
      </BulkBar>

      <DataTable
        caption={`${TAB_LABEL[status]} guest uploads`}
        columns={columns}
        rows={rows}
        getRowId={(m) => m.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        selected={selected}
        onSelectedChange={setSelected}
        rowLabel={(m) => `photo from ${uploaderLabel(m)}`}
        emptyTitle={status === 'PENDING' ? 'Nothing waiting for review' : `No ${TAB_LABEL[status].toLowerCase()} guest uploads`}
        emptyDescription={status === 'PENDING' ? 'New guest uploads will appear here.' : undefined}
        mobileCard={(m) => (
          <div className="flex gap-3">
            <button type="button" onClick={() => openPreview(m)} aria-label={`Preview photo from ${uploaderLabel(m)}`} className="shrink-0">
              <MediaThumb media={m} className="size-16 rounded-md" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-[13px] font-medium text-navy">{uploaderLabel(m)}</p>
                <ModerationBadge status={m.status} />
              </div>
              {m.uploaderMessage && <p className="truncate text-xs italic text-muted">“{m.uploaderMessage}”</p>}
              <p className="text-xs text-muted">
                {m.albumTitle ?? 'No album'} · <DateCell iso={m.createdAt} />
              </p>
              <div className="-ml-2 mt-1">{rowActions(m)}</div>
            </div>
          </div>
        )}
      />

      {list.data && (
        <Pagination
          page={list.data.page}
          totalPages={list.data.totalPages}
          total={list.data.total}
          pageSize={list.data.pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}

      <MediaLightbox
        items={rows ?? []}
        index={previewIndex}
        onIndexChange={setPreviewIndex}
        onClose={() => setPreviewIndex(null)}
        keys={keys}
        keysPaused={deleteIds !== null || albumIds !== null}
        actions={(m) => (
          <>
            {m.status !== 'APPROVED' && (
              <AButton size="sm" variant="emerald" disabled={bulk.isPending} onClick={() => run([m.id], 'APPROVE')}>
                <Check aria-hidden /> Approve
              </AButton>
            )}
            {m.status !== 'REJECTED' && (
              <AButton size="sm" disabled={bulk.isPending} onClick={() => run([m.id], 'REJECT')}>
                <X aria-hidden /> Reject
              </AButton>
            )}
            <AButton size="sm" onClick={() => setAlbumIds([m.id])}>
              <FolderInput aria-hidden /> Add to album
            </AButton>
            <AButton size="sm" variant="danger-ghost" onClick={() => setDeleteIds([m.id])}>
              <Trash2 aria-hidden /> Delete
            </AButton>
          </>
        )}
      />

      <Confirm
        open={deleteIds !== null}
        onOpenChange={(open) => !open && setDeleteIds(null)}
        title={deleteIds && deleteIds.length > 1 ? `Delete ${deleteIds.length} uploads?` : 'Delete this upload?'}
        description="The files are removed from storage permanently. This cannot be undone."
        confirmLabel="Delete"
        loading={bulk.isPending}
        onConfirm={() => deleteIds && run(deleteIds, 'DELETE')}
      />

      <MoveToAlbumDialog
        open={albumIds !== null}
        onOpenChange={(open) => !open && setAlbumIds(null)}
        count={albumIds?.length ?? 0}
        allowNone={!albumActionApproves}
        title={albumIds && albumIds.length > 1 ? `Add ${albumIds.length} uploads to an album` : 'Add to album'}
        description={
          albumActionApproves
            ? 'The selected uploads will be approved and added to this album.'
            : 'The selected uploads will be moved to this album. Their approval status does not change.'
        }
        confirmLabel={albumActionApproves ? 'Approve and add' : 'Add to album'}
        loading={bulk.isPending}
        onConfirm={(albumId) => albumIds && run(albumIds, albumActionApproves ? 'APPROVE' : 'MOVE', albumId)}
      />
    </>
  );
}
