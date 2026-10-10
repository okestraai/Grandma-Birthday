import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, Eye, FolderInput, LayoutGrid, List, Pencil, Trash2, Upload, X } from 'lucide-react';
import type { AdminMedia, AdminMediaSort, MediaKind, MediaSource, ModerationStatus } from '@birthday/types';
import { ACCEPTED_PHOTO_TYPES, ACCEPTED_VIDEO_TYPES } from '@/lib/admin-api';
import { DEFAULT_MEDIA_PARAMS, mediaListQuery } from '@/lib/admin-queries';
import { cn, formatBytes } from '@/lib/utils';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { UploadDropzone } from '@/components/ui/upload-dropzone';
import { ACheckbox, AButton, AField, ASelect, BulkBar, FilterBar, IconButton, PageHeader, SearchInput } from '@/components/admin/ui';
import { DataTable, Pagination, type Column } from '@/components/admin/data-table';
import { AdminDialog, Confirm } from '@/components/admin/overlays';
import { MediaThumb, useAdminUpload, useAlbums, useUploadLimits } from '@/components/admin/media';
import { DateCell, ModerationBadge } from '@/components/admin/misc';
import { itemsLabel, sourceLabel, useBulkMedia, useDeleteMedia } from '@/components/admin/media/actions';
import { MediaCard, MediaGrid, mediaName, type MenuAction } from '@/components/admin/media/MediaCard';
import { MediaEditDialog } from '@/components/admin/media/MediaEditDialog';
import { MediaLightbox } from '@/components/admin/media/MediaLightbox';
import { MoveToAlbumDialog } from '@/components/admin/media/MoveToAlbumDialog';
import { ActionGuide } from '@/components/admin/action-guide';
import { MEDIA_ACTIONS } from '@/components/admin/action-guide-content';

interface Filters {
  status: '' | ModerationStatus;
  source: '' | MediaSource;
  kind: '' | MediaKind;
  albumId: string;
  q: string;
  sort: Exclude<AdminMediaSort, 'order'>;
}

const { page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE, ...DEFAULT_FILTERS } = DEFAULT_MEDIA_PARAMS;
const PAGE_SIZES = [24, 48, 96];

function readView(): 'grid' | 'table' {
  try {
    return window.localStorage.getItem('admin.media.view') === 'table' ? 'table' : 'grid';
  } catch {
    return 'grid';
  }
}

export default function MediaLibraryPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState<number>(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [view, setViewState] = useState<'grid' | 'table'>(readView);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState<AdminMedia | null>(null);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const albums = useAlbums();

  const setView = (next: 'grid' | 'table') => {
    setViewState(next);
    try {
      window.localStorage.setItem('admin.media.view', next);
    } catch {
      // Storage unavailable: the choice just isn't remembered.
    }
  };

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  useEffect(() => {
    setSelected(new Set());
    setPreviewIndex(null);
  }, [filters, page, pageSize]);

  const params = { ...filters, page, pageSize };
  const list = useQuery({ ...mediaListQuery(params), placeholderData: keepPreviousData });
  const rows = list.data?.items;

  useEffect(() => {
    if (list.data && list.data.totalPages > 0 && page > list.data.totalPages) setPage(list.data.totalPages);
  }, [list.data, page]);

  const bulk = useBulkMedia({
    onSuccess: () => {
      setSelected(new Set());
      setMoveIds(null);
      setDeleteIds(null);
    },
  });
  const remove = useDeleteMedia({
    onSuccess: () => {
      setDeleteIds(null);
      setPreviewIndex(null);
    },
  });

  const confirmDelete = () => {
    if (!deleteIds) return;
    if (deleteIds.length === 1) remove.mutate(deleteIds[0]);
    else bulk.mutate({ ids: deleteIds, action: 'DELETE' });
  };

  const openPreview = (m: AdminMedia) => {
    const index = rows?.findIndex((r) => r.id === m.id) ?? -1;
    if (index >= 0) setPreviewIndex(index);
  };

  const menu = (m: AdminMedia): MenuAction[] => [
    { label: 'Preview', icon: Eye, onSelect: () => openPreview(m) },
    { label: 'Edit details', icon: Pencil, onSelect: () => setEditing(m) },
    { label: 'Approve', icon: Check, onSelect: () => bulk.mutate({ ids: [m.id], action: 'APPROVE' }), hidden: m.status === 'APPROVED' },
    { label: 'Reject', icon: X, onSelect: () => bulk.mutate({ ids: [m.id], action: 'REJECT' }), hidden: m.status === 'REJECTED' },
    { label: 'Move to album', icon: FolderInput, onSelect: () => setMoveIds([m.id]) },
    { label: 'Delete', icon: Trash2, onSelect: () => setDeleteIds([m.id]), danger: true },
  ];

  const columns: Column<AdminMedia>[] = [
    {
      id: 'thumb',
      header: <span className="sr-only">Preview</span>,
      cell: (m) => (
        <button type="button" onClick={() => openPreview(m)} aria-label={`Preview ${mediaName(m)}`} className="block overflow-hidden rounded-md">
          <MediaThumb media={m} className="size-12" />
        </button>
      ),
      className: 'w-16',
    },
    {
      id: 'name',
      header: 'File',
      cell: (m) => (
        <div className="min-w-0 max-w-xs">
          <p className="truncate font-medium text-navy" title={m.originalFilename}>
            {m.originalFilename}
          </p>
          {m.caption && <p className="truncate text-xs text-muted">{m.caption}</p>}
        </div>
      ),
    },
    { id: 'status', header: 'Status', cell: (m) => <ModerationBadge status={m.status} /> },
    { id: 'album', header: 'Album', cell: (m) => m.albumTitle ?? <span className="text-muted">No album</span>, hideBelow: 'lg' },
    { id: 'source', header: 'Source', cell: (m) => sourceLabel[m.source], hideBelow: 'xl' },
    { id: 'size', header: 'Size', cell: (m) => <span className="tabular-nums">{formatBytes(m.sizeBytes)}</span> },
    { id: 'created', header: 'Uploaded', cell: (m) => <DateCell iso={m.createdAt} />, hideBelow: 'md' },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      headerClassName: 'text-right',
      cell: (m) => (
        <div className="flex justify-end gap-0.5">
          <IconButton label={`Edit ${mediaName(m)}`} onClick={() => setEditing(m)}>
            <Pencil aria-hidden />
          </IconButton>
          <IconButton label={`Delete ${mediaName(m)}`} variant="danger-ghost" onClick={() => setDeleteIds([m.id])}>
            <Trash2 aria-hidden />
          </IconButton>
        </div>
      ),
    },
  ];

  const pageIds = rows?.map((m) => m.id) ?? [];
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));
  const selectedIds = [...selected];
  const filtered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <>
      <PageHeader
        title="Media library"
        description="Every photo and video: admin uploads, guest uploads and testimonial attachments."
        actions={
          <AButton variant="emerald" onClick={() => setUploadOpen(true)}>
            <Upload aria-hidden /> Upload
          </AButton>
        }
      />
      <ActionGuide page="media" rows={MEDIA_ACTIONS} />

      <FilterBar>
        <SearchInput value={filters.q} onChange={(v) => setFilter('q', v)} placeholder="Search captions or file names" label="Search media" />
        <ASelect aria-label="Status" className="w-full sm:w-36" value={filters.status} onChange={(e) => setFilter('status', e.target.value as Filters['status'])}>
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </ASelect>
        <ASelect aria-label="Source" className="w-full sm:w-40" value={filters.source} onChange={(e) => setFilter('source', e.target.value as Filters['source'])}>
          <option value="">All sources</option>
          <option value="ADMIN">Admin uploads</option>
          <option value="GUEST_UPLOAD">Guest uploads</option>
          <option value="TESTIMONIAL">Testimonials</option>
        </ASelect>
        <ASelect aria-label="Kind" className="w-full sm:w-32" value={filters.kind} onChange={(e) => setFilter('kind', e.target.value as Filters['kind'])}>
          <option value="">Photos and videos</option>
          <option value="PHOTO">Photos</option>
          <option value="VIDEO">Videos</option>
        </ASelect>
        <ASelect aria-label="Album" className="w-full sm:w-44" value={filters.albumId} onChange={(e) => setFilter('albumId', e.target.value)}>
          <option value="">All albums</option>
          <option value="none">No album</option>
          {albums.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </ASelect>
        <ASelect aria-label="Sort" className="w-full sm:w-36" value={filters.sort} onChange={(e) => setFilter('sort', e.target.value as Filters['sort'])}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="largest">Largest first</option>
        </ASelect>
        {filtered && (
          <AButton
            variant="ghost"
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              setPage(1);
            }}
          >
            Reset filters
          </AButton>
        )}
        <div role="group" aria-label="View" className="ml-auto flex rounded-lg border border-navy/15 bg-white p-0.5">
          {(
            [
              ['grid', 'Grid view', LayoutGrid],
              ['table', 'Table view', List],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              aria-label={label}
              title={label}
              onClick={() => setView(value)}
              className={cn(
                'flex size-9 items-center justify-center rounded-md md:size-8',
                view === value ? 'bg-navy text-white' : 'text-navy hover:bg-navy/[0.06]',
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </FilterBar>

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <AButton size="sm" variant="emerald" disabled={bulk.isPending} onClick={() => bulk.mutate({ ids: selectedIds, action: 'APPROVE' })}>
          <Check aria-hidden /> Approve
        </AButton>
        <AButton size="sm" disabled={bulk.isPending} onClick={() => bulk.mutate({ ids: selectedIds, action: 'REJECT' })}>
          <X aria-hidden /> Reject
        </AButton>
        <AButton size="sm" disabled={bulk.isPending} onClick={() => setMoveIds(selectedIds)}>
          <FolderInput aria-hidden /> Move to album
        </AButton>
        <AButton size="sm" variant="danger-ghost" disabled={bulk.isPending} onClick={() => setDeleteIds(selectedIds)}>
          <Trash2 aria-hidden /> Delete
        </AButton>
      </BulkBar>

      {view === 'table' ? (
        <DataTable
          caption="Media"
          columns={columns}
          rows={rows}
          getRowId={(m) => m.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          selected={selected}
          onSelectedChange={setSelected}
          rowLabel={mediaName}
          emptyTitle={filtered ? 'No media match these filters' : 'No media yet'}
          emptyDescription={filtered ? 'Try clearing a filter.' : 'Upload photos and videos to get started.'}
          mobileCard={(m) => (
            <div className="flex gap-3">
              <button type="button" onClick={() => openPreview(m)} aria-label={`Preview ${mediaName(m)}`} className="shrink-0">
                <MediaThumb media={m} className="size-14 rounded-md" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-navy">{mediaName(m)}</p>
                <p className="text-xs text-muted">
                  {formatBytes(m.sizeBytes)} · {m.albumTitle ?? 'No album'}
                </p>
                <div className="mt-1 flex items-center justify-between">
                  <ModerationBadge status={m.status} />
                  <div className="flex gap-0.5">
                    <IconButton label={`Edit ${mediaName(m)}`} onClick={() => setEditing(m)}>
                      <Pencil aria-hidden />
                    </IconButton>
                    <IconButton label={`Delete ${mediaName(m)}`} variant="danger-ghost" onClick={() => setDeleteIds([m.id])}>
                      <Trash2 aria-hidden />
                    </IconButton>
                  </div>
                </div>
              </div>
            </div>
          )}
        />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : rows && rows.length === 0 ? (
        <EmptyState
          title={filtered ? 'No media match these filters' : 'No media yet'}
          description={filtered ? 'Try clearing a filter.' : 'Upload photos and videos to get started.'}
        />
      ) : (
        <>
          {rows && (
            <div className="mb-2 flex items-center gap-2 text-[13px] text-muted">
              <ACheckbox
                id="media-select-page"
                checked={allOnPage ? true : someOnPage ? 'indeterminate' : false}
                onCheckedChange={(on) => {
                  const next = new Set(selected);
                  pageIds.forEach((id) => (on && !allOnPage ? next.add(id) : next.delete(id)));
                  setSelected(next);
                }}
              />
              <label htmlFor="media-select-page">Select all on this page</label>
            </div>
          )}
          <MediaGrid label="Media" loading={!rows} skeletons={pageSize > 24 ? 24 : 12}>
            {rows?.map((m) => (
              <li key={m.id}>
                <MediaCard
                  media={m}
                  selected={selected.has(m.id)}
                  onSelectedChange={(on) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (on) next.add(m.id);
                      else next.delete(m.id);
                      return next;
                    })
                  }
                  onOpen={() => openPreview(m)}
                  actions={menu(m)}
                />
              </li>
            ))}
          </MediaGrid>
        </>
      )}

      {list.data && (
        <Pagination
          page={list.data.page}
          totalPages={list.data.totalPages}
          total={list.data.total}
          pageSize={list.data.pageSize}
          pageSizes={PAGE_SIZES}
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
        keysPaused={editing !== null || deleteIds !== null || moveIds !== null}
        actions={(m) => (
          <>
            {m.status !== 'APPROVED' && (
              <AButton size="sm" variant="emerald" disabled={bulk.isPending} onClick={() => bulk.mutate({ ids: [m.id], action: 'APPROVE' })}>
                <Check aria-hidden /> Approve
              </AButton>
            )}
            <AButton size="sm" onClick={() => setEditing(m)}>
              <Pencil aria-hidden /> Edit
            </AButton>
            <AButton size="sm" variant="danger-ghost" onClick={() => setDeleteIds([m.id])}>
              <Trash2 aria-hidden /> Delete
            </AButton>
          </>
        )}
      />

      <MediaEditDialog media={editing} open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} showAlbum showStatus />

      <MoveToAlbumDialog
        open={moveIds !== null}
        onOpenChange={(open) => !open && setMoveIds(null)}
        count={moveIds?.length ?? 0}
        currentAlbumId={moveIds?.length === 1 ? rows?.find((m) => m.id === moveIds[0])?.albumId : undefined}
        loading={bulk.isPending}
        onConfirm={(albumId) => moveIds && bulk.mutate({ ids: moveIds, action: 'MOVE', albumId })}
      />

      <Confirm
        open={deleteIds !== null}
        onOpenChange={(open) => !open && setDeleteIds(null)}
        title={deleteIds && deleteIds.length > 1 ? `Delete ${itemsLabel(deleteIds.length)}?` : 'Delete this item?'}
        description="The files are removed from storage permanently, and from any album, page or testimonial that uses them. This cannot be undone."
        confirmLabel="Delete"
        loading={bulk.isPending || remove.isPending}
        onConfirm={confirmDelete}
      />

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </>
  );
}

function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [albumId, setAlbumId] = useState('');
  const albums = useAlbums();
  const limits = useUploadLimits();
  const uploader = useAdminUpload({ albumId: albumId || null, onDone: (result) => result.accepted > 0 && onOpenChange(false) });

  return (
    <AdminDialog
      open={open}
      onOpenChange={(next) => !uploader.uploading && onOpenChange(next)}
      title="Upload photos and videos"
      description="Admin uploads are approved straight away."
      size="lg"
      footer={
        <>
          <AButton variant="ghost" disabled={uploader.uploading} onClick={() => onOpenChange(false)}>
            Cancel
          </AButton>
          <AButton variant="emerald" loading={uploader.uploading} disabled={uploader.validCount === 0} onClick={() => void uploader.upload()}>
            <Upload aria-hidden /> Upload {uploader.validCount > 0 ? itemsLabel(uploader.validCount) : ''}
          </AButton>
        </>
      }
    >
      <AField label="Album" htmlFor="upload-album" hint="Optional. You can move items later." className="mb-4">
        <ASelect id="upload-album" value={albumId} onChange={(e) => setAlbumId(e.target.value)} disabled={uploader.uploading} aria-describedby="upload-album-msg">
          <option value="">No album</option>
          {albums.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </ASelect>
      </AField>
      <UploadDropzone
        variant="admin"
        files={uploader.files}
        onFilesChange={uploader.setFiles}
        acceptedMimeTypes={limits.videoEnabled ? [...ACCEPTED_PHOTO_TYPES, ...ACCEPTED_VIDEO_TYPES] : ACCEPTED_PHOTO_TYPES}
        maxFiles={limits.maxFiles}
        maxPhotoBytes={limits.maxPhotoBytes}
        maxVideoBytes={limits.maxVideoBytes}
        videoEnabled={limits.videoEnabled}
        progress={uploader.progress}
        disabled={uploader.uploading}
      />
    </AdminDialog>
  );
}
