import type { UserRole } from '@birthday/types';

export const ROLES: { value: UserRole; label: string; description: string }[] = [
  {
    value: 'SUPER_ADMIN',
    label: 'Super admin',
    description: 'Everything admins can do, plus managing dashboard users.',
  },
  {
    value: 'ADMIN',
    label: 'Admin',
    description: 'Manages content, media, testimonials, guests, the event and settings. Can check guests in and read the audit log.',
  },
  {
    value: 'CHECK_IN_STAFF',
    label: 'Check-in staff',
    description: 'Only the check-in screen: scans passes and admits guests at the door.',
  },
];

export const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label])) as Record<UserRole, string>;

export const MIN_PASSWORD = 12;

const ALPHABET = {
  lower: 'abcdefghijkmnopqrstuvwxyz',
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  digit: '23456789',
  symbol: '!@#$%^&*-_=+?',
};

/** Uniform random index in [0, max) with rejection sampling (no modulo bias). */
function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

/** A strong random password (default 20 chars) with at least one of each character class. */
export function generatePassword(length = 20): string {
  const all = ALPHABET.lower + ALPHABET.upper + ALPHABET.digit + ALPHABET.symbol;
  const chars = Object.values(ALPHABET).map((set) => set[randomIndex(set.length)]);
  while (chars.length < length) chars.push(all[randomIndex(all.length)]);
  // Fisher–Yates shuffle so the guaranteed characters are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
