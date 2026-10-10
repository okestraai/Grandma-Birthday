import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import type { AdminAlbum, ReorderRequest } from '@birthday/types';
import { api } from '@/lib/api';
import { adminKeys, affects, moveItem, useAdminMutation } from '@/lib/admin-api';
import { Badge } from '@/components/ui/badge';
import { AButton, IconButton, PageHeader, Tip } from '@/components/admin/ui';
import { DataTable, type Column } from '@/components/admin/data-table';
import { Confirm } from '@/components/admin/overlays';
import { MediaThumb, useAlbums } from '@/components/admin/media';
import { ReorderButtons } from '@/components/admin/misc';
import { AlbumFormDialog, AlbumVisibilityBadge } from '@/components/admin/media/AlbumFormDialog';
import { ActionGuide } from '@/components/admin/action-guide';
import { ALBUM_ACTIONS } from '@/components/admin/action-guide-content';

function galleryHref(album: AdminAlbum): string {
  return `/admin/gallery?album=${encodeURIComponent(album.id)}`;
}

export default function AlbumsPage() {
  const queryClient = useQueryClient();
  const albums = useAlbums();
  const [editing, setEditing] = useState<AdminAlbum | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<AdminAlbum | null>(null);

  const rows = useMemo(() => albums.data?.slice().sort((a, b) => a.sortOrder - b.sortOrder), [albums.data]);

  const reorder = useAdminMutation<void, ReorderRequest>({
    mutationFn: (body) => api.put('/admin/albums/reorder', body),
    invalidate: [adminKeys.albums],
    success: false,
    onError: () => void queryClient.invalidateQueries({ queryKey: adminKeys.albums }),
  });

  const remove = useAdminMutation<void, AdminAlbum>({
    mutationFn: (album) => api.delete(`/admin/albums/${album.id}`),
    invalidate: affects.media,
    success: (_, album) => `Deleted “${album.title}”. Its photos and videos are now in “No album”.`,
    onSuccess: () => setDeleting(null),
  });

  const move = (index: number, delta: -1 | 1) => {
    if (!rows) return;
    const next = moveItem(rows, index, delta).map((album, i) => ({ ...album, sortOrder: i }));
    queryClient.setQueryData<AdminAlbum[]>(adminKeys.albums, next);
    reorder.mutate({ ids: next.map((a) => a.id) });
  };

  const openForm = (album: AdminAlbum | null) => {
    setEditing(album);
    setFormOpen(true);
  };

  const actions = (album: AdminAlbum) => (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton label={`Edit ${album.title}`} onClick={() => openForm(album)}>
        <Pencil aria-hidden />
      </IconButton>
      <Tip content="Open in Gallery">
        <AButton asChild size="icon" variant="ghost">
          <Link to={galleryHref(album)} aria-label={`Open ${album.title} in Gallery`}>
            <FolderOpen aria-hidden />
          </Link>
        </AButton>
      </Tip>
      <IconButton label={`Delete ${album.title}`} variant="danger-ghost" onClick={() => setDeleting(album)}>
        <Trash2 aria-hidden />
      </IconButton>
    </div>
  );

  const badges = (album: AdminAlbum) => (
    <div className="flex flex-wrap gap-1">
      <AlbumVisibilityBadge isPublished={album.isPublished} />
      {album.pendingCount > 0 && <Badge tone="warning">{album.pendingCount} pending</Badge>}
    </div>
  );

  const columns: Column<AdminAlbum>[] = [
    {
      id: 'cover',
      header: <span className="sr-only">Cover</span>,
      cell: (album) => <MediaThumb media={album.cover} className="size-12 rounded-md" alt={`Cover of ${album.title}`} />,
      className: 'w-16',
    },
    {
      id: 'title',
      header: 'Title',
      cell: (album) => (
        <div className="min-w-0 max-w-sm">
          <Link to={galleryHref(album)} className="font-medium text-navy hover:underline">
            {album.title}
          </Link>
          {album.description && <p className="truncate text-xs text-muted">{album.description}</p>}
        </div>
      ),
    },
    { id: 'slug', header: 'Slug', cell: (album) => <code className="text-xs text-muted">{album.slug}</code>, hideBelow: 'lg' },
    { id: 'items', header: 'Items', cell: (album) => <span className="tabular-nums">{album.mediaCount}</span> },
    { id: 'status', header: 'Visibility', cell: badges },
    {
      id: 'order',
      header: 'Order',
      cell: (album) => {
        const index = rows?.indexOf(album) ?? 0;
        return <ReorderButtons index={index} count={rows?.length ?? 0} onMove={(d) => move(index, d)} label={album.title} disabled={reorder.isPending} />;
      },
    },
    { id: 'actions', header: <span className="sr-only">Actions</span>, cell: actions, headerClassName: 'text-right' },
  ];

  return (
    <>
      <PageHeader
        title="Albums"
        description="Group photos and videos for the public gallery. Use the arrows to set the order albums appear in."
        actions={
          <AButton variant="emerald" onClick={() => openForm(null)}>
            <Plus aria-hidden /> New album
          </AButton>
        }
      />
      <ActionGuide page="albums" rows={ALBUM_ACTIONS} />

      <DataTable
        caption="Albums"
        columns={columns}
        rows={rows}
        getRowId={(album) => album.id}
        loading={albums.isLoading}
        error={albums.error}
        onRetry={() => void albums.refetch()}
        emptyTitle="No albums yet"
        emptyDescription="Create an album, then add photos to it from the Gallery."
        emptyAction={
          <AButton variant="emerald" onClick={() => openForm(null)}>
            <Plus aria-hidden /> New album
          </AButton>
        }
        mobileCard={(album) => {
          const index = rows?.indexOf(album) ?? 0;
          return (
            <div className="flex gap-3">
              <MediaThumb media={album.cover} className="size-14 shrink-0 rounded-md" alt={`Cover of ${album.title}`} />
              <div className="min-w-0 flex-1">
                <Link to={galleryHref(album)} className="block truncate text-[13px] font-medium text-navy">
                  {album.title}
                </Link>
                <p className="text-xs text-muted">
                  {album.mediaCount} item{album.mediaCount === 1 ? '' : 's'} · /{album.slug}
                </p>
                <div className="mt-1">{badges(album)}</div>
                <div className="-ml-2 mt-1 flex items-center justify-between">
                  <ReorderButtons index={index} count={rows?.length ?? 0} onMove={(d) => move(index, d)} label={album.title} disabled={reorder.isPending} />
                  {actions(album)}
                </div>
              </div>
            </div>
          );
        }}
      />

      <AlbumFormDialog open={formOpen} onOpenChange={setFormOpen} album={editing} />

      <Confirm
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Delete “${deleting.title}”?` : 'Delete album?'}
        description={
          <>
            <p>The album is removed from the gallery.</p>
            <p className="mt-2 font-medium">{"Photos and videos in this album are kept and moved to 'No album'."}</p>
          </>
        }
        confirmLabel="Delete album"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </>
  );
}
