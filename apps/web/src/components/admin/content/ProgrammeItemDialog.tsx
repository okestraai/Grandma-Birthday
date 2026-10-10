import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ProgrammeItem, UpsertProgrammeItemRequest } from '@birthday/types';
import { api } from '@/lib/api';
import { adminKeys, nullIfBlank, reportFormError, useAdminMutation } from '@/lib/admin-api';
import { formatClock } from '@/lib/utils';
import { AdminDialog } from '../overlays';
import { AButton, AField, AInput, ATextarea, describedBy } from '../ui';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const schema = z
  .object({
    startTime: z.string().regex(TIME, 'Enter a start time.'),
    endTime: z.string().refine((v) => v === '' || TIME.test(v), 'Enter a valid time or leave it empty.'),
    title: z.string().trim().min(1, 'Give the item a title.').min(2, 'Use at least 2 characters.').max(150, 'Keep the title to 150 characters or fewer.'),
    description: z.string().refine((v) => v.trim().length <= 1000, 'Keep the description to 1,000 characters or fewer.'),
    speaker: z.string().refine((v) => v.trim().length <= 150, 'Keep this to 150 characters or fewer.'),
    location: z.string().refine((v) => v.trim().length <= 150, 'Keep this to 150 characters or fewer.'),
  })
  .refine((v) => v.endTime === '' || !TIME.test(v.startTime) || v.endTime > v.startTime, {
    path: ['endTime'],
    message: 'The end time must be after the start time.',
  });

type FormValues = z.infer<typeof schema>;

/** "5:00 PM — Guest Arrival", or "5:00 PM – 6:00 PM — Guest Arrival" when there is an end time. */
export function programmeLine(item: Pick<ProgrammeItem, 'startTime' | 'endTime' | 'title'>): string {
  const time = item.endTime ? `${formatClock(item.startTime)} – ${formatClock(item.endTime)}` : formatClock(item.startTime);
  return `${time} — ${item.title}`;
}

/** Create (item null) or edit a programme item. Mount only while open. */
export function ProgrammeItemDialog({ item, onClose }: { item: ProgrammeItem | null; onClose: () => void }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      startTime: item?.startTime.slice(0, 5) ?? '',
      endTime: item?.endTime?.slice(0, 5) ?? '',
      title: item?.title ?? '',
      description: item?.description ?? '',
      speaker: item?.speaker ?? '',
      location: item?.location ?? '',
    },
  });

  const save = useAdminMutation<ProgrammeItem, UpsertProgrammeItemRequest>({
    mutationFn: (body) => (item ? api.put<ProgrammeItem>(`/admin/programme/${item.id}`, body) : api.post<ProgrammeItem>('/admin/programme', body)),
    invalidate: [adminKeys.programme],
    success: item ? 'Programme item updated.' : 'Programme item added.',
    toastError: false,
    onSuccess: onClose,
    onError: (error) => reportFormError(error, setError),
  });

  const submit = handleSubmit((v) =>
    save.mutate({
      startTime: v.startTime,
      endTime: v.endTime || null,
      title: v.title.trim(),
      description: nullIfBlank(v.description),
      speaker: nullIfBlank(v.speaker),
      location: nullIfBlank(v.location),
    }),
  );

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={item ? 'Edit programme item' : 'Add programme item'}
      footer={
        <>
          <AButton variant="ghost" onClick={onClose}>
            Cancel
          </AButton>
          <AButton type="submit" form="programme-form" variant="emerald" loading={save.isPending}>
            {item ? 'Save changes' : 'Add item'}
          </AButton>
        </>
      }
    >
      <form id="programme-form" noValidate onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <AField label="Starts at" htmlFor="pg-start" required error={errors.startTime?.message}>
            <AInput
              id="pg-start"
              type="time"
              aria-invalid={!!errors.startTime}
              aria-describedby={describedBy('pg-start', errors.startTime)}
              {...register('startTime')}
            />
          </AField>
          <AField label="Ends at" htmlFor="pg-end" error={errors.endTime?.message} hint="Optional">
            <AInput id="pg-end" type="time" aria-invalid={!!errors.endTime} aria-describedby="pg-end-msg" {...register('endTime')} />
          </AField>
        </div>
        <AField label="Title" htmlFor="pg-title" required error={errors.title?.message}>
          <AInput
            id="pg-title"
            placeholder="e.g. Guest Arrival"
            aria-invalid={!!errors.title}
            aria-describedby={describedBy('pg-title', errors.title)}
            {...register('title')}
          />
        </AField>
        <AField label="Description" htmlFor="pg-description" error={errors.description?.message}>
          <ATextarea
            id="pg-description"
            rows={3}
            placeholder="A line or two guests will see in the programme"
            aria-invalid={!!errors.description}
            aria-describedby={describedBy('pg-description', errors.description)}
            {...register('description')}
          />
        </AField>
        <div className="grid gap-3 sm:grid-cols-2">
          <AField label="Speaker or host" htmlFor="pg-speaker" error={errors.speaker?.message}>
            <AInput
              id="pg-speaker"
              placeholder="e.g. Rev. Dr. Okafor"
              aria-invalid={!!errors.speaker}
              aria-describedby={describedBy('pg-speaker', errors.speaker)}
              {...register('speaker')}
            />
          </AField>
          <AField label="Location" htmlFor="pg-location" error={errors.location?.message}>
            <AInput
              id="pg-location"
              placeholder="e.g. Main hall"
              aria-invalid={!!errors.location}
              aria-describedby={describedBy('pg-location', errors.location)}
              {...register('location')}
            />
          </AField>
        </div>
      </form>
    </AdminDialog>
  );
}
