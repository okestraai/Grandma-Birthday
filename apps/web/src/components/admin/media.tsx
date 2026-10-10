import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Film, ImageIcon, ImageOff, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminMedia, AdminUploadResult, Paginated, PublicMedia } from '@birthday/types';
import { api, apiUrl, errorMessage, isApiError, uploadWithProgress } from '@/lib/api';
import { ACCEPTED_PHOTO_TYPES, ACCEPTED_VIDEO_TYPES, MB, adminKeys, affects } from '@/lib/admin-api';
import { albumsQuery, settingsQuery } from '@/lib/admin-queries';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { UploadDropzone, type SelectedFile } from '@/components/ui/upload-dropzone';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { AdminDialog } from './overlays';
import { AButton, ASelect, SearchInput } from './ui';
import { Pagination } from './data-table';

/** Square thumbnail for any media item. Videos show a film icon (they have no thumbnail). */
export function MediaThumb({
  media,
  className,
  alt,
  size = 'thumb',
}: {
  media: Pick<PublicMedia, 'kind' | 'urls' | 'altText' | 'caption'> | null | undefined;
  className?: string;
  alt?: string;
  size?: 'thumb' | 'medium';
}) {
  const [failed, setFailed] = useState(false);
  const src = media ? (size === 'medium' ? (media.urls.medium ?? media.urls.thumb) : media.urls.thumb) : null;
  const label = alt ?? media?.altText ?? media?.caption ?? '';
  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden bg-navy/[0.06] text-muted', className)}>
      {!media ? (
        <ImageIcon className="size-5" aria-hidden />
      ) : src && !failed ? (
        <img src={apiUrl(src)} alt={label} loading="lazy" decoding="async" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : media.kind === 'VIDEO' ? (
        <Film className="size-5" aria-label={label || 'Video'} />
      ) : (
        <ImageOff className="size-5" aria-label={label || 'Image unavailable'} />
      )}
      {media?.kind === 'VIDEO' && src && !failed && (
        <span className="absolute bottom-1 right-1 rounded bg-navy/75 p-0.5 text-white" aria-hidden>
          <Film className="size-3" />
        </span>
      )}
    </div>
  );
}

/** Photo/video preview at medium size, or a video player. */
export function MediaPreview({ media, className }: { media: AdminMedia | PublicMedia; className?: string }) {
  if (media.kind === 'VIDEO') {
    return (
      <video
        key={media.id}
        src={apiUrl(media.urls.original)}
        controls
        preload="metadata"
        className={cn('max-h-[65dvh] w-full rounded-lg bg-black', className)}
      >
        <track kind="captions" />
      </video>
    );
  }
  return (
    <img
      key={media.id}
      src={apiUrl(media.urls.medium ?? media.urls.original)}
      alt={media.altText ?? media.caption ?? ''}
      className={cn('mx-auto max-h-[65dvh] w-auto max-w-full rounded-lg object-contain', className)}
    />
  );
}

export interface UploadLimits {
  maxPhotoBytes: number;
  maxVideoBytes: number;
  videoEnabled: boolean;
  maxFiles: number;
}

/** Upload limits from settings (admins can read them); sensible defaults while loading. */
export function useUploadLimits(): UploadLimits {
  const { can } = useAuth();
  const settings = useQuery({
    ...settingsQuery,
    enabled: can('settings:manage'),
    staleTime: 5 * 60_000,
  });
  return {
    maxPhotoBytes: settings.data?.maxPhotoBytes ?? 25 * MB,
    maxVideoBytes: settings.data?.maxVideoBytes ?? 500 * MB,
    videoEnabled: settings.data?.videoUploadsEnabled ?? true,
    // Admins may upload more at once than guests.
    maxFiles: Math.max(settings.data?.maxFilesPerUpload ?? 20, 50),
  };
}

export function useAlbums() {
  return useQuery(albumsQuery);
}

/** The server's message (it names the real limits); a fallback when a proxy refused the upload without one. */
export function uploadErrorMessage(error: unknown): string {
  if (isApiError(error) && error.status === 413 && error.code === 'INTERNAL_ERROR') {
    return 'The upload was too big for the server to accept. Try fewer or smaller files at a time.';
  }
  return errorMessage(error);
}

/**
 * State and submit for admin uploads (POST /admin/media, multipart `files`, optional `albumId`).
 * One request per batch; progress is shared across the batch.
 */
export function useAdminUpload({ albumId, onDone }: { albumId?: string | null; onDone?: (result: AdminUploadResult) => void } = {}) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>();
  const [uploading, setUploading] = useState(false);

  const valid = files.filter((f) => !f.error);

  const upload = async () => {
    if (valid.length === 0) return;
    const form = new FormData();
    valid.forEach((f) => form.append('files', f.file, f.file.name));
    if (albumId) form.append('albumId', albumId);
    setUploading(true);
    setProgress(Object.fromEntries(valid.map((f) => [f.id, 0])));
    try {
      const result = await uploadWithProgress<AdminUploadResult>('/admin/media', form, (p) =>
        setProgress(Object.fromEntries(valid.map((f) => [f.id, p.percent]))),
      );
      if (result.accepted > 0) toast.success(`${result.accepted} file${result.accepted === 1 ? '' : 's'} uploaded`);
      // Files the server refused stay in the list with its reason, so the admin can see and remove them.
      const reasons = new Map(result.rejected.map((r) => [r.filename, r.reason]));
      const matched = new Set<string>();
      const kept: SelectedFile[] = [];
      for (const f of files) {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
        const name = reasons.has(f.file.name) ? f.file.name : f.file.name.slice(0, 120);
        const reason = f.error ? undefined : reasons.get(name);
        if (reason) {
          matched.add(name);
          kept.push({ ...f, previewUrl: null, error: reason });
        }
      }
      if (result.rejected.length === 1) {
        toast.error(`${result.rejected[0].filename} was not uploaded. ${result.rejected[0].reason}`);
      } else if (result.rejected.length > 1) {
        toast.error(`${result.rejected.length} files were not uploaded. The reason is shown on each file.`);
        result.rejected.filter((r) => !matched.has(r.filename)).forEach((r) => toast.error(`${r.filename}: ${r.reason}`));
      }
      setFiles(kept);
      await Promise.all(affects.media.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onDone?.(result);
    } catch (error) {
      toast.error(uploadErrorMessage(error));
    } finally {
      setUploading(false);
      setProgress(undefined);
    }
  };

  return { files, setFiles, progress, uploading, upload, validCount: valid.length };
}

/**
 * Pick an approved photo from the media library, or upload a new one.
 * GET /admin/media?status=APPROVED&kind=PHOTO&q=&albumId=
 */
export function MediaPicker({
  open,
  onOpenChange,
  onSelect,
  title = 'Choose a photo',
  albumId: fixedAlbumId,
  kind = 'PHOTO',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (media: AdminMedia) => void;
  title?: string;
  /** Restrict to one album (e.g. choosing an album cover). */
  albumId?: string;
  kind?: 'PHOTO' | 'VIDEO';
}) {
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [q, setQ] = useState('');
  const [albumId, setAlbumId] = useState(fixedAlbumId ?? '');
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<AdminMedia | null>(null);
  const albums = useAlbums();
  const limits = useUploadLimits();

  useEffect(() => {
    if (open) {
      setChosen(null);
      setTab('library');
      setAlbumId(fixedAlbumId ?? '');
      setPage(1);
    }
  }, [open, fixedAlbumId]);

  const params = { status: 'APPROVED', kind, q, albumId, page, pageSize: 24, sort: 'newest' };
  const list = useQuery({
    queryKey: adminKeys.mediaList({ picker: true, ...params }),
    queryFn: () => api.get<Paginated<AdminMedia>>('/admin/media', params),
    enabled: open && tab === 'library',
    placeholderData: keepPreviousData,
  });

  const uploader = useAdminUpload({
    albumId: albumId && albumId !== 'none' ? albumId : null,
    onDone: (result) => {
      const first = result.media.find((m) => m.kind === kind);
      if (first) {
        onSelect(first);
        onOpenChange(false);
      } else if (result.rejected.length === 0) {
        setTab('library');
      }
    },
  });

  const confirm = () => {
    if (!chosen) return;
    onSelect(chosen);
    onOpenChange(false);
  };

  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="xl"
      footer={
        tab === 'library' ? (
          <>
            <AButton variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </AButton>
            <AButton variant="primary" disabled={!chosen} onClick={confirm}>
              Use selected
            </AButton>
          </>
        ) : (
          <>
            <AButton variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </AButton>
            <AButton variant="emerald" loading={uploader.uploading} disabled={uploader.validCount === 0} onClick={() => void uploader.upload()}>
              <Upload aria-hidden /> Upload and use
            </AButton>
          </>
        )
      }
    >
      <div role="tablist" aria-label="Source" className="mb-3 flex gap-1 border-b border-navy/10">
        {(['library', 'upload'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              '-mb-px h-10 border-b-2 px-3 text-[13px] font-medium md:h-9',
              tab === value ? 'border-gold-rich text-navy' : 'border-transparent text-muted hover:text-navy',
            )}
          >
            {value === 'library' ? 'Media library' : 'Upload new'}
          </button>
        ))}
      </div>

      {tab === 'library' ? (
        <div role="tabpanel" aria-label="Media library">
          <div className="mb-3 flex flex-wrap gap-2">
            <SearchInput
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
              placeholder="Search captions or file names"
            />
            {!fixedAlbumId && (
              <ASelect
                aria-label="Album"
                value={albumId}
                onChange={(e) => {
                  setAlbumId(e.target.value);
                  setPage(1);
                }}
                className="w-full sm:w-56"
              >
                <option value="">All albums</option>
                <option value="none">No album</option>
                {albums.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </ASelect>
            )}
          </div>
          {list.error ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : list.data && list.data.items.length === 0 ? (
            <EmptyState title="No approved photos found" description="Try another search, or upload a new photo." />
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label="Photos" aria-busy={list.isFetching}>
              {(list.data?.items ?? Array.from({ length: 12 }, () => null)).map((m, i) =>
                m ? (
                  <li key={m.id}>
                    <button
                      type="button"
                      aria-pressed={chosen?.id === m.id}
                      onClick={() => setChosen(m)}
                      onDoubleClick={() => {
                        onSelect(m);
                        onOpenChange(false);
                      }}
                      className={cn(
                        'block w-full overflow-hidden rounded-lg ring-2 ring-transparent transition focus-visible:outline-none focus-visible:ring-gold-rich',
                        chosen?.id === m.id && 'ring-gold-rich',
                      )}
                    >
                      <MediaThumb media={m} className="aspect-square w-full" />
                      <span className="block truncate px-0.5 pt-1 text-left text-[11px] text-muted">{m.caption ?? m.originalFilename}</span>
                    </button>
                  </li>
                ) : (
                  <li key={i} className="aspect-square animate-pulse rounded-lg bg-navy/[0.06]" aria-hidden />
                ),
              )}
            </ul>
          )}
          {list.data && (
            <Pagination
              page={list.data.page}
              totalPages={list.data.totalPages}
              total={list.data.total}
              pageSize={list.data.pageSize}
              onPageChange={setPage}
            />
          )}
        </div>
      ) : (
        <div role="tabpanel" aria-label="Upload new">
          <UploadDropzone
            files={uploader.files}
            onFilesChange={uploader.setFiles}
            acceptedMimeTypes={kind === 'VIDEO' ? ACCEPTED_VIDEO_TYPES : ACCEPTED_PHOTO_TYPES}
            maxFiles={1}
            maxPhotoBytes={limits.maxPhotoBytes}
            maxVideoBytes={limits.maxVideoBytes}
            videoEnabled={kind === 'VIDEO'}
            progress={uploader.progress}
            disabled={uploader.uploading}
            hint={
              albumId && albumId !== 'none'
                ? `Will be added to "${albums.data?.find((a) => a.id === albumId)?.title ?? 'the selected album'}"`
                : 'Uploaded by an admin, so it is approved straight away.'
            }
          />
        </div>
      )}
    </AdminDialog>
  );
}

/** A form control for a single media reference: thumbnail, Choose, Remove. */
export function MediaField({
  id,
  label,
  value,
  preview,
  onChange,
  hint,
  albumId,
}: {
  id: string;
  label: string;
  value: string | null;
  /** The currently chosen media (for the thumbnail). */
  preview: Pick<PublicMedia, 'kind' | 'urls' | 'altText' | 'caption'> | null;
  onChange: (id: string | null, media: AdminMedia | null) => void;
  hint?: string;
  albumId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p id={`${id}-label`} className="mb-1 text-[13px] font-medium text-navy">
        {label}
      </p>
      <div className="flex items-center gap-3">
        <MediaThumb media={value ? preview : null} className="size-16 shrink-0 rounded-lg" alt={`${label} preview`} />
        <div className="flex flex-wrap gap-2">
          <AButton size="sm" onClick={() => setOpen(true)} aria-describedby={`${id}-label`}>
            <ImageIcon aria-hidden /> {value ? 'Change' : 'Choose'}
          </AButton>
          {value && (
            <AButton size="sm" variant="danger-ghost" onClick={() => onChange(null, null)} aria-describedby={`${id}-label`}>
              <X aria-hidden /> Remove
            </AButton>
          )}
        </div>
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <MediaPicker open={open} onOpenChange={setOpen} onSelect={(m) => onChange(m.id, m)} title={`Choose ${label.toLowerCase()}`} albumId={albumId} />
    </div>
  );
}
