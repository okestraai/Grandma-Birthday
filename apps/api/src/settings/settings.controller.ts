import { Body, Controller, Get, HttpCode, Post, Put, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AdminSettings } from '@birthday/types';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { Errors } from '../common/errors';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import { randomToken } from '../common/utils/crypto';
import type { Settings } from '../generated/prisma/client';
import { PUBLIC_MEDIA_SELECT, publicMediaOrNull, type PublicMediaRow } from '../media/media.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QrService } from '../qr/qr.service';
import { UpdateSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

const GB = 1024 ** 3;
export const QUOTA_PRESETS = [5 * GB, 10 * GB, 25 * GB, 50 * GB];

type SettingsWithMedia = Settings & { logoMedia: PublicMediaRow | null; heroMedia: PublicMediaRow | null; ogImageMedia: PublicMediaRow | null };

@ApiTags('Admin: settings')
@ApiCookieAuth()
@Controller('admin/settings')
@RequirePermissions('settings:manage')
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly qr: QrService,
  ) {}

  @Get()
  async get(): Promise<AdminSettings> {
    return this.toAdmin(await this.load());
  }

  @Put()
  @ApiOperation({ summary: 'Update any subset of settings' })
  async update(@Body() dto: UpdateSettingsDto, @Req() req: RequestWithUser): Promise<AdminSettings> {
    for (const field of ['logoMediaId', 'heroMediaId', 'ogImageMediaId'] as const) {
      const id = dto[field];
      if (id && !(await this.prisma.media.findFirst({ where: { id, kind: 'PHOTO' } }))) {
        throw Errors.validation({ [field]: ['Choose a photo from the media library.'] });
      }
    }
    if (dto.guestUploadAlbumId && !(await this.prisma.album.findUnique({ where: { id: dto.guestUploadAlbumId } }))) {
      throw Errors.validation({ guestUploadAlbumId: ['That album does not exist.'] });
    }
    const { storageQuotaBytes, ...rest } = dto;
    await this.prisma.settings.update({
      where: { id: 1 },
      data: { ...rest, storageQuotaBytes: storageQuotaBytes === undefined ? undefined : BigInt(storageQuotaBytes) },
    });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CHANGED_SETTINGS', entityType: 'Settings', entityId: '1', metadata: { ...dto } });
    return this.get();
  }

  @Post('upload-token/rotate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Issue a new guest upload link. Printed QR codes with the old link stop working.' })
  async rotate(@Req() req: RequestWithUser): Promise<AdminSettings> {
    await this.prisma.settings.update({ where: { id: 1 }, data: { uploadToken: randomToken(), uploadTokenRotatedAt: new Date() } });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_ROTATED_UPLOAD_TOKEN', entityType: 'Settings', entityId: '1' });
    return this.get();
  }

  @Get('upload-qr.svg')
  async qrSvg(@Res() res: Response): Promise<void> {
    const settings = await this.settings.getSettings();
    res.type('image/svg+xml').setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline; filename="guest-upload-qr.svg"');
    res.send(await this.qr.svg(this.settings.uploadUrl(settings.uploadToken)));
  }

  @Get('upload-qr.png')
  async qrPng(@Res() res: Response): Promise<void> {
    const settings = await this.settings.getSettings();
    res.type('image/png').setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'attachment; filename="guest-upload-qr.png"');
    res.send(await this.qr.png(this.settings.uploadUrl(settings.uploadToken)));
  }

  @Get('upload-qr.pdf')
  async qrPdf(@Res() res: Response): Promise<void> {
    const [settings, event, celebrant] = await Promise.all([
      this.settings.getSettings(),
      this.settings.getEvent(),
      this.prisma.celebrant.findUnique({ where: { id: 1 } }),
    ]);
    const pdf = await this.qr.uploadPosterPdf({
      celebrantName: celebrant?.fullName ?? '',
      eventName: event.name,
      url: this.settings.uploadUrl(settings.uploadToken),
    });
    res.type('application/pdf').setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline; filename="guest-upload-poster.pdf"');
    res.send(pdf);
  }

  private async load(): Promise<SettingsWithMedia> {
    await this.settings.getSettings();
    return this.prisma.settings.findUniqueOrThrow({ where: { id: 1 }, include: { logoMedia: { select: PUBLIC_MEDIA_SELECT }, heroMedia: { select: PUBLIC_MEDIA_SELECT }, ogImageMedia: { select: PUBLIC_MEDIA_SELECT } } });
  }

  private toAdmin(s: SettingsWithMedia): AdminSettings {
    return {
      storageQuotaBytes: Number(s.storageQuotaBytes),
      maxPhotoBytes: s.maxPhotoBytes,
      maxVideoBytes: s.maxVideoBytes,
      videoUploadsEnabled: s.videoUploadsEnabled,
      uploadModerationEnabled: s.uploadModerationEnabled,
      guestUploadsOpen: s.guestUploadsOpen,
      maxFilesPerUpload: s.maxFilesPerUpload,
      guestUploadAlbumId: s.guestUploadAlbumId,
      uploadToken: s.uploadToken,
      uploadUrl: this.settings.uploadUrl(s.uploadToken),
      uploadTokenRotatedAt: s.uploadTokenRotatedAt.toISOString(),
      testimonialsOpen: s.testimonialsOpen,
      testimonialsRequireApproval: s.testimonialsRequireApproval,
      testimonialsAllowPhotos: s.testimonialsAllowPhotos,
      testimonialsAllowVideos: s.testimonialsAllowVideos,
      primaryColor: s.primaryColor,
      secondaryColor: s.secondaryColor,
      logoMediaId: s.logoMediaId,
      heroMediaId: s.heroMediaId,
      ogImageMediaId: s.ogImageMediaId,
      logo: publicMediaOrNull(s.logoMedia),
      hero: publicMediaOrNull(s.heroMedia),
      ogImage: publicMediaOrNull(s.ogImageMedia),
      siteTitle: s.siteTitle,
      siteDescription: s.siteDescription,
      isDemo: s.isDemo,
      quotaPresets: QUOTA_PRESETS,
    };
  }
}
