import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { AdminMedia, ModerationStatus, UpdateMediaRequest } from '@birthday/types';
import { nullIfBlank, reportFormError } from '@/lib/admin-api';
import { AdminDialog } from '../overlays';
import { AButton, AField, AInput, ASelect, ATextarea, describedBy } from '../ui';
import { MediaThumb, useAlbums } from '../media';
import { useUpdateMedia } from './actions';

const schema = z.object({
  caption: z.string().refine((v) => v.trim().length <= 500, 'Keep the caption to 500 characters or fewer.'),
  altText: z.string().refine((v) => v.trim().length <= 300, 'Keep the alt text to 300 characters or fewer.'),
  albumId: z.string(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
});
type FormValues = z.infer<typeof schema>;

/**
 * Edit caption and alt text (and optionally album and moderation status) of one media item.
 * PATCH /admin/media/:id
 */
export function MediaEditDialog({
  media,
  open,
  onOpenChange,
  showAlbum = false,
  showStatus = false,
  onSaved,
}: {
  media: AdminMedia | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showAlbum?: boolean;
  showStatus?: boolean;
  onSaved?: (media: AdminMedia) => void;
}) {
  const albums = useAlbums();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { caption: '', altText: '', albumId: '', status: 'APPROVED' },
  });
  const { register, handleSubmit, reset, setError, setValue, watch, formState } = form;
  const albumId = watch('albumId');
  const errors = formState.errors;

  useEffect(() => {
    if (open && media) {
      reset({ caption: media.caption ?? '', altText: media.altText ?? '', albumId: media.albumId ?? '', status: media.status });
    }
  }, [open, media, reset]);

  const update = useUpdateMedia({
    success: 'Media details saved',
    toastError: false,
    onSuccess: (saved) => {
      onSaved?.(saved);
      onOpenChange(false);
    },
    onError: (error) => reportFormError(error, setError, ['caption', 'altText', 'albumId', 'status']),
  });

  const onSubmit = handleSubmit((values) => {
    if (!media) return;
    const body: UpdateMediaRequest = { caption: nullIfBlank(values.caption), altText: nullIfBlank(values.altText) };
    if (showAlbum) body.albumId = values.albumId || null;
    if (showStatus) body.status = values.status as ModerationStatus;
    update.mutate({ id: media.id, body });
  });

  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit media details"
      description={media?.originalFilename}
      footer={
        <>
          <AButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </AButton>
          <AButton variant="primary" type="submit" form="media-edit-form" loading={update.isPending}>
            Save
          </AButton>
        </>
      }
    >
      <form id="media-edit-form" onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
        {media && <MediaThumb media={media} size="medium" className="mx-auto aspect-video w-full max-w-sm rounded-lg" />}
        <AField label="Caption" htmlFor="media-caption" error={errors.caption?.message} hint="Shown under the photo in the public gallery.">
          <ATextarea
            id="media-caption"
            rows={3}
            placeholder="e.g. Cutting the cake with the grandchildren"
            aria-invalid={!!errors.caption}
            aria-describedby={describedBy('media-caption', errors.caption, true)}
            {...register('caption')}
          />
        </AField>
        <AField
          label="Alt text"
          htmlFor="media-alt"
          error={errors.altText?.message}
          hint="Describe the photo for people using screen readers, e.g. “Grandma cutting the cake with her grandchildren”."
        >
          <AInput id="media-alt" placeholder="e.g. Woman in a gold gele smiling beside a cake" aria-invalid={!!errors.altText} aria-describedby={describedBy('media-alt', errors.altText, true)} {...register('altText')} />
        </AField>
        {(showAlbum || showStatus) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {showAlbum && (
              <AField label="Album" htmlFor="media-album" error={errors.albumId?.message}>
                <ASelect
                  id="media-album"
                  aria-invalid={!!errors.albumId}
                  aria-describedby={describedBy('media-album', errors.albumId)}
                  value={albumId}
                  onChange={(e) => setValue('albumId', e.target.value, { shouldDirty: true })}
                >
                  <option value="">No album</option>
                  {albums.data?.map((album) => (
                    <option key={album.id} value={album.id}>
                      {album.title}
                    </option>
                  ))}
                </ASelect>
              </AField>
            )}
            {showStatus && (
              <AField label="Status" htmlFor="media-status" error={errors.status?.message} hint="Only approved items appear on the public site.">
                <ASelect id="media-status" aria-invalid={!!errors.status} aria-describedby={describedBy('media-status', errors.status, true)} {...register('status')}>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </ASelect>
              </AField>
            )}
          </div>
        )}
      </form>
    </AdminDialog>
  );
}
