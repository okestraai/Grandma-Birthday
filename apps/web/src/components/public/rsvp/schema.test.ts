import type { RsvpFormConfig, RsvpQuestion } from '@birthday/types';
import {
  buildSubmitBody,
  companionLimit,
  createStepSchemas,
  defaultValues,
  firstInvalidStep,
  isLoosePhone,
  partySize,
  sortQuestions,
  stepForField,
  type RsvpValues,
} from './schema';

const questions: RsvpQuestion[] = [
  { id: 'q-song', label: 'Favourite song', helpText: null, type: 'TEXT', options: [], required: false, sortOrder: 2 },
  { id: 'q-meal', label: 'Meal', helpText: null, type: 'SELECT', options: ['Fish', 'Beef'], required: true, sortOrder: 1 },
  { id: 'q-photo', label: 'Photos ok', helpText: null, type: 'CHECKBOX', options: [], required: true, sortOrder: 3 },
];

const config: RsvpFormConfig = {
  availability: { open: true, mode: 'OPEN', deadline: null, closedReason: null },
  allowCompanions: true,
  maxCompanions: 3,
  categories: [
    { id: 'family', name: 'Family', description: null, defaultCompanions: 5, full: false },
    { id: 'friends', name: 'Friends', description: null, defaultCompanions: 1, full: false },
  ],
  questions,
  tributes: { open: true, requireApproval: true },
};

function values(overrides: Partial<RsvpValues> = {}): RsvpValues {
  return {
    ...defaultValues(sortQuestions(questions)),
    fullName: ' Ada Obi ',
    email: ' ada@example.com ',
    categoryId: 'friends',
    response: 'ATTENDING',
    answers: { 'q-meal': 'Fish', 'q-song': '', 'q-photo': true },
    ...overrides,
  };
}

describe('companionLimit', () => {
  it('uses the category default capped by the maximum', () => {
    expect(companionLimit(config, { categoryId: 'friends' })).toBe(1);
    expect(companionLimit(config, { categoryId: 'family' })).toBe(3);
    expect(companionLimit(config, {})).toBe(3);
  });
  it('uses the invitation allowance for invited guests', () => {
    expect(companionLimit(config, { allowedCompanions: 4, categoryId: 'friends' })).toBe(4);
    expect(companionLimit(config, { allowedCompanions: 0 })).toBe(0);
  });
  it('is zero when companions are not allowed', () => {
    expect(companionLimit({ ...config, allowCompanions: false }, { allowedCompanions: 2 })).toBe(0);
  });
});

describe('isLoosePhone', () => {
  it.each(['+234 803 123 4567', '(020) 7946-0958', '08031234567'])('accepts %s', (phone) => expect(isLoosePhone(phone)).toBe(true));
  it.each(['123', 'call me', '+44 abc 123456', '1234567890123456'])('rejects %s', (phone) => expect(isLoosePhone(phone)).toBe(false));
});

describe('step schemas', () => {
  const schemas = createStepSchemas({ config, invited: false, allowedCompanions: null });

  it('requires a valid email and a category for open registration', () => {
    expect(schemas[0].safeParse(values({ email: 'nope' })).success).toBe(false);
    expect(schemas[0].safeParse(values({ categoryId: '' })).success).toBe(false);
    expect(schemas[0].safeParse(values()).success).toBe(true);
  });

  it('does not ask invited guests for a category', () => {
    const invited = createStepSchemas({ config, invited: true, allowedCompanions: 2 });
    expect(invited[0].safeParse(values({ categoryId: '' })).success).toBe(true);
  });

  it('rejects more companions than the limit and unnamed companions', () => {
    const two = [
      { fullName: 'Bola', dietary: '' },
      { fullName: 'Chi', dietary: '' },
    ];
    const over = schemas[1].safeParse(values({ companions: two }));
    expect(over.success).toBe(false);
    expect(over.error?.issues[0].path).toEqual(['companions']);
    expect(schemas[1].safeParse(values({ companions: [{ fullName: 'B', dietary: '' }] })).success).toBe(false);
    expect(schemas[1].safeParse(values({ companions: [two[0]] })).success).toBe(true);
  });

  it('ignores companions when declining', () => {
    expect(schemas[1].safeParse(values({ response: 'DECLINED', companions: [{ fullName: '', dietary: '' }] })).success).toBe(true);
  });

  it('honours required questions only when attending', () => {
    const missing = { 'q-meal': '', 'q-song': '', 'q-photo': false };
    const result = schemas[2].safeParse(values({ answers: missing }));
    expect(result.error?.issues.map((i) => i.path.join('.'))).toEqual(['answers.q-meal', 'answers.q-photo']);
    expect(schemas[2].safeParse(values({ response: 'DECLINED', answers: missing })).success).toBe(true);
  });

  it('finds the first invalid step', () => {
    expect(firstInvalidStep(schemas, values())).toBeNull();
    expect(firstInvalidStep(schemas, values({ response: '' }))).toBe(1);
    expect(firstInvalidStep(schemas, values({ fullName: 'A', response: '' }))).toBe(0);
  });
});

describe('stepForField', () => {
  it('maps server field paths to steps', () => {
    expect(stepForField('email')).toBe(0);
    expect(stepForField('companions.0.fullName')).toBe(1);
    expect(stepForField('answers.q-meal')).toBe(2);
    expect(stepForField('unknown')).toBeNull();
  });
});

describe('buildSubmitBody', () => {
  const ctx = { config, invited: false, allowedCompanions: null };

  it('trims, omits empty optionals and keys answers by question id', () => {
    const body = buildSubmitBody(values({ companions: [{ fullName: ' Bola ', dietary: ' ' }], message: '  ' }), ctx);
    expect(body).toEqual({
      fullName: 'Ada Obi',
      email: 'ada@example.com',
      response: 'ATTENDING',
      categoryId: 'friends',
      companions: [{ fullName: 'Bola' }],
      answers: { 'q-meal': 'Fish', 'q-photo': true },
    });
  });

  it('sends no companions or preferences when declining, and the invite token when present', () => {
    const body = buildSubmitBody(
      values({ response: 'DECLINED', companions: [{ fullName: 'Bola', dietary: '' }], dietary: 'Vegan', message: 'Happy birthday!' }),
      { config, invited: true, allowedCompanions: 1, inviteToken: 'tok' },
    );
    expect(body).toEqual({
      inviteToken: 'tok',
      fullName: 'Ada Obi',
      email: 'ada@example.com',
      response: 'DECLINED',
      companions: [],
      tribute: { message: 'Happy birthday!' },
    });
  });
});

describe('defaultValues and partySize', () => {
  it('prefills from an invitation', () => {
    const v = defaultValues(questions, {
      fullName: 'Ada',
      email: 'ada@example.com',
      phone: null,
      categoryName: 'Family',
      allowedCompanions: 2,
      existing: {
        response: 'ATTENDING',
        companionCount: 1,
        companions: [{ fullName: 'Bola', dietary: null }],
        dietary: null,
        tribute: { message: 'Happy birthday, Aunty!', relationship: 'Niece', status: 'PENDING' },
        accessibility: 'Ramp',
        message: null,
        answers: { 'q-meal': 'Beef', 'q-photo': true },
      },
    });
    expect(v).toMatchObject({
      fullName: 'Ada',
      phone: '',
      response: 'ATTENDING',
      companions: [{ fullName: 'Bola', dietary: '' }],
      accessibility: 'Ramp',
      answers: { 'q-meal': 'Beef', 'q-song': '', 'q-photo': true },
    });
    expect(partySize(v, true)).toBe(2);
    expect(partySize({ ...v, response: 'DECLINED' }, true)).toBe(0);
  });
});

describe('birthday message in the RSVP', () => {
  const ctx = { config, invited: false, allowedCompanions: null };
  const base = { ...defaultValues(questions), fullName: 'Ada Obi', email: 'ada@example.com', response: 'DECLINED' as const };

  it('sends the message as a tribute (also when declining), with the relationship', () => {
    const body = buildSubmitBody({ ...base, message: '  Happy seventieth birthday!  ', tributeRelationship: 'Niece' }, ctx);
    expect(body.tribute).toEqual({ message: 'Happy seventieth birthday!', relationship: 'Niece' });
    expect(body).not.toHaveProperty('message');
  });

  it('omits the tribute when empty or when messages are closed', () => {
    expect(buildSubmitBody({ ...base, message: '   ' }, ctx).tribute).toBeUndefined();
    const closed = { ...ctx, config: { ...config, tributes: { open: false, requireApproval: true } } };
    expect(buildSubmitBody({ ...base, message: 'Happy seventieth birthday!' }, closed).tribute).toBeUndefined();
  });

  it('prefills an existing message and maps server errors to the right field', () => {
    const v = defaultValues(questions, {
      fullName: 'Ada', email: 'ada@example.com', phone: null, categoryName: null, allowedCompanions: 0,
      existing: { response: 'DECLINED', companionCount: 0, companions: [], dietary: null, accessibility: null, message: null, answers: {},
        tribute: { message: 'Old words', relationship: 'Friend', status: 'APPROVED' } },
    });
    expect(v.message).toBe('Old words');
    expect(v.tributeRelationship).toBe('Friend');
    expect(stepForField('tribute.message')).toBe(2);
  });
});
