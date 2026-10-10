import { useFormContext } from 'react-hook-form';
import type { RsvpQuestion, RsvpFormConfig } from '@birthday/types';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { StepHeading } from './parts';
import { LIMITS, type RsvpValues } from './schema';

function describedBy(id: string, show: boolean): string | undefined {
  return show ? `${id}-msg` : undefined;
}

function QuestionField({ question }: { question: RsvpQuestion }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<RsvpValues>();
  const id = `rsvp-q-${question.id}`;
  const name = `answers.${question.id}` as const;
  const error = (errors.answers as Record<string, { message?: string } | undefined> | undefined)?.[question.id]?.message;
  const hasMessage = Boolean(error || question.helpText);

  if (question.type === 'CHECKBOX') {
    return (
      <div>
        <label
          htmlFor={id}
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-xl border bg-white px-4 py-3.5 transition-colors',
            error ? 'border-error' : 'border-navy/12 hover:border-gold/60',
          )}
        >
          <input
            id={id}
            type="checkbox"
            className="mt-0.5 size-4.5 shrink-0 cursor-pointer rounded border-navy/30 accent-[var(--brand-gold-rich)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:ring-offset-2"
            aria-required={question.required || undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, hasMessage)}
            {...register(name)}
          />
          <span className="text-[15px] leading-snug text-navy">
            {question.label}
            {question.required && <span className="ml-0.5 text-error" aria-hidden>*</span>}
          </span>
        </label>
        {hasMessage && (
          <p id={`${id}-msg`} role={error ? 'alert' : undefined} className={cn('mt-1.5 text-sm', error ? 'text-error' : 'text-muted')}>
            {error ?? question.helpText}
          </p>
        )}
      </div>
    );
  }

  const common = {
    id,
    'aria-required': question.required || undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy(id, hasMessage),
  } as const;

  return (
    <Field label={question.label} htmlFor={id} required={question.required} error={error} hint={question.helpText ?? undefined}>
      {question.type === 'SELECT' ? (
        <Select {...common} {...register(name)}>
          <option value="">Please choose…</option>
          {question.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      ) : question.type === 'TEXTAREA' ? (
        <Textarea {...common} rows={3} maxLength={LIMITS.answerMax} placeholder="Your answer" {...register(name)} />
      ) : (
        <Input {...common} maxLength={LIMITS.answerMax} placeholder="Your answer" {...register(name)} />
      )}
    </Field>
  );
}

export function StepPreferences({
  focusOnMount,
  questions,
  tributes,
}: {
  focusOnMount: boolean;
  questions: RsvpQuestion[];
  tributes: RsvpFormConfig['tributes'];
}) {
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<RsvpValues>();
  const attending = watch('response') === 'ATTENDING';
  const messageLength = watch('message').length;

  return (
    <div className="space-y-6">
      <StepHeading
        focusOnMount={focusOnMount}
        eyebrow={attending ? 'A few details' : 'A note for the celebrant'}
        title={attending ? 'Your preferences' : 'Leave a few words'}
        description={
          attending
            ? 'Help the family prepare a comfortable evening for you, and add a birthday message if you like.'
            : 'You will be missed. If you would like, leave a birthday message for the celebrant.'
        }
      />

      <div className="space-y-5">
        {attending && (
          <>
            <Field label="Dietary requirements" htmlFor="rsvp-dietary" error={errors.dietary?.message} hint="Optional. For example: vegetarian, no nuts.">
              <Input
                id="rsvp-dietary"
            placeholder="e.g. Vegetarian, halal, no nuts"
                maxLength={LIMITS.noteMax}
                aria-invalid={errors.dietary ? true : undefined}
                aria-describedby="rsvp-dietary-msg"
                {...register('dietary')}
              />
            </Field>
            <Field
              label="Accessibility needs"
              htmlFor="rsvp-accessibility"
              error={errors.accessibility?.message}
              hint="Optional. Anything that would make the day easier for you."
            >
              <Input
                id="rsvp-accessibility"
            placeholder="e.g. Step-free access, a seat near the entrance"
                maxLength={LIMITS.noteMax}
                aria-invalid={errors.accessibility ? true : undefined}
                aria-describedby="rsvp-accessibility-msg"
                {...register('accessibility')}
              />
            </Field>
            {questions.map((question) => (
              <QuestionField key={question.id} question={question} />
            ))}
          </>
        )}

        {tributes.open && (
          <fieldset className="space-y-4 rounded-2xl border border-gold/40 bg-champagne/15 p-4 sm:p-5">
            <legend className="px-1 font-display text-lg text-navy">
              A birthday message <span className="font-sans text-sm text-muted">(optional)</span>
            </legend>
            <p className="-mt-1 text-sm text-muted">
              Your words join the tributes to the celebrant.
              {tributes.requireApproval ? ' The family reads every message before it can appear on the website.' : ''}
            </p>
            <Field
              label="Your message"
              htmlFor="rsvp-message"
              error={errors.message?.message}
              hint={`${messageLength} of ${LIMITS.messageMax} characters.`}
            >
              <Textarea
                id="rsvp-message"
                rows={4}
                maxLength={LIMITS.messageMax}
                placeholder="Share a memory, a wish or a few words of thanks…"
                aria-invalid={errors.message ? true : undefined}
                aria-describedby="rsvp-message-msg"
                {...register('message')}
              />
            </Field>
            <Field label="How you know the celebrant" htmlFor="rsvp-tribute-relationship" error={errors.tributeRelationship?.message}>
              <Input
                id="rsvp-tribute-relationship"
                maxLength={LIMITS.relationshipMax}
                placeholder="e.g. Niece, Former colleague, Choir friend"
                aria-invalid={errors.tributeRelationship ? true : undefined}
                aria-describedby="rsvp-tribute-relationship-msg"
                {...register('tributeRelationship')}
              />
            </Field>
          </fieldset>
        )}
      </div>
    </div>
  );
}
