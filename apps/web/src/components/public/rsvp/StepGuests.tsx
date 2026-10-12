import { useFieldArray, useFormContext } from 'react-hook-form';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Minus, Plus } from 'lucide-react';
import type { RsvpEventOption } from '@birthday/types';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { cn, formatEventDate } from '@/lib/utils';
import { EASE } from '../reveal';
import { eventTimes } from '../event/event-helpers';
import { StepHeading } from './parts';
import type { RsvpValues } from './schema';

/**
 * Tick boxes for the events the guest will attend, each with how many of their companions come.
 * Shown only when more than one event is offered. A full event can be kept but not newly ticked.
 */
export function EventChoices({ events, timezone, allowCompanions }: { events: RsvpEventOption[]; timezone?: string; allowCompanions: boolean }) {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<RsvpValues>();
  const choices = watch('events');
  const named = allowCompanions ? watch('companions').length : 0;
  const error = errors.events?.message ?? errors.events?.root?.message;

  const update = (eventId: string, change: Partial<RsvpValues['events'][number]>) => {
    const next = choices.map((c) => (c.eventId === eventId ? { ...c, ...change } : c));
    if (!next.some((c) => c.eventId === eventId)) next.push({ eventId, selected: false, companionCount: null, ...change });
    setValue('events', next, { shouldValidate: Boolean(errors.events), shouldDirty: true });
  };

  return (
    <fieldset aria-describedby={error ? 'rsvp-events-msg' : 'rsvp-events-hint'} className="rounded-2xl border border-gold/25 bg-cream/60 px-5 py-5 sm:px-6">
      <legend className="sr-only">Which events will you attend?</legend>
      <h3 aria-hidden className="font-display text-lg text-navy">
        Which events will you attend?
      </h3>
      <p id="rsvp-events-hint" className="mt-0.5 text-sm text-muted">
        Tick each one you will come to.
      </p>
      <ul className="mt-4 space-y-3">
        {events.map((event) => {
          const choice = choices.find((c) => c.eventId === event.id);
          const selected = Boolean(choice?.selected);
          const blocked = event.full && !selected;
          const count = Math.min(choice?.companionCount ?? named, named);
          return (
            <li key={event.id}>
              <label
                className={cn(
                  'flex min-h-11 items-start gap-3 rounded-xl border bg-ivory px-4 py-3 transition-colors duration-300',
                  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold/50',
                  selected ? 'border-gold-rich' : 'border-navy/10',
                  blocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-gold/60',
                )}
              >
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={selected}
                  disabled={blocked}
                  onChange={(e) => update(event.id, { selected: e.target.checked })}
                />
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                    selected ? 'border-gold-rich bg-gold-rich text-ivory' : 'border-navy/25 bg-white',
                  )}
                >
                  {selected && <Check className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[17px] leading-snug text-navy">{event.name}</span>
                  <span className="block text-sm text-charcoal/80">
                    {formatEventDate(event.startsAt, timezone, { year: undefined })} · {eventTimes(event, timezone)}
                  </span>
                  <span className="block text-sm text-muted">
                    {event.venueName}
                    {event.city ? `, ${event.city}` : ''}
                  </span>
                  {blocked && <span className="mt-1 block text-xs font-medium uppercase tracking-[0.18em] text-error">Full</span>}
                </span>
              </label>
              {selected && named > 0 && (
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2 pr-1 text-sm text-navy">
                  <label htmlFor={`rsvp-event-${event.id}-companions`}>Accompanying guests at {event.name}</label>
                  <select
                    id={`rsvp-event-${event.id}-companions`}
                    className="h-11 rounded-full border border-navy/15 bg-white px-4 text-sm text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                    value={count}
                    onChange={(e) => update(event.id, { companionCount: Number(e.target.value) === named ? null : Number(e.target.value) })}
                  >
                    {Array.from({ length: named + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {n === named ? `All ${n}` : n}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p id="rsvp-events-msg" role="alert" className="mt-3 text-sm text-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}

const CHOICES = [
  { value: 'ATTENDING', title: 'Joyfully accepts', note: 'I will be there to celebrate.' },
  { value: 'DECLINED', title: 'Regretfully declines', note: 'I cannot attend, but send my love.' },
] as const;

/** The events a whole-celebration reply covers, shown for information. */
export function EventsCovered({ events, timezone }: { events: RsvpEventOption[]; timezone?: string }) {
  return (
    <section aria-labelledby="rsvp-events-covered" className="rounded-2xl border border-gold/25 bg-cream/60 px-5 py-5 sm:px-6">
      <h3 id="rsvp-events-covered" className="font-display text-lg text-navy">
        Your reply covers these events
      </h3>
      <p className="mt-0.5 text-sm text-muted">You and your guests are expected at each of them.</p>
      <ul className="mt-4 divide-y divide-navy/10 rounded-xl border border-navy/10 bg-ivory">
        {events.map((event) => (
          <li key={event.id} className="px-4 py-3">
            <span className="block font-display text-[17px] leading-snug text-navy">{event.name}</span>
            <span className="block text-sm text-charcoal/80">
              {formatEventDate(event.startsAt, timezone, { year: undefined })} · {eventTimes(event, timezone)}
            </span>
            <span className="block text-sm text-muted">
              {event.venueName}
              {event.city ? `, ${event.city}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StepGuests({
  focusOnMount,
  allowCompanions,
  limit,
  serverError,
  events = [],
  timezone,
  wholeCelebration = false,
}: {
  focusOnMount: boolean;
  allowCompanions: boolean;
  limit: number;
  /** COMPANION_LIMIT_EXCEEDED from the server. */
  serverError?: string | null;
  /** The events this guest is offered; the tick boxes show only when there are several. */
  events?: RsvpEventOption[];
  timezone?: string;
  /** One yes covers every event: list them instead of asking. */
  wholeCelebration?: boolean;
}) {
  const {
    register,
    watch,
    control,
    formState: { errors },
  } = useFormContext<RsvpValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'companions' });
  const response = watch('response');
  const attending = response === 'ATTENDING';
  const count = fields.length;
  const companionsError = serverError ?? errors.companions?.message ?? errors.companions?.root?.message;

  return (
    <div className="space-y-7">
      <StepHeading
        focusOnMount={focusOnMount}
        eyebrow="Your reply"
        title="Will you join us?"
        description="Let the family know whether you will be celebrating with them."
      />

      <fieldset
        role="radiogroup"
        aria-labelledby="rsvp-response-legend"
        aria-describedby={errors.response ? 'rsvp-response-msg' : undefined}
        aria-required
      >
        <legend id="rsvp-response-legend" className="sr-only">
          Your reply
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {CHOICES.map((choice) => {
            const checked = response === choice.value;
            return (
              <label
                key={choice.value}
                className={cn(
                  'group relative flex cursor-pointer flex-col gap-1 rounded-2xl border bg-white px-5 py-5 text-left transition-all duration-500 ease-luxe',
                  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold/50 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-ivory',
                  checked ? 'border-gold-rich shadow-gold' : 'border-navy/12 hover:border-gold/60 hover:shadow-soft',
                )}
              >
                <input type="radio" value={choice.value} className="sr-only" aria-invalid={errors.response ? true : undefined} {...register('response')} />
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-500',
                      checked ? 'border-gold-rich' : 'border-navy/25',
                    )}
                  >
                    <span className={cn('size-2.5 rounded-full bg-gold-rich transition-transform duration-500 ease-luxe', checked ? 'scale-100' : 'scale-0')} />
                  </span>
                  <span className="font-display text-lg text-navy">{choice.title}</span>
                </span>
                <span className="pl-8 text-sm text-muted">{choice.note}</span>
              </label>
            );
          })}
        </div>
        {errors.response && (
          <p id="rsvp-response-msg" role="alert" className="mt-2 text-sm text-error">
            {errors.response.message}
          </p>
        )}
      </fieldset>

      <AnimatePresence initial={false}>
        {attending && allowCompanions && (
          <motion.section
            key="companions"
            aria-labelledby="rsvp-companions-title"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-gold/25 bg-cream/60 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 id="rsvp-companions-title" className="font-display text-lg text-navy">
                    Accompanying guests
                  </h3>
                  <p className="mt-0.5 text-sm text-muted">
                    {limit === 0
                      ? 'Your invitation is for you alone.'
                      : `You may bring up to ${limit} ${limit === 1 ? 'guest' : 'guests'}.`}
                  </p>
                </div>
                {limit > 0 && (
                  <div className="flex items-center gap-3" role="group" aria-label="Number of accompanying guests">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-10 text-navy"
                      onClick={() => remove(count - 1)}
                      disabled={count === 0}
                      aria-label="Remove a guest"
                    >
                      <Minus aria-hidden />
                    </Button>
                    <output aria-live="polite" aria-atomic className="min-w-[4.5rem] text-center text-sm text-navy">
                      <span className="font-display text-2xl">{count}</span>
                      <span className="sr-only"> accompanying {count === 1 ? 'guest' : 'guests'}</span>
                    </output>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-10 text-navy"
                      onClick={() => append({ fullName: '', dietary: '' }, { shouldFocus: true })}
                      disabled={count >= limit}
                      aria-label="Add a guest"
                    >
                      <Plus aria-hidden />
                    </Button>
                  </div>
                )}
              </div>

              {companionsError && (
                <p role="alert" className="mt-3 text-sm text-error">
                  {companionsError}
                </p>
              )}

              {fields.length > 0 && (
                <ol className="mt-5 space-y-4">
                  {fields.map((field, index) => {
                    const fieldErrors = errors.companions?.[index];
                    return (
                      <li key={field.id} className="rounded-xl border border-navy/10 bg-ivory px-4 py-4">
                        <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-gold-rich">Guest {index + 1}</p>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          <Field label="Full name" htmlFor={`rsvp-companion-${index}-name`} required error={fieldErrors?.fullName?.message}>
                            <Input
                              id={`rsvp-companion-${index}-name`}
            placeholder="Their full name"
                              autoComplete="off"
                              aria-required
                              aria-invalid={fieldErrors?.fullName ? true : undefined}
                              aria-describedby={fieldErrors?.fullName ? `rsvp-companion-${index}-name-msg` : undefined}
                              {...register(`companions.${index}.fullName`)}
                            />
                          </Field>
                          <Field label="Dietary needs" htmlFor={`rsvp-companion-${index}-dietary`} error={fieldErrors?.dietary?.message} hint="Optional">
                            <Input
                              id={`rsvp-companion-${index}-dietary`}
            placeholder="e.g. Vegetarian, no nuts"
                              aria-invalid={fieldErrors?.dietary ? true : undefined}
                              aria-describedby={`rsvp-companion-${index}-dietary-msg`}
                              {...register(`companions.${index}.dietary`)}
                            />
                          </Field>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {attending && events.length > 1 && !wholeCelebration && <EventChoices events={events} timezone={timezone} allowCompanions={allowCompanions} />}
      {attending && events.length > 1 && wholeCelebration && <EventsCovered events={events} timezone={timezone} />}

      {response === 'DECLINED' && (
        <p className="text-center font-display text-[15px] italic text-muted">
          We are sorry you cannot be with us. You may leave a message for the celebrant on the next step.
        </p>
      )}
    </div>
  );
}
