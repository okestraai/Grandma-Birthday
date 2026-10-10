import { AppException } from '../common/errors';
import { assertStrongPassword, hashPassword, verifyPassword } from './password';

describe('passwords', () => {
  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });
  it('rejects short, common or email-based passwords', () => {
    expect(() => assertStrongPassword('short')).toThrow(AppException);
    expect(() => assertStrongPassword('password1234')).toThrow(AppException);
    expect(() => assertStrongPassword('aaaaaaaaaaaaaa')).toThrow(AppException);
    expect(() => assertStrongPassword('margaretsecret99', 'margaret@example.com')).toThrow(AppException);
    expect(() => assertStrongPassword('Gold-and-Emerald-70')).not.toThrow();
  });
});
