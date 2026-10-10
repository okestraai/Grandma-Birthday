import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AdminMedia, AdminUploadResult, BulkResult, MediaModerationStats, Paginated, PublicMedia } from '@birthday/types';
import { Public, RequirePermissions } from '../common/decorators/auth.decorators';
import { PublicCacheHeaders } from '../common/decorators/cache.decorators';
import { AppException, Errors } from '../common/errors';
import { hasPermission } from '../common/permissions';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import { ObjectNotFoundError, StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { MediaIngestService } from './media-ingest.service';
import { ADMIN_MEDIA_INCLUDE, mediaVersion, toAdminMedia } from './media.mapper';
import { AdminMediaQuery, AdminUploadFieldsDto, BulkMediaDto, MediaVariantParams, PublicMediaQuery, UpdateMediaDto } from './media.dto';
import { MediaService } from './media.service';
import { UploadInterceptor, uploadedFiles } from './upload.interceptor';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Public: media')
@Controller('media')
export class PublicMediaController {
  constructor(
    private readonly media: MediaService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @Public()
  @PublicCacheHeaders()
  @ApiOperation({ summary: 'Approved media, optionally for one album (by slug)' })
  list(@Query() query: PublicMediaQuery): Promise<Paginated<PublicMedia>> {
    return this.media.listPublic(query);
  }

  @Get(':id/:variant')
  @Public()
  @ApiOperation({
    summary: 'Serve a media file (thumb | medium | original). Approved media are public; others need media:manage. Supports Range.',
  })
  async serve(@Param() params: MediaVariantParams, @Req() req: RequestWithUser, @Res() res: Response): Promise<void> {
    const media = await this.media.findForServing(params.id);
    if (!media) throw Errors.notFound('Media');
    // Approved media are public, except inside a private (unpublished) album.
    const isPublic = media.status === 'APPROVED' && media.album?.isPublished !== false;
    if (!isPublic && !(req.user && hasPermission(req.user.role, 'media:manage'))) throw Errors.notFound('Media');

    const key = params.variant === 'thumb' ? media.thumbKey : params.variant === 'medium' ? media.mediumKey : media.storageKey;
    if (!key) throw Errors.notFound('Media variant');

    const etag = `"${media.id}-${params.variant}-${media.updatedAt.getTime()}"`;
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    const range = typeof req.headers.range === 'string' ? req.headers.range : undefined;
    let object;
    try {
      object = await this.storage.get(key, range);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) throw Errors.notFound('Media file');
      throw error;
    }

    const contentType = params.variant === 'original' ? media.mimeType : 'image/webp';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('ETag', etag);
    // A URL with the current ?v= never changes content, so caches may skip revalidating it.
    // A day, not a year: a photo that is later rejected, hidden or made private must drop out
    // of browser and CDN caches soon after.
    const versioned = isPublic && req.query.v === mediaVersion(media);
    res.setHeader(
      'Cache-Control',
      versioned ? 'public, max-age=86400, immutable' : isPublic ? 'public, max-age=3600, stale-while-revalidate=86400' : 'private, no-store',
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    const ext = contentType.split('/')[1]?.replace('quicktime', 'mov').replace('jpeg', 'jpg') ?? 'bin';
    res.setHeader('Content-Disposition', `inline; filename="${media.id}-${params.variant}.${ext}"`);
    if (object.contentLength !== undefined) res.setHeader('Content-Length', String(object.contentLength));
    if (object.contentRange) {
      res.status(206);
      res.setHeader('Content-Range', object.contentRange);
    }
    object.body.on('error', () => res.destroy());
    object.body.pipe(res);
  }
}

@ApiTags('Admin: media')
@ApiCookieAuth()
@Controller('admin/media')
@RequirePermissions('media:manage')
export class AdminMediaController {
  constructor(
    private readonly media: MediaService,
    private readonly ingest: MediaIngestService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query() query: AdminMediaQuery): Promise<Paginated<AdminMedia>> {
    return this.media.listAdmin(query);
  }

  @Get('stats')
  stats(): Promise<MediaModerationStats> {
    return this.media.stats();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminMedia> {
    return this.media.getAdmin(id);
  }

  @Post()
  @UseInterceptors(UploadInterceptor([{ name: 'files', maxCount: 50 }]))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } }, albumId: { type: 'string' }, caption: { type: 'string' } },
    },
  })
  @ApiOperation({ summary: 'Upload photos/videos (approved immediately). Files that fail validation are listed in `rejected`.' })
  async upload(@Req() req: RequestWithUser, @Body() fields: AdminUploadFieldsDto): Promise<AdminUploadResult> {
    const files = uploadedFiles(req, 'files');
    if (!files.length) throw Errors.validation({ files: ['Choose at least one file.'] });
    if (fields.albumId && !(await this.prisma.album.findUnique({ where: { id: fields.albumId } }))) {
      throw Errors.validation({ albumId: ['That album does not exist.'] });
    }
    const settings = await this.settings.getSettings();
    const result: AdminUploadResult = { accepted: 0, rejected: [], moderated: false, media: [] };
    for (const file of files) {
      try {
        const created = await this.ingest.ingest(file, {
          source: 'ADMIN',
          status: 'APPROVED',
          settings,
          albumId: fields.albumId ?? null,
          caption: fields.caption ?? null,
          uploadedById: req.user?.id,
        });
        const full = await this.prisma.media.findUniqueOrThrow({ where: { id: created.id }, include: ADMIN_MEDIA_INCLUDE });
        result.media.push(toAdminMedia(full));
        result.accepted++;
      } catch (error) {
        if (!(error instanceof AppException)) throw error;
        result.rejected.push({ filename: file.originalname, code: error.code, reason: error.message });
        if (error.code === 'STORAGE_QUOTA_EXCEEDED') break;
      }
    }
    await this.audit.record(requestMeta(req), {
      action: 'ADMIN_UPLOADED_MEDIA',
      entityType: 'Media',
      metadata: { accepted: result.accepted, rejected: result.rejected.length, albumId: fields.albumId ?? null },
    });
    return result;
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMediaDto, @Req() req: RequestWithUser): Promise<AdminMedia> {
    return this.media.update(id, dto, requestMeta(req));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser): Promise<void> {
    return this.media.remove(id, requestMeta(req));
  }

  @Post('bulk')
  @HttpCode(200)
  bulk(@Body() dto: BulkMediaDto, @Req() req: RequestWithUser): Promise<BulkResult> {
    return this.media.bulk(dto, requestMeta(req));
  }
}
