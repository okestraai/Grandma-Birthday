import { Inject, Injectable } from '@nestjs/common';
import type { DigitalInvitation, InvitationEvent } from '@birthday/types';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { Errors, AppException } from '../common/errors';
import { invitationCode, randomToken } from '../common/utils/crypto';
import type { Event, Invitation } from '../generated/prisma/client';
import { Prisma } from '../generated/prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { MailService } from '../notifications/mail.service';
import { invitationEmail, rsvpDeclinedEmail } from '../notifications/templates';
import type { EventLines } from '../qr/qr.service';
import { SettingsService } from '../settings/settings.service';
import { EventsService, eventsForGuest, toInvitationEvent, type EventRow } from '../events/events.service';

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
  guest: {
    include: {
      category: true,
      extraEvents: { select: { eventId: true } },
      rsvp: { include: { companions: { orderBy: { createdAt: 'asc' as const } }, events: true } },
    },
  },
  checkIns: { where: { reversedAt: null } },
} satisfies Prisma.InvitationInclude;

export type InvitationWithGuest = Prisma.InvitationGetPayload<{ include: typeof INVITATION_INCLUDE }>;

/** One of a guest's events, with the people they bring to it. */
export interface GuestEvent {
  event: Event;
  partySize: number;
}

/**
 * The events on a guest's invitation. Attending: the events they chose, plus information-only
 * events they are invited to. Not replied yet: every event they are invited to, with their full
 * allowance. Declined: none.
 */
export function guestEventsOf(invitation: InvitationWithGuest, events: EventRow[]): GuestEvent[] {
  const { guest } = invitation;
  const rsvp = guest.rsvp;
  if (rsvp?.response === 'DECLINED') return [];
  const invited = eventsForGuest(
    { categoryId: guest.categoryId, extraEventIds: guest.extraEvents.map((e) => e.eventId), chosenEventIds: rsvp?.events.map((e) => e.eventId) ?? [] },
    events,
  );
  if (!rsvp) return invited.map((event) => ({ event, partySize: 1 + guest.allowedCompanions }));
  const chosen = new Map(rsvp.events.map((e) => [e.eventId, e.companionCount]));
  return invited
    .filter((e) => chosen.has(e.id) || !e.rsvpEnabled)
    .map((event) => ({ event, partySize: 1 + (chosen.get(event.id) ?? rsvp.companionCount) }));
}

export function eventLines(event: Event, timeZone: string): EventLines {
  return {
    name: event.name,
    dateText: formatEventDate(event.startsAt, timeZone),
    timeText: formatEventTime(event.startsAt, event.endsAt, timeZone),
    venue: event.venueName,
    address: event.address,
    dressCode: event.dressCode,
  };
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  url(token: string): string {
    return `${this.config.publicWebUrl}/invitation/${token}`;
  }

  /** Expired some hours after the event (or the last of the events) ends. */
  isExpired(endsAt: Date, now = new Date()): boolean {
    return now.getTime() > endsAt.getTime() + INVITATION_GRACE_MS;
  }

  /** The events on a guest's invitation (see guestEventsOf). */
  async guestEvents(invitation: InvitationWithGuest): Promise<GuestEvent[]> {
    return guestEventsOf(invitation, await this.events.list());
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
    const [celebration, celebrant, guestEvents] = await Promise.all([
      this.settings.getCelebration(),
      this.prisma.celebrant.findUniqueOrThrow({ where: { id: 1 } }),
      this.guestEvents(invitation),
    ]);
    const checkedIn = new Set(invitation.checkIns.map((c) => c.eventId));
    const events: InvitationEvent[] = guestEvents.map((g) => toInvitationEvent(g.event, g.partySize, checkedIn.has(g.event.id)));
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
      celebration: { name: celebration.name, celebrantName: celebrant.fullName, timezone: celebration.timezone },
      events,
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
    const [celebration, celebrant, guestEvents] = await Promise.all([
      this.settings.getCelebration(),
      this.prisma.celebrant.findUniqueOrThrow({ where: { id: 1 } }),
      this.guestEvents(invitation),
    ]);
    const guest = invitation.guest;

    const email =
      guest.rsvp?.response === 'DECLINED' && kind === 'confirmation'
        ? rsvpDeclinedEmail({ guestName: guest.fullName, celebrantName: celebrant.fullName, eventName: celebration.name })
        : invitationEmail({
            guestName: guest.fullName,
            celebrantName: celebrant.fullName,
            eventName: celebration.name,
            events: guestEvents.map((g) => ({ ...eventLines(g.event, celebration.timezone), partySize: g.partySize })),
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
