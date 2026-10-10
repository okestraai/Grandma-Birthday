import { formatZoneOffset, isValidTimeZone, isoToZonedInput, zonedInputToIso } from './timezone';

describe('isoToZonedInput', () => {
  it('reads an instant on a Lagos clock (UTC+1, no DST)', () => {
    expect(isoToZonedInput('2026-11-21T16:00:00.000Z', 'Africa/Lagos')).toBe('2026-11-21T17:00');
  });

  it('crosses midnight into the next day', () => {
    expect(isoToZonedInput('2026-12-31T23:30:00.000Z', 'Africa/Lagos')).toBe('2027-01-01T00:30');
  });

  it('uses the New York offset in force on each date', () => {
    expect(isoToZonedInput('2026-01-15T17:00:00.000Z', 'America/New_York')).toBe('2026-01-15T12:00'); // EST, UTC−5
    expect(isoToZonedInput('2026-07-15T16:00:00.000Z', 'America/New_York')).toBe('2026-07-15T12:00'); // EDT, UTC−4
  });

  it('returns an empty string for null, bad dates and bad zones', () => {
    expect(isoToZonedInput(null, 'Africa/Lagos')).toBe('');
    expect(isoToZonedInput('not a date', 'Africa/Lagos')).toBe('');
    expect(isoToZonedInput('2026-11-21T16:00:00.000Z', 'Mars/Olympus')).toBe('');
  });
});

describe('zonedInputToIso', () => {
  it('treats the value as Lagos wall-clock time regardless of the device zone', () => {
    expect(zonedInputToIso('2026-11-21T17:00', 'Africa/Lagos')).toBe('2026-11-21T16:00:00.000Z');
    expect(zonedInputToIso('2027-01-01T00:30', 'Africa/Lagos')).toBe('2026-12-31T23:30:00.000Z');
  });

  it('uses standard and daylight time in New York', () => {
    expect(zonedInputToIso('2026-01-15T12:00', 'America/New_York')).toBe('2026-01-15T17:00:00.000Z');
    expect(zonedInputToIso('2026-07-15T12:00', 'America/New_York')).toBe('2026-07-15T16:00:00.000Z');
  });

  it('is correct right after the spring-forward change', () => {
    // Clocks jump from 02:00 EST to 03:00 EDT on 8 March 2026 (07:00 UTC).
    expect(zonedInputToIso('2026-03-08T01:59', 'America/New_York')).toBe('2026-03-08T06:59:00.000Z');
    expect(zonedInputToIso('2026-03-08T03:30', 'America/New_York')).toBe('2026-03-08T07:30:00.000Z');
  });

  it('moves a time inside the spring-forward gap to just after it', () => {
    expect(zonedInputToIso('2026-03-08T02:30', 'America/New_York')).toBe('2026-03-08T07:30:00.000Z');
    // London skips 01:00–02:00 on 29 March 2026.
    expect(zonedInputToIso('2026-03-29T01:30', 'Europe/London')).toBe('2026-03-29T01:30:00.000Z');
  });

  it('is correct around the fall-back change', () => {
    // Clocks go from 02:00 EDT back to 01:00 EST on 1 November 2026 (06:00 UTC).
    expect(zonedInputToIso('2026-11-01T00:30', 'America/New_York')).toBe('2026-11-01T04:30:00.000Z');
    expect(zonedInputToIso('2026-11-01T03:00', 'America/New_York')).toBe('2026-11-01T08:00:00.000Z');
    // 01:30 happens twice; the first (EDT) reading is used.
    expect(zonedInputToIso('2026-11-01T01:30', 'America/New_York')).toBe('2026-11-01T05:30:00.000Z');
  });

  it('round-trips with isoToZonedInput', () => {
    for (const zone of ['Africa/Lagos', 'America/New_York', 'Asia/Kolkata', 'Australia/Adelaide']) {
      for (const iso of ['2026-02-10T09:15:00.000Z', '2026-08-10T21:45:00.000Z']) {
        expect(zonedInputToIso(isoToZonedInput(iso, zone), zone)).toBe(iso);
      }
    }
  });

  it('returns null for empty or malformed values', () => {
    expect(zonedInputToIso('', 'Africa/Lagos')).toBeNull();
    expect(zonedInputToIso('21/11/2026 17:00', 'Africa/Lagos')).toBeNull();
    expect(zonedInputToIso('2026-11-21T17:00', 'Nowhere/Special')).toBeNull();
  });
});

describe('zone helpers', () => {
  it('validates IANA zone names', () => {
    expect(isValidTimeZone('Africa/Lagos')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('formats offsets', () => {
    expect(formatZoneOffset('Africa/Lagos', '2026-11-21T16:00:00Z')).toBe('UTC+1');
    expect(formatZoneOffset('America/New_York', '2026-01-15T12:00:00Z')).toBe('UTC−5');
    expect(formatZoneOffset('Asia/Kolkata', '2026-01-15T12:00:00Z')).toBe('UTC+5:30');
    expect(formatZoneOffset('UTC', '2026-01-15T12:00:00Z')).toBe('UTC');
  });
});
