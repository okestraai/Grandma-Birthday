import { HttpStatus, Injectable } from '@nestjs/common';
import type { CheckInGuestSummary, CheckInOverview, CheckInRecord, CheckInSearchResult, CheckInVerifyResult, Paginated } from '@birthday/types';
import { AppException, Errors } from '../common/errors';
import type { RequestMeta } from '../common/request-context';
import { INVITATION_CODE_PATTERN } from '../common/utils/crypto';
import { paginated, skipTake } from '../common/utils/pagination';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { INVITATION_INCLUDE, InvitationsService, type InvitationWithGuest } from '../invitations/invitations.service';
import { SettingsService } from '../settings/settings.service';
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

/** People expected for an invitation: the RSVP party, or the full allowance if they never replied. */
export function partySizeOf(invitation: InvitationWithGuest): number {
  const rsvp = invitation.guest.rsvp;
  if (!rsvp) return 1 + invitation.guest.allowedCompanions;
  return rsvp.response === 'ATTENDING' ? 1 + rsvp.companionCount : 0;
}

@Injectable()
export class CheckInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async verify(value: string): Promise<CheckInVerifyResult> {
    const parsed = parseScan(value);
    if (!parsed) return { status: 'INVALID', guest: null, checkIn: null };
    const invitation = await this.prisma.invitation.findUnique({
      where: 'token' in parsed ? { token: parsed.token } : { code: parsed.code },
      include: INVITATION_INCLUDE,
    });
    if (!invitation) return { status: 'INVALID', guest: null, checkIn: null };
    return this.evaluate(invitation);
  }

  async checkIn(invitationId: string, requestedParty: number | undefined, deviceInfo: string | undefined, meta: RequestMeta): Promise<CheckInRecord> {
    const invitation = await this.prisma.invitation.findUnique({ where: { id: invitationId }, include: INVITATION_INCLUDE });
    if (!invitation) throw new AppException(HttpStatus.NOT_FOUND, 'INVITATION_NOT_FOUND', 'Invitation not found.');
    const verdict = await this.evaluate(invitation);
    switch (verdict.status) {
      case 'ALREADY_CHECKED_IN':
        throw new AppException(HttpStatus.CONFLICT, 'ALREADY_CHECKED_IN', 'This guest is already checked in.');
      case 'REVOKED':
        throw new AppException(HttpStatus.CONFLICT, 'INVITATION_REVOKED', 'This invitation has been revoked.');
      case 'EXPIRED':
        throw new AppException(HttpStatus.CONFLICT, 'INVITATION_EXPIRED', 'This invitation has expired.');
      case 'NOT_ATTENDING':
        throw new AppException(HttpStatus.CONFLICT, 'BAD_REQUEST', 'This guest declined the invitation. Ask an admin to update their RSVP first.');
      default:
        break;
    }
    const full = partySizeOf(invitation);
    const partySize = requestedParty ?? full;
    if (partySize < 1 || partySize > full) throw Errors.validation({ partySize: [`Between 1 and ${full} people can be checked in on this invitation.`] });

    try {
      const record = await this.prisma.$transaction(async (tx) => {
        const created = await tx.checkIn.create({
          data: {
            invitationId: invitation.id,
            guestId: invitation.guestId,
            checkedInById: meta.actor?.id ?? null,
            partySize,
            deviceInfo: deviceInfo?.slice(0, 200) ?? meta.userAgent?.slice(0, 200) ?? null,
            ip: meta.ip,
          },
          include: CHECKIN_INCLUDE,
        });
        await this.audit.record(meta, { action: 'ADMIN_CHECKED_IN_GUEST', entityType: 'Invitation', entityId: invitation.id, metadata: { partySize, code: invitation.code } }, tx);
        return created;
      });
      return toCheckInRecord(record);
    } catch (error) {
      // The partial unique index turned a simultaneous second scan into a clean conflict.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(HttpStatus.CONFLICT, 'ALREADY_CHECKED_IN', 'This guest is already checked in.');
      }
      throw error;
    }
  }

  async overview(): Promise<CheckInOverview> {
    const [active, expectedPeople, recent] = await Promise.all([
      this.prisma.checkIn.aggregate({ where: { reversedAt: null }, _count: { _all: true }, _sum: { partySize: true } }),
      this.settings.confirmedPeople(),
      this.prisma.checkIn.findMany({ include: CHECKIN_INCLUDE, orderBy: { checkedInAt: 'desc' }, take: 15 }),
    ]);
    return {
      checkedInGuests: active._count._all,
      checkedInPeople: active._sum.partySize ?? 0,
      expectedPeople,
      recent: recent.map(toCheckInRecord),
    };
  }

  async search(q: string): Promise<CheckInSearchResult[]> {
    const term = q.trim();
    if (term.length < 2) return [];
    const rows = await this.prisma.invitation.findMany({
      where: {
        OR: [{ code: { contains: term.toUpperCase() } }, { guest: { fullName: { contains: term, mode: 'insensitive' } } }],
      },
      include: INVITATION_INCLUDE,
      take: 20,
      orderBy: { guest: { fullName: 'asc' } },
    });
    return rows.map((inv) => ({
      invitationId: inv.id,
      code: inv.code,
      guestName: inv.guest.fullName,
      categoryName: inv.guest.category?.name ?? null,
      partySize: partySizeOf(inv),
      checkedIn: inv.checkIns.length > 0,
      status: inv.status,
    }));
  }

  async list(query: { page: number; pageSize: number; includeReversed?: boolean }): Promise<Paginated<CheckInRecord>> {
    const where: Prisma.CheckInWhereInput = query.includeReversed ? {} : { reversedAt: null };
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

  private async evaluate(invitation: InvitationWithGuest): Promise<CheckInVerifyResult> {
    const event = await this.settings.getEvent();
    const guest = this.summary(invitation);
    const active = await this.prisma.checkIn.findFirst({
      where: { invitationId: invitation.id, reversedAt: null },
      include: { checkedInBy: { select: { name: true } } },
    });
    if (active) {
      return {
        status: 'ALREADY_CHECKED_IN',
        guest,
        checkIn: { checkedInAt: active.checkedInAt.toISOString(), checkedInByName: active.checkedInBy?.name ?? null, partySize: active.partySize },
      };
    }
    if (invitation.status === 'REVOKED') return { status: 'REVOKED', guest, checkIn: null };
    if (this.invitations.isExpired(event)) return { status: 'EXPIRED', guest, checkIn: null };
    if (invitation.guest.rsvp?.response === 'DECLINED') return { status: 'NOT_ATTENDING', guest, checkIn: null };
    return { status: 'VALID', guest, checkIn: null };
  }

  /** Only what door staff need: no email, phone or admin notes. */
  private summary(invitation: InvitationWithGuest): CheckInGuestSummary {
    const rsvp = invitation.guest.rsvp;
    return {
      invitationId: invitation.id,
      code: invitation.code,
      guestName: invitation.guest.fullName,
      categoryName: invitation.guest.category?.name ?? null,
      partySize: partySizeOf(invitation),
      companions: rsvp?.companions.map((c) => c.fullName) ?? [],
      dietary: rsvp?.dietary ?? null,
      accessibility: rsvp?.accessibility ?? null,
    };
  }
}
