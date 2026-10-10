import { Body, Controller, Get, HttpStatus, Inject, Param, Post, Req, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { UploadPageConfig, UploadResult } from '@birthday/types';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { Public } from '../common/decorators/auth.decorators';
import { AppException, Errors } from '../common/errors';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import { hashIp, safeEqual } from '../common/utils/crypto';
import { Clean } from '../common/utils/text';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ACCEPTED_MIME_TYPES, MediaIngestService } from '../media/media-ingest.service';
import { UploadInterceptor, uploadedFiles } from '../media/upload.interceptor';
import { MailService } from '../notifications/mail.service';
import { adminNotificationEmail } from '../notifications/templates';
import { QuotaService } from '../storage/quota.service';
import { SettingsService } from '../settings/settings.service';
import { TokenCheckFirst } from './token-check.interceptor';

class GuestUploadFieldsDto {
  @ApiPropertyOptional() @IsOptional() @Clean() @IsString() @MaxLength(80) uploaderName?: string;
  @ApiPropertyOptional() @IsOptional() @Clean() @IsString() @MaxLength(500) message?: string;
}

/**
 * The page behind the event QR code. The token in the URL is the only credential: it grants
 * uploading (never viewing or admin access) and can be rotated from Settings.
 */
@ApiTags('Public: guest photo uploads')
@Controller('uploads/:token')
@Public()
export class UploadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly quota: QuotaService,
    private readonly ingest: MediaIngestService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Upload page configuration (limits, accepted types, whether uploads are open)' })
  async config_(@Param('token') token: string): Promise<UploadPageConfig> {
    const settings = await this.checkToken(token);
    const [event, celebrant, storage] = await Promise.all([
      this.settings.getEvent(),
      this.prisma.celebrant.findUnique({ where: { id: 1 } }),
      this.quota.summary(),
    ]);
    const closedReason = !settings.guestUploadsOpen ? 'CLOSED_BY_ADMIN' : storage.remainingBytes <= 0 ? 'STORAGE_FULL' : null;
    return {
      open: closedReason === null,
      closedReason,
      eventName: event.name,
      celebrantName: celebrant?.fullName ?? '',
      maxPhotoBytes: settings.maxPhotoBytes,
      maxVideoBytes: settings.maxVideoBytes,
      videoUploadsEnabled: settings.videoUploadsEnabled,
      maxFilesPerUpload: settings.maxFilesPerUpload,
      acceptedMimeTypes: ACCEPTED_MIME_TYPES(settings),
    };
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 10 * 60_000 } })
  @UseInterceptors(TokenCheckFirst, UploadInterceptor([{ name: 'files', maxCount: 'settings' }]))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } }, uploaderName: { type: 'string' }, message: { type: 'string' } },
    },
  })
  @ApiOperation({ summary: 'Upload photos/videos from the event QR page. Held for moderation unless moderation is off.' })
  async upload(@Param('token') token: string, @Body() fields: GuestUploadFieldsDto, @Req() req: RequestWithUser): Promise<UploadResult> {
    const settings = await this.checkToken(token);
    if (!settings.guestUploadsOpen) throw new AppException(HttpStatus.FORBIDDEN, 'UPLOADS_CLOSED', 'Photo sharing is closed at the moment.');
    const files = uploadedFiles(req, 'files');
    if (!files.length) throw Errors.validation({ files: ['Choose at least one photo.'] });

    // Per-device hourly limit, counted from stored uploads (IP is hashed, never stored raw).
    const ipHash = hashIp(req.ip, this.config.auth.refreshSecret);
    if (ipHash) {
      const recent = await this.prisma.uploadSession.aggregate({
        where: { ipHash, createdAt: { gt: new Date(Date.now() - 3600_000) } },
        _sum: { fileCount: true },
      });
      if ((recent._sum.fileCount ?? 0) + files.length > this.config.guestUploadFilesPerHour) {
        throw new AppException(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'You have shared a lot of photos in the last hour. Please try again a little later.');
      }
    }

    const session = await this.prisma.uploadSession.create({
      data: { uploaderName: fields.uploaderName || null, message: fields.message || null, ipHash, userAgent: req.headers['user-agent']?.slice(0, 300) ?? null },
    });
    const status = settings.uploadModerationEnabled ? 'PENDING' : 'APPROVED';
    const result: UploadResult = { accepted: 0, rejected: [], moderated: settings.uploadModerationEnabled };
    let totalBytes = 0;
    for (const file of files) {
      try {
        const media = await this.ingest.ingest(file, {
          source: 'GUEST_UPLOAD',
          status,
          settings,
          albumId: status === 'APPROVED' ? settings.guestUploadAlbumId : null,
          uploaderName: fields.uploaderName || null,
          uploaderMessage: fields.message || null,
          uploadSessionId: session.id,
        });
        totalBytes += Number(media.storedBytes);
        result.accepted++;
      } catch (error) {
        if (!(error instanceof AppException)) throw error;
        result.rejected.push({ filename: file.originalname.slice(0, 120), code: error.code, reason: error.message });
        if (error.code === 'STORAGE_QUOTA_EXCEEDED') {
          // Everything after this would fail the same way.
          for (const rest of files.slice(files.indexOf(file) + 1)) {
            result.rejected.push({ filename: rest.originalname.slice(0, 120), code: error.code, reason: error.message });
          }
          break;
        }
      }
    }
    await this.prisma.uploadSession.update({ where: { id: session.id }, data: { fileCount: result.accepted, totalBytes: BigInt(totalBytes) } });
    await this.audit.record({ ...requestMeta(req), actor: null }, {
      action: 'GUEST_UPLOADED_MEDIA',
      entityType: 'UploadSession',
      entityId: session.id,
      metadata: { accepted: result.accepted, rejected: result.rejected.length },
    });
    if (result.accepted > 0 && settings.uploadModerationEnabled) {
      this.mail.notifyAdmin(
        adminNotificationEmail({
          title: 'New guest photos to review',
          lines: [`${fields.uploaderName || 'A guest'} shared ${result.accepted} file${result.accepted === 1 ? '' : 's'}.`],
          url: `${this.config.publicWebUrl}/admin/guest-photos`,
        }),
      );
    }
    if (result.accepted === 0 && result.rejected.length) {
      const first = result.rejected[0];
      if (first.code === 'STORAGE_QUOTA_EXCEEDED') throw this.quota.quotaError();
    }
    return result;
  }

  private async checkToken(token: string) {
    const settings = await this.settings.getSettings();
    if (!token || !safeEqual(token, settings.uploadToken)) {
      throw new AppException(HttpStatus.NOT_FOUND, 'UPLOAD_TOKEN_INVALID', 'This photo sharing link is no longer active.');
    }
    return settings;
  }
}
