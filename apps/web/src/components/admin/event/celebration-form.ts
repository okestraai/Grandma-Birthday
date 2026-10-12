import { z } from 'zod';
import type { AdminCelebration, UpdateCelebrationRequest } from '@birthday/types';
import { nullIfBlank } from '@/lib/admin-api';
import { isValidTimeZone, isoToZonedInput, zonedInputToIso } from './timezone';

export const text = (max: number) =>
  z.string().refine((v) => v.trim().length <= max, `Keep this to ${max.toLocaleString('en')} characters or fewer.`);
export const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const WHOLE = /^\d+$/;

export const celebrationSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter the celebration name.').min(2, 'Use at least 2 characters.').max(150, 'Keep this to 150 characters or fewer.'),
    tagline: text(200),
    description: text(4000),
    timezone: z.string().trim().refine(isValidTimeZone, 'Choose a time zone from the list, e.g. Africa/Lagos.'),
    contactName: text(100),
    contactEmail: z
      .string()
      .trim()
      .max(254, 'Keep this email to 254 characters or fewer.')
      .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email address.'),
    contactPhone: text(40),
    capacity: z
      .string()
      .trim()
      .refine((v) => WHOLE.test(v) && Number(v) >= 1 && Number(v) <= 100000, 'Enter the most people who can come.'),
    rsvpOpen: z.boolean(),
    rsvpMode: z.enum(['OPEN', 'INVITE_ONLY']),
    rsvpScope: z.enum(['PER_EVENT', 'WHOLE_CELEBRATION']),
    checkInScope: z.enum(['PER_EVENT', 'ONCE']),
    rsvpDeadline: z.string().refine((v) => v === '' || DATETIME.test(v), 'Enter a date and time, or clear it.'),
    allowCompanions: z.boolean(),
    defaultCompanions: z.string().trim().refine((v) => WHOLE.test(v) && Number(v) <= 20, 'Use a whole number from 0 to 20.'),
    maxCompanions: z.string().trim().refine((v) => WHOLE.test(v) && Number(v) <= 20, 'Use a whole number from 0 to 20.'),
  })
  .superRefine((v, ctx) => {
    if (WHOLE.test(v.defaultCompanions) && WHOLE.test(v.maxCompanions) && Number(v.defaultCompanions) > Number(v.maxCompanions)) {
      ctx.addIssue({ code: 'custom', path: ['defaultCompanions'], message: 'The default cannot be more than the maximum.' });
    }
  });

export type CelebrationFormValues = z.infer<typeof celebrationSchema>;

export function celebrationToForm(c: AdminCelebration): CelebrationFormValues {
  return {
    name: c.name,
    tagline: c.tagline ?? '',
    description: c.description ?? '',
    timezone: c.timezone,
    contactName: c.contactName ?? '',
    contactEmail: c.contactEmail ?? '',
    contactPhone: c.contactPhone ?? '',
    capacity: String(c.capacity),
    rsvpOpen: c.rsvpOpen,
    rsvpMode: c.rsvpMode,
    rsvpScope: c.rsvpScope,
    checkInScope: c.checkInScope,
    rsvpDeadline: isoToZonedInput(c.rsvpDeadline, c.timezone),
    allowCompanions: c.allowCompanions,
    defaultCompanions: String(c.defaultCompanions),
    maxCompanions: String(c.maxCompanions),
  };
}

/** Form values → the PUT /admin/celebration body. The deadline is read in the form's time zone. */
export function celebrationToRequest(v: CelebrationFormValues): UpdateCelebrationRequest {
  const timezone = v.timezone.trim();
  return {
    name: v.name.trim(),
    tagline: nullIfBlank(v.tagline),
    description: nullIfBlank(v.description),
    timezone,
    contactName: nullIfBlank(v.contactName),
    contactEmail: nullIfBlank(v.contactEmail),
    contactPhone: nullIfBlank(v.contactPhone),
    capacity: Number(v.capacity),
    rsvpOpen: v.rsvpOpen,
    rsvpMode: v.rsvpMode,
    rsvpScope: v.rsvpScope,
    checkInScope: v.checkInScope,
    rsvpDeadline: v.rsvpDeadline ? zonedInputToIso(v.rsvpDeadline, timezone) : null,
    allowCompanions: v.allowCompanions,
    defaultCompanions: Number(v.defaultCompanions),
    maxCompanions: Number(v.maxCompanions),
  };
}
