import { z } from 'zod';
import type { AdminEvent, UpdateEventRequest } from '@birthday/types';
import { nullIfBlank } from '@/lib/admin-api';
import { isValidTimeZone, isoToZonedInput, zonedInputToIso } from './timezone';

const text = (max: number) =>
  z.string().refine((v) => v.trim().length <= max, `Keep this to ${max.toLocaleString('en')} characters or fewer.`);
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const WHOLE = /^\d+$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

export const eventSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter the event name.').min(2, 'Use at least 2 characters.').max(150, 'Keep this to 150 characters or fewer.'),
    tagline: text(200),
    description: text(4000),
    startsAt: z.string().regex(DATETIME, 'Enter the start date and time.'),
    endsAt: z.string().regex(DATETIME, 'Enter the end date and time.'),
    timezone: z.string().trim().refine(isValidTimeZone, 'Choose a time zone from the list, e.g. Africa/Lagos.'),
    venueName: z.string().trim().min(1, 'Enter the venue name.').min(2, 'Use at least 2 characters.').max(150, 'Keep this to 150 characters or fewer.'),
    address: z.string().trim().min(1, 'Enter the venue address.').min(2, 'Use at least 2 characters.').max(300, 'Keep this to 300 characters or fewer.'),
    city: text(100),
    mapUrl: z
      .string()
      .trim()
      .max(500, 'Keep this link to 500 characters or fewer.')
      .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Enter a full link starting with https://'),
    latitude: z
      .string()
      .trim()
      .refine((v) => v === '' || (DECIMAL.test(v) && Math.abs(Number(v)) <= 90), 'Latitude is a number between −90 and 90.'),
    longitude: z
      .string()
      .trim()
      .refine((v) => v === '' || (DECIMAL.test(v) && Math.abs(Number(v)) <= 180), 'Longitude is a number between −180 and 180.'),
    theme: text(150),
    dressCode: text(200),
    parkingInfo: text(1000),
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
      .refine((v) => WHOLE.test(v) && Number(v) >= 1 && Number(v) <= 100000, 'Enter the number of people the venue can hold.'),
    rsvpOpen: z.boolean(),
    rsvpMode: z.enum(['OPEN', 'INVITE_ONLY']),
    rsvpDeadline: z.string().refine((v) => v === '' || DATETIME.test(v), 'Enter a date and time, or clear it.'),
    allowCompanions: z.boolean(),
    defaultCompanions: z.string().trim().refine((v) => WHOLE.test(v) && Number(v) <= 20, 'Use a whole number from 0 to 20.'),
    maxCompanions: z.string().trim().refine((v) => WHOLE.test(v) && Number(v) <= 20, 'Use a whole number from 0 to 20.'),
  })
  .superRefine((v, ctx) => {
    // Both values are wall-clock times in the same zone, so comparing the strings compares the times.
    if (DATETIME.test(v.startsAt) && DATETIME.test(v.endsAt) && v.endsAt <= v.startsAt) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'The event must end after it starts.' });
    }
    if (v.rsvpDeadline && DATETIME.test(v.endsAt) && v.rsvpDeadline > v.endsAt) {
      ctx.addIssue({ code: 'custom', path: ['rsvpDeadline'], message: 'The RSVP deadline should be before the event ends.' });
    }
    if (WHOLE.test(v.defaultCompanions) && WHOLE.test(v.maxCompanions) && Number(v.defaultCompanions) > Number(v.maxCompanions)) {
      ctx.addIssue({ code: 'custom', path: ['defaultCompanions'], message: 'The default cannot be more than the maximum.' });
    }
    if ((v.latitude === '') !== (v.longitude === '')) {
      ctx.addIssue({ code: 'custom', path: [v.latitude === '' ? 'latitude' : 'longitude'], message: 'Enter both latitude and longitude, or neither.' });
    }
  });

export type EventFormValues = z.infer<typeof eventSchema>;

export function eventToForm(e: AdminEvent): EventFormValues {
  return {
    name: e.name,
    tagline: e.tagline ?? '',
    description: e.description ?? '',
    startsAt: isoToZonedInput(e.startsAt, e.timezone),
    endsAt: isoToZonedInput(e.endsAt, e.timezone),
    timezone: e.timezone,
    venueName: e.venueName,
    address: e.address,
    city: e.city ?? '',
    mapUrl: e.mapUrl ?? '',
    latitude: e.latitude === null ? '' : String(e.latitude),
    longitude: e.longitude === null ? '' : String(e.longitude),
    theme: e.theme ?? '',
    dressCode: e.dressCode ?? '',
    parkingInfo: e.parkingInfo ?? '',
    contactName: e.contactName ?? '',
    contactEmail: e.contactEmail ?? '',
    contactPhone: e.contactPhone ?? '',
    capacity: String(e.capacity),
    rsvpOpen: e.rsvpOpen,
    rsvpMode: e.rsvpMode,
    rsvpDeadline: isoToZonedInput(e.rsvpDeadline, e.timezone),
    allowCompanions: e.allowCompanions,
    defaultCompanions: String(e.defaultCompanions),
    maxCompanions: String(e.maxCompanions),
  };
}

/** Form values → the PUT body. Date-times are read in the form's (event's) time zone. */
export function formToRequest(v: EventFormValues): UpdateEventRequest {
  const timezone = v.timezone.trim();
  const toIso = (value: string) => zonedInputToIso(value, timezone);
  return {
    name: v.name.trim(),
    tagline: nullIfBlank(v.tagline),
    description: nullIfBlank(v.description),
    startsAt: toIso(v.startsAt) ?? undefined,
    endsAt: toIso(v.endsAt) ?? undefined,
    timezone,
    venueName: v.venueName.trim(),
    address: v.address.trim(),
    city: nullIfBlank(v.city),
    mapUrl: nullIfBlank(v.mapUrl),
    latitude: v.latitude.trim() === '' ? null : Number(v.latitude),
    longitude: v.longitude.trim() === '' ? null : Number(v.longitude),
    theme: nullIfBlank(v.theme),
    dressCode: nullIfBlank(v.dressCode),
    parkingInfo: nullIfBlank(v.parkingInfo),
    contactName: nullIfBlank(v.contactName),
    contactEmail: nullIfBlank(v.contactEmail),
    contactPhone: nullIfBlank(v.contactPhone),
    capacity: Number(v.capacity),
    rsvpOpen: v.rsvpOpen,
    rsvpMode: v.rsvpMode,
    rsvpDeadline: v.rsvpDeadline ? toIso(v.rsvpDeadline) : null,
    allowCompanions: v.allowCompanions,
    defaultCompanions: Number(v.defaultCompanions),
    maxCompanions: Number(v.maxCompanions),
  };
}
