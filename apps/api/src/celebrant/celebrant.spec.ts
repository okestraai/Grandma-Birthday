import { ageAt } from './celebrant.mapper';

describe('ageAt', () => {
  const born = new Date('1956-11-21T00:00:00Z');
  it('counts the birthday itself', () => {
    expect(ageAt(born, new Date('2026-11-21T16:00:00Z'))).toBe(70);
    expect(ageAt(born, new Date('2026-11-20T23:00:00Z'))).toBe(69);
  });
  it('is null without a birth date', () => {
    expect(ageAt(null, new Date())).toBeNull();
  });
});
