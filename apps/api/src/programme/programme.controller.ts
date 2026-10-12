import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import type { ProgrammeGroup, ProgrammeItem as ProgrammeDto } from '@birthday/types';
import { Public, RequirePermissions } from '../common/decorators/auth.decorators';
import { PublicCacheHeaders } from '../common/decorators/cache.decorators';
import { ReorderDto } from '../common/dto/reorder.dto';
import { Errors } from '../common/errors';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import { Clean } from '../common/utils/text';
import type { ProgrammeItem } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventsService, toPublicEvent } from '../events/events.service';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const opt = (max: number): PropertyDecorator => (t, k) =>
  [IsOptional(), Clean({ nullable: true }), ValidateIf((_: unknown, v: unknown) => v !== null), IsString(), MaxLength(max)].forEach((d) => d(t, k));

class UpsertProgrammeDto {
  @ApiPropertyOptional({ nullable: true, example: '2026-11-22', description: 'Only for items on another day than the event starts' })
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(DATE, { message: 'Use YYYY-MM-DD.' })
  date?: string | null;
  @ApiProperty({ example: '17:00' }) @Matches(HHMM, { message: 'Use 24-hour HH:mm.' }) startTime: string;
  @ApiPropertyOptional({ nullable: true, example: '17:30' }) @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(HHMM, { message: 'Use 24-hour HH:mm.' }) endTime?: string | null;
  @ApiProperty() @Clean() @IsString() @MinLength(2) @MaxLength(150) title: string;
  @ApiPropertyOptional({ nullable: true }) @opt(1000) description?: string | null;
  @ApiPropertyOptional({ nullable: true }) @opt(150) speaker?: string | null;
  @ApiPropertyOptional({ nullable: true }) @opt(150) location?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

const toDto = (p: ProgrammeItem): ProgrammeDto => ({
  id: p.id,
  eventId: p.eventId,
  date: p.date ? p.date.toISOString().slice(0, 10) : null,
  startTime: p.startTime,
  endTime: p.endTime,
  title: p.title,
  description: p.description,
  speaker: p.speaker,
  location: p.location,
  sortOrder: p.sortOrder,
});
const ORDER = [{ sortOrder: 'asc' as const }, { startTime: 'asc' as const }];

const toData = ({ date, ...dto }: UpsertProgrammeDto) => ({ ...dto, date: date === undefined ? undefined : date === null ? null : new Date(`${date}T00:00:00Z`) });

@ApiTags('Programme')
@Controller()
export class ProgrammeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
  ) {}

  @Get('programme')
  @Public()
  @PublicCacheHeaders()
  @ApiOperation({ summary: 'Programme items grouped by public event; events without items are left out' })
  async list(): Promise<ProgrammeGroup[]> {
    const [events, items] = await Promise.all([
      this.events.listPublic(),
      this.prisma.programmeItem.findMany({ where: { event: { isPublic: true } }, orderBy: ORDER }),
    ]);
    return events
      .map((event) => ({ event: toPublicEvent(event), items: items.filter((i) => i.eventId === event.id).map(toDto) }))
      .filter((group) => group.items.length > 0);
  }

  @Get('admin/events/:eventId/programme')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  async adminList(@Param('eventId', ParseUUIDPipe) eventId: string): Promise<ProgrammeDto[]> {
    await this.assertEvent(eventId);
    return (await this.prisma.programmeItem.findMany({ where: { eventId }, orderBy: ORDER })).map(toDto);
  }

  @Post('admin/events/:eventId/programme')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  async create(@Param('eventId', ParseUUIDPipe) eventId: string, @Body() dto: UpsertProgrammeDto, @Req() req: RequestWithUser): Promise<ProgrammeDto> {
    this.checkTimes(dto);
    await this.assertEvent(eventId);
    const max = (await this.prisma.programmeItem.aggregate({ where: { eventId }, _max: { sortOrder: true } }))._max.sortOrder ?? -1;
    const item = await this.prisma.programmeItem.create({ data: { ...toData(dto), eventId, sortOrder: dto.sortOrder ?? max + 1 } });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_PROGRAMME', entityType: 'ProgrammeItem', entityId: item.id, metadata: { op: 'create', eventId } });
    return toDto(item);
  }

  @Put('admin/events/:eventId/programme/reorder')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  @HttpCode(204)
  async reorder(@Param('eventId', ParseUUIDPipe) eventId: string, @Body() dto: ReorderDto, @Req() req: RequestWithUser): Promise<void> {
    await this.assertEvent(eventId);
    await this.prisma.$transaction(dto.ids.map((id, i) => this.prisma.programmeItem.updateMany({ where: { id, eventId }, data: { sortOrder: i } })));
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_PROGRAMME', entityType: 'ProgrammeItem', metadata: { op: 'reorder', eventId } });
  }

  @Put('admin/events/:eventId/programme/:id')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  async update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertProgrammeDto,
    @Req() req: RequestWithUser,
  ): Promise<ProgrammeDto> {
    this.checkTimes(dto);
    if (!(await this.prisma.programmeItem.findFirst({ where: { id, eventId } }))) throw Errors.notFound('Programme item');
    const item = await this.prisma.programmeItem.update({ where: { id }, data: toData(dto) });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_PROGRAMME', entityType: 'ProgrammeItem', entityId: id, metadata: { op: 'update', eventId } });
    return toDto(item);
  }

  @Delete('admin/events/:eventId/programme/:id')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  @HttpCode(204)
  async remove(@Param('eventId', ParseUUIDPipe) eventId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser): Promise<void> {
    const { count } = await this.prisma.programmeItem.deleteMany({ where: { id, eventId } });
    if (!count) throw Errors.notFound('Programme item');
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_PROGRAMME', entityType: 'ProgrammeItem', entityId: id, metadata: { op: 'delete', eventId } });
  }

  private async assertEvent(eventId: string): Promise<void> {
    if (!(await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true } }))) throw Errors.notFound('Event');
  }

  private checkTimes(dto: UpsertProgrammeDto): void {
    if (dto.endTime && dto.endTime <= dto.startTime) throw Errors.validation({ endTime: ['The end must be after the start.'] });
  }
}
