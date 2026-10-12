import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { AdminGuestDetail, AdminGuestListItem, Paginated, SendInvitationsResult } from '@birthday/types';
import { MailService } from '../notifications/mail.service';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { AppException, Errors } from '../common/errors';
import type { RequestMeta } from '../common/request-context';
import { paginated, skipTake } from '../common/utils/pagination';
import { randomToken } from '../common/utils/crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InvitationsService } from '../invitations/invitations.service';
import { RsvpService, companionLimit } from '../rsvp/rsvp.service';
import { SettingsService } from '../settings/settings.service';
import { EventsService } from '../events/events.service';
import type { Celebration } from '../generated/prisma/client';
import type { Tx } from '../prisma/prisma.service';
import { CHECKIN_INCLUDE, toCheckInRecord } from '../checkin/checkin.mapper';
import type { CreateGuestDto, GuestListQuery, UpdateGuestDto } from './guests.dto';

const LIST_INCLUDE = {
  category: { select: { name: true } },
  rsvp: { select: { response: true, companionCount: true, events: { select: { eventId: true, companionCount: true } } } },
  invitation: { select: { id: true, code: true, status: true, lastSentAt: true } },
  checkIns: { where: { reversedAt: null }, select: { checkedInAt: true, eventId: true }, orderBy: { checkedInAt: 'desc' as const } },
} satisfies Prisma.GuestInclude;

type ListRow = Prisma.GuestGetPayload<{ include: typeof LIST_INCLUDE }>;

function toListItem(g: ListRow): AdminGuestListItem {
  const attending = g.rsvp?.response === 'ATTENDING';
  return {
    id: g.id,
    fullName: g.fullName,
    email: g.email,
    phone: g.phone,
    categoryId: g.categoryId,
    categoryName: g.category?.name ?? null,
    allowedCompanions: g.allowedCompanions,
    source: g.source,
    rsvpResponse: g.rsvp?.response ?? null,
    companionCount: g.rsvp?.companionCount ?? 0,
    partySize: attending ? 1 + (g.rsvp?.companionCount ?? 0) : 0,
    events: attending
      ? (g.rsvp?.events ?? []).map((e) => ({ eventId: e.eventId, companionCount: e.companionCount, checkedIn: g.checkIns.some((c) => c.eventId === e.eventId) }))
      : [],
    invitation: g.invitation
      ? { id: g.invitation.id, code: g.invitation.code, status: g.invitation.status, lastSentAt: g.invitation.lastSentAt?.toISOString() ?? null }
      : null,
    checkedInAt: g.checkIns[0]?.checkedInAt.toISOString() ?? null,
    createdAt: g.createdAt.toISOString(),
  };
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

@Injectable()
export class GuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
    private readonly rsvp: RsvpService,
    private readonly invitations: InvitationsService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  where(query: GuestListQuery, invitationsOnly = false): Prisma.GuestWhereInput {
    const q = query.q?.trim();
    const and: Prisma.GuestWhereInput[] = [];
    if (q) {
      and.push({
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          { invitation: { code: { contains: q.toUpperCase() } } },
        ],
      });
    }
    if (query.categoryId) and.push({ categoryId: query.categoryId });
    if (query.eventId) and.push({ rsvp: { response: 'ATTENDING', events: { some: { eventId: query.eventId } } } });
    if (query.rsvp === 'NONE') and.push({ rsvp: null });
    else if (query.rsvp) and.push({ rsvp: { response: query.rsvp } });
    const active = { reversedAt: null, ...(query.eventId ? { eventId: query.eventId } : {}) };
    if (query.checkIn === 'IN') and.push({ checkIns: { some: active } });
    if (query.checkIn === 'OUT') and.push({ checkIns: { none: active } });
    if (query.from) and.push({ createdAt: { gte: new Date(query.from) } });
    if (query.to) {
      const to = new Date(query.to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) to.setUTCDate(to.getUTCDate() + 1);
      and.push({ createdAt: { lt: to } });
    }
    if (invitationsOnly || query.status) and.push({ invitation: query.status ? { status: query.status } : { isNot: null } });
    return { AND: and };
  }

  orderBy(sort: GuestListQuery['sort']): Prisma.GuestOrderByWithRelationInput[] {
    switch (sort) {
      case 'oldest':
        return [{ createdAt: 'asc' }];
      case 'name':
        return [{ fullName: 'asc' }];
      case '-name':
        return [{ fullName: 'desc' }];
      default:
        return [{ createdAt: 'desc' }];
    }
  }

  async list(query: GuestListQuery, invitationsOnly = false): Promise<Paginated<AdminGuestListItem>> {
    const where = this.where(query, invitationsOnly);
    const [rows, total] = await Promise.all([
      this.prisma.guest.findMany({ where, include: LIST_INCLUDE, orderBy: this.orderBy(query.sort), ...skipTake(query) }),
      this.prisma.guest.count({ where }),
    ]);
    return paginated(rows.map(toListItem), total, query);
  }

  async exportCsv(query: GuestListQuery): Promise<string> {
    const [rows, events] = await Promise.all([
      this.prisma.guest.findMany({
        where: this.where(query),
        include: { ...LIST_INCLUDE, rsvp: { include: { companions: true, events: { select: { eventId: true, companionCount: true } } } } },
        orderBy: this.orderBy(query.sort),
        take: 10_000,
      }),
      this.events.list(),
    ]);
    const eventName = new Map(events.map((e) => [e.id, e.name]));
    const header = ['Name', 'Email', 'Phone', 'Category', 'RSVP', 'Party size', 'Events', 'Companions', 'Dietary', 'Accessibility', 'Invitation', 'Invitation status', 'Checked in at', 'Registered'];
    const lines = rows.map((g) => {
      const item = toListItem(g);
      return [
        g.fullName,
        g.email,
        g.phone,
        item.categoryName,
        item.rsvpResponse ?? 'No reply',
        item.partySize,
        item.events.map((e) => `${eventName.get(e.eventId) ?? 'Event'} (${1 + e.companionCount})`).join('; '),
        g.rsvp?.companions.map((c) => c.fullName).join('; '),
        g.rsvp?.dietary,
        g.rsvp?.accessibility,
        item.invitation?.code,
        item.invitation?.status,
        item.checkedInAt,
        item.createdAt,
      ]
        .map(csvCell)
        .join(',');
    });
    return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`;
  }

  async detail(id: string): Promise<AdminGuestDetail> {
    const guest = await this.prisma.guest.findUnique({
      where: { id },
      include: {
        ...LIST_INCLUDE,
        rsvp: { include: { companions: { orderBy: { createdAt: 'asc' } }, events: { select: { eventId: true, companionCount: true } } } },
        invitation: true,
        extraEvents: { select: { eventId: true } },
      },
    });
    if (!guest) throw Errors.notFound('Guest');
    const [checkIns, questions, invited] = await Promise.all([
      this.prisma.checkIn.findMany({ where: { guestId: id }, include: CHECKIN_INCLUDE, orderBy: { checkedInAt: 'desc' } }),
      this.prisma.rsvpQuestion.findMany(),
      this.events.forGuest(this.prisma, id),
    ]);
    const answers = (guest.rsvp?.answers as Record<string, string | boolean> | null) ?? {};
    const inv = guest.invitation;
    return {
      ...toListItem({ ...guest, invitation: inv ? { id: inv.id, code: inv.code, status: inv.status, lastSentAt: inv.lastSentAt } : null }),
      notes: guest.notes,
      invitedEventIds: invited.map((e) => e.id),
      extraEventIds: guest.extraEvents.map((e) => e.eventId),
      rsvp: guest.rsvp
        ? {
            response: guest.rsvp.response,
            companions: guest.rsvp.companions.map((c) => ({ id: c.id, fullName: c.fullName, dietary: c.dietary })),
            dietary: guest.rsvp.dietary,
            accessibility: guest.rsvp.accessibility,
            message: guest.rsvp.message,
            answers: Object.entries(answers).map(([questionId, value]) => ({
              questionId,
              label: questions.find((q) => q.id === questionId)?.label ?? 'Removed question',
              value,
            })),
            submittedAt: guest.rsvp.submittedAt.toISOString(),
            updatedAt: guest.rsvp.updatedAt.toISOString(),
          }
        : null,
      invitationDetail: inv
        ? {
            id: inv.id,
            code: inv.code,
            status: inv.status,
            token: inv.token,
            url: this.invitations.url(inv.token),
            revokedAt: inv.revokedAt?.toISOString() ?? null,
            revokedReason: inv.revokedReason,
            lastSentAt: inv.lastSentAt?.toISOString() ?? null,
            sendCount: inv.sendCount,
          }
        : null,
      checkIns: checkIns.map(toCheckInRecord),
    };
  }

  async create(dto: CreateGuestDto, meta: RequestMeta): Promise<AdminGuestDetail> {
    await this.assertCategory(dto.categoryId);
    await this.assertEvents(dto.extraEventIds);
    const celebration = await this.settings.getCelebration();
    const guestId = await this.prisma.$transaction(async (tx) => {
      await this.rsvp.lockCapacity(tx);
      if (await tx.guest.findUnique({ where: { email: dto.email } })) {
        throw new AppException(HttpStatus.CONFLICT, 'CONFLICT', 'A guest with this email already exists.', { email: ['A guest with this email already exists.'] });
      }
      const guest = await tx.guest.create({
        data: {
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone ?? null,
          categoryId: dto.categoryId ?? null,
          allowedCompanions: dto.allowedCompanions,
          notes: dto.notes ?? null,
          source: 'ADMIN_INVITED',
        },
      });
      if (dto.extraEventIds) await this.setExtraEvents(tx, guest.id, dto.extraEventIds);
      if (dto.rsvp) await this.saveAdminRsvp(tx, guest.id, celebration, dto.allowedCompanions, dto.rsvp, dto.overrideCapacity ?? false, meta);
      await this.invitations.ensure(tx, guest.id);
      await this.audit.record(meta, { action: 'ADMIN_CREATED_GUEST', entityType: 'Guest', entityId: guest.id, metadata: { withRsvp: Boolean(dto.rsvp), extraEventIds: dto.extraEventIds } }, tx);
      return guest.id;
    });
    if (dto.sendInvitation) {
      const invitation = await this.prisma.invitation.findUniqueOrThrow({ where: { guestId } });
      await this.invitations.sendInvitationEmail(invitation.id, 'invitation');
    }
    return this.detail(guestId);
  }

  async update(id: string, dto: UpdateGuestDto, meta: RequestMeta): Promise<AdminGuestDetail> {
    await this.assertCategory(dto.categoryId);
    await this.assertEvents(dto.extraEventIds);
    const celebration = await this.settings.getCelebration();
    await this.prisma.$transaction(async (tx) => {
      await this.rsvp.lockCapacity(tx);
      const guest = await tx.guest.findUnique({ where: { id }, include: { rsvp: true } });
      if (!guest) throw Errors.notFound('Guest');
      if (dto.email && dto.email !== guest.email && (await tx.guest.findUnique({ where: { email: dto.email } }))) {
        throw new AppException(HttpStatus.CONFLICT, 'CONFLICT', 'A guest with this email already exists.', { email: ['A guest with this email already exists.'] });
      }
      const allowed = dto.allowedCompanions ?? guest.allowedCompanions;
      if (!dto.rsvp && guest.rsvp && guest.rsvp.companionCount > allowed) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'COMPANION_LIMIT_EXCEEDED',
          `This guest has already named ${guest.rsvp.companionCount} companion(s). Edit their RSVP first, or allow at least that many.`,
        );
      }
      await tx.guest.update({
        where: { id },
        data: { fullName: dto.fullName, email: dto.email, phone: dto.phone, categoryId: dto.categoryId, allowedCompanions: dto.allowedCompanions, notes: dto.notes },
      });
      if (dto.extraEventIds) await this.setExtraEvents(tx, id, dto.extraEventIds);
      if (dto.rsvp) await this.saveAdminRsvp(tx, id, celebration, allowed, dto.rsvp, dto.overrideCapacity ?? false, meta);
      await this.audit.record(meta, { action: 'ADMIN_UPDATED_GUEST', entityType: 'Guest', entityId: id, metadata: { fields: Object.keys(dto), extraEventIds: dto.extraEventIds } }, tx);
    });
    return this.detail(id);
  }

  async remove(id: string, meta: RequestMeta): Promise<void> {
    const guest = await this.prisma.guest.findUnique({ where: { id } });
    if (!guest) throw Errors.notFound('Guest');
    await this.prisma.guest.delete({ where: { id } });
    await this.audit.record(meta, { action: 'ADMIN_DELETED_GUEST', entityType: 'Guest', entityId: id, metadata: { name: guest.fullName } });
  }

  async resend(id: string, meta: RequestMeta): Promise<AdminGuestDetail> {
    const guest = await this.prisma.guest.findUnique({ where: { id }, include: { invitation: true, rsvp: true } });
    if (!guest) throw Errors.notFound('Guest');
    const invitation = guest.invitation ?? (await this.prisma.$transaction((tx) => this.invitations.ensure(tx, id)));
    if (invitation.status === 'REVOKED') throw new AppException(HttpStatus.CONFLICT, 'INVITATION_REVOKED', 'Reinstate this invitation before sending it.');
    const sent = await this.invitations.sendInvitationEmail(invitation.id, guest.rsvp?.response === 'ATTENDING' ? 'confirmation' : 'invitation');
    await this.audit.record(meta, { action: 'ADMIN_SENT_INVITATION', entityType: 'Invitation', entityId: invitation.id, metadata: { delivered: sent } });
    return this.detail(id);
  }

  /**
   * Emails invitations in bulk: the given guests, or every active invitation never sent.
   * Guests who declined and revoked invitations are skipped. Sent one after another so a
   * slow mail server is not flooded.
   */
  async sendMany(dto: { guestIds?: string[]; onlyUnsent?: boolean }, meta: RequestMeta): Promise<SendInvitationsResult> {
    if (!dto.guestIds?.length && !dto.onlyUnsent) throw Errors.validation({ guestIds: ['Choose guests, or send to everyone not yet invited.'] });
    const guests = await this.prisma.guest.findMany({
      where: dto.guestIds?.length ? { id: { in: dto.guestIds } } : { invitation: { is: { lastSentAt: null } } },
      include: { invitation: true, rsvp: { select: { response: true } } },
      take: 500,
      orderBy: { createdAt: 'asc' },
    });
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const guest of guests) {
      if (guest.rsvp?.response === 'DECLINED' || guest.invitation?.status === 'REVOKED') {
        skipped++;
        continue;
      }
      const invitation = guest.invitation ?? (await this.prisma.$transaction((tx) => this.invitations.ensure(tx, guest.id)));
      try {
        const delivered = await this.invitations.sendInvitationEmail(invitation.id, guest.rsvp?.response === 'ATTENDING' ? 'confirmation' : 'invitation');
        if (delivered || !this.mail.enabled) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }
    await this.audit.record(meta, { action: 'ADMIN_SENT_INVITATION', entityType: 'Invitation', metadata: { bulk: true, sent, skipped, failed } });
    return { sent, skipped, failed, emailEnabled: this.mail.enabled };
  }

  async revoke(id: string, reason: string | undefined, meta: RequestMeta): Promise<AdminGuestDetail> {
    const invitation = await this.invitationOf(id);
    await this.prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: reason ?? null } });
    await this.audit.record(meta, { action: 'ADMIN_REVOKED_INVITATION', entityType: 'Invitation', entityId: invitation.id, metadata: { reason: reason ?? null } });
    return this.detail(id);
  }

  async reinstate(id: string, meta: RequestMeta): Promise<AdminGuestDetail> {
    const invitation = await this.invitationOf(id);
    await this.prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'ACTIVE', revokedAt: null, revokedReason: null } });
    await this.audit.record(meta, { action: 'ADMIN_REINSTATED_INVITATION', entityType: 'Invitation', entityId: invitation.id });
    return this.detail(id);
  }

  async regenerate(id: string, meta: RequestMeta): Promise<AdminGuestDetail> {
    const invitation = await this.invitationOf(id);
    await this.prisma.invitation.update({ where: { id: invitation.id }, data: { token: randomToken() } });
    await this.audit.record(meta, { action: 'ADMIN_REGENERATED_INVITATION', entityType: 'Invitation', entityId: invitation.id });
    return this.detail(id);
  }

  private async saveAdminRsvp(
    tx: Tx,
    guestId: string,
    celebration: Celebration,
    allowed: number,
    rsvp: NonNullable<CreateGuestDto['rsvp']>,
    overrideCapacity: boolean,
    meta: RequestMeta,
  ): Promise<void> {
    const companions = rsvp.response === 'ATTENDING' ? rsvp.companions.filter((c) => c.fullName.trim()) : [];
    const limit = companionLimit(celebration, allowed);
    if (companions.length > limit) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'COMPANION_LIMIT_EXCEEDED', `This guest may bring at most ${limit} companion(s).`);
    }
    const existingAnswers = await tx.rsvp.findUnique({ where: { guestId }, select: { answers: true } });
    const chosen = await this.rsvp.saveRsvp(
      tx,
      guestId,
      celebration,
      { ...rsvp, companions, answers: (existingAnswers?.answers as Record<string, string | boolean> | null) ?? {} },
      { overrideCapacity, admin: true },
    );
    if (overrideCapacity) {
      const confirmed = await this.settings.confirmedPeople(tx);
      const attendance = await this.events.attendance(tx);
      const overEvents = chosen.filter((c) => c.event.capacity !== null && (attendance.get(c.event.id)?.people ?? 0) > c.event.capacity).map((c) => c.event.name);
      if (confirmed > celebration.capacity || overEvents.length) {
        await this.audit.record(
          meta,
          { action: 'ADMIN_OVERRODE_CAPACITY', entityType: 'Guest', entityId: guestId, metadata: { confirmed, capacity: celebration.capacity, overEvents } },
          tx,
        );
      }
    }
  }

  /** Replaces the events an admin added this guest to beyond their category. */
  private async setExtraEvents(tx: Tx, guestId: string, eventIds: string[]): Promise<void> {
    await tx.guestEvent.deleteMany({ where: { guestId } });
    if (eventIds.length) await tx.guestEvent.createMany({ data: [...new Set(eventIds)].map((eventId) => ({ guestId, eventId })) });
  }

  private async assertEvents(ids: string[] | undefined): Promise<void> {
    if (!ids?.length) return;
    const found = await this.prisma.event.count({ where: { id: { in: ids } } });
    if (found !== new Set(ids).size) throw Errors.validation({ extraEventIds: ['Choose from the existing events.'] });
  }

  private async invitationOf(guestId: string) {
    const invitation = await this.prisma.invitation.findUnique({ where: { guestId } });
    if (!invitation) throw Errors.notFound('Invitation');
    return invitation;
  }

  private async assertCategory(id: string | null | undefined): Promise<void> {
    if (id && !(await this.prisma.guestCategory.findUnique({ where: { id } }))) {
      throw Errors.validation({ categoryId: ['That category does not exist.'] });
    }
  }
}
