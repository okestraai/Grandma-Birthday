import type { RsvpQuestion } from '../generated/prisma/client';
import { AppException } from '../common/errors';
import { cleanAnswers, companionLimit } from './rsvp.service';

const q = (over: Partial<RsvpQuestion>): RsvpQuestion => ({
  id: 'q1',
  label: 'Question',
  helpText: null,
  type: 'TEXT',
  options: [],
  required: false,
  isActive: true,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('companionLimit', () => {
  it('is the allowance, or zero when companions are turned off', () => {
    expect(companionLimit({ allowCompanions: true }, 3)).toBe(3);
    expect(companionLimit({ allowCompanions: false }, 3)).toBe(0);
  });
});

describe('cleanAnswers', () => {
  const select = q({ id: 's', type: 'SELECT', options: ['Yes', 'No'], required: true });
  const box = q({ id: 'b', type: 'CHECKBOX' });

  it('keeps valid answers and drops unknown question ids', () => {
    expect(cleanAnswers([select, box], { s: 'Yes', b: true, unknown: 'x' }, true)).toEqual({ s: 'Yes', b: true });
  });
  it('requires required answers from attending guests only', () => {
    expect(() => cleanAnswers([select], {}, true)).toThrow(AppException);
    expect(cleanAnswers([select], {}, false)).toEqual({});
  });
  it('rejects a select value that is not an option, and wrong types', () => {
    expect(() => cleanAnswers([select], { s: 'Maybe' }, true)).toThrow(AppException);
    expect(() => cleanAnswers([box], { b: 'yes' }, true)).toThrow(AppException);
  });
  it('trims and bounds text answers', () => {
    const text = q({ id: 't' });
    expect(cleanAnswers([text], { t: `  ${'a'.repeat(2000)} ` }, true).t).toHaveLength(1000);
  });
});
