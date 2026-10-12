import type { ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import { PencilLine } from 'lucide-react';
import type { PublicGuestCategory, RsvpQuestion } from '@birthday/types';
import { formatEventDate } from '@/lib/utils';
import { ReviewRow, StepHeading } from './parts';
import { chosenEvents, visibleEvents, partySize, type RsvpSchemaContext, type RsvpStep, type RsvpValues } from './schema';

function Section({ title, step, onEdit, children }: { title: string; step: RsvpStep; onEdit: (step: RsvpStep) => void; children: ReactNode }) {
  const headingId = `rsvp-review-${step}`;
  return (
    <section aria-labelledby={headingId} className="border-t border-gold/25 pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-4">
        <h3 id={headingId} className="font-display text-lg text-navy">
          {title}
        </h3>
        <button
          type="button"
          onClick={() => onEdit(step)}
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-medium text-emerald underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
        >
          <PencilLine className="size-3.5" aria-hidden />
          Edit<span className="sr-only"> {title.toLowerCase()}</span>
        </button>
      </div>
      <dl className="mt-2 divide-y divide-navy/5">{children}</dl>
    </section>
  );
}

const none = <span className="text-muted">Not provided</span>;

export function StepReview({
  focusOnMount,
  onEdit,
  allowCompanions,
  categories,
  invitedAs,
  questions,
  schemaContext,
  timezone,
}: {
  focusOnMount: boolean;
  onEdit: (step: RsvpStep) => void;
  allowCompanions: boolean;
  categories: PublicGuestCategory[] | null;
  invitedAs: string | null;
  questions: RsvpQuestion[];
  /** Which events the guest is offered; the chosen ones are listed when there are several. */
  schemaContext?: Pick<RsvpSchemaContext, 'config' | 'events' | 'invited'>;
  timezone?: string;
}) {
  const { watch } = useFormContext<RsvpValues>();
  const values = watch();
  const attending = values.response === 'ATTENDING';
  const category = categories?.find((c) => c.id === values.categoryId);
  const size = partySize(values, allowCompanions);

  return (
    <div className="space-y-6">
      <StepHeading
        focusOnMount={focusOnMount}
        eyebrow="Almost there"
        title="Please review your reply"
        description="Take a moment to check everything before you send it."
      />

      <div className="space-y-5 rounded-2xl border border-gold/25 bg-white/70 px-5 py-5 sm:px-6">
        <Section title="Your details" step={0} onEdit={onEdit}>
          <ReviewRow label="Name">{values.fullName.trim()}</ReviewRow>
          <ReviewRow label="Email">{values.email.trim()}</ReviewRow>
          <ReviewRow label="Phone">{values.phone.trim() || none}</ReviewRow>
          {(category || invitedAs) && <ReviewRow label="Guest of">{category?.name ?? invitedAs}</ReviewRow>}
        </Section>

        <Section title="Guest details" step={1} onEdit={onEdit}>
          <ReviewRow label="Reply">
            <span className="font-display text-base">{attending ? 'Joyfully accepts' : 'Regretfully declines'}</span>
          </ReviewRow>
          {attending && (
            <ReviewRow label="Party">
              {size} {size === 1 ? 'person' : 'people'}
            </ReviewRow>
          )}
          {attending && schemaContext && visibleEvents(schemaContext, values.categoryId).length > 1 && (
            <ReviewRow label="Events">
              <ul className="space-y-1">
                {chosenEvents(values, schemaContext).map(({ event, companionCount }) => (
                  <li key={event.id}>
                    {event.name}
                    <span className="text-muted">
                      {' '}
                      · {formatEventDate(event.startsAt, timezone, { year: undefined })} · {1 + companionCount} {companionCount === 0 ? 'person' : 'people'}
                    </span>
                  </li>
                ))}
              </ul>
            </ReviewRow>
          )}
          {attending && allowCompanions && values.companions.length > 0 && (
            <ReviewRow label="Accompanying">
              <ul className="space-y-1">
                {values.companions.map((companion, index) => (
                  <li key={index}>
                    {companion.fullName.trim()}
                    {companion.dietary.trim() && <span className="text-muted"> · {companion.dietary.trim()}</span>}
                  </li>
                ))}
              </ul>
            </ReviewRow>
          )}
        </Section>

        <Section title="Preferences" step={2} onEdit={onEdit}>
          {attending && (
            <>
              <ReviewRow label="Dietary">{values.dietary.trim() || none}</ReviewRow>
              <ReviewRow label="Accessibility">{values.accessibility.trim() || none}</ReviewRow>
              {questions.map((question) => {
                const answer = values.answers[question.id];
                return (
                  <ReviewRow key={question.id} label={question.label}>
                    {typeof answer === 'boolean' ? (answer ? 'Yes' : 'No') : answer?.trim() || none}
                  </ReviewRow>
                );
              })}
            </>
          )}
          <ReviewRow label="Birthday message">
            {values.message.trim() ? (
              <span className="whitespace-pre-line font-display italic">
                {values.message.trim()}
                {values.tributeRelationship.trim() && <span className="not-italic text-muted"> ({values.tributeRelationship.trim()})</span>}
              </span>
            ) : (
              none
            )}
          </ReviewRow>
        </Section>
      </div>
    </div>
  );
}
