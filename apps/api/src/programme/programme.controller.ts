import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import type { ProgrammeItem as ProgrammeDto } from '@birthday/types';
import { Public, RequirePermissions } from '../common/decorators/auth.decorators';
import { PublicCacheHeaders } from '../common/decorators/cache.decorators';
import { ReorderDto } from '../common/dto/reorder.dto';
import { Errors } from '../common/errors';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import { Clean } from '../common/utils/text';
import type { ProgrammeItem } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const opt = (max: number): PropertyDecorator => (t, k) =>
  [IsOptional(), Clean({ nullable: true }), ValidateIf((_: unknown, v: unknown) => v !== null), IsString(), MaxLength(max)].forEach((d) => d(t, k));

class UpsertProgrammeDto {
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
  startTime: p.startTime,
  endTime: p.endTime,
  title: p.title,
  description: p.description,
  speaker: p.speaker,
  location: p.location,
  sortOrder: p.sortOrder,
});
const ORDER = [{ sortOrder: 'asc' as const }, { startTime: 'asc' as const }];

@ApiTags('Programme')
@Controller()
export class ProgrammeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('programme')
  @Public()
  @PublicCacheHeaders()
  async list(): Promise<ProgrammeDto[]> {
    return (await this.prisma.programmeItem.findMany({ orderBy: ORDER })).map(toDto);
  }

  @Get('admin/programme')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  adminList(): Promise<ProgrammeDto[]> {
    return this.list();
  }

  @Post('admin/programme')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  async create(@Body() dto: UpsertProgrammeDto, @Req() req: RequestWithUser): Promise<ProgrammeDto> {
    this.checkTimes(dto);
    const max = (await this.prisma.programmeItem.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1;
    const item = await this.prisma.programmeItem.create({ data: { ...dto, sortOrder: dto.sortOrder ?? max + 1 } });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_PROGRAMME', entityType: 'ProgrammeItem', entityId: item.id, metadata: { op: 'create' } });
    return toDto(item);
  }

  @Put('admin/programme/reorder')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  @HttpCode(204)
  async reorder(@Body() dto: ReorderDto, @Req() req: RequestWithUser): Promise<void> {
    await this.prisma.$transaction(dto.ids.map((id, i) => this.prisma.programmeItem.updateMany({ where: { id }, data: { sortOrder: i } })));
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_PROGRAMME', entityType: 'ProgrammeItem', metadata: { op: 'reorder' } });
  }

  @Put('admin/programme/:id')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertProgrammeDto, @Req() req: RequestWithUser): Promise<ProgrammeDto> {
    this.checkTimes(dto);
    if (!(await this.prisma.programmeItem.findUnique({ where: { id } }))) throw Errors.notFound('Programme item');
    const item = await this.prisma.programmeItem.update({ where: { id }, data: dto });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_PROGRAMME', entityType: 'ProgrammeItem', entityId: id, metadata: { op: 'update' } });
    return toDto(item);
  }

  @Delete('admin/programme/:id')
  @ApiCookieAuth()
  @RequirePermissions('event:manage')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser): Promise<void> {
    const { count } = await this.prisma.programmeItem.deleteMany({ where: { id } });
    if (!count) throw Errors.notFound('Programme item');
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_PROGRAMME', entityType: 'ProgrammeItem', entityId: id, metadata: { op: 'delete' } });
  }

  private checkTimes(dto: UpsertProgrammeDto): void {
    if (dto.endTime && dto.endTime <= dto.startTime) throw Errors.validation({ endTime: ['The end must be after the start.'] });
  }
}
