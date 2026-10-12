import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import type { AdminCelebration, UpdateCelebrationRequest } from '@birthday/types';
import { api } from '@/lib/api';
import { adminKeys, reportFormError, useAdminMutation } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { AButton, AField, AInput, ATextarea, Panel, SwitchRow, describedBy } from '../ui';
import { Meter } from '../misc';
import { UnsavedChangesGuard } from '../overlays';
import { SaveBar } from '../content/SaveBar';
import { celebrationSchema, celebrationToForm, celebrationToRequest, type CelebrationFormValues } from './celebration-form';
import { formatZoneOffset, isValidTimeZone, isoToZonedInput, timeZoneOptions, zonedInputToIso } from './timezone';

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
 * Celebration-wide settings: name, time zone, contact, RSVP rules and the overall capacity.
 * Dates and venues belong to each event (EventsSection).
 * `besideRsvp` is shown next to the RSVP rules on wide screens (the guest-category allocation panel).
 * It must not contain its own <form>: it renders inside this one.
 */
export function CelebrationForm({ celebration, besideRsvp }: { celebration: AdminCelebration; besideRsvp?: ReactNode }) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(celebration);
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
  } = useForm<CelebrationFormValues>({ resolver: zodResolver(celebrationSchema), defaultValues: celebrationToForm(celebration) });

  const save = useAdminMutation<AdminCelebration, UpdateCelebrationRequest>({
    mutationFn: (body) => api.put<AdminCelebration>('/admin/celebration', body),
    // Event times are shown in the celebration's time zone.
    invalidate: [adminKeys.celebration, adminKeys.events, adminKeys.dashboard],
    success: 'Celebration settings saved.',
    toastError: false,
    onSuccess: (data) => {
      queryClient.setQueryData(adminKeys.celebration, data);
      setSaved(data);
      reset(celebrationToForm(data));
    },
    onError: (error) => reportFormError(error, setError),
  });

  const timezone = watch('timezone');
  const zoneOk = isValidTimeZone(timezone);
  const offset = zoneOk ? formatZoneOffset(timezone, saved.startsAt) : '';
  const capacity = Number(watch('capacity')) || 0;
  const remaining = capacity - saved.confirmedPeople;
  const allowCompanions = watch('allowCompanions');
  const rsvpMode = watch('rsvpMode');
  const rsvpScope = watch('rsvpScope');
  const checkInScope = watch('checkInScope');
  const deadline = watch('rsvpDeadline');
  const lastEnd = zoneOk ? isoToZonedInput(saved.endsAt, timezone) : '';

  /** "Fri 20 Nov 2026, 11:00 pm on your device" when the device is in another zone. */
  const deviceHint = (value: string): string | undefined => {
    if (!zoneOk || !deviceZone || deviceZone === timezone) return undefined;
    const iso = zonedInputToIso(value, timezone);
    return iso ? `${deviceFormat.format(new Date(iso))} on your device (${deviceZone}).` : undefined;
  };

  const field = (
    name: FieldPath<CelebrationFormValues>,
    label: string,
    opts: { required?: boolean; hint?: ReactNode; placeholder?: string; type?: string; inputMode?: 'numeric' | 'decimal' | 'email' | 'tel' | 'url'; className?: string } = {},
  ) => {
    const id = `celebration-${name}`;
    const error = errors[name as keyof CelebrationFormValues]?.message;
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

  const deadlineHint = !deadline
    ? 'No deadline: replies stay open until you close them or the last event starts.'
    : lastEnd && deadline > lastEnd
      ? 'This is after the last event ends.'
      : (deviceHint(deadline) ?? `In the celebration’s time zone (${timezone}).`);

  return (
    <form id="celebration-form" noValidate onSubmit={handleSubmit((values) => save.mutate(celebrationToRequest(values)))}>
      <UnsavedChangesGuard when={isDirty && !save.isPending} />
      {/* Rows on wide screens: Details | Contact, then RSVP rules | Guest categories. */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <Panel title="Details" id="celebration-details">
          <div className="space-y-3">
            {field('name', 'Celebration name', { required: true, placeholder: 'e.g. Mama’s 70th Birthday' })}
            {field('tagline', 'Tagline', { placeholder: 'e.g. Seventy years of grace' })}
            <AField label="Description" htmlFor="celebration-description" error={errors.description?.message} hint="Shown on the home page.">
              <ATextarea
                id="celebration-description"
                rows={3}
                placeholder="What guests should know about the celebration…"
                aria-invalid={!!errors.description}
                aria-describedby="celebration-description-msg"
                {...register('description')}
              />
            </AField>
            <AField
              label="Time zone"
              htmlFor="celebration-timezone"
              required
              error={errors.timezone?.message}
              hint={
                zoneOk
                  ? `Every event time is read in this zone${offset ? ` (${offset})` : ''}, whatever your device’s zone.`
                  : 'Event times are read in this zone, not your device’s.'
              }
            >
              <AInput
                id="celebration-timezone"
                list="celebration-timezone-options"
                placeholder="e.g. Africa/Lagos"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!errors.timezone}
                aria-describedby="celebration-timezone-msg"
                {...register('timezone')}
              />
              <datalist id="celebration-timezone-options">
                {zones.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </AField>
          </div>
        </Panel>

        <Panel title="Contact" id="celebration-contact" description="Who guests should call or email with questions.">
          <div className="grid gap-3 sm:grid-cols-2">
            {field('contactName', 'Name', { placeholder: 'e.g. Chidi Eze', className: 'sm:col-span-2' })}
            {field('contactEmail', 'Email', { type: 'email', inputMode: 'email', placeholder: 'family@example.com' })}
            {field('contactPhone', 'Phone', { type: 'tel', inputMode: 'tel', placeholder: 'e.g. +234 803 000 0000' })}
          </div>
        </Panel>

        <Panel title="RSVP rules" id="celebration-rsvp">
          <div className="space-y-4">
            <div>
              {field('capacity', 'Capacity (people)', {
                required: true,
                inputMode: 'numeric',
                placeholder: 'e.g. 300',
                hint: 'Guests plus their companions, counted once whatever events they attend. Replies close when it is reached.',
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

            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium text-navy">How guests reply to the events</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { value: 'PER_EVENT', title: 'Event by event', body: 'Guests tick the events they will come to, and how many of their companions come to each.' },
                    { value: 'WHOLE_CELEBRATION', title: 'Once for everything', body: 'One yes or no. A yes covers every event the guest is invited to, with all their companions.' },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer gap-2.5 rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold-rich',
                      rsvpScope === option.value ? 'border-gold bg-champagne/30' : 'border-navy/15 hover:border-navy/30',
                    )}
                  >
                    <input type="radio" value={option.value} className="mt-0.5 size-4 accent-navy" {...register('rsvpScope')} />
                    <span>
                      <span className="block text-[13px] font-medium text-navy">{option.title}</span>
                      <span className="mt-0.5 block text-xs text-muted">{option.body}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted">Changing this keeps the replies already made. Only new and updated replies follow the new choice.</p>
            </fieldset>

            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium text-navy">Check-in at the door</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { value: 'PER_EVENT', title: 'At each event', body: 'Staff choose the event. A guest is checked in once at every event they come to.' },
                    { value: 'ONCE', title: 'Once for the celebration', body: 'No event to choose. After one check-in, the same QR code shows "already checked in" at every event.' },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer gap-2.5 rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold-rich',
                      checkInScope === option.value ? 'border-gold bg-champagne/30' : 'border-navy/15 hover:border-navy/30',
                    )}
                  >
                    <input type="radio" value={option.value} className="mt-0.5 size-4 accent-navy" {...register('checkInScope')} />
                    <span>
                      <span className="block text-[13px] font-medium text-navy">{option.title}</span>
                      <span className="mt-0.5 block text-xs text-muted">{option.body}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <AField label="RSVP deadline" htmlFor="celebration-rsvpDeadline" error={errors.rsvpDeadline?.message} hint={deadlineHint}>
              <div className="flex gap-2">
                <AInput
                  id="celebration-rsvpDeadline"
                  type="datetime-local"
                  aria-invalid={!!errors.rsvpDeadline}
                  aria-describedby="celebration-rsvpDeadline-msg"
                  {...register('rsvpDeadline')}
                />
                {deadline && (
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

        {besideRsvp}
      </div>
      <SaveBar formId="celebration-form" dirty={isDirty} saving={save.isPending} onReset={() => reset(celebrationToForm(saved))} />
    </form>
  );
}
