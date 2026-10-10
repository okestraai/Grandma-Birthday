import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import type { AdminCelebrant, Celebrant } from '@birthday/types';
import { Public, RequirePermissions } from '../common/decorators/auth.decorators';
import { PublicCacheHeaders } from '../common/decorators/cache.decorators';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import { assertPhoto } from '../common/utils/media-ref';
import { Clean } from '../common/utils/text';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { PUBLIC_MEDIA_SELECT } from '../media/media.mapper';
import { toAdminCelebrant, toPublicCelebrant } from './celebrant.mapper';

const opt = (max: number): PropertyDecorator => (t, k) =>
  [IsOptional(), Clean({ nullable: true }), ValidateIf((_: unknown, v: unknown) => v !== null), IsString(), MaxLength(max)].forEach((d) => d(t, k));

class UpdateCelebrantDto {
  @ApiPropertyOptional() @IsOptional() @Clean() @IsString() @MinLength(2) @MaxLength(150) fullName?: string;
  @ApiPropertyOptional() @IsOptional() @Clean() @IsString() @MinLength(1) @MaxLength(80) preferredName?: string;
  @ApiPropertyOptional({ nullable: true }) @opt(40) honorific?: string | null;
  @ApiPropertyOptional({ nullable: true, example: '1956-11-21' })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsISO8601({ strict: true }) birthDate?: string | null;
  @ApiPropertyOptional({ nullable: true }) @opt(150) birthPlace?: string | null;
  @ApiPropertyOptional({ nullable: true }) @opt(200) heroHeadline?: string | null;
  @ApiPropertyOptional({ nullable: true }) @opt(2000) introduction?: string | null;
  @ApiPropertyOptional({ nullable: true }) @opt(20000) biography?: string | null;
  @ApiPropertyOptional({ nullable: true }) @opt(600) quote?: string | null;
  @ApiPropertyOptional({ nullable: true }) @opt(150) quoteAttribution?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(300, { each: true }) achievements?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(200, { each: true }) values?: string[];
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() portraitMediaId?: string | null;
}

@ApiTags('Celebrant')
@Controller()
export class CelebrantController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get('celebrant')
  @Public()
  @PublicCacheHeaders()
  async get(): Promise<Celebrant> {
    const [c, event] = await Promise.all([this.load(), this.settings.getEvent()]);
    return toPublicCelebrant(c, event.startsAt);
  }

  @Get('admin/celebrant')
  @ApiCookieAuth()
  @RequirePermissions('content:manage')
  async getAdmin(): Promise<AdminCelebrant> {
    const [c, event] = await Promise.all([this.load(), this.settings.getEvent()]);
    return toAdminCelebrant(c, event.startsAt);
  }

  @Put('admin/celebrant')
  @ApiCookieAuth()
  @RequirePermissions('content:manage')
  async update(@Body() dto: UpdateCelebrantDto, @Req() req: RequestWithUser): Promise<AdminCelebrant> {
    await assertPhoto(this.prisma, dto.portraitMediaId, 'portraitMediaId');
    const clean = (list?: string[]) => list?.map((s) => s.trim()).filter(Boolean);
    await this.prisma.celebrant.update({
      where: { id: 1 },
      data: {
        ...dto,
        achievements: clean(dto.achievements),
        values: clean(dto.values),
        birthDate: dto.birthDate === undefined ? undefined : dto.birthDate === null ? null : new Date(`${dto.birthDate.slice(0, 10)}T00:00:00Z`),
      },
    });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_UPDATED_CELEBRANT', entityType: 'Celebrant', entityId: '1', metadata: { fields: Object.keys(dto) } });
    return this.getAdmin();
  }

  private load() {
    return this.prisma.celebrant.findUniqueOrThrow({ where: { id: 1 }, include: { portraitMedia: { select: PUBLIC_MEDIA_SELECT } } });
  }
}
