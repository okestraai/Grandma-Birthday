import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, FolderInput, Images, Lock, Pencil, Plus, Star, Trash2, Upload, X } from 'lucide-react';
import type { AdminAlbum, AdminMedia, ReorderRequest, UpsertAlbumRequest } from '@birthday/types';
import { api } from '@/lib/api';
import { ACCEPTED_PHOTO_TYPES, ACCEPTED_VIDEO_TYPES, adminKeys, moveItem, useAdminMutation } from '@/lib/admin-api';
import { albumMediaQuery, galleryAlbumId, sortAlbums } from '@/lib/admin-queries';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { UploadDropzone } from '@/components/ui/upload-dropzone';
import { ACheckbox, AButton, AField, ASelect, BulkBar, IconButton, PageHeader, Panel } from '@/components/admin/ui';
import { Confirm } from '@/components/admin/overlays';
import { useAdminUpload, useAlbums, useUploadLimits } from '@/components/admin/media';
import { CountPill } from '@/components/admin/misc';
import { itemsLabel, useBulkMedia, useUpdateMedia } from '@/components/admin/media/actions';
import { MediaCard, MediaGrid, mediaName } from '@/components/admin/media/MediaCard';
import { MediaEditDialog } from '@/components/admin/media/MediaEditDialog';
import { MediaLightbox } from '@/components/admin/media/MediaLightbox';
import { MoveToAlbumDialog } from '@/components/admin/media/MoveToAlbumDialog';
import { AlbumFormDialog, AlbumVisibilityBadge } from '@/components/admin/media/AlbumFormDialog';
import { ActionGuide } from '@/components/admin/action-guide';
import { MEDIA_ACTIONS } from '@/components/admin/action-guide-content';

function albumBody(album: AdminAlbum, coverMediaId: string | null): UpsertAlbumRequest {
  return { title: album.title, slug: album.slug, description: album.description, isPublished: album.isPublished, coverMediaId };
}

export default function GalleryAdminPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const albums = useAlbums();
  const sortedAlbums = useMemo(() => (albums.data ? sortAlbums(albums.data) : undefined), [albums.data]);
  const albumParam = searchParams.get('album');
  const album = sortedAlbums?.find((a) => a.id === albumParam) ?? null;

  // No (or an unknown) album in the URL: select the first one.
  useEffect(() => {
    const target = galleryAlbumId(sortedAlbums, albumParam);
    if (target && target !== albumParam) setSearchParams({ album: target }, { replace: true });
  }, [sortedAlbums, albumParam, setSearchParams]);

  const selectAlbum = (id: string) => setSearchParams({ album: id });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState<AdminMedia | null>(null);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [albumFormOpen, setAlbumFormOpen] = useState(false);
  const [newAlbum, setNewAlbum] = useState(false);

  useEffect(() => {
    setSelected(new Set());
    setPreviewIndex(null);
  }, [album?.id]);

  const mediaQuery = albumMediaQuery(album?.id);
  const mediaKey = mediaQuery.queryKey;
  const media = useQuery({ ...mediaQuery, enabled: !!album });
  const items = media.data;

  const limits = useUploadLimits();
  const uploader = useAdminUpload({ albumId: album?.id ?? null, onDone: (result) => result.accepted > 0 && setShowUpload(false) });

  const reorder = useAdminMutation<void, { albumId: string } & ReorderRequest>({
    mutationFn: ({ albumId, ids }) => api.put(`/admin/albums/${albumId}/media/reorder`, { ids }),
    invalidate: [adminKeys.media, adminKeys.albums],
    success: false,
    onError: () => void queryClient.invalidateQueries({ queryKey: adminKeys.media }),
  });

  const move = (index: number, delta: -1 | 1) => {
    if (!items || !album) return;
    const next = moveItem(items, index, delta).map((m, i) => ({ ...m, sortOrder: i }));
    queryClient.setQueryData<AdminMedia[]>(mediaKey, next);
    reorder.mutate({ albumId: album.id, ids: next.map((m) => m.id) });
  };

  const bulk = useBulkMedia({
    onSuccess: (_, vars) => {
      setSelected((prev) => {
        const next = new Set(prev);
        vars.ids.forEach((id) => next.delete(id));
        return next;
      });
      setMoveIds(null);
      setDeleteIds(null);
      setPreviewIndex(null);
    },
  });

  const approve = useUpdateMedia({ success: 'Approved' });

  const setCover = useAdminMutation<AdminAlbum, { album: AdminAlbum; media: AdminMedia }>({
    mutationFn: ({ album: a, media: m }) => api.put<AdminAlbum>(`/admin/albums/${a.id}`, albumBody(a, m.id)),
    invalidate: [adminKeys.albums],
    success: (_, { album: a }) => `Cover updated for “${a.title}”`,
  });

  const allIds = items?.map((m) => m.id) ?? [];
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = allIds.some((id) => selected.has(id));
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const menu = (m: AdminMedia) => [
    { label: 'Preview', icon: Images, onSelect: () => setPreviewIndex(items?.indexOf(m) ?? null) },
    { label: 'Edit caption and alt text', icon: Pencil, onSelect: () => setEditing(m) },
    {
      label: 'Approve',
      icon: Check,
      onSelect: () => approve.mutate({ id: m.id, body: { status: 'APPROVED' } }),
      hidden: m.status === 'APPROVED',
    },
    {
      label: 'Set as album cover',
      icon: Star,
      onSelect: () => album && setCover.mutate({ album, media: m }),
      hidden: m.kind !== 'PHOTO' || m.status !== 'APPROVED' || album?.coverMediaId === m.id,
    },
    { label: 'Move to album', icon: FolderInput, onSelect: () => setMoveIds([m.id]) },
    { label: 'Delete', icon: Trash2, onSelect: () => setDeleteIds([m.id]), danger: true },
  ];

  const openNewAlbum = () => {
    setNewAlbum(true);
    setAlbumFormOpen(true);
  };

  if (albums.error) {
    return (
      <>
        <PageHeader title="Gallery" />
        <ErrorState error={albums.error} onRetry={() => void albums.refetch()} />
      </>
    );
  }

  const header = (
    <>
      <PageHeader
        title="Gallery"
        description="Manage the photos and videos in each album: upload, caption, reorder, move and delete."
        actions={
          <AButton onClick={openNewAlbum}>
            <Plus aria-hidden /> New album
          </AButton>
        }
      />
      <ActionGuide page="gallery" rows={MEDIA_ACTIONS} />
    </>
  );

  if (sortedAlbums && sortedAlbums.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No albums yet"
          description="Create an album first, then upload photos and videos into it."
          action={
            <AButton variant="emerald" onClick={openNewAlbum}>
              <Plus aria-hidden /> New album
            </AButton>
          }
        />
        <AlbumFormDialog open={albumFormOpen} onOpenChange={setAlbumFormOpen} album={null} onSaved={(a) => selectAlbum(a.id)} />
      </>
    );
  }

  return (
    <>
      {header}

      <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)]">
        {/* Album selector: list on tablet and up, select on phones. */}
        <nav aria-label="Albums" className="hidden md:block">
          <div className="sticky top-16 rounded-xl border border-navy/10 bg-white p-1.5">
            {!sortedAlbums ? (
              <div className="space-y-1.5 p-1" aria-hidden>
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded-md bg-navy/[0.06]" />
                ))}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {sortedAlbums.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => selectAlbum(a.id)}
                      aria-current={a.id === album?.id ? 'page' : undefined}
                      className={cn(
                        'flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors',
                        a.id === album?.id ? 'bg-navy text-white' : 'text-navy hover:bg-navy/[0.06]',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{a.title}</span>
                      {!a.isPublished && (
                        <Lock
                          className={cn('size-3.5 shrink-0', a.id === album?.id ? 'text-white/70' : 'text-muted')}
                          aria-label="Private"
                        />
                      )}
                      <span className={cn('text-[11px] tabular-nums', a.id === album?.id ? 'text-white/70' : 'text-muted')}>{a.mediaCount}</span>
                      <CountPill count={a.pendingCount} className="ml-0" label={`${a.pendingCount} pending`} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 border-t border-navy/[0.08] pt-1">
              <AButton asChild size="sm" variant="ghost" className="w-full justify-start">
                <Link to="/admin/albums">Manage albums</Link>
              </AButton>
            </div>
          </div>
        </nav>

        <div className="min-w-0">
          <AField label="Album" htmlFor="gallery-album" className="mb-3 md:hidden">
            <ASelect id="gallery-album" value={album?.id ?? ''} onChange={(e) => selectAlbum(e.target.value)} disabled={!sortedAlbums}>
              {!album && <option value="">Loading albums…</option>}
              {sortedAlbums?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                  {a.isPublished ? '' : ' (private)'} ({a.mediaCount}
                  {a.pendingCount > 0 ? `, ${a.pendingCount} pending` : ''})
                </option>
              ))}
            </ASelect>
          </AField>

          {album && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-navy">
                  {album.title}
                  <AlbumVisibilityBadge isPublished={album.isPublished} />
                </h2>
                <p className="text-xs text-muted">
                  {itemsLabel(album.mediaCount)}
                  {album.pendingCount > 0 ? ` · ${album.pendingCount} pending review` : ''} · /gallery/{album.slug}
                </p>
              </div>
              <AButton
                size="sm"
                onClick={() => {
                  setNewAlbum(false);
                  setAlbumFormOpen(true);
                }}
              >
                <Pencil aria-hidden /> Edit album
              </AButton>
              <AButton size="sm" variant={showUpload ? 'ghost' : 'emerald'} onClick={() => setShowUpload((v) => !v)} aria-expanded={showUpload}>
                {showUpload ? (
                  <>
                    <X aria-hidden /> Close upload
                  </>
                ) : (
                  <>
                    <Upload aria-hidden /> Upload
                  </>
                )}
              </AButton>
            </div>
          )}

          {album && showUpload && (
            <Panel title={`Upload to “${album.title}”`} className="mb-4">
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
                hint="Admin uploads are approved straight away and added to the end of this album."
              />
              <div className="mt-3 flex justify-end gap-2">
                <AButton variant="ghost" onClick={() => uploader.setFiles([])} disabled={uploader.uploading || uploader.files.length === 0}>
                  Clear
                </AButton>
                <AButton variant="emerald" loading={uploader.uploading} disabled={uploader.validCount === 0} onClick={() => void uploader.upload()}>
                  <Upload aria-hidden /> Upload {uploader.validCount > 0 ? itemsLabel(uploader.validCount) : ''}
                </AButton>
              </div>
            </Panel>
          )}

          <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
            <AButton size="sm" disabled={bulk.isPending} onClick={() => setMoveIds([...selected])}>
              <FolderInput aria-hidden /> Move to album
            </AButton>
            <AButton size="sm" variant="danger-ghost" disabled={bulk.isPending} onClick={() => setDeleteIds([...selected])}>
              <Trash2 aria-hidden /> Delete
            </AButton>
          </BulkBar>

          {items && items.length > 0 && (
            <div className="mb-2 flex items-center gap-2 text-[13px] text-muted">
              <ACheckbox
                id="gallery-select-all"
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={(on) => setSelected(on && !allSelected ? new Set(allIds) : new Set())}
              />
              <label htmlFor="gallery-select-all">Select all</label>
              <span className="ml-auto hidden sm:inline">Use the arrows on each item to change the order in the public gallery.</span>
            </div>
          )}

          {media.error ? (
            <ErrorState error={media.error} onRetry={() => void media.refetch()} />
          ) : items && items.length === 0 ? (
            <EmptyState
              title="This album is empty"
              description="Upload photos and videos, or move items here from the Media library."
              action={
                !showUpload && (
                  <AButton variant="emerald" onClick={() => setShowUpload(true)}>
                    <Upload aria-hidden /> Upload
                  </AButton>
                )
              }
            />
          ) : (
            <MediaGrid label={album ? `Items in ${album.title}` : 'Album items'} loading={!items}>
              {items?.map((m, index) => (
                <li key={m.id}>
                  <MediaCard
                    media={m}
                    selected={selected.has(m.id)}
                    onSelectedChange={(on) => toggle(m.id, on)}
                    onOpen={() => setPreviewIndex(index)}
                    actions={menu(m)}
                    badge={album?.coverMediaId === m.id ? <Badge tone="gold">Cover</Badge> : undefined}
                    footer={
                      <>
                        <IconButton
                          label={`Move ${mediaName(m)} earlier`}
                          tooltip={false}
                          disabled={index === 0 || reorder.isPending}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowLeft aria-hidden />
                        </IconButton>
                        <span className="text-[11px] tabular-nums text-muted">{index + 1}</span>
                        <IconButton
                          label={`Move ${mediaName(m)} later`}
                          tooltip={false}
                          disabled={index === items.length - 1 || reorder.isPending}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowRight aria-hidden />
                        </IconButton>
                      </>
                    }
                  />
                </li>
              ))}
            </MediaGrid>
          )}
        </div>
      </div>

      <MediaLightbox
        items={items ?? []}
        index={previewIndex}
        onIndexChange={setPreviewIndex}
        onClose={() => setPreviewIndex(null)}
        keysPaused={editing !== null || moveIds !== null || deleteIds !== null}
        actions={(m) => (
          <>
            <AButton size="sm" onClick={() => setEditing(m)}>
              <Pencil aria-hidden /> Edit
            </AButton>
            {m.kind === 'PHOTO' && m.status === 'APPROVED' && album && album.coverMediaId !== m.id && (
              <AButton size="sm" loading={setCover.isPending} onClick={() => setCover.mutate({ album, media: m })}>
                <Star aria-hidden /> Set as cover
              </AButton>
            )}
            <AButton size="sm" onClick={() => setMoveIds([m.id])}>
              <FolderInput aria-hidden /> Move
            </AButton>
            <AButton size="sm" variant="danger-ghost" onClick={() => setDeleteIds([m.id])}>
              <Trash2 aria-hidden /> Delete
            </AButton>
          </>
        )}
      />

      <MediaEditDialog media={editing} open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} />

      <MoveToAlbumDialog
        open={moveIds !== null}
        onOpenChange={(open) => !open && setMoveIds(null)}
        count={moveIds?.length ?? 0}
        currentAlbumId={album?.id}
        loading={bulk.isPending}
        onConfirm={(albumId) => moveIds && bulk.mutate({ ids: moveIds, action: 'MOVE', albumId })}
      />

      <Confirm
        open={deleteIds !== null}
        onOpenChange={(open) => !open && setDeleteIds(null)}
        title={deleteIds && deleteIds.length > 1 ? `Delete ${deleteIds.length} items?` : 'Delete this item?'}
        description="The files are removed from storage permanently. This cannot be undone."
        confirmLabel="Delete"
        loading={bulk.isPending}
        onConfirm={() => deleteIds && bulk.mutate({ ids: deleteIds, action: 'DELETE' })}
      />

      <AlbumFormDialog
        open={albumFormOpen}
        onOpenChange={setAlbumFormOpen}
        album={newAlbum ? null : album}
        onSaved={(a) => newAlbum && selectAlbum(a.id)}
      />
    </>
  );
}
