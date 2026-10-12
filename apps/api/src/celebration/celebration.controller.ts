import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminCelebration, CapacityAllocations, PublicCelebration, SiteOverview } from '@birthday/types';
import { Public, RequirePermissions } from '../common/decorators/auth.decorators';
import { PublicCacheHeaders } from '../common/decorators/cache.decorators';
import { Errors } from '../common/errors';
import { PublicCache } from '../common/public-cache';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import type { Celebration } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { EventsService, spanOf, toPublicEvent, withFull, type EventRow } from '../events/events.service';
import { PUBLIC_MEDIA_SELECT, publicMediaOrNull } from '../media/media.mapper';
import { toPublicCelebrant } from '../celebrant/celebrant.mapper';
import { UpdateAllocationsDto, UpdateCelebrationDto } from './celebration.dto';
import { AppException } from '../common/errors';

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

@ApiTags('Public: site & celebration')
@Controller()
export class CelebrationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
    private readonly cache: PublicCache,
  ) {}

  @Get('site')
  @Public()
  @PublicCacheHeaders()
  @ApiOperation({ summary: 'Everything the home page needs: celebration, public events, celebrant, branding, feature flags' })
  site(): Promise<SiteOverview> {
    return this.cache.remember('site', () => this.loadSite());
  }

  @Get('celebration')
  @Public()
  @PublicCacheHeaders()
  async publicCelebration(): Promise<PublicCelebration> {
    return (await this.loadPublic()).celebration;
  }

  private async loadSite(): Promise<SiteOverview> {
    const [{ celebration, publicEvents, firstStart }, s, celebrant] = await Promise.all([
      this.loadPublic(),
      this.prisma.settings.findUniqueOrThrow({
        where: { id: 1 },
        include: { logoMedia: { select: PUBLIC_MEDIA_SELECT }, heroMedia: { select: PUBLIC_MEDIA_SELECT }, ogImageMedia: { select: PUBLIC_MEDIA_SELECT } },
      }),
      this.prisma.celebrant.findUniqueOrThrow({ where: { id: 1 }, include: { portraitMedia: { select: PUBLIC_MEDIA_SELECT } } }),
    ]);
    return {
      celebration,
      events: publicEvents.map(toPublicEvent),
      celebrant: toPublicCelebrant(celebrant, firstStart),
      branding: {
        siteTitle: s.siteTitle,
        siteDescription: s.siteDescription,
        primaryColor: s.primaryColor,
        secondaryColor: s.secondaryColor,
        logo: publicMediaOrNull(s.logoMedia),
        hero: publicMediaOrNull(s.heroMedia),
        ogImage: publicMediaOrNull(s.ogImageMedia),
      },
      features: {
        testimonialsOpen: s.testimonialsOpen,
        testimonialsAllowPhotos: s.testimonialsAllowPhotos,
        testimonialsAllowVideos: s.testimonialsAllowVideos,
      },
      isDemo: s.isDemo,
    };
  }

  @Get('admin/celebration')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  async adminCelebration(): Promise<AdminCelebration> {
    const [celebration, confirmed, events] = await Promise.all([this.settings.getCelebration(), this.settings.confirmedPeople(), this.events.list()]);
    return this.toAdmin(celebration, confirmed, events);
  }

  @Put('admin/celebration')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  async update(@Body() dto: UpdateCelebrationDto, @Req() req: RequestWithUser): Promise<AdminCelebration> {
    const current = await this.settings.getCelebration();
    if (dto.timezone && !isValidTimeZone(dto.timezone)) throw Errors.validation({ timezone: ['Use a time zone name such as Africa/Lagos.'] });
    const defaultCompanions = dto.defaultCompanions ?? current.defaultCompanions;
    const maxCompanions = dto.maxCompanions ?? current.maxCompanions;
    if (defaultCompanions > maxCompanions) throw Errors.validation({ defaultCompanions: ['The default cannot be more than the maximum.'] });
    const confirmed = await this.settings.confirmedPeople();
    if (dto.capacity !== undefined && dto.capacity < confirmed) {
      throw Errors.validation({ capacity: [`${confirmed} people are already confirmed; capacity cannot be lower.`] });
    }
    if (dto.capacity !== undefined) {
      const allocated = (await this.prisma.guestCategory.aggregate({ _sum: { capacity: true } }))._sum.capacity ?? 0;
      if (dto.capacity < allocated) {
        throw Errors.validation({ capacity: [`${allocated} places are set aside for guest categories. Lower those first, or keep capacity at ${allocated} or more.`] });
      }
    }

    const updated = await this.prisma.celebration.update({
      where: { id: 1 },
      data: {
        ...dto,
        rsvpDeadline: dto.rsvpDeadline === undefined ? undefined : dto.rsvpDeadline === null ? null : new Date(dto.rsvpDeadline),
      },
    });
    // Only the fields sent: the DTO class also lists the ones left out.
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_EVENT_SETTINGS', entityType: 'Celebration', entityId: '1', metadata: { fields: Object.keys(dto).filter((k) => dto[k as keyof UpdateCelebrationDto] !== undefined) } });
    return this.toAdmin(updated, confirmed, await this.events.list());
  }

  @Get('admin/celebration/allocations')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  async allocations(): Promise<CapacityAllocations> {
    const [celebration, categories, byCategory] = await Promise.all([
      this.settings.getCelebration(),
      this.prisma.guestCategory.findMany({ include: { _count: { select: { guests: true } } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.settings.confirmedPeopleByCategory(),
    ]);
    const allocated = categories.reduce((sum, c) => sum + (c.capacity ?? 0), 0);
    return {
      capacity: celebration.capacity,
      confirmedPeople: [...byCategory.values()].reduce((a, b) => a + b, 0),
      allocated,
      unallocated: Math.max(0, celebration.capacity - allocated),
      categories: categories.map((c) => {
        const confirmedPeople = byCategory.get(c.id) ?? 0;
        return {
          categoryId: c.id,
          name: c.name,
          color: c.color,
          capacity: c.capacity,
          confirmedPeople,
          remaining: c.capacity === null ? null : Math.max(0, c.capacity - confirmedPeople),
          guestCount: c._count.guests,
        };
      }),
      uncategorisedPeople: byCategory.get('') ?? 0,
    };
  }

  @Put('admin/celebration/allocations')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  @ApiOperation({ summary: 'Split the celebration capacity across guest categories (all categories in one request)' })
  async updateAllocations(@Body() dto: UpdateAllocationsDto, @Req() req: RequestWithUser): Promise<CapacityAllocations> {
    const [celebration, categories, byCategory] = await Promise.all([
      this.settings.getCelebration(),
      this.prisma.guestCategory.findMany(),
      this.settings.confirmedPeopleByCategory(),
    ]);
    const next = new Map(categories.map((c) => [c.id, c.capacity]));
    const details: Record<string, string[]> = {};
    dto.allocations.forEach((a, i) => {
      const category = categories.find((c) => c.id === a.categoryId);
      if (!category) {
        details[`allocations.${i}.categoryId`] = ['That category does not exist.'];
        return;
      }
      const confirmed = byCategory.get(a.categoryId) ?? 0;
      if (a.capacity !== null && a.capacity < confirmed) {
        details[`allocations.${i}.capacity`] = [`${confirmed} ${category.name} guests are already confirmed; allow at least ${confirmed}.`];
      }
      next.set(a.categoryId, a.capacity);
    });
    if (Object.keys(details).length) throw Errors.validation(details);
    const total = [...next.values()].reduce<number>((sum, v) => sum + (v ?? 0), 0);
    if (total > celebration.capacity) {
      throw new AppException(400, 'VALIDATION_FAILED', `The categories add up to ${total} places, but the celebration capacity is ${celebration.capacity}.`, {
        allocations: [`Allocated places (${total}) cannot exceed the celebration capacity (${celebration.capacity}).`],
      });
    }
    await this.prisma.$transaction(dto.allocations.map((a) => this.prisma.guestCategory.update({ where: { id: a.categoryId }, data: { capacity: a.capacity } })));
    await this.audit.record(requestMeta(req), {
      action: 'ADMIN_CHANGED_EVENT_SETTINGS',
      entityType: 'Celebration',
      entityId: '1',
      metadata: { allocations: dto.allocations },
    });
    return this.allocations();
  }

  private async loadPublic(): Promise<{ celebration: PublicCelebration; publicEvents: EventRow[]; firstStart: Date }> {
    const [celebration, confirmed, events, attendance] = await Promise.all([
      this.settings.getCelebration(),
      this.settings.confirmedPeople(),
      this.events.list(),
      this.events.attendance(),
    ]);
    const publicEvents = events.filter((e) => e.isPublic);
    return {
      celebration: this.toPublic(celebration, confirmed, events, withFull(events, attendance)),
      publicEvents,
      firstStart: spanOf(events)?.startsAt ?? new Date(),
    };
  }

  /** The date span shown for the celebration: its public events, or all events when none is public. */
  private span(events: EventRow[]): { startsAt: string; endsAt: string } {
    const shown = events.some((e) => e.isPublic) ? events.filter((e) => e.isPublic) : events;
    const span = spanOf(shown);
    const now = new Date().toISOString();
    return { startsAt: span?.startsAt.toISOString() ?? now, endsAt: span?.endsAt.toISOString() ?? now };
  }

  private toPublic(c: Celebration, confirmedPeople: number, events: EventRow[], availability: Parameters<SettingsService['availability']>[2]): PublicCelebration {
    return {
      name: c.name,
      tagline: c.tagline,
      description: c.description,
      timezone: c.timezone,
      ...this.span(events),
      contactName: c.contactName,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      programmeVisible: c.programmeVisible,
      rsvp: this.settings.availability(c, confirmedPeople, availability),
    };
  }

  private toAdmin(c: Celebration, confirmedPeople: number, events: EventRow[]): AdminCelebration {
    return {
      name: c.name,
      tagline: c.tagline,
      description: c.description,
      timezone: c.timezone,
      ...this.span(events),
      contactName: c.contactName,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      programmeVisible: c.programmeVisible,
      capacity: c.capacity,
      rsvpOpen: c.rsvpOpen,
      rsvpMode: c.rsvpMode,
      rsvpScope: c.rsvpScope,
      checkInScope: c.checkInScope,
      rsvpDeadline: c.rsvpDeadline?.toISOString() ?? null,
      defaultCompanions: c.defaultCompanions,
      maxCompanions: c.maxCompanions,
      allowCompanions: c.allowCompanions,
      confirmedPeople,
      capacityRemaining: Math.max(0, c.capacity - confirmedPeople),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
