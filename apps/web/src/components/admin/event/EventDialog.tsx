import type { ReactNode } from 'react';
import { Controller, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import type { AdminEvent, UpsertEventRequest } from '@birthday/types';
import { api } from '@/lib/api';
import { adminKeys, reportFormError, useAdminMutation } from '@/lib/admin-api';
import { categoriesQuery } from '@/lib/admin-queries';
import { AButton, ACheckbox, AField, AInput, ATextarea, SwitchRow, describedBy } from '../ui';
import { AdminDialog } from '../overlays';
import { EMPTY_EVENT, eventSchema, eventToForm, eventToRequest, type EventFormValues } from './event-form';
import { formatZoneOffset } from './timezone';

/** Add (event null) or edit one event. Times are in the celebration's time zone. Mount only while open. */
export function EventDialog({ event, timeZone, onClose }: { event: AdminEvent | null; timeZone: string; onClose: () => void }) {
  const categories = useQuery(categoriesQuery);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: event ? eventToForm(event, timeZone) : EMPTY_EVENT,
  });

  const save = useAdminMutation<AdminEvent, UpsertEventRequest>({
    mutationFn: (body) => (event ? api.put<AdminEvent>(`/admin/events/${event.id}`, body) : api.post<AdminEvent>('/admin/events', body)),
    // The celebration's dates span its events; the dashboard counts per event.
    invalidate: [adminKeys.events, adminKeys.celebration, adminKeys.dashboard],
    success: (saved) => (event ? `“${saved.name}” saved.` : `“${saved.name}” added.`),
    toastError: false,
    onSuccess: onClose,
    onError: (error) => reportFormError(error, setError),
  });

  const field = (
    name: FieldPath<EventFormValues>,
    label: string,
    opts: { required?: boolean; hint?: ReactNode; placeholder?: string; type?: string; inputMode?: 'numeric' | 'decimal' | 'url'; className?: string } = {},
  ) => {
    const id = `ev-${name}`;
    const error = errors[name as keyof EventFormValues]?.message;
    return (
      <AField label={label} htmlFor={id} required={opts.required} error={error} hint={opts.hint} className={opts.className}>
        <AInput
          id={id}
          type={opts.type}
          inputMode={opts.inputMode}
          placeholder={opts.placeholder}
          aria-invalid={!!error}
          aria-describedby={describedBy(id, error, opts.hint)}
          {...register(name)}
        />
      </AField>
    );
  };

  const area = (name: 'description' | 'parkingInfo', label: string, rows: number, placeholder: string, hint?: string) => {
    const id = `ev-${name}`;
    const error = errors[name]?.message;
    return (
      <AField label={label} htmlFor={id} error={error} hint={hint}>
        <ATextarea id={id} rows={rows} placeholder={placeholder} aria-invalid={!!error} aria-describedby={describedBy(id, error, hint)} {...register(name)} />
      </AField>
    );
  };

  const offset = formatZoneOffset(timeZone, event?.startsAt ?? Date.now());
  const sectionTitle = 'text-xs font-semibold uppercase tracking-wide text-muted';

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={event ? `Edit ${event.name}` : 'Add event'}
      description={`Times are in the celebration’s time zone (${timeZone}${offset ? `, ${offset}` : ''}).`}
      footer={
        <>
          <AButton variant="ghost" onClick={onClose}>
            Cancel
          </AButton>
          <AButton type="submit" form="event-form" variant="emerald" loading={save.isPending}>
            {event ? 'Save changes' : 'Add event'}
          </AButton>
        </>
      }
    >
      <form id="event-form" noValidate onSubmit={handleSubmit((v) => save.mutate(eventToRequest(v, timeZone)))} className="space-y-5">
        <section className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {field('name', 'Event name', { required: true, placeholder: 'e.g. Birthday Dinner' })}
            {field('slug', 'Web address name', {
              placeholder: 'e.g. birthday-dinner',
              hint: event ? 'Used in links to this event.' : 'Optional. Made from the name when left blank.',
            })}
            {field('startsAt', 'Starts', { required: true, type: 'datetime-local' })}
            {field('endsAt', 'Ends', { required: true, type: 'datetime-local' })}
          </div>
          {area('description', 'Description', 3, 'What guests should know about this event…')}
        </section>

        <section className="space-y-3">
          <h3 className={sectionTitle}>Venue</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('venueName', 'Venue name', { required: true, placeholder: 'e.g. Eko Hotel & Suites' })}
            {field('city', 'City', { placeholder: 'e.g. Lagos' })}
            {field('address', 'Address', { required: true, className: 'sm:col-span-2', placeholder: 'e.g. 1415 Adetokunbo Ademola Street, Victoria Island' })}
            {field('mapUrl', 'Map link', { type: 'url', inputMode: 'url', placeholder: 'https://maps.google.com/…', className: 'sm:col-span-2' })}
            {field('latitude', 'Latitude', { inputMode: 'decimal', placeholder: 'e.g. 6.4281' })}
            {field('longitude', 'Longitude', { inputMode: 'decimal', placeholder: 'e.g. 3.4219' })}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className={sectionTitle}>Guest information</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('dressCode', 'Dress code', { placeholder: 'e.g. Traditional formal' })}
            {field('theme', 'Theme or colours', { placeholder: 'e.g. Gold and emerald' })}
          </div>
          {area('parkingInfo', 'Parking', 2, 'e.g. Free parking at the venue')}
        </section>

        <section className="space-y-3">
          <h3 className={sectionTitle}>Who comes</h3>
          {field('capacity', 'Capacity (people)', {
            inputMode: 'numeric',
            placeholder: 'No limit',
            hint: 'The most people at this event. Leave blank to use only the celebration capacity.',
            className: 'sm:max-w-xs',
          })}
          <Controller
            control={control}
            name="invitedCategoryIds"
            render={({ field: f }) => (
              <fieldset aria-describedby="ev-categories-hint">
                <legend className="mb-1 text-[13px] font-medium text-navy">Invited categories</legend>
                <p id="ev-categories-hint" className="mb-2 text-xs text-muted">
                  {f.value.length === 0 ? 'None ticked: everyone is invited.' : 'Only guests in the ticked categories are invited.'}
                </p>
                {categories.isPending ? (
                  <p className="text-xs text-muted">Loading categories…</p>
                ) : !categories.data || categories.data.length === 0 ? (
                  <p className="text-xs text-muted">There are no guest categories yet, so everyone is invited.</p>
                ) : (
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {categories.data.map((c) => {
                      const id = `ev-cat-${c.id}`;
                      const on = f.value.includes(c.id);
                      return (
                        <li key={c.id} className="flex min-h-10 items-center gap-2.5">
                          <ACheckbox
                            id={id}
                            checked={on}
                            onCheckedChange={(checked) => f.onChange(checked ? [...f.value, c.id] : f.value.filter((v) => v !== c.id))}
                          />
                          <label htmlFor={id} className="flex items-center gap-1.5 text-[13px] text-charcoal">
                            {c.color && <span className="size-2.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: c.color }} aria-hidden />}
                            {c.name}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </fieldset>
            )}
          />
          <div className="divide-y divide-navy/[0.08] border-t border-navy/[0.08]">
            <Controller
              control={control}
              name="rsvpEnabled"
              render={({ field: f }) => (
                <SwitchRow
                  label="Guests reply to this event"
                  description="Turn off for information only, such as a service anyone may attend. Guests then do not choose it on the RSVP form."
                  checked={f.value}
                  onCheckedChange={f.onChange}
                />
              )}
            />
            <Controller
              control={control}
              name="isPublic"
              render={({ field: f }) => (
                <SwitchRow
                  label="Show on the public website"
                  description="Turn off to hide the event from the website and the open RSVP form. Invited guests still see it on their personal invitation."
                  checked={f.value}
                  onCheckedChange={f.onChange}
                />
              )}
            />
          </div>
        </section>
      </form>
    </AdminDialog>
  );
}
