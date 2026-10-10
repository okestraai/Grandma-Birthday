import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** 32 random bytes, base64url (43 chars). Used for invitation, upload and session tokens. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacSha256(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Crockford-style alphabet without 0/O, 1/I/L, U: easy to read aloud and type.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Human-readable invitation reference, e.g. "BP70-7K3Q9D". */
export function invitationCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `BP70-${code}`;
}

export const INVITATION_CODE_PATTERN = /^BP70-[2-9A-HJKMNP-TV-Z]{6}$/;

/** IP addresses are hashed before storage for rate limiting, so raw guest IPs are not kept. */
export function hashIp(ip: string | null | undefined, salt: string): string | null {
  return ip ? hmacSha256(salt, ip).slice(0, 32) : null;
}
