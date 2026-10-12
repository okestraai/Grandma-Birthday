import { z } from 'zod';
import type {
  PublicGuestCategory,
  RsvpEventChoice,
  RsvpEventOption,
  RsvpFormConfig,
  RsvpInvitePrefill,
  RsvpQuestion,
  RsvpResponse,
  SubmitRsvpRequest,
} from '@birthday/types';

/**
 * RSVP form model, per-step validation and pure helpers.
 * The page keeps one react-hook-form instance; each step validates only its own slice.
 */

export const RSVP_STEPS = ['Your details', 'Guest details', 'Preferences', 'Confirmation'] as const;
export type RsvpStep = 0 | 1 | 2 | 3;
export const LAST_STEP: RsvpStep = 3;

export interface CompanionValues {
  fullName: string;
  dietary: string;
}

/** One event the guest may tick. `companionCount` null means all their companions come. */
export interface EventChoiceValues {
  eventId: string;
  selected: boolean;
  companionCount: number | null;
}

export interface RsvpValues {
  fullName: string;
  email: string;
  phone: string;
  categoryId: string;
  response: RsvpResponse | '';
  companions: CompanionValues[];
  /** One entry per event the guest might reply to; which are shown depends on the category. */
  events: EventChoiceValues[];
  dietary: string;
  accessibility: string;
  /** Optional birthday message (saved as a testimonial for review). */
  message: string;
  /** How the guest knows the celebrant, shown with the birthday message. */
  tributeRelationship: string;
  answers: Record<string, string | boolean>;
}

export const LIMITS = {
  nameMin: 2,
  nameMax: 120,
  noteMax: 500,
  messageMin: 10,
  messageMax: 2000,
  relationshipMax: 80,
  answerMax: 1000,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Loose phone check: digits with optional +, spaces, dashes, dots and brackets; 7–15 digits. */
export function isLoosePhone(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}

export function sortQuestions(questions: RsvpQuestion[]): RsvpQuestion[] {
  return [...questions].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function findCategory(categories: PublicGuestCategory[], id: string | null | undefined): PublicGuestCategory | undefined {
  return id ? categories.find((category) => category.id === id) : undefined;
}

type CompanionConfig = Pick<RsvpFormConfig, 'allowCompanions' | 'maxCompanions' | 'categories'>;

/**
 * How many accompanying guests this person may bring.
 * Invited guests: the number the family set on their invitation.
 * Open registration: the chosen category's default, capped by the site-wide maximum.
 */
export function companionLimit(
  config: CompanionConfig,
  options: { allowedCompanions?: number | null; categoryId?: string | null } = {},
): number {
  if (!config.allowCompanions) return 0;
  const max = Math.max(0, config.maxCompanions);
  if (options.allowedCompanions != null) return Math.max(0, options.allowedCompanions);
  const category = findCategory(config.categories, options.categoryId);
  return Math.min(Math.max(0, category?.defaultCompanions ?? max), max);
}

export interface RsvpSchemaContext {
  config: RsvpFormConfig;
  /** Set for guests arriving from a personal invitation link. */
  invited: boolean;
  allowedCompanions: number | null;
  /** The events this guest may reply to: their invitation's, or the open form's. Defaults to the form's. */
  events?: RsvpEventOption[];
}

/** The events the guest may reply to before any category filter. */
export function eventOptions(ctx: Pick<RsvpSchemaContext, 'config' | 'events'>): RsvpEventOption[] {
  return ctx.events ?? ctx.config.events;
}

/**
 * The events offered to this guest. An invitation's events are already this guest's. In the open
 * form, an event limited to some categories shows only when the guest picked one of them.
 */
export function visibleEvents(ctx: Pick<RsvpSchemaContext, 'config' | 'events' | 'invited'>, categoryId: string): RsvpEventOption[] {
  const options = eventOptions(ctx);
  if (ctx.invited) return options;
  return options.filter((e) => e.invitedCategoryIds.length === 0 || e.invitedCategoryIds.includes(categoryId));
}

/** True when one yes covers every event the guest may attend (the celebration's rsvpScope). */
export function wholeCelebration(ctx: Pick<RsvpSchemaContext, 'config'>): boolean {
  return ctx.config.rsvpScope === 'WHOLE_CELEBRATION';
}

/** Whether the guest is asked to tick events: only when they reply per event and more than one is offered. */
export function asksForEvents(ctx: Pick<RsvpSchemaContext, 'config' | 'events' | 'invited'>, categoryId: string): boolean {
  return !wholeCelebration(ctx) && visibleEvents(ctx, categoryId).length > 1;
}

/** The events the guest will attend, with the companions coming to each (capped at those named). */
export function chosenEvents(
  values: Pick<RsvpValues, 'events' | 'categoryId' | 'companions'>,
  ctx: Pick<RsvpSchemaContext, 'config' | 'events' | 'invited'>,
): { event: RsvpEventOption; companionCount: number }[] {
  const named = ctx.config.allowCompanions ? values.companions.length : 0;
  const visible = visibleEvents(ctx, values.categoryId);
  // A single event needs no ticking, and a whole-celebration reply covers them all.
  if (visible.length === 1 || wholeCelebration(ctx)) return visible.map((event) => ({ event, companionCount: named }));
  return visible.flatMap((event) => {
    const choice = values.events.find((c) => c.eventId === event.id);
    return choice?.selected ? [{ event, companionCount: Math.min(choice.companionCount ?? named, named) }] : [];
  });
}

/** Category is asked only for open registration (no invitation) when categories exist. */
export function requiresCategory(ctx: Pick<RsvpSchemaContext, 'config' | 'invited'>): boolean {
  return !ctx.invited && ctx.config.categories.length > 0;
}

const nameRule = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Please enter ${label}.`)
    .min(LIMITS.nameMin, `Please enter at least ${LIMITS.nameMin} characters.`)
    .max(LIMITS.nameMax, `Please keep this under ${LIMITS.nameMax} characters.`);

function answerIssue(question: RsvpQuestion, value: string | boolean | undefined): string | null {
  if (question.type === 'CHECKBOX') {
    if (question.required && value !== true) return 'Please tick this box to continue.';
    return null;
  }
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return question.required ? (question.type === 'SELECT' ? 'Please choose an option.' : 'Please answer this question.') : null;
  if (question.type === 'SELECT' && !question.options.includes(text)) return 'Please choose one of the options.';
  if (text.length > LIMITS.answerMax) return `Please keep this under ${LIMITS.answerMax} characters.`;
  return null;
}

/** One schema per data-entry step (0–2). Each validates the whole form value but reports only its own fields. */
export function createStepSchemas(ctx: RsvpSchemaContext) {
  const { config } = ctx;
  const questions = sortQuestions(config.questions);
  const categoryRequired = requiresCategory(ctx);

  const details = z.object({
    fullName: nameRule('your full name'),
    email: z.string().trim().min(1, 'Please enter your email address.').regex(EMAIL_RE, 'Please enter a valid email address.'),
    phone: z
      .string()
      .trim()
      .refine((value) => value === '' || isLoosePhone(value), 'Please enter a valid phone number, or leave it blank.'),
    categoryId: z
      .string()
      .refine((value) => !categoryRequired || config.categories.some((c) => c.id === value), 'Please choose how you know the family.'),
  });

  const guests = z
    .object({
      categoryId: z.string(),
      response: z.string(),
      companions: z.array(z.object({ fullName: z.string(), dietary: z.string() })),
      events: z.array(z.object({ eventId: z.string(), selected: z.boolean(), companionCount: z.number().nullable() })),
    })
    .superRefine((value, issue) => {
      if (value.response !== 'ATTENDING' && value.response !== 'DECLINED') {
        issue.addIssue({ code: 'custom', path: ['response'], message: 'Please let us know whether you can attend.' });
        return;
      }
      if (value.response === 'ATTENDING' && asksForEvents(ctx, value.categoryId) && chosenEvents(value, ctx).length === 0) {
        issue.addIssue({ code: 'custom', path: ['events'], message: 'Please choose at least one event.' });
      }
      if (value.response === 'DECLINED' || !config.allowCompanions) return;
      const limit = companionLimit(config, {
        allowedCompanions: ctx.invited ? ctx.allowedCompanions : null,
        categoryId: value.categoryId,
      });
      if (value.companions.length > limit) {
        issue.addIssue({
          code: 'custom',
          path: ['companions'],
          message:
            limit === 0
              ? 'Your invitation is for you alone.'
              : `You may bring up to ${limit} accompanying ${limit === 1 ? 'guest' : 'guests'}.`,
        });
      }
      value.companions.forEach((companion, index) => {
        const result = nameRule("your guest's full name").safeParse(companion.fullName);
        if (!result.success) {
          issue.addIssue({ code: 'custom', path: ['companions', index, 'fullName'], message: result.error.issues[0].message });
        }
        if (companion.dietary.trim().length > LIMITS.noteMax) {
          issue.addIssue({ code: 'custom', path: ['companions', index, 'dietary'], message: `Please keep this under ${LIMITS.noteMax} characters.` });
        }
      });
    });

  const preferences = z
    .object({
      response: z.string(),
      dietary: z.string(),
      accessibility: z.string(),
      message: z
        .string()
        .trim()
        .max(LIMITS.messageMax, `Please keep your message under ${LIMITS.messageMax} characters.`)
        .refine((text) => text.length === 0 || text.length >= LIMITS.messageMin, `Please write at least ${LIMITS.messageMin} characters, or leave it empty.`),
      tributeRelationship: z.string().trim().max(LIMITS.relationshipMax, `Please keep this under ${LIMITS.relationshipMax} characters.`),
      answers: z.record(z.string(), z.union([z.string(), z.boolean()])),
    })
    .superRefine((value, issue) => {
      if (value.response !== 'ATTENDING') return;
      for (const key of ['dietary', 'accessibility'] as const) {
        if (value[key].trim().length > LIMITS.noteMax) {
          issue.addIssue({ code: 'custom', path: [key], message: `Please keep this under ${LIMITS.noteMax} characters.` });
        }
      }
      for (const question of questions) {
        const message = answerIssue(question, value.answers[question.id]);
        if (message) issue.addIssue({ code: 'custom', path: ['answers', question.id], message });
      }
    });

  return [details, guests, preferences] as const;
}

/** Form field names that belong to each step, for `trigger()`. */
export function stepFields(step: RsvpStep, values: Pick<RsvpValues, 'companions'>, questions: RsvpQuestion[]): string[] {
  switch (step) {
    case 0:
      return ['fullName', 'email', 'phone', 'categoryId'];
    case 1:
      return ['response', 'companions', 'events', ...values.companions.flatMap((_, i) => [`companions.${i}.fullName`, `companions.${i}.dietary`])];
    case 2:
      return ['dietary', 'accessibility', 'message', 'tributeRelationship', ...questions.map((q) => `answers.${q.id}`)];
    default:
      return [];
  }
}

/** Server field paths that map onto a differently named form field. */
export const SERVER_FIELD_ALIASES: Record<string, string> = {
  'tribute.message': 'message',
  'tribute.relationship': 'tributeRelationship',
};

/** The step that holds a field path such as "email", "companions.0.fullName" or "answers.<id>". */
export function stepForField(path: string): RsvpStep | null {
  const root = (SERVER_FIELD_ALIASES[path] ?? path).split('.')[0];
  if (['fullName', 'email', 'phone', 'categoryId', 'inviteToken'].includes(root)) return 0;
  if (['response', 'companions', 'events'].includes(root)) return 1;
  if (['dietary', 'accessibility', 'message', 'tributeRelationship', 'answers'].includes(root)) return 2;
  return null;
}

/** First data-entry step whose schema rejects the values, or null when all pass. */
export function firstInvalidStep(schemas: ReturnType<typeof createStepSchemas>, values: RsvpValues): RsvpStep | null {
  for (let step = 0; step < schemas.length; step += 1) {
    if (!schemas[step].safeParse(values).success) return step as RsvpStep;
  }
  return null;
}

function emptyAnswer(question: RsvpQuestion): string | boolean {
  return question.type === 'CHECKBOX' ? false : '';
}

/** Ticked events from an earlier reply; nothing is ticked for a new reply. */
function eventDefaults(options: RsvpEventOption[], existing: { companionCount: number; events: RsvpEventChoice[] } | null): EventChoiceValues[] {
  return options.map((event) => {
    const saved = existing?.events.find((c) => c.eventId === event.id);
    return {
      eventId: event.id,
      selected: Boolean(saved),
      companionCount: saved && saved.companionCount !== existing?.companionCount ? saved.companionCount : null,
    };
  });
}

/** Initial form values, prefilled from a personal invitation when there is one. */
export function defaultValues(questions: RsvpQuestion[], prefill?: RsvpInvitePrefill | null, options: RsvpEventOption[] = prefill?.events ?? []): RsvpValues {
  const existing = prefill?.existing ?? null;
  const answers: Record<string, string | boolean> = {};
  for (const question of questions) {
    const saved = existing?.answers[question.id];
    if (question.type === 'CHECKBOX') answers[question.id] = saved === true || saved === 'true';
    else answers[question.id] = typeof saved === 'string' ? saved : emptyAnswer(question);
  }
  return {
    fullName: prefill?.fullName ?? '',
    email: prefill?.email ?? '',
    phone: prefill?.phone ?? '',
    categoryId: '',
    response: existing?.response ?? '',
    companions: (existing?.companions ?? []).map((c) => ({ fullName: c.fullName, dietary: c.dietary ?? '' })),
    events: eventDefaults(options, existing),
    dietary: existing?.dietary ?? '',
    accessibility: existing?.accessibility ?? '',
    message: existing?.tribute?.message ?? '',
    tributeRelationship: existing?.tribute?.relationship ?? '',
    answers,
  };
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** The POST /api/rsvp body: trimmed, empty optionals omitted, no companions when declining. */
export function buildSubmitBody(
  values: RsvpValues,
  ctx: RsvpSchemaContext & { inviteToken?: string | null },
): SubmitRsvpRequest {
  const response = values.response as RsvpResponse;
  const attending = response === 'ATTENDING';
  const body: SubmitRsvpRequest = {
    fullName: values.fullName.trim(),
    email: values.email.trim(),
    response,
    companions:
      attending && ctx.config.allowCompanions
        ? values.companions.map((c) => {
            const dietary = optional(c.dietary);
            return dietary ? { fullName: c.fullName.trim(), dietary } : { fullName: c.fullName.trim() };
          })
        : [],
  };
  if (ctx.inviteToken) body.inviteToken = ctx.inviteToken;
  const phone = optional(values.phone);
  if (phone) body.phone = phone;
  if (requiresCategory(ctx) && values.categoryId) body.categoryId = values.categoryId;
  // The birthday message goes to the testimonials table, for declined guests too.
  const message = optional(values.message);
  if (message && ctx.config.tributes.open) {
    const relationship = optional(values.tributeRelationship);
    body.tribute = relationship ? { message, relationship } : { message };
  }

  if (attending) {
    // A whole-celebration reply leaves the events to the server: it records every event the guest may attend.
    const events = wholeCelebration(ctx) ? [] : chosenEvents(values, ctx);
    if (events.length) body.events = events.map((c) => ({ eventId: c.event.id, companionCount: c.companionCount }));
    const dietary = optional(values.dietary);
    if (dietary) body.dietary = dietary;
    const accessibility = optional(values.accessibility);
    if (accessibility) body.accessibility = accessibility;

    const answers: Record<string, string | boolean> = {};
    for (const question of ctx.config.questions) {
      const value = values.answers[question.id];
      if (typeof value === 'boolean') answers[question.id] = value;
      else if (typeof value === 'string' && value.trim()) answers[question.id] = value.trim();
    }
    if (Object.keys(answers).length > 0) body.answers = answers;
  }
  return body;
}

/** Everyone in the party, including the guest. */
export function partySize(values: Pick<RsvpValues, 'response' | 'companions'>, allowCompanions: boolean): number {
  if (values.response !== 'ATTENDING') return 0;
  return 1 + (allowCompanions ? values.companions.length : 0);
}
