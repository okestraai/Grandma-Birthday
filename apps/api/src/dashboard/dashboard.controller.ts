import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { DashboardStats, StorageDetail } from '@birthday/types';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ADMIN_MEDIA_INCLUDE, toAdminMedia } from '../media/media.mapper';
import { QuotaService } from '../storage/quota.service';
import { SettingsService } from '../settings/settings.service';

@ApiTags('Admin: dashboard & storage')
@ApiCookieAuth()
@Controller('admin')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    private readonly settings: SettingsService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('dashboard:read')
  async dashboard(): Promise<DashboardStats> {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [
      event,
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
      this.settings.getEvent(),
      this.prisma.invitation.count(),
      this.prisma.invitation.count({ where: { status: 'ACTIVE' } }),
      this.prisma.guest.count(),
      this.prisma.rsvp.groupBy({ by: ['response'], _count: { _all: true } }),
      this.settings.confirmedPeople(),
      this.prisma.checkIn.aggregate({ where: { reversedAt: null }, _count: { _all: true }, _sum: { partySize: true } }),
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
      capacity: event.capacity,
      capacityRemaining: Math.max(0, event.capacity - confirmedPeople),
      checkedInGuests: checkIns._count._all,
      checkedInPeople: checkIns._sum.partySize ?? 0,
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
