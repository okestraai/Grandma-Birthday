import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminEvent, CapacityAllocations, PublicEvent, SiteOverview } from '@birthday/types';
import { Public, RequirePermissions } from '../common/decorators/auth.decorators';
import { PublicCacheHeaders } from '../common/decorators/cache.decorators';
import { Errors } from '../common/errors';
import { PublicCache } from '../common/public-cache';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import type { Event } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { PUBLIC_MEDIA_SELECT, publicMediaOrNull } from '../media/media.mapper';
import { toPublicCelebrant } from '../celebrant/celebrant.mapper';
import { UpdateAllocationsDto, UpdateEventDto } from './event.dto';
import { AppException } from '../common/errors';

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

@ApiTags('Public: site & event')
@Controller()
export class EventController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly cache: PublicCache,
  ) {}

  @Get('site')
  @Public()
  @PublicCacheHeaders()
  @ApiOperation({ summary: 'Everything the home page needs: event, celebrant, branding, feature flags' })
  site(): Promise<SiteOverview> {
    return this.cache.remember('site', () => this.loadSite());
  }

  @Get('event')
  @Public()
  @PublicCacheHeaders()
  publicEvent(): Promise<PublicEvent> {
    return this.loadPublic();
  }

  private async loadSite(): Promise<SiteOverview> {
    const [event, s, celebrant] = await Promise.all([
      this.loadPublic(),
      this.prisma.settings.findUniqueOrThrow({
        where: { id: 1 },
        include: { logoMedia: { select: PUBLIC_MEDIA_SELECT }, heroMedia: { select: PUBLIC_MEDIA_SELECT }, ogImageMedia: { select: PUBLIC_MEDIA_SELECT } },
      }),
      this.prisma.celebrant.findUniqueOrThrow({ where: { id: 1 }, include: { portraitMedia: { select: PUBLIC_MEDIA_SELECT } } }),
    ]);
    return {
      event,
      celebrant: toPublicCelebrant(celebrant, new Date(event.startsAt)),
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

  @Get('admin/event')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  async adminEvent(): Promise<AdminEvent> {
    const event = await this.settings.getEvent();
    const confirmed = await this.settings.confirmedPeople();
    return this.toAdmin(event, confirmed);
  }

  @Put('admin/event')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  async update(@Body() dto: UpdateEventDto, @Req() req: RequestWithUser): Promise<AdminEvent> {
    const current = await this.settings.getEvent();
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : current.endsAt;
    if (endsAt <= startsAt) throw Errors.validation({ endsAt: ['The end must be after the start.'] });
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

    const updated = await this.prisma.event.update({
      where: { id: 1 },
      data: {
        ...dto,
        startsAt,
        endsAt,
        rsvpDeadline: dto.rsvpDeadline === undefined ? undefined : dto.rsvpDeadline === null ? null : new Date(dto.rsvpDeadline),
      },
    });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_EVENT_SETTINGS', entityType: 'Event', entityId: '1', metadata: { fields: Object.keys(dto) } });
    return this.toAdmin(updated, confirmed);
  }

  @Get('admin/event/allocations')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  async allocations(): Promise<CapacityAllocations> {
    const [event, categories, byCategory] = await Promise.all([
      this.settings.getEvent(),
      this.prisma.guestCategory.findMany({ include: { _count: { select: { guests: true } } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.settings.confirmedPeopleByCategory(),
    ]);
    const allocated = categories.reduce((sum, c) => sum + (c.capacity ?? 0), 0);
    return {
      capacity: event.capacity,
      confirmedPeople: [...byCategory.values()].reduce((a, b) => a + b, 0),
      allocated,
      unallocated: Math.max(0, event.capacity - allocated),
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

  @Put('admin/event/allocations')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  @ApiOperation({ summary: 'Split the event capacity across guest categories (all categories in one request)' })
  async updateAllocations(@Body() dto: UpdateAllocationsDto, @Req() req: RequestWithUser): Promise<CapacityAllocations> {
    const [event, categories, byCategory] = await Promise.all([
      this.settings.getEvent(),
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
    if (total > event.capacity) {
      throw new AppException(400, 'VALIDATION_FAILED', `The categories add up to ${total} places, but the event capacity is ${event.capacity}.`, {
        allocations: [`Allocated places (${total}) cannot exceed the event capacity (${event.capacity}).`],
      });
    }
    await this.prisma.$transaction(dto.allocations.map((a) => this.prisma.guestCategory.update({ where: { id: a.categoryId }, data: { capacity: a.capacity } })));
    await this.audit.record(requestMeta(req), {
      action: 'ADMIN_CHANGED_EVENT_SETTINGS',
      entityType: 'Event',
      entityId: '1',
      metadata: { allocations: dto.allocations },
    });
    return this.allocations();
  }

  private async loadPublic(): Promise<PublicEvent> {
    const event = await this.settings.getEvent();
    const confirmed = await this.settings.confirmedPeople();
    return this.toPublic(event, confirmed);
  }

  private toPublic(e: Event, confirmedPeople: number): PublicEvent {
    return {
      name: e.name,
      tagline: e.tagline,
      description: e.description,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      timezone: e.timezone,
      venueName: e.venueName,
      address: e.address,
      city: e.city,
      mapUrl: e.mapUrl,
      latitude: e.latitude,
      longitude: e.longitude,
      theme: e.theme,
      dressCode: e.dressCode,
      parkingInfo: e.parkingInfo,
      contactName: e.contactName,
      contactEmail: e.contactEmail,
      contactPhone: e.contactPhone,
      rsvp: this.settings.availability(e, confirmedPeople),
    };
  }

  private toAdmin(e: Event, confirmedPeople: number): AdminEvent {
    const { rsvp: _rsvp, ...base } = this.toPublic(e, confirmedPeople);
    return {
      ...base,
      capacity: e.capacity,
      rsvpOpen: e.rsvpOpen,
      rsvpMode: e.rsvpMode,
      rsvpDeadline: e.rsvpDeadline?.toISOString() ?? null,
      defaultCompanions: e.defaultCompanions,
      maxCompanions: e.maxCompanions,
      allowCompanions: e.allowCompanions,
      confirmedPeople,
      capacityRemaining: Math.max(0, e.capacity - confirmedPeople),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}
