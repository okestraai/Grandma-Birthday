import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { AdminTestimonial, BulkResult, Paginated, PublicTestimonial, SubmitTestimonialResult, TestimonialCounts, TestimonialFilter } from '@birthday/types';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { AppException, Errors } from '../common/errors';
import type { RequestMeta } from '../common/request-context';
import { hashIp } from '../common/utils/crypto';
import { paginated, skipTake } from '../common/utils/pagination';
import { Prisma, type ModerationStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaIngestService } from '../media/media-ingest.service';
import { MediaService } from '../media/media.service';
import { PUBLIC_MEDIA_SELECT, publicMediaOrNull, toPublicMedia } from '../media/media.mapper';
import { MailService } from '../notifications/mail.service';
import { adminNotificationEmail, testimonialReceivedEmail } from '../notifications/templates';
import { SettingsService } from '../settings/settings.service';

const INCLUDE = {
  photoMedia: { select: PUBLIC_MEDIA_SELECT },
  videoMedia: { select: PUBLIC_MEDIA_SELECT },
  reviewedBy: { select: { name: true } },
} satisfies Prisma.TestimonialInclude;
type Row = Prisma.TestimonialGetPayload<{ include: typeof INCLUDE }>;

function toPublic(t: Row): PublicTestimonial {
  return {
    id: t.id,
    authorName: t.authorName,
    relationship: t.relationship,
    message: t.message,
    isFeatured: t.isFeatured,
    photo: publicMediaOrNull(t.photoMedia),
    video: publicMediaOrNull(t.videoMedia),
    createdAt: t.createdAt.toISOString(),
  };
}

function toAdmin(t: Row): AdminTestimonial {
  return {
    ...toPublic(t),
    // Admins see attached media whatever its moderation status.
    photo: t.photoMedia ? toPublicMedia(t.photoMedia) : null,
    video: t.videoMedia ? toPublicMedia(t.videoMedia) : null,
    email: t.email,
    fromRsvp: t.guestId !== null,
    status: t.status,
    isPublic: t.isPublic,
    sortOrder: t.sortOrder,
    reviewedAt: t.reviewedAt?.toISOString() ?? null,
    reviewedByName: t.reviewedBy?.name ?? null,
    editedAt: t.editedAt?.toISOString() ?? null,
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function filterWhere(filter: TestimonialFilter | undefined): Prisma.TestimonialWhereInput {
  switch (filter) {
    case 'pending':
      return { status: 'PENDING' };
    case 'approved':
      return { status: 'APPROVED' };
    case 'rejected':
      return { status: 'REJECTED' };
    case 'featured':
      return { isFeatured: true };
    case 'public':
      return { isPublic: true };
    default:
      return {};
  }
}

/**
 * Applies the moderation rules to a requested change and returns the fields to write.
 * - Approving never publishes; isPublic is a separate, explicit choice.
 * - Public/featured are only allowed while APPROVED; featuring also makes it public.
 * - Leaving APPROVED clears public and featured; unpublishing also unfeatures.
 */
export function applyModerationRules(
  current: { status: ModerationStatus; isPublic: boolean; isFeatured: boolean },
  change: { status?: ModerationStatus; isPublic?: boolean; isFeatured?: boolean },
): { status: ModerationStatus; isPublic: boolean; isFeatured: boolean } {
  const status = change.status ?? current.status;
  let isPublic = change.isPublic ?? current.isPublic;
  let isFeatured = change.isFeatured ?? current.isFeatured;
  if (status !== 'APPROVED') {
    if (change.isPublic === true || change.isFeatured === true) {
      throw new AppException(HttpStatus.CONFLICT, 'TESTIMONIAL_NOT_APPROVED', 'Approve this message before showing it on the public website.');
    }
    return { status, isPublic: false, isFeatured: false };
  }
  if (change.isFeatured === true) isPublic = true;
  if (change.isPublic === false) isFeatured = false;
  if (!isPublic) isFeatured = false;
  return { status, isPublic, isFeatured };
}

@Injectable()
export class TestimonialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly ingest: MediaIngestService,
    private readonly media: MediaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async listPublic(query: { page: number; pageSize: number }): Promise<Paginated<PublicTestimonial>> {
    const where: Prisma.TestimonialWhereInput = { status: 'APPROVED', isPublic: true };
    const [rows, total] = await Promise.all([
      this.prisma.testimonial.findMany({ where, include: INCLUDE, orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }], ...skipTake(query) }),
      this.prisma.testimonial.count({ where }),
    ]);
    return paginated(rows.map(toPublic), total, query);
  }

  async submit(
    fields: { authorName: string; relationship?: string; email?: string; message: string },
    files: { photo?: Express.Multer.File; video?: Express.Multer.File },
    meta: RequestMeta,
  ): Promise<SubmitTestimonialResult> {
    const settings = await this.settings.getSettings();
    if (!settings.testimonialsOpen) throw new AppException(HttpStatus.FORBIDDEN, 'TESTIMONIALS_CLOSED', 'Birthday messages are closed at the moment.');
    if (files.photo && !settings.testimonialsAllowPhotos) throw Errors.validation({ photo: ['Photos are not accepted with messages.'] });
    if (files.video && !settings.testimonialsAllowVideos) throw Errors.validation({ video: ['Videos are not accepted with messages.'] });

    const status: ModerationStatus = settings.testimonialsRequireApproval ? 'PENDING' : 'APPROVED';
    const photo = files.photo
      ? await this.ingest.ingest(files.photo, { source: 'TESTIMONIAL', status, settings, photosOnly: true, uploaderName: fields.authorName })
      : null;
    let video = null;
    if (files.video) {
      try {
        video = await this.ingest.ingest(files.video, { source: 'TESTIMONIAL', status, settings: { ...settings, videoUploadsEnabled: true }, uploaderName: fields.authorName });
        if (video.kind !== 'VIDEO') {
          await this.media.deleteMany([video.id]);
          throw Errors.validation({ video: ['Attach a video file here.'] });
        }
      } catch (error) {
        if (photo) await this.media.deleteMany([photo.id]);
        throw error;
      }
    }

    const testimonial = await this.prisma.testimonial.create({
      data: {
        authorName: fields.authorName,
        relationship: fields.relationship || null,
        email: fields.email || null,
        message: fields.message,
        status,
        photoMediaId: photo?.id ?? null,
        videoMediaId: video?.id ?? null,
        ipHash: hashIp(meta.ip, this.config.auth.refreshSecret),
      },
    });
    await this.audit.record({ ...meta, actor: null }, { action: 'GUEST_SUBMITTED_TESTIMONIAL', entityType: 'Testimonial', entityId: testimonial.id });

    const celebrant = await this.prisma.celebrant.findUnique({ where: { id: 1 } });
    if (fields.email) void this.mail.send(fields.email, testimonialReceivedEmail({ authorName: fields.authorName, celebrantName: celebrant?.fullName ?? '' }));
    this.mail.notifyAdmin(
      adminNotificationEmail({
        title: 'New birthday message',
        lines: [`${fields.authorName}${fields.relationship ? ` (${fields.relationship})` : ''} left a message.`, status === 'PENDING' ? 'It is waiting for your review.' : 'It was approved automatically but is not public yet.'],
        url: `${this.config.publicWebUrl}/admin/testimonials?filter=pending`,
      }),
    );

    return {
      id: testimonial.id,
      status,
      message:
        status === 'PENDING'
          ? 'Thank you. Your message will appear once the family has reviewed it.'
          : 'Thank you. Your message has been received.',
    };
  }

  async listAdmin(query: { page: number; pageSize: number; filter?: TestimonialFilter; q?: string }): Promise<Paginated<AdminTestimonial>> {
    const q = query.q?.trim();
    const where: Prisma.TestimonialWhereInput = {
      ...filterWhere(query.filter),
      OR: q
        ? [
            { authorName: { contains: q, mode: 'insensitive' } },
            { relationship: { contains: q, mode: 'insensitive' } },
            { message: { contains: q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.testimonial.findMany({ where, include: INCLUDE, orderBy: [{ createdAt: 'desc' }], ...skipTake(query) }),
      this.prisma.testimonial.count({ where }),
    ]);
    return paginated(rows.map(toAdmin), total, query);
  }

  async counts(): Promise<TestimonialCounts> {
    const [all, pending, approved, rejected, featured, pub] = await Promise.all(
      (['all', 'pending', 'approved', 'rejected', 'featured', 'public'] as const).map((f) => this.prisma.testimonial.count({ where: filterWhere(f) })),
    );
    return { all, pending, approved, rejected, featured, public: pub };
  }

  async update(
    id: string,
    dto: { status?: ModerationStatus; isPublic?: boolean; isFeatured?: boolean; authorName?: string; relationship?: string | null; message?: string; sortOrder?: number },
    meta: RequestMeta,
  ): Promise<AdminTestimonial> {
    const current = await this.prisma.testimonial.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('Testimonial');
    const next = applyModerationRules(current, dto);
    const edited = dto.authorName !== undefined || dto.relationship !== undefined || dto.message !== undefined;
    const statusChanged = next.status !== current.status;

    await this.prisma.$transaction(async (tx) => {
      await tx.testimonial.update({
        where: { id },
        data: {
          ...next,
          authorName: dto.authorName,
          relationship: dto.relationship,
          message: dto.message,
          sortOrder: dto.sortOrder,
          editedAt: edited ? new Date() : undefined,
          reviewedAt: statusChanged ? new Date() : undefined,
          reviewedById: statusChanged ? (meta.actor?.id ?? null) : undefined,
        },
      });
      // Attached media follow the testimonial's moderation status.
      if (statusChanged) {
        const mediaIds = [current.photoMediaId, current.videoMediaId].filter((m): m is string => Boolean(m));
        if (mediaIds.length) await tx.media.updateMany({ where: { id: { in: mediaIds } }, data: { status: next.status, reviewedAt: new Date() } });
      }
    });

    const action = statusChanged
      ? next.status === 'APPROVED'
        ? 'ADMIN_APPROVED_TESTIMONIAL'
        : next.status === 'REJECTED'
          ? 'ADMIN_REJECTED_TESTIMONIAL'
          : 'ADMIN_UPDATED_TESTIMONIAL'
      : next.isPublic !== current.isPublic
        ? next.isPublic
          ? 'ADMIN_PUBLISHED_TESTIMONIAL'
          : 'ADMIN_UNPUBLISHED_TESTIMONIAL'
        : 'ADMIN_UPDATED_TESTIMONIAL';
    await this.audit.record(meta, { action, entityType: 'Testimonial', entityId: id, metadata: { ...next, edited } });
    return toAdmin(await this.prisma.testimonial.findUniqueOrThrow({ where: { id }, include: INCLUDE }));
  }

  async remove(id: string, meta: RequestMeta): Promise<void> {
    const current = await this.prisma.testimonial.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('Testimonial');
    await this.prisma.testimonial.delete({ where: { id } });
    await this.media.deleteMany([current.photoMediaId, current.videoMediaId].filter((m): m is string => Boolean(m)));
    await this.audit.record(meta, { action: 'ADMIN_DELETED_TESTIMONIAL', entityType: 'Testimonial', entityId: id });
  }

  async bulk(ids: string[], action: 'APPROVE' | 'REJECT' | 'DELETE' | 'PUBLISH' | 'UNPUBLISH', meta: RequestMeta): Promise<BulkResult> {
    let affected = 0;
    for (const id of [...new Set(ids)]) {
      try {
        if (action === 'DELETE') await this.remove(id, meta);
        else {
          const change =
            action === 'APPROVE' ? { status: 'APPROVED' as const } : action === 'REJECT' ? { status: 'REJECTED' as const } : { isPublic: action === 'PUBLISH' };
          await this.update(id, change, meta);
        }
        affected++;
      } catch (error) {
        // Skip items the rules refuse (e.g. publishing an unapproved message); report the count.
        if (!(error instanceof AppException)) throw error;
      }
    }
    return { affected };
  }
}
