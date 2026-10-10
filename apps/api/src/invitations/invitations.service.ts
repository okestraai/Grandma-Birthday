import { Inject, Injectable } from '@nestjs/common';
import type { DigitalInvitation } from '@birthday/types';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { Errors, AppException } from '../common/errors';
import { invitationCode, randomToken } from '../common/utils/crypto';
import type { Event, Invitation } from '../generated/prisma/client';
import { Prisma } from '../generated/prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { MailService } from '../notifications/mail.service';
import { invitationEmail, rsvpDeclinedEmail } from '../notifications/templates';
import { SettingsService } from '../settings/settings.service';

/** How long after the event ends an invitation still counts as valid (late check-ins). */
export const INVITATION_GRACE_MS = 12 * 3600 * 1000;

export function formatEventDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(date);
}

export function formatEventTime(start: Date, end: Date, timeZone: string): string {
  const f = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone });
  return `${f.format(start).toUpperCase()} – ${f.format(end).toUpperCase()}`;
}

export const INVITATION_INCLUDE = {
  guest: { include: { category: true, rsvp: { include: { companions: { orderBy: { createdAt: 'asc' as const } } } } } },
  checkIns: { where: { reversedAt: null }, take: 1 },
} satisfies Prisma.InvitationInclude;

export type InvitationWithGuest = Prisma.InvitationGetPayload<{ include: typeof INVITATION_INCLUDE }>;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  url(token: string): string {
    return `${this.config.publicWebUrl}/invitation/${token}`;
  }

  isExpired(event: Event, now = new Date()): boolean {
    return now.getTime() > event.endsAt.getTime() + INVITATION_GRACE_MS;
  }

  /** Creates the guest's invitation if missing. Retries on the (very unlikely) code collision. */
  async ensure(tx: Tx, guestId: string): Promise<Invitation> {
    const existing = await tx.invitation.findUnique({ where: { guestId } });
    if (existing) return existing;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = invitationCode();
      if (await tx.invitation.findUnique({ where: { code } })) continue;
      return tx.invitation.create({ data: { guestId, code, token: randomToken() } });
    }
    throw new Error('Could not allocate a unique invitation code');
  }

  async findByToken(token: string): Promise<InvitationWithGuest> {
    const invitation = await this.prisma.invitation.findUnique({ where: { token }, include: INVITATION_INCLUDE });
    if (!invitation) throw new AppException(404, 'INVITATION_NOT_FOUND', 'We could not find this invitation. Please check the link.');
    return invitation;
  }

  async digital(token: string): Promise<DigitalInvitation> {
    const invitation = await this.findByToken(token);
    const [event, celebrant] = await Promise.all([this.settings.getEvent(), this.prisma.celebrant.findUniqueOrThrow({ where: { id: 1 } })]);
    const rsvp = invitation.guest.rsvp;
    const companions = rsvp?.companions.map((c) => c.fullName) ?? [];
    const partySize = rsvp ? (rsvp.response === 'ATTENDING' ? 1 + rsvp.companionCount : 0) : 1 + invitation.guest.allowedCompanions;
    const base = `/api/invitations/${invitation.token}`;
    return {
      code: invitation.code,
      status: invitation.status,
      guestName: invitation.guest.fullName,
      categoryName: invitation.guest.category?.name ?? null,
      companionCount: rsvp?.companionCount ?? 0,
      companions,
      partySize,
      response: rsvp?.response ?? null,
      checkedIn: invitation.checkIns.length > 0,
      event: {
        name: event.name,
        celebrantName: celebrant.fullName,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        timezone: event.timezone,
        venueName: event.venueName,
        address: event.address,
        dressCode: event.dressCode,
        mapUrl: event.mapUrl,
      },
      qrSvgUrl: `${base}/qr.svg`,
      qrPngUrl: `${base}/qr.png`,
      pdfUrl: `${base}/pass.pdf`,
      qrValue: this.url(invitation.token),
    };
  }

  /** Sends the invitation (or RSVP confirmation) email. Returns whether it was handed to SMTP. */
  async sendInvitationEmail(invitationId: string, kind: 'invitation' | 'confirmation'): Promise<boolean> {
    const invitation = await this.prisma.invitation.findUnique({ where: { id: invitationId }, include: INVITATION_INCLUDE });
    if (!invitation) throw Errors.notFound('Invitation');
    const [event, celebrant] = await Promise.all([this.settings.getEvent(), this.prisma.celebrant.findUniqueOrThrow({ where: { id: 1 } })]);
    const guest = invitation.guest;

    const email =
      guest.rsvp?.response === 'DECLINED' && kind === 'confirmation'
        ? rsvpDeclinedEmail({ guestName: guest.fullName, celebrantName: celebrant.fullName, eventName: event.name })
        : invitationEmail({
            guestName: guest.fullName,
            celebrantName: celebrant.fullName,
            eventName: event.name,
            dateText: formatEventDate(event.startsAt, event.timezone),
            timeText: formatEventTime(event.startsAt, event.endsAt, event.timezone),
            venue: event.venueName,
            address: event.address,
            dressCode: event.dressCode,
            partySize: guest.rsvp?.response === 'ATTENDING' ? 1 + guest.rsvp.companionCount : 1 + guest.allowedCompanions,
            code: invitation.code,
            invitationUrl: kind === 'invitation' && !guest.rsvp ? `${this.config.publicWebUrl}/rsvp?invite=${invitation.token}` : this.url(invitation.token),
            isRsvpConfirmation: kind === 'confirmation',
          });
    const sent = await this.mail.send(guest.email, email);
    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { lastSentAt: new Date(), sendCount: { increment: 1 } },
    });
    return sent;
  }
}
