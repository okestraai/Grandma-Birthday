import { HttpStatus, Injectable } from '@nestjs/common';
import type { CheckInEventCount, CheckInGuestSummary, CheckInOverview, CheckInRecord, CheckInSearchResult, CheckInVerifyResult, Paginated } from '@birthday/types';
import { AppException, Errors } from '../common/errors';
import type { RequestMeta } from '../common/request-context';
import { INVITATION_CODE_PATTERN } from '../common/utils/crypto';
import { paginated, skipTake } from '../common/utils/pagination';
import { Prisma, type CheckInScope, type Event } from '../generated/prisma/client';
import { LOCK_KEYS, PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { guestEventsOf, INVITATION_INCLUDE, InvitationsService, type GuestEvent, type InvitationWithGuest } from '../invitations/invitations.service';
import { defaultEvent, EventsService, type EventRow } from '../events/events.service';
import { CHECKIN_INCLUDE, toCheckInRecord } from './checkin.mapper';

/**
 * Turns whatever the scanner read into a lookup: an invitation URL (…/invitation/<token>),
 * a bare token, or a typed invitation code such as "BP70-7K3Q9D". Only these shapes are accepted.
 */
export function parseScan(raw: string): { token: string } | { code: string } | null {
  const value = raw.trim();
  if (!value || value.length > 500) return null;
  const upper = value.toUpperCase().replace(/\s+/g, '');
  if (INVITATION_CODE_PATTERN.test(upper)) return { code: upper };
  const fromUrl = value.match(/\/invitation\/([A-Za-z0-9_-]{20,100})(?:[/?#]|$)/);
  if (fromUrl) return { token: fromUrl[1] };
  if (/^[A-Za-z0-9_-]{20,100}$/.test(value)) return { token: value };
  return null;
}

/** People expected at check-in once for the whole celebration: their party at this event, else the largest of their events. */
export function partyOf(guestEvents: GuestEvent[], eventId: string): number {
  const here = guestEvents.find((g) => g.event.id === eventId);
  return here?.partySize ?? Math.max(0, ...guestEvents.map((g) => g.partySize));
}

@Injectable()
export class CheckInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationsService,
    private readonly events: EventsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The event a check-in is recorded against. Checking in once for the whole celebration always
   * uses the event in progress (or next, or last); otherwise the event staff chose.
   */
  private async target(eventId: string | undefined): Promise<{ event: Event; scope: CheckInScope }> {
    const { checkInScope: scope } = await this.settings.getCelebration();
    if (scope === 'ONCE') {
      const event = defaultEvent(await this.prisma.event.findMany());
      if (!event) throw Errors.notFound('Event');
      return { event, scope };
    }
    return { event: await this.events.resolve(eventId), scope };
  }

  async verify(value: string, eventId: string | undefined): Promise<CheckInVerifyResult> {
    const { event, scope } = await this.target(eventId);
    const eventRef = { id: event.id, name: event.name };
    const parsed = parseScan(value);
    if (!parsed) return { status: 'INVALID', event: eventRef, guest: null, checkIn: null };
    const invitation = await this.prisma.invitation.findUnique({
      where: 'token' in parsed ? { token: parsed.token } : { code: parsed.code },
      include: INVITATION_INCLUDE,
    });
    if (!invitation) return { status: 'INVALID', event: eventRef, guest: null, checkIn: null };
    return this.evaluate(invitation, event, await this.events.list(), scope);
  }

  async checkIn(
    invitationId: string,
    eventId: string | undefined,
    requestedParty: number | undefined,
    deviceInfo: string | undefined,
    meta: RequestMeta,
  ): Promise<CheckInRecord> {
    const { event, scope } = await this.target(eventId);
    const invitation = await this.prisma.invitation.findUnique({ where: { id: invitationId }, include: INVITATION_INCLUDE });
    if (!invitation) throw new AppException(HttpStatus.NOT_FOUND, 'INVITATION_NOT_FOUND', 'Invitation not found.');
    const verdict = await this.evaluate(invitation, event, await this.events.list(), scope);
    const already = scope === 'ONCE' ? 'This guest is already checked in.' : `This guest is already checked in to ${event.name}.`;
    switch (verdict.status) {
      case 'ALREADY_CHECKED_IN':
        throw new AppException(HttpStatus.CONFLICT, 'ALREADY_CHECKED_IN', already);
      case 'REVOKED':
        throw new AppException(HttpStatus.CONFLICT, 'INVITATION_REVOKED', 'This invitation has been revoked.');
      case 'EXPIRED':
        throw new AppException(HttpStatus.CONFLICT, 'INVITATION_EXPIRED', 'This invitation has expired.');
      case 'NOT_ATTENDING':
        throw new AppException(HttpStatus.CONFLICT, 'BAD_REQUEST', 'This guest declined the invitation. Ask an admin to update their RSVP first.');
      case 'NOT_FOR_THIS_EVENT':
        throw new AppException(HttpStatus.CONFLICT, 'BAD_REQUEST', `This guest is not on the list for ${event.name}. Ask an admin to update their RSVP or invitation first.`);
      default:
        break;
    }
    const full = verdict.guest!.partySize;
    const partySize = requestedParty ?? full;
    if (partySize < 1 || partySize > full) throw Errors.validation({ partySize: [`Between 1 and ${full} people can be checked in on this invitation.`] });

    try {
      const record = await this.prisma.$transaction(async (tx) => {
        if (scope === 'ONCE') {
          // The unique index is per event, so "once for the whole celebration" is checked here, under a lock.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEYS.checkIn})`;
          if (await tx.checkIn.findFirst({ where: { guestId: invitation.guestId, reversedAt: null } })) {
            throw new AppException(HttpStatus.CONFLICT, 'ALREADY_CHECKED_IN', already);
          }
        }
        const created = await tx.checkIn.create({
          data: {
            invitationId: invitation.id,
            guestId: invitation.guestId,
            eventId: event.id,
            checkedInById: meta.actor?.id ?? null,
            partySize,
            deviceInfo: deviceInfo?.slice(0, 200) ?? meta.userAgent?.slice(0, 200) ?? null,
            ip: meta.ip,
          },
          include: CHECKIN_INCLUDE,
        });
        await this.audit.record(
          meta,
          { action: 'ADMIN_CHECKED_IN_GUEST', entityType: 'Invitation', entityId: invitation.id, metadata: { partySize, code: invitation.code, eventId: event.id, event: event.name } },
          tx,
        );
        return created;
      });
      return toCheckInRecord(record);
    } catch (error) {
      // The partial unique index turned a simultaneous second scan into a clean conflict.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(HttpStatus.CONFLICT, 'ALREADY_CHECKED_IN', already);
      }
      throw error;
    }
  }

  /**
   * Counts for every event, and recent check-ins for one: the given event, or the likely one now.
   * Checking in once for the whole celebration counts guests across all events instead.
   */
  async overview(eventId: string | undefined): Promise<CheckInOverview> {
    const [{ checkInScope }, events, attendance, counts] = await Promise.all([
      this.settings.getCelebration(),
      this.prisma.event.findMany({ orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }] }),
      this.events.attendance(),
      this.prisma.checkIn.groupBy({ by: ['eventId'], where: { reversedAt: null }, _count: { _all: true }, _sum: { partySize: true } }),
    ]);
    const event = eventId && checkInScope === 'PER_EVENT' ? events.find((e) => e.id === eventId) : defaultEvent(events);
    if (!event) throw Errors.notFound('Event');
    const perEvent: CheckInEventCount[] = events.map((e) => {
      const c = counts.find((row) => row.eventId === e.id);
      return {
        eventId: e.id,
        name: e.name,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        checkedInGuests: c?._count._all ?? 0,
        checkedInPeople: c?._sum.partySize ?? 0,
        expectedPeople: attendance.get(e.id)?.people ?? 0,
      };
    });
    if (checkInScope === 'ONCE') {
      const [active, expectedPeople, recent] = await Promise.all([
        // Per guest, so check-ins made before switching to ONCE still count each person once.
        this.prisma.checkIn.groupBy({ by: ['guestId'], where: { reversedAt: null }, _max: { partySize: true } }),
        this.settings.confirmedPeople(),
        this.prisma.checkIn.findMany({ include: CHECKIN_INCLUDE, orderBy: { checkedInAt: 'desc' }, take: 15 }),
      ]);
      return {
        checkInScope,
        eventId: event.id,
        eventName: event.name,
        checkedInGuests: active.length,
        checkedInPeople: active.reduce((sum, g) => sum + (g._max.partySize ?? 0), 0),
        expectedPeople,
        recent: recent.map(toCheckInRecord),
        events: perEvent,
      };
    }
    const current = perEvent.find((e) => e.eventId === event.id)!;
    const recent = await this.prisma.checkIn.findMany({ where: { eventId: event.id }, include: CHECKIN_INCLUDE, orderBy: { checkedInAt: 'desc' }, take: 15 });
    return {
      checkInScope,
      eventId: event.id,
      eventName: event.name,
      checkedInGuests: current.checkedInGuests,
      checkedInPeople: current.checkedInPeople,
      expectedPeople: current.expectedPeople,
      recent: recent.map(toCheckInRecord),
      events: perEvent,
    };
  }

  async search(q: string, eventId: string | undefined): Promise<CheckInSearchResult[]> {
    const term = q.trim();
    if (term.length < 2) return [];
    const [{ checkInScope }, rows, events] = await Promise.all([
      this.settings.getCelebration(),
      this.prisma.invitation.findMany({
        where: {
          OR: [{ code: { contains: term.toUpperCase() } }, { guest: { fullName: { contains: term, mode: 'insensitive' } } }],
        },
        include: INVITATION_INCLUDE,
        take: 20,
        orderBy: { guest: { fullName: 'asc' } },
      }),
      this.events.list(),
    ]);
    const once = checkInScope === 'ONCE';
    const event = eventId && !once ? events.find((e) => e.id === eventId) : defaultEvent(events);
    if (!event) throw Errors.notFound('Event');
    return rows.map((inv) => {
      const guestEvents = guestEventsOf(inv, events);
      const mine = guestEvents.find((g) => g.event.id === event.id);
      return {
        invitationId: inv.id,
        code: inv.code,
        guestName: inv.guest.fullName,
        categoryName: inv.guest.category?.name ?? null,
        partySize: once ? partyOf(guestEvents, event.id) : (mine?.partySize ?? 0),
        checkedIn: inv.checkIns.some((c) => once || c.eventId === event.id),
        forThisEvent: once ? guestEvents.length > 0 : Boolean(mine),
        status: inv.status,
      };
    });
  }

  async list(query: { page: number; pageSize: number; includeReversed?: boolean; eventId?: string }): Promise<Paginated<CheckInRecord>> {
    const where: Prisma.CheckInWhereInput = { ...(query.includeReversed ? {} : { reversedAt: null }), ...(query.eventId ? { eventId: query.eventId } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.checkIn.findMany({ where, include: CHECKIN_INCLUDE, orderBy: { checkedInAt: 'desc' }, ...skipTake(query) }),
      this.prisma.checkIn.count({ where }),
    ]);
    return paginated(rows.map(toCheckInRecord), total, query);
  }

  async reverse(id: string, reason: string, meta: RequestMeta): Promise<CheckInRecord> {
    const { count } = await this.prisma.checkIn.updateMany({
      where: { id, reversedAt: null },
      data: { reversedAt: new Date(), reversedById: meta.actor?.id ?? null, reverseReason: reason },
    });
    if (count === 0) {
      const exists = await this.prisma.checkIn.findUnique({ where: { id } });
      if (!exists) throw Errors.notFound('Check-in');
      throw new AppException(HttpStatus.CONFLICT, 'NOT_CHECKED_IN', 'This check-in was already reversed.');
    }
    await this.audit.record(meta, { action: 'ADMIN_REVERSED_CHECK_IN', entityType: 'CheckIn', entityId: id, metadata: { reason } });
    return toCheckInRecord(await this.prisma.checkIn.findUniqueOrThrow({ where: { id }, include: CHECKIN_INCLUDE }));
  }

  private async evaluate(invitation: InvitationWithGuest, event: Event, events: EventRow[], scope: CheckInScope): Promise<CheckInVerifyResult> {
    const once = scope === 'ONCE';
    const eventRef = { id: event.id, name: event.name };
    const guestEvents = guestEventsOf(invitation, events);
    const guest = this.summary(invitation, guestEvents, event.id, once);
    // Once for the whole celebration: a check-in at any event counts.
    const active = await this.prisma.checkIn.findFirst({
      where: { guestId: invitation.guestId, reversedAt: null, ...(once ? {} : { eventId: event.id }) },
      include: { checkedInBy: { select: { name: true } } },
    });
    if (active) {
      return {
        status: 'ALREADY_CHECKED_IN',
        event: eventRef,
        guest,
        checkIn: { checkedInAt: active.checkedInAt.toISOString(), checkedInByName: active.checkedInBy?.name ?? null, partySize: active.partySize },
      };
    }
    if (invitation.status === 'REVOKED') return { status: 'REVOKED', event: eventRef, guest, checkIn: null };
    const lastEnd = once ? new Date(Math.max(...events.map((e) => e.endsAt.getTime()))) : event.endsAt;
    if (this.invitations.isExpired(lastEnd)) return { status: 'EXPIRED', event: eventRef, guest, checkIn: null };
    if (invitation.guest.rsvp?.response === 'DECLINED') return { status: 'NOT_ATTENDING', event: eventRef, guest, checkIn: null };
    const forThisEvent = once ? guestEvents.length > 0 : guestEvents.some((g) => g.event.id === event.id);
    if (!forThisEvent) return { status: 'NOT_FOR_THIS_EVENT', event: eventRef, guest, checkIn: null };
    return { status: 'VALID', event: eventRef, guest, checkIn: null };
  }

  /** Only what door staff need: no email, phone or admin notes. */
  private summary(invitation: InvitationWithGuest, guestEvents: GuestEvent[], eventId: string, once: boolean): CheckInGuestSummary {
    const rsvp = invitation.guest.rsvp;
    return {
      invitationId: invitation.id,
      code: invitation.code,
      guestName: invitation.guest.fullName,
      categoryName: invitation.guest.category?.name ?? null,
      partySize: once ? partyOf(guestEvents, eventId) : (guestEvents.find((g) => g.event.id === eventId)?.partySize ?? 0),
      companions: rsvp?.companions.map((c) => c.fullName) ?? [],
      dietary: rsvp?.dietary ?? null,
      accessibility: rsvp?.accessibility ?? null,
      events: guestEvents.map((g) => ({ id: g.event.id, name: g.event.name })),
    };
  }
}
