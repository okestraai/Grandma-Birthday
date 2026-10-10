import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { DigitalInvitation } from '@birthday/types';
import { Public } from '../common/decorators/auth.decorators';
import { QrService } from '../qr/qr.service';
import { SettingsService } from '../settings/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { formatEventDate, formatEventTime, InvitationsService } from './invitations.service';

/**
 * Public, token-addressed invitation pages. The token is 256 bits of randomness, so these
 * cannot be enumerated; responses are private and never cached by shared caches.
 */
@ApiTags('Public: invitations')
@Controller('invitations/:token')
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly qr: QrService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Digital invitation pass' })
  async get(@Param('token') token: string, @Res({ passthrough: true }) res: Response): Promise<DigitalInvitation> {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    return this.invitations.digital(token);
  }

  @Get('qr.svg')
  async svg(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const invitation = await this.invitations.findByToken(token);
    res.type('image/svg+xml').setHeader('Cache-Control', 'private, max-age=300');
    res.send(await this.qr.svg(this.invitations.url(invitation.token)));
  }

  @Get('qr.png')
  async png(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const invitation = await this.invitations.findByToken(token);
    res.type('image/png').setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `attachment; filename="invitation-${invitation.code}.png"`);
    res.send(await this.qr.png(this.invitations.url(invitation.token)));
  }

  @Get('pass.pdf')
  async pdf(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const invitation = await this.invitations.findByToken(token);
    const [event, celebrant] = await Promise.all([this.settings.getEvent(), this.prisma.celebrant.findUniqueOrThrow({ where: { id: 1 } })]);
    const rsvp = invitation.guest.rsvp;
    const pdf = await this.qr.invitationPdf({
      celebrantName: celebrant.fullName,
      eventName: event.name,
      guestName: invitation.guest.fullName,
      dateText: formatEventDate(event.startsAt, event.timezone),
      timeText: formatEventTime(event.startsAt, event.endsAt, event.timezone),
      venue: event.venueName,
      address: event.address,
      dressCode: event.dressCode,
      partySize: rsvp?.response === 'ATTENDING' ? 1 + rsvp.companionCount : 1 + invitation.guest.allowedCompanions,
      companions: rsvp?.companions.map((c) => c.fullName) ?? [],
      code: invitation.code,
      qrValue: this.invitations.url(invitation.token),
      revoked: invitation.status === 'REVOKED',
    });
    res.type('application/pdf').setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="invitation-${invitation.code}.pdf"`);
    res.send(pdf);
  }
}
