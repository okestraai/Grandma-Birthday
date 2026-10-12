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
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z
  .object({
    date: z.string().refine((v) => v === '' || DATE.test(v), 'Enter a date or leave it empty.'),
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

const dayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "2026-11-22" → "Sun 22 Nov". */
export function formatProgrammeDate(date: string): string {
  return dayFormat.format(new Date(`${date}T00:00:00Z`));
}

/**
 * "5:00 PM — Guest Arrival", or "5:00 PM – 6:00 PM — Guest Arrival" when there is an end time.
 * Items on another day than the event starts lead with the day: "Sun 22 Nov, 12:30 AM — Last dance".
 */
export function programmeLine(item: Pick<ProgrammeItem, 'startTime' | 'endTime' | 'title'> & { date?: string | null }): string {
  const time = item.endTime ? `${formatClock(item.startTime)} – ${formatClock(item.endTime)}` : formatClock(item.startTime);
  return `${item.date ? `${formatProgrammeDate(item.date)}, ` : ''}${time} — ${item.title}`;
}

/**
 * Create (item null) or edit a programme item of one event. `eventDay` is the event's start
 * date (YYYY-MM-DD in the celebration's time zone), for the date field's hint. Mount only while open.
 */
export function ProgrammeItemDialog({
  item,
  eventId,
  eventName,
  eventDay,
  onClose,
}: {
  item: ProgrammeItem | null;
  eventId: string;
  eventName?: string;
  eventDay?: string;
  onClose: () => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: item?.date ?? '',
      startTime: item?.startTime.slice(0, 5) ?? '',
      endTime: item?.endTime?.slice(0, 5) ?? '',
      title: item?.title ?? '',
      description: item?.description ?? '',
      speaker: item?.speaker ?? '',
      location: item?.location ?? '',
    },
  });

  const save = useAdminMutation<ProgrammeItem, UpsertProgrammeItemRequest>({
    mutationFn: (body) =>
      item
        ? api.put<ProgrammeItem>(`/admin/events/${eventId}/programme/${item.id}`, body)
        : api.post<ProgrammeItem>(`/admin/events/${eventId}/programme`, body),
    // The events list shows each event's item count.
    invalidate: [adminKeys.programme, adminKeys.events],
    success: item ? 'Programme item updated.' : 'Programme item added.',
    toastError: false,
    onSuccess: onClose,
    onError: (error) => reportFormError(error, setError),
  });

  const submit = handleSubmit((v) =>
    save.mutate({
      // Blank, or the event's own day: the item is on the day the event starts.
      date: v.date && v.date !== eventDay ? v.date : null,
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
      description={eventName}
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
        <AField
          label="Date"
          htmlFor="pg-date"
          error={errors.date?.message}
          hint={`Leave blank for the event’s day${eventDay ? ` (${formatProgrammeDate(eventDay)})` : ''}. Set a date only for items after midnight.`}
        >
          <AInput id="pg-date" type="date" className="sm:max-w-[calc(50%-0.375rem)]" min={eventDay} aria-invalid={!!errors.date} aria-describedby="pg-date-msg" {...register('date')} />
        </AField>
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
