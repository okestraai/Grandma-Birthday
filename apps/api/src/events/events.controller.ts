import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminEvent } from '@birthday/types';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { ReorderDto } from '../common/dto/reorder.dto';
import { Errors } from '../common/errors';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import { slugify } from '../common/utils/text';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventsService, invitedCategoryIds, toPublicEvent, type EventAttendance, type EventRow } from './events.service';
import { UpsertEventDto } from './events.dto';

@ApiTags('Admin: events')
@ApiCookieAuth()
@Controller('admin/events')
@RequirePermissions('event:manage')
export class EventsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Every event, public or not, with replies and check-ins' })
  async list(): Promise<AdminEvent[]> {
    const [events, attendance, checkedIn, programme] = await Promise.all([
      this.events.list(),
      this.events.attendance(),
      this.prisma.checkIn.groupBy({ by: ['eventId'], where: { reversedAt: null }, _sum: { partySize: true } }),
      this.prisma.programmeItem.groupBy({ by: ['eventId'], _count: { _all: true } }),
    ]);
    return events.map((e) =>
      this.toAdmin(e, attendance, checkedIn.find((c) => c.eventId === e.id)?._sum.partySize ?? 0, programme.find((p) => p.eventId === e.id)?._count._all ?? 0),
    );
  }

  @Post()
  async create(@Body() dto: UpsertEventDto, @Req() req: RequestWithUser): Promise<AdminEvent> {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.checkTimes(startsAt, endsAt);
    await this.assertCategories(dto.invitedCategoryIds);
    const slug = await this.uniqueSlug(dto.slug || slugify(dto.name));
    const max = (await this.prisma.event.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1;
    const { invitedCategoryIds: categoryIds, ...data } = dto;
    const event = await this.prisma.event.create({
      data: {
        ...data,
        slug,
        startsAt,
        endsAt,
        sortOrder: dto.sortOrder ?? max + 1,
        invitedCategories: { create: [...new Set(categoryIds ?? [])].map((categoryId) => ({ categoryId })) },
      },
    });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_EVENT', entityType: 'Event', entityId: event.id, metadata: { op: 'create', name: event.name } });
    return this.one(event.id);
  }

  @Put('reorder')
  @HttpCode(204)
  async reorder(@Body() dto: ReorderDto, @Req() req: RequestWithUser): Promise<void> {
    await this.prisma.$transaction(dto.ids.map((id, i) => this.prisma.event.updateMany({ where: { id }, data: { sortOrder: i } })));
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_EVENT', entityType: 'Event', metadata: { op: 'reorder' } });
  }

  @Put(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertEventDto, @Req() req: RequestWithUser): Promise<AdminEvent> {
    const current = await this.prisma.event.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('Event');
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.checkTimes(startsAt, endsAt);
    await this.assertCategories(dto.invitedCategoryIds);
    if (dto.capacity !== undefined && dto.capacity !== null) {
      const attending = (await this.events.attendance()).get(id)?.people ?? 0;
      if (dto.capacity < attending) throw Errors.validation({ capacity: [`${attending} people are already coming to this event; capacity cannot be lower.`] });
    }
    const slug = dto.slug && dto.slug !== current.slug ? await this.uniqueSlug(dto.slug, id) : undefined;
    const { invitedCategoryIds: categoryIds, ...data } = dto;
    await this.prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { id }, data: { ...data, slug, startsAt, endsAt } });
      if (categoryIds) {
        await tx.eventCategory.deleteMany({ where: { eventId: id } });
        await tx.eventCategory.createMany({ data: [...new Set(categoryIds)].map((categoryId) => ({ eventId: id, categoryId })) });
      }
    });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_EVENT', entityType: 'Event', entityId: id, metadata: { op: 'update', fields: Object.keys(dto) } });
    return this.one(id);
  }

  /**
   * Deletes an event and its programme. Refused for the last event, and for an event guests have
   * replied to or been checked in at: hide it and close its replies instead, so nobody's answer
   * changes without them knowing.
   */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser): Promise<void> {
    const event = await this.prisma.event.findUnique({ where: { id }, include: { _count: { select: { rsvps: true, checkIns: true } } } });
    if (!event) throw Errors.notFound('Event');
    if ((await this.prisma.event.count()) === 1) throw Errors.conflict('The celebration needs at least one event. Edit this one instead.');
    if (event._count.rsvps || event._count.checkIns) {
      throw Errors.conflict(
        `${event._count.rsvps} guest${event._count.rsvps === 1 ? ' has' : 's have'} replied to this event and ${event._count.checkIns} check-in${event._count.checkIns === 1 ? ' is' : 's are'} recorded. Hide it and turn off its replies instead.`,
      );
    }
    await this.prisma.event.delete({ where: { id } });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_EVENT', entityType: 'Event', entityId: id, metadata: { op: 'delete', name: event.name } });
  }

  private async one(id: string): Promise<AdminEvent> {
    return (await this.list()).find((e) => e.id === id)!;
  }

  private toAdmin(e: EventRow, attendance: Map<string, EventAttendance>, checkedInPeople: number, programmeCount: number): AdminEvent {
    const counts = attendance.get(e.id) ?? { guests: 0, people: 0 };
    return {
      ...toPublicEvent(e),
      isPublic: e.isPublic,
      capacity: e.capacity,
      invitedCategoryIds: invitedCategoryIds(e),
      attendingGuests: counts.guests,
      attendingPeople: counts.people,
      capacityRemaining: e.capacity === null ? null : Math.max(0, e.capacity - counts.people),
      checkedInPeople,
      programmeCount,
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  private checkTimes(startsAt: Date, endsAt: Date): void {
    if (endsAt <= startsAt) throw Errors.validation({ endsAt: ['The end must be after the start.'] });
  }

  private async assertCategories(ids: string[] | undefined): Promise<void> {
    if (!ids?.length) return;
    const found = await this.prisma.guestCategory.count({ where: { id: { in: ids } } });
    if (found !== new Set(ids).size) throw Errors.validation({ invitedCategoryIds: ['Choose from the existing guest categories.'] });
  }

  private async uniqueSlug(base: string, exceptId?: string): Promise<string> {
    const root = base || 'event';
    let slug = root;
    for (let n = 2; await this.prisma.event.findFirst({ where: { slug, id: exceptId ? { not: exceptId } : undefined } }); n++) {
      if (n > 50) throw Errors.conflict('Choose a different slug.');
      slug = `${root}-${n}`;
    }
    return slug;
  }
}
