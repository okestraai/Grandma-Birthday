import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { DashboardStats, StorageDetail } from '@birthday/types';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ADMIN_MEDIA_INCLUDE, toAdminMedia } from '../media/media.mapper';
import { QuotaService } from '../storage/quota.service';
import { SettingsService } from '../settings/settings.service';
import { EventsService } from '../events/events.service';

@ApiTags('Admin: dashboard & storage')
@ApiCookieAuth()
@Controller('admin')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('dashboard:read')
  async dashboard(): Promise<DashboardStats> {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [
      celebration,
      events,
      attendance,
      checkInsByEvent,
      totalInvitations,
      activeInvitations,
      registeredGuests,
      rsvpGroups,
      confirmedPeople,
      checkIns,
      pendingTestimonials,
      guestPhotos,
      storage,
      rsvpRows,
      categories,
      recent,
    ] = await Promise.all([
      this.settings.getCelebration(),
      this.prisma.event.findMany({ orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }] }),
      this.events.attendance(),
      this.prisma.checkIn.groupBy({ by: ['eventId'], where: { reversedAt: null }, _count: { _all: true }, _sum: { partySize: true } }),
      this.prisma.invitation.count(),
      this.prisma.invitation.count({ where: { status: 'ACTIVE' } }),
      this.prisma.guest.count(),
      this.prisma.rsvp.groupBy({ by: ['response'], _count: { _all: true } }),
      this.settings.confirmedPeople(),
      // Guests checked in at any event (counted once), and the people with them at the busiest.
      this.prisma.checkIn.groupBy({ by: ['guestId'], where: { reversedAt: null }, _max: { partySize: true } }),
      this.prisma.testimonial.count({ where: { status: 'PENDING' } }),
      this.prisma.media.groupBy({ by: ['status'], where: { source: 'GUEST_UPLOAD' }, _count: { _all: true } }),
      this.quota.summary(),
      this.prisma.rsvp.findMany({ where: { submittedAt: { gte: since } }, select: { submittedAt: true } }),
      this.prisma.guestCategory.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { name: true, guests: { select: { rsvp: { select: { response: true, companionCount: true } } } } },
      }),
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);

    const byDay = new Map<string, number>();
    for (let i = 29; i >= 0; i--) byDay.set(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), 0);
    for (const row of rsvpRows) {
      const day = row.submittedAt.toISOString().slice(0, 10);
      if (byDay.has(day)) byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    const count = (status: string) => guestPhotos.find((g) => g.status === status)?._count._all ?? 0;

    return {
      totalInvitations,
      activeInvitations,
      registeredGuests,
      confirmedGuests: rsvpGroups.find((g) => g.response === 'ATTENDING')?._count._all ?? 0,
      declinedGuests: rsvpGroups.find((g) => g.response === 'DECLINED')?._count._all ?? 0,
      confirmedPeople,
      checkInScope: celebration.checkInScope,
      capacity: celebration.capacity,
      capacityRemaining: Math.max(0, celebration.capacity - confirmedPeople),
      checkedInGuests: checkIns.length,
      checkedInPeople: checkIns.reduce((sum, g) => sum + (g._max.partySize ?? 0), 0),
      events: events.map((e) => {
        const c = checkInsByEvent.find((row) => row.eventId === e.id);
        return {
          eventId: e.id,
          name: e.name,
          startsAt: e.startsAt.toISOString(),
          capacity: e.capacity,
          attendingGuests: attendance.get(e.id)?.guests ?? 0,
          attendingPeople: attendance.get(e.id)?.people ?? 0,
          checkedInGuests: c?._count._all ?? 0,
          checkedInPeople: c?._sum.partySize ?? 0,
        };
      }),
      pendingTestimonials,
      pendingPhotos: count('PENDING'),
      storage,
      rsvpsByDay: [...byDay.entries()].map(([date, n]) => ({ date, count: n })),
      guestsByCategory: categories.map((c) => ({
        categoryName: c.name,
        guests: c.guests.length,
        people: c.guests.reduce((sum, g) => sum + (g.rsvp?.response === 'ATTENDING' ? 1 + g.rsvp.companionCount : 0), 0),
      })),
      guestPhotoCounts: { pending: count('PENDING'), approved: count('APPROVED'), rejected: count('REJECTED') },
      recentActivity: recent.map(AuditService.toEntry),
    };
  }

  @Get('storage')
  @RequirePermissions('storage:read')
  async storage(): Promise<StorageDetail> {
    const [summary, largest, bySource, byStatus] = await Promise.all([
      this.quota.summary(),
      this.prisma.media.findMany({ orderBy: { storedBytes: 'desc' }, take: 10, include: ADMIN_MEDIA_INCLUDE }),
      this.prisma.media.groupBy({ by: ['source'], _count: { _all: true }, _sum: { storedBytes: true } }),
      this.prisma.media.groupBy({ by: ['status'], _count: { _all: true }, _sum: { storedBytes: true } }),
    ]);
    return {
      ...summary,
      largestFiles: largest.map(toAdminMedia),
      bySource: bySource.map((g) => ({ source: g.source, count: g._count._all, bytes: Number(g._sum.storedBytes ?? 0) })),
      byStatus: byStatus.map((g) => ({ status: g.status, count: g._count._all, bytes: Number(g._sum.storedBytes ?? 0) })),
    };
  }
}
