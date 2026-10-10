import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { AdminTimelineEntry, PublicMedia, TimelineCategory, UpsertTimelineEntryRequest } from '@birthday/types';
import { api } from '@/lib/api';
import { adminKeys, nullIfBlank, reportFormError, useAdminMutation } from '@/lib/admin-api';
import { AdminDialog } from '../overlays';
import { AButton, AField, AInput, ASelect, ATextarea, SwitchRow, describedBy } from '../ui';
import { MediaField } from '../media';

export const TIMELINE_CATEGORIES: { value: TimelineCategory; label: string }[] = [
  { value: 'BIRTH', label: 'Birth' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'CAREER', label: 'Career' },
  { value: 'FAMILY', label: 'Family' },
  { value: 'FAITH', label: 'Faith' },
  { value: 'ACHIEVEMENT', label: 'Achievement' },
  { value: 'TRAVEL', label: 'Travel' },
  { value: 'MILESTONE', label: 'Milestone' },
  { value: 'OTHER', label: 'Other' },
];

export const categoryLabel = (value: TimelineCategory) => TIMELINE_CATEGORIES.find((c) => c.value === value)?.label ?? value;

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const currentYear = new Date().getFullYear();

const schema = z.object({
  year: z
    .string()
    .trim()
    .min(1, 'Enter the year.')
    .refine((v) => /^\d{4}$/.test(v) && Number(v) >= 1800 && Number(v) <= currentYear + 5, `Enter a year between 1800 and ${currentYear + 5}.`),
  month: z.string(),
  title: z.string().trim().min(1, 'Give the moment a title.').min(2, 'Use at least 2 characters.').max(150, 'Keep the title to 150 characters or fewer.'),
  description: z.string().refine((v) => v.trim().length <= 3000, 'Keep the description to 3,000 characters or fewer.'),
  category: z.enum(['BIRTH', 'EDUCATION', 'CAREER', 'FAMILY', 'FAITH', 'ACHIEVEMENT', 'TRAVEL', 'MILESTONE', 'OTHER']),
  mediaId: z.string().nullable(),
  isPublished: z.boolean(),
});

type FormValues = z.infer<typeof schema>;
type Preview = Pick<PublicMedia, 'kind' | 'urls' | 'altText' | 'caption'> | null;

/** Create (entry null) or edit a timeline moment. Mount only while open so the form starts fresh. */
export function TimelineEntryDialog({ entry, onClose }: { entry: AdminTimelineEntry | null; onClose: () => void }) {
  const [preview, setPreview] = useState<Preview>(entry?.media ?? null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      year: entry ? String(entry.year) : '',
      month: entry?.month ? String(entry.month) : '',
      title: entry?.title ?? '',
      description: entry?.description ?? '',
      category: entry?.category ?? 'MILESTONE',
      mediaId: entry?.mediaId ?? null,
      isPublished: entry?.isPublished ?? true,
    },
  });

  const save = useAdminMutation<AdminTimelineEntry, UpsertTimelineEntryRequest>({
    mutationFn: (body) =>
      entry ? api.put<AdminTimelineEntry>(`/admin/timeline/${entry.id}`, body) : api.post<AdminTimelineEntry>('/admin/timeline', body),
    invalidate: [adminKeys.timeline],
    success: entry ? 'Timeline moment updated.' : 'Timeline moment added.',
    toastError: false,
    onSuccess: onClose,
    onError: (error) => reportFormError(error, setError),
  });

  const submit = handleSubmit((v) =>
    save.mutate({
      year: Number(v.year),
      month: v.month ? Number(v.month) : null,
      title: v.title.trim(),
      description: nullIfBlank(v.description),
      category: v.category,
      mediaId: v.mediaId,
      isPublished: v.isPublished,
    }),
  );

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={entry ? 'Edit timeline moment' : 'Add timeline moment'}
      size="lg"
      footer={
        <>
          <AButton variant="ghost" onClick={onClose}>
            Cancel
          </AButton>
          <AButton type="submit" form="timeline-form" variant="emerald" loading={save.isPending}>
            {entry ? 'Save changes' : 'Add moment'}
          </AButton>
        </>
      }
    >
      <form id="timeline-form" noValidate onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <AField label="Year" htmlFor="tl-year" required error={errors.year?.message}>
            <AInput
              id="tl-year"
              inputMode="numeric"
              maxLength={4}
              placeholder="e.g. 1978"
              aria-invalid={!!errors.year}
              aria-describedby={describedBy('tl-year', errors.year)}
              {...register('year')}
            />
          </AField>
          <AField label="Month" htmlFor="tl-month" hint="Optional">
            <ASelect id="tl-month" aria-describedby="tl-month-msg" {...register('month')}>
              <option value="">No month</option>
              {MONTHS.map((name, i) => (
                <option key={name} value={String(i + 1)}>
                  {name}
                </option>
              ))}
            </ASelect>
          </AField>
          <AField label="Category" htmlFor="tl-category" required>
            <ASelect id="tl-category" {...register('category')}>
              {TIMELINE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </ASelect>
          </AField>
        </div>
        <AField label="Title" htmlFor="tl-title" required error={errors.title?.message}>
          <AInput
            id="tl-title"
            placeholder="e.g. Graduated from the University of Ibadan"
            aria-invalid={!!errors.title}
            aria-describedby={describedBy('tl-title', errors.title)}
            {...register('title')}
          />
        </AField>
        <AField label="Description" htmlFor="tl-description" error={errors.description?.message}>
          <ATextarea
            id="tl-description"
            rows={4}
            placeholder="What happened, and why it mattered"
            aria-invalid={!!errors.description}
            aria-describedby={describedBy('tl-description', errors.description)}
            {...register('description')}
          />
        </AField>
        <MediaField
          id="tl-media"
          label="Photo"
          value={watch('mediaId')}
          preview={preview}
          onChange={(id, media) => {
            setValue('mediaId', id, { shouldDirty: true });
            setPreview(media);
          }}
        />
        <Controller
          control={control}
          name="isPublished"
          render={({ field }) => (
            <SwitchRow
              label="Published"
              description="Unpublished moments stay hidden from the public timeline."
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </form>
    </AdminDialog>
  );
}
