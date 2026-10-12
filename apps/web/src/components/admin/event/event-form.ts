import { z } from 'zod';
import type { AdminEvent, UpsertEventRequest } from '@birthday/types';
import { nullIfBlank } from '@/lib/admin-api';
import { isoToZonedInput, zonedInputToIso } from './timezone';
import { DATETIME, WHOLE, text } from './celebration-form';

const DECIMAL = /^-?\d+(\.\d+)?$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const required = (what: string, max: number) =>
  z.string().trim().min(1, `Enter the ${what}.`).min(2, 'Use at least 2 characters.').max(max, `Keep this to ${max} characters or fewer.`);

/** One event in the celebration (the add/edit event dialog). */
export const eventSchema = z
  .object({
    name: required('event name', 150),
    slug: z
      .string()
      .trim()
      .max(80, 'Keep this to 80 characters or fewer.')
      .refine((v) => v === '' || SLUG.test(v), 'Use lowercase letters, numbers and hyphens, e.g. birthday-dinner.'),
    description: text(4000),
    startsAt: z.string().regex(DATETIME, 'Enter the start date and time.'),
    endsAt: z.string().regex(DATETIME, 'Enter the end date and time.'),
    venueName: required('venue name', 150),
    address: required('venue address', 300),
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
    dressCode: text(200),
    theme: text(150),
    parkingInfo: text(1000),
    capacity: z
      .string()
      .trim()
      .refine((v) => v === '' || (WHOLE.test(v) && Number(v) <= 100000), 'Enter a whole number, or leave it blank for no limit.'),
    invitedCategoryIds: z.array(z.string()),
    rsvpEnabled: z.boolean(),
    isPublic: z.boolean(),
  })
  .superRefine((v, ctx) => {
    // Both values are wall-clock times in the same zone, so comparing the strings compares the times.
    if (DATETIME.test(v.startsAt) && DATETIME.test(v.endsAt) && v.endsAt <= v.startsAt) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'The event must end after it starts.' });
    }
    if ((v.latitude === '') !== (v.longitude === '')) {
      ctx.addIssue({ code: 'custom', path: [v.latitude === '' ? 'latitude' : 'longitude'], message: 'Enter both latitude and longitude, or neither.' });
    }
  });

export type EventFormValues = z.infer<typeof eventSchema>;

export const EMPTY_EVENT: EventFormValues = {
  name: '',
  slug: '',
  description: '',
  startsAt: '',
  endsAt: '',
  venueName: '',
  address: '',
  city: '',
  mapUrl: '',
  latitude: '',
  longitude: '',
  dressCode: '',
  theme: '',
  parkingInfo: '',
  capacity: '',
  invitedCategoryIds: [],
  rsvpEnabled: true,
  isPublic: true,
};

export function eventToForm(e: AdminEvent, timeZone: string): EventFormValues {
  return {
    name: e.name,
    slug: e.slug,
    description: e.description ?? '',
    startsAt: isoToZonedInput(e.startsAt, timeZone),
    endsAt: isoToZonedInput(e.endsAt, timeZone),
    venueName: e.venueName,
    address: e.address,
    city: e.city ?? '',
    mapUrl: e.mapUrl ?? '',
    latitude: e.latitude === null ? '' : String(e.latitude),
    longitude: e.longitude === null ? '' : String(e.longitude),
    dressCode: e.dressCode ?? '',
    theme: e.theme ?? '',
    parkingInfo: e.parkingInfo ?? '',
    capacity: e.capacity === null ? '' : String(e.capacity),
    invitedCategoryIds: e.invitedCategoryIds,
    rsvpEnabled: e.rsvpEnabled,
    isPublic: e.isPublic,
  };
}

/** Form values → the POST/PUT /admin/events body. Times are read in the celebration's time zone. */
export function eventToRequest(v: EventFormValues, timeZone: string): UpsertEventRequest {
  const slug = v.slug.trim();
  return {
    name: v.name.trim(),
    ...(slug ? { slug } : {}),
    description: nullIfBlank(v.description),
    startsAt: zonedInputToIso(v.startsAt, timeZone) ?? '',
    endsAt: zonedInputToIso(v.endsAt, timeZone) ?? '',
    venueName: v.venueName.trim(),
    address: v.address.trim(),
    city: nullIfBlank(v.city),
    mapUrl: nullIfBlank(v.mapUrl),
    latitude: v.latitude.trim() === '' ? null : Number(v.latitude),
    longitude: v.longitude.trim() === '' ? null : Number(v.longitude),
    dressCode: nullIfBlank(v.dressCode),
    theme: nullIfBlank(v.theme),
    parkingInfo: nullIfBlank(v.parkingInfo),
    capacity: v.capacity.trim() === '' ? null : Number(v.capacity),
    invitedCategoryIds: v.invitedCategoryIds,
    rsvpEnabled: v.rsvpEnabled,
    isPublic: v.isPublic,
  };
}

const whenFormats = new Map<string, { day: Intl.DateTimeFormat; time: Intl.DateTimeFormat }>();

function formatsFor(timeZone: string) {
  let f = whenFormats.get(timeZone);
  if (!f) {
    f = {
      day: new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone }),
      time: new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone }),
    };
    whenFormats.set(timeZone, f);
  }
  return f;
}

/**
 * "Sat 21 Nov 2026, 10:00 am – 1:00 pm" in the celebration's time zone, with the end date
 * when the event runs into another day.
 */
export function formatEventWhen(startsAt: string, endsAt: string, timeZone: string): string {
  const { day, time } = formatsFor(timeZone);
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  // "Sat 21 Nov 2026" (engines differ on the comma after the weekday).
  const dayOf = (d: Date) => {
    const p = Object.fromEntries(day.formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
  };
  const startDay = dayOf(start);
  const endDay = dayOf(end);
  return startDay === endDay
    ? `${startDay}, ${time.format(start)} – ${time.format(end)}`
    : `${startDay}, ${time.format(start)} – ${endDay}, ${time.format(end)}`;
}

/** "YYYY-MM-DD" of an instant on a clock in `timeZone` (the event's own day). */
export function zonedDate(iso: string, timeZone: string): string {
  return isoToZonedInput(iso, timeZone).slice(0, 10);
}
