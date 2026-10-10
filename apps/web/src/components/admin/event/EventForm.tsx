import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Globe2, X } from 'lucide-react';
import type { AdminEvent, UpdateEventRequest } from '@birthday/types';
import { api } from '@/lib/api';
import { adminKeys, reportFormError, useAdminMutation } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { AButton, AField, AInput, ATextarea, Panel, SwitchRow, describedBy } from '../ui';
import { Meter } from '../misc';
import { UnsavedChangesGuard } from '../overlays';
import { SaveBar } from '../content/SaveBar';
import { eventSchema, eventToForm, formToRequest, type EventFormValues } from './event-form';
import { formatZoneOffset, isValidTimeZone, timeZoneOptions, zonedInputToIso } from './timezone';

const deviceZone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return '';
  }
})();

const deviceFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/**
 * `besideVenue` is shown next to the Venue panel on wide screens (the guest-category allocation panel).
 * It must not contain its own <form>: it renders inside this one.
 */
export function EventForm({ event, besideVenue }: { event: AdminEvent; besideVenue?: ReactNode }) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(event);
  const zones = useMemo(timeZoneOptions, []);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<EventFormValues>({ resolver: zodResolver(eventSchema), defaultValues: eventToForm(event) });

  const save = useAdminMutation<AdminEvent, UpdateEventRequest>({
    mutationFn: (body) => api.put<AdminEvent>('/admin/event', body),
    invalidate: [adminKeys.event, adminKeys.dashboard],
    success: 'Event details saved.',
    toastError: false,
    onSuccess: (data) => {
      queryClient.setQueryData(adminKeys.event, data);
      setSaved(data);
      reset(eventToForm(data));
    },
    onError: (error) => reportFormError(error, setError),
  });

  const timezone = watch('timezone');
  const zoneOk = isValidTimeZone(timezone);
  const startsAt = watch('startsAt');
  const offset = zoneOk ? formatZoneOffset(timezone, zonedInputToIso(startsAt, timezone) ?? Date.now()) : '';
  const capacity = Number(watch('capacity')) || 0;
  const remaining = capacity - saved.confirmedPeople;
  const allowCompanions = watch('allowCompanions');
  const rsvpMode = watch('rsvpMode');

  /** "Fri 20 Nov 2026, 11:00 pm on your device" when the device is in another zone. */
  const deviceHint = (value: string): string | undefined => {
    if (!zoneOk || !deviceZone || deviceZone === timezone) return undefined;
    const iso = zonedInputToIso(value, timezone);
    return iso ? `${deviceFormat.format(new Date(iso))} on your device (${deviceZone}).` : undefined;
  };

  const field = (
    name: FieldPath<EventFormValues>,
    label: string,
    opts: { required?: boolean; hint?: ReactNode; placeholder?: string; type?: string; inputMode?: 'numeric' | 'decimal' | 'email' | 'tel' | 'url'; className?: string } = {},
  ) => {
    const id = `event-${name}`;
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

  const area = (name: 'description' | 'parkingInfo', label: string, rows: number, hint?: string, placeholder?: string) => {
    const id = `event-${name}`;
    const error = errors[name]?.message;
    return (
      <AField label={label} htmlFor={id} error={error} hint={hint}>
        <ATextarea id={id} rows={rows} placeholder={placeholder} aria-invalid={!!error} aria-describedby={describedBy(id, error, hint)} {...register(name)} />
      </AField>
    );
  };

  return (
    <form id="event-form" noValidate onSubmit={handleSubmit((values) => save.mutate(formToRequest(values)))}>
      <UnsavedChangesGuard when={isDirty && !save.isPending} />
      {/* Rows on wide screens: Details | Date and time, Venue | Guest categories, Guest information | Contact, then RSVP rules. */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <Panel title="Details" id="event-details">
          <div className="space-y-3">
            {field('name', 'Event name', { required: true, placeholder: 'e.g. Mama’s 70th Birthday Thanksgiving' })}
            {field('tagline', 'Tagline', { placeholder: 'e.g. Seventy years of grace' })}
            {area('description', 'Description', 4, 'Shown on the event page.', 'What guests should know about the day…')}
          </div>
        </Panel>

        <Panel title="Date and time" id="event-time">
          <div
            className="mb-3 flex items-start gap-2 rounded-lg bg-champagne/40 px-3 py-2 text-[13px] text-navy"
            role="note"
          >
            <Globe2 className="mt-0.5 size-4 shrink-0 text-gold-rich" aria-hidden />
            <p>
              {zoneOk ? (
                <>
                  Times are in the event’s time zone ({timezone}
                  {offset && `, ${offset}`}) regardless of your device’s time zone.
                </>
              ) : (
                'Choose a valid time zone. Times are read in the event’s time zone, not your device’s.'
              )}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('startsAt', 'Starts', { required: true, type: 'datetime-local', hint: deviceHint(startsAt) })}
            {field('endsAt', 'Ends', { required: true, type: 'datetime-local', hint: deviceHint(watch('endsAt')) })}
            <AField
              label="Time zone"
              htmlFor="event-timezone"
              required
              error={errors.timezone?.message}
              hint="Changing the zone keeps the times as typed; they are then read in the new zone."
              className="sm:col-span-2"
            >
              <AInput
                id="event-timezone"
                list="event-timezone-options"
                placeholder="e.g. Africa/Lagos"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!errors.timezone}
                aria-describedby="event-timezone-msg"
                {...register('timezone')}
              />
              <datalist id="event-timezone-options">
                {zones.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </AField>
          </div>
        </Panel>

        <Panel title="Venue" id="event-venue">
          <div className="grid gap-3 sm:grid-cols-2">
            {field('venueName', 'Venue name', { required: true, placeholder: 'e.g. Eko Hotel & Suites' })}
            {field('city', 'City', { placeholder: 'e.g. Lagos' })}
            {field('address', 'Address', { required: true, className: 'sm:col-span-2', placeholder: 'e.g. 1415 Adetokunbo Ademola Street, Victoria Island' })}
            {field('mapUrl', 'Map link', {
              type: 'url',
              inputMode: 'url',
              placeholder: 'https://maps.google.com/…',
              className: 'sm:col-span-2',
            })}
            {field('latitude', 'Latitude', { inputMode: 'decimal', placeholder: 'e.g. 6.4281' })}
            {field('longitude', 'Longitude', { inputMode: 'decimal', placeholder: 'e.g. 3.4219' })}
          </div>
        </Panel>

        {besideVenue}

        <Panel title="Guest information" id="event-guest-info">
          <div className="grid gap-3 sm:grid-cols-2">
            {field('theme', 'Theme or colours', { placeholder: 'e.g. Gold and emerald' })}
            {field('dressCode', 'Dress code', { placeholder: 'e.g. Traditional formal' })}
            <div className="sm:col-span-2">{area('parkingInfo', 'Parking', 3, undefined, 'e.g. Free parking at the venue; overflow parking across the road')}</div>
          </div>
        </Panel>

        <Panel title="Contact" id="event-contact" description="Who guests should call or email with questions.">
          <div className="grid gap-3 sm:grid-cols-2">
            {field('contactName', 'Name', { placeholder: 'e.g. Chidi Eze', className: 'sm:col-span-2' })}
            {field('contactEmail', 'Email', { type: 'email', inputMode: 'email', placeholder: 'family@example.com' })}
            {field('contactPhone', 'Phone', { type: 'tel', inputMode: 'tel', placeholder: 'e.g. +234 803 000 0000' })}
          </div>
        </Panel>

        <Panel title="RSVP rules" id="event-rsvp" className="lg:col-span-2">
          <div className="space-y-4">
            <div>
              {field('capacity', 'Capacity (people)', {
                required: true,
                inputMode: 'numeric',
                placeholder: 'e.g. 300',
                hint: 'Guests plus their companions. RSVPs close automatically when it is reached.',
              })}
              <div className="mt-2 space-y-1">
                <Meter value={saved.confirmedPeople} max={capacity} label="Confirmed people against capacity" />
                <p className={cn('text-xs tabular-nums', remaining < 0 ? 'text-error' : 'text-muted')}>
                  {saved.confirmedPeople} confirmed ·{' '}
                  {remaining >= 0 ? `${remaining} ${remaining === 1 ? 'place' : 'places'} left` : `${-remaining} over capacity`}
                </p>
              </div>
            </div>

            <div className="border-t border-navy/[0.08] pt-2">
              <Controller
                control={control}
                name="rsvpOpen"
                render={({ field: f }) => (
                  <SwitchRow
                    label="RSVPs open"
                    description="Turn off to stop new responses. RSVPs also close at the deadline or when capacity is reached."
                    checked={f.value}
                    onCheckedChange={f.onChange}
                  />
                )}
              />
            </div>

            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium text-navy">Who can RSVP</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { value: 'OPEN', title: 'Anyone with the link', body: 'Guests register themselves on the RSVP page and receive their pass by email.' },
                    { value: 'INVITE_ONLY', title: 'Invited guests only', body: 'Only guests you add can respond, using the personal link in their invitation.' },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer gap-2.5 rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold-rich',
                      rsvpMode === option.value ? 'border-gold bg-champagne/30' : 'border-navy/15 hover:border-navy/30',
                    )}
                  >
                    <input type="radio" value={option.value} className="mt-0.5 size-4 accent-navy" {...register('rsvpMode')} />
                    <span>
                      <span className="block text-[13px] font-medium text-navy">{option.title}</span>
                      <span className="mt-0.5 block text-xs text-muted">{option.body}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <AField
              label="RSVP deadline"
              htmlFor="event-rsvpDeadline"
              error={errors.rsvpDeadline?.message}
              hint={
                watch('rsvpDeadline')
                  ? (deviceHint(watch('rsvpDeadline')) ?? `In the event’s time zone (${timezone}).`)
                  : 'No deadline: RSVPs stay open until you close them or the event starts.'
              }
            >
              <div className="flex gap-2">
                <AInput
                  id="event-rsvpDeadline"
                  type="datetime-local"
                  aria-invalid={!!errors.rsvpDeadline}
                  aria-describedby="event-rsvpDeadline-msg"
                  {...register('rsvpDeadline')}
                />
                {watch('rsvpDeadline') && (
                  <AButton variant="ghost" onClick={() => setValue('rsvpDeadline', '', { shouldDirty: true, shouldValidate: true })}>
                    <X aria-hidden /> Clear
                  </AButton>
                )}
              </div>
            </AField>

            <div className="border-t border-navy/[0.08] pt-2">
              <Controller
                control={control}
                name="allowCompanions"
                render={({ field: f }) => (
                  <SwitchRow
                    label="Allow companions"
                    description="Let guests bring others (a spouse, children) on their RSVP."
                    checked={f.value}
                    onCheckedChange={f.onChange}
                  />
                )}
              />
              <div className={cn('mt-2 grid gap-3 sm:grid-cols-2', !allowCompanions && 'opacity-60')}>
                {field('defaultCompanions', 'Default companions', {
                  inputMode: 'numeric',
                  placeholder: 'e.g. 1',
                  hint: 'For guests who register themselves, unless their category says otherwise.',
                })}
                {field('maxCompanions', 'Maximum companions', {
                  inputMode: 'numeric',
                  placeholder: 'e.g. 2',
                  hint: 'The most any one guest can bring.',
                })}
              </div>
              {!allowCompanions && <p className="mt-1 text-xs text-muted">Companion limits are kept but not used while companions are off.</p>}
            </div>
          </div>
        </Panel>
      </div>
      <SaveBar formId="event-form" dirty={isDirty} saving={save.isPending} onReset={() => reset(eventToForm(saved))} />
    </form>
  );
}
