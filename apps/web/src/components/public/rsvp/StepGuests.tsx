import { useFieldArray, useFormContext } from 'react-hook-form';
import { AnimatePresence, motion } from 'motion/react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { EASE } from '../reveal';
import { StepHeading } from './parts';
import type { RsvpValues } from './schema';

const CHOICES = [
  { value: 'ATTENDING', title: 'Joyfully accepts', note: 'I will be there to celebrate.' },
  { value: 'DECLINED', title: 'Regretfully declines', note: 'I cannot attend, but send my love.' },
] as const;

export function StepGuests({
  focusOnMount,
  allowCompanions,
  limit,
  serverError,
}: {
  focusOnMount: boolean;
  allowCompanions: boolean;
  limit: number;
  /** COMPANION_LIMIT_EXCEEDED from the server. */
  serverError?: string | null;
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

      {response === 'DECLINED' && (
        <p className="text-center font-display text-[15px] italic text-muted">
          We are sorry you cannot be with us. You may leave a message for the celebrant on the next step.
        </p>
      )}
    </div>
  );
}
