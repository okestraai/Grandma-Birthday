import argon2 from 'argon2';
import { AppException } from '../common/errors';

const COMMON = new Set([
  'password1234', 'password12345', '123456789012', 'qwertyuiop12', 'iloveyou1234', 'administrator',
  'welcome12345', 'letmein12345', 'changeme1234', 'birthday1234', 'happybirthday',
]);

/** Argon2id with OWASP-recommended parameters (19 MiB, 2 iterations). */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** A real hash of a random string, verified when the email is unknown so timing does not reveal accounts. */
let dummyHash: Promise<string> | null = null;
export function dummyVerify(password: string): Promise<boolean> {
  dummyHash ??= hashPassword(`dummy-${Math.random()}`);
  return dummyHash.then((hash) => verifyPassword(hash, password));
}

export function assertStrongPassword(password: string, email?: string): void {
  const problems: string[] = [];
  if (password.length < 12) problems.push('Use at least 12 characters.');
  if (password.length > 128) problems.push('Use at most 128 characters.');
  if (COMMON.has(password.toLowerCase())) problems.push('That password is too common.');
  if (/^(.)\1+$/.test(password)) problems.push('Do not repeat one character.');
  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) problems.push('Do not include your email name.');
  if (problems.length) throw new AppException(400, 'WEAK_PASSWORD', problems.join(' '), { password: problems });
}
