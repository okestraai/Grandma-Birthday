import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import type { AdminTimelineEntry, TimelineCategory, TimelineEntry as TimelineDto } from '@birthday/types';
import { Public, RequirePermissions } from '../common/decorators/auth.decorators';
import { PublicCacheHeaders } from '../common/decorators/cache.decorators';
import { ReorderDto } from '../common/dto/reorder.dto';
import { Errors } from '../common/errors';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import { assertPhoto } from '../common/utils/media-ref';
import { Clean } from '../common/utils/text';
import type { TimelineEntry } from '../generated/prisma/client';
import { PUBLIC_MEDIA_SELECT, publicMediaOrNull, type PublicMediaRow } from '../media/media.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const CATEGORIES = ['BIRTH', 'EDUCATION', 'CAREER', 'FAMILY', 'FAITH', 'ACHIEVEMENT', 'TRAVEL', 'MILESTONE', 'OTHER'] as const;

class UpsertTimelineDto {
  @ApiProperty() @IsInt() @Min(1800) @Max(2200) year: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(12) month?: number | null;
  @ApiProperty() @Clean() @IsString() @MinLength(2) @MaxLength(150) title: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Clean({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(3000) description?: string | null;
  @ApiProperty({ enum: CATEGORIES }) @IsIn(CATEGORIES) category: TimelineCategory;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() mediaId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublished?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

type Row = TimelineEntry & { media: PublicMediaRow | null };

const INCLUDE = { media: { select: PUBLIC_MEDIA_SELECT } };

function toPublic(row: Row): TimelineDto {
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    title: row.title,
    description: row.description,
    category: row.category,
    media: publicMediaOrNull(row.media),
    sortOrder: row.sortOrder,
  };
}

// Admins control the order explicitly (reorder endpoint); year breaks ties.
const ORDER = [{ sortOrder: 'asc' as const }, { year: 'asc' as const }, { month: 'asc' as const }, { createdAt: 'asc' as const }];

@ApiTags('Timeline')
@Controller()
export class TimelineController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('timeline')
  @Public()
  @PublicCacheHeaders()
  async list(): Promise<TimelineDto[]> {
    const rows = await this.prisma.timelineEntry.findMany({ where: { isPublished: true }, include: INCLUDE, orderBy: ORDER });
    return rows.map(toPublic);
  }

  @Get('admin/timeline')
  @ApiCookieAuth()
  @RequirePermissions('content:manage')
  async listAdmin(): Promise<AdminTimelineEntry[]> {
    const rows = await this.prisma.timelineEntry.findMany({ include: INCLUDE, orderBy: ORDER });
    return rows.map((r) => ({ ...toPublic(r), mediaId: r.mediaId, isPublished: r.isPublished }));
  }

  @Post('admin/timeline')
  @ApiCookieAuth()
  @RequirePermissions('content:manage')
  async create(@Body() dto: UpsertTimelineDto, @Req() req: RequestWithUser): Promise<AdminTimelineEntry> {
    await assertPhoto(this.prisma, dto.mediaId, 'mediaId');
    const max = (await this.prisma.timelineEntry.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1;
    const row = await this.prisma.timelineEntry.create({ data: { ...dto, sortOrder: dto.sortOrder ?? max + 1 }, include: INCLUDE });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_TIMELINE', entityType: 'TimelineEntry', entityId: row.id, metadata: { op: 'create' } });
    return { ...toPublic(row), mediaId: row.mediaId, isPublished: row.isPublished };
  }

  @Put('admin/timeline/reorder')
  @ApiCookieAuth()
  @RequirePermissions('content:manage')
  @HttpCode(204)
  async reorder(@Body() dto: ReorderDto, @Req() req: RequestWithUser): Promise<void> {
    await this.prisma.$transaction(dto.ids.map((id, i) => this.prisma.timelineEntry.updateMany({ where: { id }, data: { sortOrder: i } })));
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_TIMELINE', entityType: 'TimelineEntry', metadata: { op: 'reorder' } });
  }

  @Put('admin/timeline/:id')
  @ApiCookieAuth()
  @RequirePermissions('content:manage')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertTimelineDto, @Req() req: RequestWithUser): Promise<AdminTimelineEntry> {
    await assertPhoto(this.prisma, dto.mediaId, 'mediaId');
    if (!(await this.prisma.timelineEntry.findUnique({ where: { id } }))) throw Errors.notFound('Timeline entry');
    const row = await this.prisma.timelineEntry.update({ where: { id }, data: dto, include: INCLUDE });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_TIMELINE', entityType: 'TimelineEntry', entityId: id, metadata: { op: 'update' } });
    return { ...toPublic(row), mediaId: row.mediaId, isPublished: row.isPublished };
  }

  @Delete('admin/timeline/:id')
  @ApiCookieAuth()
  @RequirePermissions('content:manage')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser): Promise<void> {
    const { count } = await this.prisma.timelineEntry.deleteMany({ where: { id } });
    if (!count) throw Errors.notFound('Timeline entry');
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_TIMELINE', entityType: 'TimelineEntry', entityId: id, metadata: { op: 'delete' } });
  }
}
