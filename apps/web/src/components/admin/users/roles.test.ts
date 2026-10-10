import { generatePassword, MIN_PASSWORD } from './roles';
import { humaniseAction, humaniseEntity } from '../audit/format';

describe('generatePassword', () => {
  it('is long enough and mixes every character class', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p.length).toBeGreaterThanOrEqual(MIN_PASSWORD);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[^a-zA-Z0-9]/);
    }
  });

  it('does not repeat', () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});

describe('audit formatting', () => {
  it('humanises actions and entity types', () => {
    expect(humaniseAction('testimonial.approve')).toBe('Testimonial approve');
    expect(humaniseAction('guest.rsvp_update')).toBe('Guest rsvp update');
    expect(humaniseEntity('GuestCategory')).toBe('Guest category');
  });
});
