import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import type { RsvpFormConfig, RsvpInvitePrefill, SubmitRsvpResult } from '@birthday/types';
import { AppException, Errors } from '../common/errors';
import type { RequestMeta } from '../common/request-context';
import { Prisma, type Event, type ModerationStatus, type RsvpQuestion, type Settings } from '../generated/prisma/client';
import { LOCK_KEYS, PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InvitationsService } from '../invitations/invitations.service';
import { SettingsService } from '../settings/settings.service';
import type { RsvpTributeDto, SubmitRsvpDto } from './rsvp.dto';
import { hashIp } from '../common/utils/crypto';

export interface RsvpInput {
  response: 'ATTENDING' | 'DECLINED';
  companions: { fullName: string; dietary?: string | null }[];
  dietary?: string | null;
  accessibility?: string | null;
  message?: string | null;
  answers?: Record<string, string | boolean>;
}

/** The companion limit that applies to a guest: their allowance, or 0 when companions are off. */
export function companionLimit(event: Pick<Event, 'allowCompanions'>, allowed: number): number {
  return event.allowCompanions ? allowed : 0;
}

/**
 * Validates custom-question answers against the active questions. Unknown ids are dropped;
 * required answers are only enforced for guests who are attending.
 */
export function cleanAnswers(questions: RsvpQuestion[], raw: Record<string, unknown> | undefined, attending: boolean): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const errors: Record<string, string[]> = {};
  for (const q of questions) {
    const value = raw?.[q.id];
    const key = `answers.${q.id}`;
    if (q.type === 'CHECKBOX') {
      if (value !== undefined && typeof value !== 'boolean') errors[key] = ['Must be true or false.'];
      else if (value !== undefined) out[q.id] = value;
      else if (q.required && attending) errors[key] = [`"${q.label}" is required.`];
      continue;
    }
    const text = typeof value === 'string' ? value.trim().slice(0, 1000) : '';
    if (value !== undefined && typeof value !== 'string') errors[key] = ['Must be text.'];
    else if (!text) {
      if (q.required && attending) errors[key] = [`"${q.label}" is required.`];
    } else if (q.type === 'SELECT' && !q.options.includes(text)) errors[key] = ['Choose one of the listed options.'];
    else out[q.id] = text;
  }
  if (Object.keys(errors).length) throw Errors.validation(errors);
  return out;
}

@Injectable()
export class RsvpService {
  private readonly logger = new Logger('Rsvp');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly invitations: InvitationsService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async formConfig(): Promise<RsvpFormConfig> {
    const [event, confirmed, categories, questions, settings, byCategory] = await Promise.all([
      this.settings.getEvent(),
      this.settings.confirmedPeople(),
      this.prisma.guestCategory.findMany({ where: { selfSelectable: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.activeQuestions(),
      this.settings.getSettings(),
      this.settings.confirmedPeopleByCategory(),
    ]);
    return {
      tributes: { open: settings.testimonialsOpen, requireApproval: settings.testimonialsRequireApproval },
      availability: this.settings.availability(event, confirmed),
      allowCompanions: event.allowCompanions,
      maxCompanions: companionLimit(event, event.maxCompanions),
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        defaultCompanions: Math.min(c.defaultCompanions, event.maxCompanions),
        full: c.capacity !== null && (byCategory.get(c.id) ?? 0) >= c.capacity,
      })),
      questions: questions.map((q) => ({ id: q.id, label: q.label, helpText: q.helpText, type: q.type, options: q.options, required: q.required, sortOrder: q.sortOrder })),
    };
  }

  async invitePrefill(token: string): Promise<RsvpInvitePrefill> {
    const invitation = await this.invitations.findByToken(token);
    if (invitation.status === 'REVOKED') throw new AppException(HttpStatus.GONE, 'INVITATION_REVOKED', 'This invitation is no longer active.');
    const event = await this.settings.getEvent();
    const { guest } = invitation;
    const rsvp = guest.rsvp;
    const tribute = await this.prisma.testimonial.findUnique({ where: { guestId: guest.id } });
    return {
      fullName: guest.fullName,
      email: guest.email,
      phone: guest.phone,
      categoryName: guest.category?.name ?? null,
      allowedCompanions: companionLimit(event, guest.allowedCompanions),
      existing: rsvp
        ? {
            response: rsvp.response,
            companionCount: rsvp.companionCount,
            companions: rsvp.companions.map((c) => ({ fullName: c.fullName, dietary: c.dietary })),
            dietary: rsvp.dietary,
            accessibility: rsvp.accessibility,
            message: rsvp.message,
            answers: (rsvp.answers as Record<string, string | boolean> | null) ?? {},
            tribute: tribute ? { message: tribute.message, relationship: tribute.relationship, status: tribute.status } : null,
          }
        : null,
    };
  }

  /** Public RSVP. Every rule is checked here, on the server. */
  async submit(dto: SubmitRsvpDto, meta: RequestMeta): Promise<SubmitRsvpResult> {
    const event = await this.settings.getEvent();
    const confirmed = await this.settings.confirmedPeople();
    const availability = this.settings.availability(event, confirmed);
    // A full event still accepts declines and updates from existing guests; the capacity
    // rule below decides whether an attending reply fits.
    if (!availability.open && availability.closedReason !== 'CAPACITY_REACHED') {
      throw new AppException(HttpStatus.FORBIDDEN, 'RSVP_CLOSED', 'RSVPs are closed for this celebration.');
    }

    const questions = await this.activeQuestions();
    const siteSettings = await this.settings.getSettings();
    const attending = dto.response === 'ATTENDING';
    const answers = cleanAnswers(questions, dto.answers, attending);
    const companions = attending ? dto.companions.filter((c) => c.fullName.trim()) : [];

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEYS.capacity})`;

      let guestId: string;
      let allowed: number;
      if (dto.inviteToken) {
        const invitation = await tx.invitation.findUnique({ where: { token: dto.inviteToken }, include: { guest: true } });
        if (!invitation) throw new AppException(404, 'INVITATION_NOT_FOUND', 'We could not find this invitation. Please check the link.');
        if (invitation.status === 'REVOKED') throw new AppException(HttpStatus.GONE, 'INVITATION_REVOKED', 'This invitation is no longer active.');
        guestId = invitation.guestId;
        allowed = invitation.guest.allowedCompanions;
        await tx.guest.update({ where: { id: guestId }, data: { fullName: dto.fullName, phone: dto.phone ?? undefined } });
      } else {
        if (event.rsvpMode === 'INVITE_ONLY') {
          throw new AppException(HttpStatus.FORBIDDEN, 'RSVP_INVITE_REQUIRED', 'This celebration is by invitation. Please use the link in your invitation.');
        }
        const existing = await tx.guest.findUnique({ where: { email: dto.email }, include: { invitation: true } });
        if (existing) {
          return { conflict: existing.invitation?.id ?? null } as const;
        }
        let categoryDefault = event.defaultCompanions;
        if (dto.categoryId) {
          const category = await tx.guestCategory.findUnique({ where: { id: dto.categoryId } });
          if (!category || !category.selfSelectable) throw Errors.validation({ categoryId: ['Choose one of the listed guest categories.'] });
          categoryDefault = category.defaultCompanions;
        }
        allowed = Math.min(categoryDefault, event.maxCompanions);
        const guest = await tx.guest.create({
          data: { fullName: dto.fullName, email: dto.email, phone: dto.phone ?? null, categoryId: dto.categoryId ?? null, allowedCompanions: allowed, source: 'SELF_REGISTERED' },
        });
        guestId = guest.id;
      }

      const limit = companionLimit(event, allowed);
      if (companions.length > limit) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'COMPANION_LIMIT_EXCEEDED',
          limit === 0 ? 'This invitation is for you alone.' : `Your invitation allows up to ${limit} accompanying guest${limit === 1 ? '' : 's'}.`,
        );
      }

      await this.saveRsvp(tx, guestId, event, { ...dto, companions, answers }, false);
      const invitation = attending || dto.inviteToken ? await this.invitations.ensure(tx, guestId) : null;
      const tributeStatus = dto.tribute ? await this.saveTribute(tx, guestId, dto, dto.tribute, siteSettings, meta) : null;
      await this.audit.record(meta, {
        action: 'GUEST_SUBMITTED_RSVP',
        entityType: 'Guest',
        entityId: guestId,
        metadata: { response: dto.response, companions: companions.length, viaInvite: Boolean(dto.inviteToken) },
      }, tx);
      return { invitation, tributeStatus } as const;
    });

    if ('conflict' in result) {
      // Resend the existing invitation (rate-limited) rather than revealing details here.
      if (result.conflict) await this.resendIfQuiet(result.conflict);
      throw new AppException(
        HttpStatus.CONFLICT,
        'RSVP_ALREADY_EXISTS',
        'This email is already on the guest list. We have re-sent the invitation to that address; use its link to change your reply.',
      );
    }

    const emailSent = result.invitation ? await this.invitations.sendInvitationEmail(result.invitation.id, 'confirmation') : false;
    return {
      response: dto.response,
      invitationToken: attending ? (result.invitation?.token ?? null) : null,
      invitationCode: attending ? (result.invitation?.code ?? null) : null,
      guestName: dto.fullName,
      companionCount: companions.length,
      emailSent,
      tributeStatus: result.tributeStatus,
    };
  }

  /**
   * Saves the optional birthday message from the RSVP form into the testimonials table,
   * one per guest. Changing the text sends it back for review and takes it off the website;
   * resubmitting the same text leaves its status alone. Ignored when messages are closed.
   */
  private async saveTribute(
    tx: Tx,
    guestId: string,
    dto: SubmitRsvpDto,
    tribute: RsvpTributeDto,
    settings: Settings,
    meta: RequestMeta,
  ): Promise<ModerationStatus | null> {
    if (!settings.testimonialsOpen) return null;
    const status: ModerationStatus = settings.testimonialsRequireApproval ? 'PENDING' : 'APPROVED';
    const relationship = tribute.relationship || null;
    const existing = await tx.testimonial.findUnique({ where: { guestId } });
    if (existing) {
      const changed = existing.message !== tribute.message || existing.relationship !== relationship || existing.authorName !== dto.fullName;
      if (!changed) return existing.status;
      await tx.testimonial.update({
        where: { id: existing.id },
        data: { message: tribute.message, relationship, authorName: dto.fullName, email: dto.email, status, isPublic: false, isFeatured: false, reviewedAt: null, reviewedById: null },
      });
      return status;
    }
    const created = await tx.testimonial.create({
      data: {
        guestId,
        authorName: dto.fullName,
        relationship,
        email: dto.email,
        message: tribute.message,
        status,
        ipHash: hashIp(meta.ip, this.config.auth.refreshSecret),
      },
    });
    await this.audit.record(meta, { action: 'GUEST_SUBMITTED_TESTIMONIAL', entityType: 'Testimonial', entityId: created.id, metadata: { viaRsvp: true } }, tx);
    return status;
  }

  /**
   * Writes a guest's RSVP and companions. Enforces capacity under the capacity lock, which the
   * caller must already hold. `overrideCapacity` is for audited admin overrides only.
   */
  async saveRsvp(tx: Tx, guestId: string, event: Event, input: RsvpInput, overrideCapacity: boolean): Promise<void> {
    const attending = input.response === 'ATTENDING';
    const companions = attending ? input.companions : [];
    if (attending && !overrideCapacity) {
      const others = await this.settings.confirmedPeople(tx, guestId);
      if (others + 1 + companions.length > event.capacity) {
        const left = Math.max(0, event.capacity - others);
        throw new AppException(
          HttpStatus.CONFLICT,
          'EVENT_CAPACITY_REACHED',
          left === 0 ? 'We are sorry: the celebration is now full.' : `We are sorry: only ${left} place${left === 1 ? '' : 's'} remain${left === 1 ? 's' : ''}.`,
        );
      }
    }
    if (attending && !overrideCapacity) {
      const guest = await tx.guest.findUnique({ where: { id: guestId }, select: { category: true } });
      const category = guest?.category;
      if (category && category.capacity !== null) {
        const others = (await this.settings.confirmedPeopleByCategory(tx, guestId)).get(category.id) ?? 0;
        if (others + 1 + companions.length > category.capacity) {
          const left = Math.max(0, category.capacity - others);
          throw new AppException(
            HttpStatus.CONFLICT,
            'CATEGORY_CAPACITY_REACHED',
            left === 0
              ? `We are sorry: the places set aside for ${category.name} guests are all taken.`
              : `We are sorry: only ${left} place${left === 1 ? '' : 's'} remain${left === 1 ? 's' : ''} for ${category.name} guests.`,
          );
        }
      }
    }
    const data = {
      response: input.response,
      companionCount: companions.length,
      dietary: input.dietary || null,
      accessibility: input.accessibility || null,
      message: input.message || null,
      answers: (input.answers ?? {}) as Prisma.InputJsonValue,
    };
    const rsvp = await tx.rsvp.upsert({ where: { guestId }, create: { guestId, ...data }, update: data });
    await tx.companion.deleteMany({ where: { rsvpId: rsvp.id } });
    if (companions.length) {
      await tx.companion.createMany({ data: companions.map((c) => ({ rsvpId: rsvp.id, fullName: c.fullName, dietary: c.dietary || null })) });
    }
  }

  async lockCapacity(tx: Tx): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEYS.capacity})`;
  }

  private activeQuestions() {
    return this.prisma.rsvpQuestion.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  private async resendIfQuiet(invitationId: string): Promise<void> {
    const invitation = await this.prisma.invitation.findUnique({ where: { id: invitationId } });
    if (!invitation || invitation.status === 'REVOKED') return;
    if (invitation.lastSentAt && Date.now() - invitation.lastSentAt.getTime() < 10 * 60_000) return;
    await this.invitations.sendInvitationEmail(invitationId, 'confirmation').catch((e: Error) => this.logger.warn(`Resend failed: ${e.message}`));
  }
}
