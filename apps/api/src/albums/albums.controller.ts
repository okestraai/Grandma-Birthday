import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import type { AdminAlbum, AlbumDetail, AlbumSummary } from '@birthday/types';
import { Public, RequirePermissions } from '../common/decorators/auth.decorators';
import { PublicCacheHeaders } from '../common/decorators/cache.decorators';
import { ReorderDto } from '../common/dto/reorder.dto';
import { Errors } from '../common/errors';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import { Clean, slugify } from '../common/utils/text';
import type { Album } from '../generated/prisma/client';
import { PUBLIC_MEDIA_SELECT, publicMediaOrNull, toPublicMedia, type PublicMediaRow } from '../media/media.mapper';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

class UpsertAlbumDto {
  @ApiProperty() @Clean() @IsString() @MinLength(2) @MaxLength(120) title: string;
  @ApiPropertyOptional() @IsOptional() @Clean({ lowercase: true }) @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Use lowercase letters, numbers and hyphens.' }) @MaxLength(80) slug?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Clean({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000) description?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() coverMediaId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublished?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

@ApiTags('Albums')
@Controller()
export class AlbumsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  @Get('albums')
  @Public()
  @PublicCacheHeaders()
  async list(): Promise<AlbumSummary[]> {
    const albums = await this.prisma.album.findMany({ where: { isPublished: true }, include: { coverMedia: { select: PUBLIC_MEDIA_SELECT } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const summaries = await this.summaries(albums);
    return summaries.filter((a) => a.mediaCount > 0);
  }

  @Get('albums/:slug')
  @Public()
  @PublicCacheHeaders()
  async detail(@Param('slug') slug: string): Promise<AlbumDetail> {
    const album = await this.prisma.album.findFirst({ where: { slug, isPublished: true }, include: { coverMedia: { select: PUBLIC_MEDIA_SELECT } } });
    if (!album) throw Errors.notFound('Album');
    return (await this.summaries([album]))[0];
  }

  @Get('admin/albums')
  @ApiCookieAuth()
  @RequirePermissions('media:manage')
  async adminList(): Promise<AdminAlbum[]> {
    const albums = await this.prisma.album.findMany({ include: { coverMedia: { select: PUBLIC_MEDIA_SELECT } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const [summaries, pending] = await Promise.all([
      this.summaries(albums, true),
      this.prisma.media.groupBy({ by: ['albumId'], where: { status: 'PENDING', albumId: { not: null } }, _count: { _all: true } }),
    ]);
    return summaries.map((s, i) => ({
      ...s,
      coverMediaId: albums[i].coverMediaId,
      isPublished: albums[i].isPublished,
      pendingCount: pending.find((p) => p.albumId === s.id)?._count._all ?? 0,
      createdAt: albums[i].createdAt.toISOString(),
    }));
  }

  @Post('admin/albums')
  @ApiCookieAuth()
  @RequirePermissions('media:manage')
  async create(@Body() dto: UpsertAlbumDto, @Req() req: RequestWithUser): Promise<AdminAlbum> {
    const slug = await this.uniqueSlug(dto.slug || slugify(dto.title));
    await this.assertCover(dto.coverMediaId);
    const max = (await this.prisma.album.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1;
    const album = await this.prisma.album.create({ data: { ...dto, slug, sortOrder: dto.sortOrder ?? max + 1 } });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_ALBUM', entityType: 'Album', entityId: album.id, metadata: { op: 'create' } });
    return this.one(album.id);
  }

  @Put('admin/albums/reorder')
  @ApiCookieAuth()
  @RequirePermissions('media:manage')
  @HttpCode(204)
  async reorder(@Body() dto: ReorderDto, @Req() req: RequestWithUser): Promise<void> {
    await this.prisma.$transaction(dto.ids.map((id, i) => this.prisma.album.updateMany({ where: { id }, data: { sortOrder: i } })));
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_ALBUM', entityType: 'Album', metadata: { op: 'reorder' } });
  }

  @Put('admin/albums/:id/media/reorder')
  @ApiCookieAuth()
  @RequirePermissions('media:manage')
  @HttpCode(204)
  reorderMedia(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderDto, @Req() req: RequestWithUser): Promise<void> {
    return this.media.reorderAlbum(id, dto.ids, requestMeta(req));
  }

  @Put('admin/albums/:id')
  @ApiCookieAuth()
  @RequirePermissions('media:manage')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertAlbumDto, @Req() req: RequestWithUser): Promise<AdminAlbum> {
    const current = await this.prisma.album.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('Album');
    const slug = dto.slug && dto.slug !== current.slug ? await this.uniqueSlug(dto.slug, id) : undefined;
    await this.assertCover(dto.coverMediaId);
    await this.prisma.album.update({ where: { id }, data: { ...dto, slug } });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_ALBUM', entityType: 'Album', entityId: id, metadata: { op: 'update' } });
    return this.one(id);
  }

  @Delete('admin/albums/:id')
  @ApiCookieAuth()
  @RequirePermissions('media:manage')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser): Promise<void> {
    // Media keep existing with albumId set to null (FK ON DELETE SET NULL).
    const { count } = await this.prisma.album.deleteMany({ where: { id } });
    if (!count) throw Errors.notFound('Album');
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_ALBUM', entityType: 'Album', entityId: id, metadata: { op: 'delete' } });
  }

  private async one(id: string): Promise<AdminAlbum> {
    const all = await this.adminList();
    return all.find((a) => a.id === id)!;
  }

  private async summaries(albums: (Album & { coverMedia: PublicMediaRow | null })[], includeUnapproved = false): Promise<AlbumSummary[]> {
    const ids = albums.map((a) => a.id);
    // Albums without a chosen cover use their first approved photo.
    const coverless = albums.filter((a) => !publicMediaOrNull(a.coverMedia)).map((a) => a.id);
    const [counts, photos] = await Promise.all([
      this.prisma.media.groupBy({
        by: ['albumId'],
        where: { albumId: { in: ids }, status: includeUnapproved ? undefined : 'APPROVED' },
        _count: { _all: true },
      }),
      coverless.length
        ? this.prisma.media.findMany({
            where: { albumId: { in: coverless }, status: 'APPROVED', kind: 'PHOTO' },
            select: { ...PUBLIC_MEDIA_SELECT, albumId: true },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          })
        : [],
    ]);
    // Rows come sorted, so the first one seen for each album is its cover.
    const fallbacks = new Map<string, PublicMediaRow>();
    for (const photo of photos) if (photo.albumId && !fallbacks.has(photo.albumId)) fallbacks.set(photo.albumId, photo);
    return albums.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      description: a.description,
      cover: publicMediaOrNull(a.coverMedia) ?? (fallbacks.has(a.id) ? toPublicMedia(fallbacks.get(a.id)!) : null),
      mediaCount: counts.find((c) => c.albumId === a.id)?._count._all ?? 0,
      sortOrder: a.sortOrder,
    }));
  }

  private async uniqueSlug(base: string, exceptId?: string): Promise<string> {
    const root = base || 'album';
    let slug = root;
    for (let n = 2; await this.prisma.album.findFirst({ where: { slug, id: exceptId ? { not: exceptId } : undefined } }); n++) {
      if (n > 50) throw Errors.conflict('Choose a different slug.');
      slug = `${root}-${n}`;
    }
    return slug;
  }

  private async assertCover(id: string | null | undefined): Promise<void> {
    if (!id) return;
    const media = await this.prisma.media.findUnique({ where: { id }, select: { kind: true } });
    if (!media || media.kind !== 'PHOTO') throw Errors.validation({ coverMediaId: ['Choose a photo as the cover.'] });
  }
}
