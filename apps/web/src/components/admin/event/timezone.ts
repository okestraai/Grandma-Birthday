/**
 * Converting between ISO instants and `<input type="datetime-local">` values that mean
 * wall-clock time in the EVENT's time zone (not the browser's).
 */

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The wall-clock reading in `timeZone` at the instant `ms`. */
function wallClockAt(ms: number, timeZone: string): WallClock {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    // Some engines report midnight as 24 even with h23.
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Offset of `timeZone` from UTC at the instant `ms`, in milliseconds (Lagos → +3 600 000). */
export function zoneOffsetMs(ms: number, timeZone: string): number {
  const w = wallClockAt(ms, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const wholeSeconds = Math.floor(ms / 1000) * 1000;
  return asUtc - wholeSeconds;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** ISO instant → "YYYY-MM-DDTHH:mm" as read on a clock in `timeZone`. Empty string for null/invalid input. */
export function isoToZonedInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms) || !isValidTimeZone(timeZone)) return '';
  const w = wallClockAt(ms, timeZone);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

const INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * "YYYY-MM-DDTHH:mm" read as wall-clock time in `timeZone` → UTC ISO string.
 * Returns null for an empty or malformed value.
 *
 * The offset is taken at a first guess and then re-taken at the corrected instant, so values
 * next to a daylight-saving change use the offset that is actually in force. A wall-clock time
 * that does not exist (skipped by a spring-forward) resolves to the instant after the gap.
 */
export function zonedInputToIso(value: string | null | undefined, timeZone: string): string | null {
  const match = INPUT_PATTERN.exec((value ?? '').trim());
  if (!match || !isValidTimeZone(timeZone)) return null;
  const [, y, mo, d, h, mi, s] = match;
  const wallAsUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  if (Number.isNaN(wallAsUtc)) return null;

  const firstOffset = zoneOffsetMs(wallAsUtc, timeZone);
  let instant = wallAsUtc - firstOffset;
  const secondOffset = zoneOffsetMs(instant, timeZone);
  if (secondOffset !== firstOffset) {
    const candidate = wallAsUtc - secondOffset;
    // Keep the candidate if it really reads back as the typed wall-clock time. Otherwise the time
    // falls in a spring-forward gap: of the two guesses, the later one lands just after the gap.
    instant = zoneOffsetMs(candidate, timeZone) === secondOffset ? candidate : Math.max(instant, candidate);
  }
  return new Date(instant).toISOString();
}

/** "UTC+1", "UTC−4", "UTC+5:30", "UTC" for the zone's offset at `at` (default now). */
export function formatZoneOffset(timeZone: string, at: Date | string | number = Date.now()): string {
  if (!isValidTimeZone(timeZone)) return '';
  const ms = new Date(at).getTime();
  const minutes = Math.round(zoneOffsetMs(Number.isNaN(ms) ? Date.now() : ms, timeZone) / 60000);
  if (minutes === 0) return 'UTC';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return `UTC${sign}${hours}${rest ? `:${pad(rest)}` : ''}`;
}

/** Every IANA zone the browser knows, or a short fallback list. */
export function timeZoneOptions(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  try {
    const zones = intl.supportedValuesOf?.('timeZone');
    if (zones && zones.length > 0) return zones.includes('UTC') ? zones : ['UTC', ...zones];
  } catch {
    // Older engines: fall through to the short list.
  }
  return ['Africa/Lagos', 'Africa/Accra', 'Africa/Johannesburg', 'Africa/Nairobi', 'Europe/London', 'America/New_York', 'UTC'];
}
