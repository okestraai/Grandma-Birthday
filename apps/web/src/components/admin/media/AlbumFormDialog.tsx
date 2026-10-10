import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { AdminAlbum, AdminMedia, PublicMedia, UpsertAlbumRequest } from '@birthday/types';
import { api, isApiError } from '@/lib/api';
import { affects, nullIfBlank, reportFormError, useAdminMutation } from '@/lib/admin-api';
import { AdminDialog } from '../overlays';
import { Globe2, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AButton, AField, AInput, ATextarea, describedBy } from '../ui';
import { MediaField } from '../media';
import { Badge } from '@/components/ui/badge';

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

const schema = z.object({
  title: z.string().trim().min(1, 'Give the album a title.').min(2, 'Use at least 2 characters.').max(120, 'Keep the title to 120 characters or fewer.'),
  slug: z
    .string()
    .trim()
    .max(80, 'Keep the slug to 80 characters or fewer.')
    .regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, 'Use lowercase letters, numbers and single hyphens, e.g. "family-portraits".'),
  description: z.string().refine((v) => v.trim().length <= 1000, 'Keep the description to 1,000 characters or fewer.'),
  isPublished: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

/** "Public" or "Private" (with a lock) for album lists and headers. */
export function AlbumVisibilityBadge({ isPublished }: { isPublished: boolean }) {
  return isPublished ? (
    <Badge tone="success">
      <Globe2 className="size-3" aria-hidden /> Public
    </Badge>
  ) : (
    <Badge tone="navy" title="Only admins can see this album">
      <Lock className="size-3" aria-hidden /> Private
    </Badge>
  );
}

const VISIBILITY = [
  { published: true, label: 'Public', description: 'Shown in the gallery', icon: Globe2 },
  { published: false, label: 'Private', description: 'Only admins can see it', icon: Lock },
] as const;

/** Create or edit an album. POST /admin/albums, PUT /admin/albums/:id */
export function AlbumFormDialog({
  open,
  onOpenChange,
  album,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null creates a new album. */
  album: AdminAlbum | null;
  onSaved?: (album: AdminAlbum) => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', slug: '', description: '', isPublished: true },
  });
  const { register, handleSubmit, reset, setError, setValue, watch, formState } = form;
  const errors = formState.errors;
  const [slugTouched, setSlugTouched] = useState(false);
  const [cover, setCover] = useState<{ id: string | null; preview: PublicMedia | AdminMedia | null }>({ id: null, preview: null });

  useEffect(() => {
    if (!open) return;
    reset({
      title: album?.title ?? '',
      slug: album?.slug ?? '',
      description: album?.description ?? '',
      isPublished: album?.isPublished ?? true,
    });
    setSlugTouched(!!album);
    setCover({ id: album?.coverMediaId ?? null, preview: album?.cover ?? null });
  }, [open, album, reset]);

  const title = watch('title');
  const isPublished = watch('isPublished');
  const suggestedSlug = slugify(title ?? '');

  useEffect(() => {
    if (!slugTouched) setValue('slug', suggestedSlug);
  }, [suggestedSlug, slugTouched, setValue]);

  const save = useAdminMutation<AdminAlbum, UpsertAlbumRequest>({
    mutationFn: (body) => (album ? api.put<AdminAlbum>(`/admin/albums/${album.id}`, body) : api.post<AdminAlbum>('/admin/albums', body)),
    invalidate: affects.media,
    success: album ? 'Album saved' : 'Album created',
    toastError: false,
    onSuccess: (saved) => {
      onSaved?.(saved);
      onOpenChange(false);
    },
    onError: (error) => {
      if (isApiError(error, 'CONFLICT')) {
        setError('slug', { type: 'server', message: 'Another album already uses this slug. Choose a different one.' });
        return;
      }
      reportFormError(error, setError, ['title', 'slug', 'description', 'isPublished']);
    },
  });

  const onSubmit = handleSubmit((values) => {
    const body: UpsertAlbumRequest = {
      title: values.title.trim(),
      description: nullIfBlank(values.description),
      isPublished: values.isPublished,
    };
    const slug = values.slug.trim();
    if (slug) body.slug = slug;
    if (album) body.coverMediaId = cover.id;
    save.mutate(body);
  });

  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title={album ? `Edit “${album.title}”` : 'New album'}
      footer={
        <>
          <AButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </AButton>
          <AButton variant="emerald" type="submit" form="album-form" loading={save.isPending}>
            {album ? 'Save album' : 'Create album'}
          </AButton>
        </>
      }
    >
      <form id="album-form" className="space-y-4" noValidate onSubmit={(e) => void onSubmit(e)}>
        <AField label="Title" htmlFor="album-title" required error={errors.title?.message}>
          <AInput id="album-title" autoComplete="off" placeholder="e.g. Family portraits" aria-invalid={!!errors.title} aria-describedby={describedBy('album-title', errors.title)} {...register('title')} />
        </AField>
        <AField
          label="Slug"
          htmlFor="album-slug"
          error={errors.slug?.message}
          hint={slugTouched ? 'Used in the gallery link: /gallery/<slug>. Leave blank to generate one from the title.' : 'Suggested from the title. Edit it if you like.'}
        >
          <AInput
            id="album-slug"
            autoComplete="off"
            placeholder="e.g. family-portraits"
            spellCheck={false}
            aria-invalid={!!errors.slug}
            aria-describedby={describedBy('album-slug', errors.slug, true)}
            {...register('slug', { onChange: () => setSlugTouched(true) })}
          />
        </AField>
        <AField label="Description" htmlFor="album-description" error={errors.description?.message}>
          <ATextarea
            id="album-description"
            rows={3}
            placeholder="A line about what's in this album"
            aria-invalid={!!errors.description}
            aria-describedby={describedBy('album-description', errors.description)}
            {...register('description')}
          />
        </AField>
        <fieldset>
          <legend className="mb-1 text-[13px] font-medium text-navy">Visibility</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {VISIBILITY.map((option) => {
              const checked = isPublished === option.published;
              const Icon = option.icon;
              return (
                <label
                  key={option.label}
                  className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold-rich',
                    checked ? 'border-navy bg-navy/[0.04]' : 'border-navy/15 hover:border-navy/30',
                  )}
                >
                  <input
                    type="radio"
                    name="album-visibility"
                    className="sr-only"
                    checked={checked}
                    onChange={() => setValue('isPublished', option.published, { shouldDirty: true })}
                  />
                  <Icon className={cn('mt-0.5 size-4 shrink-0', checked ? 'text-navy' : 'text-muted')} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-navy">{option.label}</span>
                    <span className="block text-xs text-muted">{option.description}</span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'ml-auto mt-0.5 size-4 shrink-0 rounded-full border',
                      checked ? 'border-[5px] border-navy bg-white' : 'border-navy/30 bg-white',
                    )}
                  />
                </label>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {isPublished
              ? 'Public albums appear in the gallery once they have at least one approved photo.'
              : 'Photos in a private album also won’t show on public pages such as the timeline or family tree.'}
          </p>
        </fieldset>
        {album ? (
          <MediaField
            id="album-cover"
            label="Cover photo"
            value={cover.id}
            preview={cover.preview}
            albumId={album.id}
            onChange={(id, media) => setCover({ id, preview: media })}
            hint="Chosen from the approved photos in this album. Without one, the gallery uses the first photo."
          />
        ) : (
          <p className="rounded-lg bg-cream/60 px-3 py-2 text-xs text-muted">
            You can choose a cover photo after the album has photos: open the album in the Gallery, then use “Set as cover”, or edit the album here.
          </p>
        )}
      </form>
    </AdminDialog>
  );
}
