import { useFormContext } from 'react-hook-form';
import { Lock } from 'lucide-react';
import type { PublicGuestCategory } from '@birthday/types';
import { Field, Input, Select } from '@/components/ui/input';
import { StepHeading } from './parts';
import type { RsvpValues } from './schema';

export function StepDetails({
  focusOnMount,
  emailLocked,
  categories,
}: {
  focusOnMount: boolean;
  emailLocked: boolean;
  /** Null when the category is not asked (invited guests, or no categories). */
  categories: PublicGuestCategory[] | null;
}) {
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<RsvpValues>();
  const selected = categories?.find((c) => c.id === watch('categoryId'));

  return (
    <div className="space-y-6">
      <StepHeading
        focusOnMount={focusOnMount}
        eyebrow="Kindly introduce yourself"
        title="Your details"
        description="So we can greet you by name and send your personal invitation."
      />

      <div className="space-y-5">
        <Field label="Full name" htmlFor="rsvp-fullName" required error={errors.fullName?.message}>
          <Input
            id="rsvp-fullName"
            placeholder="e.g. Adaeze Okafor"
            autoComplete="name"
            aria-required
            aria-invalid={errors.fullName ? true : undefined}
            aria-describedby={errors.fullName ? 'rsvp-fullName-msg' : undefined}
            {...register('fullName')}
          />
        </Field>

        <Field
          label="Email address"
          htmlFor="rsvp-email"
          required
          error={errors.email?.message}
          hint={
            emailLocked ? (
              <span className="inline-flex items-start gap-1.5">
                <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                This is the address your invitation was sent to, so it cannot be changed here.
              </span>
            ) : (
              'Your invitation and any updates will be sent here.'
            )
          }
        >
          <Input
            id="rsvp-email"
            placeholder="you@example.com"
            type="email"
            inputMode="email"
            autoComplete="email"
            aria-required
            readOnly={emailLocked}
            className={emailLocked ? 'cursor-not-allowed bg-cream text-charcoal/80' : undefined}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby="rsvp-email-msg"
            {...register('email')}
          />
        </Field>

        <Field label="Phone number" htmlFor="rsvp-phone" error={errors.phone?.message} hint="Optional. Only used if the family needs to reach you.">
          <Input
            id="rsvp-phone"
            placeholder="+234 800 000 0000"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby="rsvp-phone-msg"
            {...register('phone')}
          />
        </Field>

        {categories && (
          <Field
            label="How do you know the family?"
            htmlFor="rsvp-category"
            required
            error={errors.categoryId?.message}
            hint={
              selected?.description ??
              (categories.some((c) => c.full) ? 'Options marked (full) have no places left.' : undefined)
            }
          >
            <Select
              id="rsvp-category"
              aria-required
              aria-invalid={errors.categoryId ? true : undefined}
              aria-describedby={errors.categoryId || selected?.description || categories.some((c) => c.full) ? 'rsvp-category-msg' : undefined}
              {...register('categoryId')}
            >
              <option value="">Please choose…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id} disabled={category.full}>
                  {category.full ? `${category.name} (full)` : category.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </div>
  );
}
