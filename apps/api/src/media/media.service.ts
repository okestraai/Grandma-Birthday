import { Injectable, Logger } from '@nestjs/common';
import type { AdminMedia, BulkResult, MediaModerationStats, Paginated, PublicMedia } from '@birthday/types';
import { Errors } from '../common/errors';
import type { RequestMeta } from '../common/request-context';
import { paginated, skipTake } from '../common/utils/pagination';
import { Prisma, type Media } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QuotaService } from '../storage/quota.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { ADMIN_MEDIA_INCLUDE, PUBLIC_MEDIA_SELECT, toAdminMedia, toPublicMedia } from './media.mapper';
import type { AdminMediaQuery, BulkMediaDto, PublicMediaQuery, UpdateMediaDto } from './media.dto';

@Injectable()
export class MediaService {
  private readonly logger = new Logger('Media');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly quota: QuotaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  // ---- Public ---------------------------------------------------------------

  async listPublic(query: PublicMediaQuery): Promise<Paginated<PublicMedia>> {
    const where: Prisma.MediaWhereInput = {
      status: 'APPROVED',
      kind: query.kind,
      album: query.album ? { slug: query.album, isPublished: true } : { isPublished: true },
    };
    const [rows, total] = await Promise.all([
      this.prisma.media.findMany({ where, select: PUBLIC_MEDIA_SELECT, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], ...skipTake(query) }),
      this.prisma.media.count({ where }),
    ]);
    return paginated(rows.map(toPublicMedia), total, query);
  }

  async findForServing(id: string): Promise<(Media & { album: { isPublished: boolean } | null }) | null> {
    return this.prisma.media.findUnique({ where: { id }, include: { album: { select: { isPublished: true } } } });
  }

  // ---- Admin ----------------------------------------------------------------

  async listAdmin(query: AdminMediaQuery): Promise<Paginated<AdminMedia>> {
    const q = query.q?.trim();
    const where: Prisma.MediaWhereInput = {
      status: query.status,
      source: query.source,
      kind: query.kind,
      albumId: query.albumId === 'none' ? null : query.albumId,
      OR: q
        ? [
            { originalFilename: { contains: q, mode: 'insensitive' } },
            { caption: { contains: q, mode: 'insensitive' } },
            { uploaderName: { contains: q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const orderBy: Prisma.MediaOrderByWithRelationInput[] =
      query.sort === 'oldest'
        ? [{ createdAt: 'asc' }]
        : query.sort === 'largest'
          ? [{ storedBytes: 'desc' }]
          : query.sort === 'order'
            ? [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
            : [{ createdAt: 'desc' }];
    const [rows, total] = await Promise.all([
      this.prisma.media.findMany({ where, orderBy, include: ADMIN_MEDIA_INCLUDE, ...skipTake(query) }),
      this.prisma.media.count({ where }),
    ]);
    return paginated(rows.map(toAdminMedia), total, query);
  }

  async getAdmin(id: string): Promise<AdminMedia> {
    const media = await this.prisma.media.findUnique({ where: { id }, include: ADMIN_MEDIA_INCLUDE });
    if (!media) throw Errors.notFound('Media');
    return toAdminMedia(media);
  }

  async stats(): Promise<MediaModerationStats> {
    const [guest, all, storage] = await Promise.all([
      this.prisma.media.groupBy({ by: ['status'], where: { source: 'GUEST_UPLOAD' }, _count: { _all: true } }),
      this.prisma.media.groupBy({ by: ['status'], _count: { _all: true } }),
      this.quota.summary(),
    ]);
    const shape = (groups: { status: string; _count: { _all: number } }[]) => ({
      pending: groups.find((g) => g.status === 'PENDING')?._count._all ?? 0,
      approved: groups.find((g) => g.status === 'APPROVED')?._count._all ?? 0,
      rejected: groups.find((g) => g.status === 'REJECTED')?._count._all ?? 0,
    });
    return { guestUploads: shape(guest), all: shape(all), storage };
  }

  async update(id: string, dto: UpdateMediaDto, meta: RequestMeta): Promise<AdminMedia> {
    const existing = await this.prisma.media.findUnique({ where: { id } });
    if (!existing) throw Errors.notFound('Media');
    if (dto.albumId) await this.assertAlbum(dto.albumId);
    const statusChanged = dto.status !== undefined && dto.status !== existing.status;
    await this.prisma.media.update({
      where: { id },
      data: {
        caption: dto.caption,
        altText: dto.altText,
        albumId: dto.albumId,
        sortOrder: dto.sortOrder,
        status: dto.status,
        reviewedAt: statusChanged ? new Date() : undefined,
        reviewedById: statusChanged ? meta.actor?.id : undefined,
      },
    });
    await this.audit.record(meta, {
      action: statusChanged ? (dto.status === 'APPROVED' ? 'ADMIN_APPROVED_MEDIA' : dto.status === 'REJECTED' ? 'ADMIN_REJECTED_MEDIA' : 'ADMIN_UPDATED_MEDIA') : 'ADMIN_UPDATED_MEDIA',
      entityType: 'Media',
      entityId: id,
      metadata: { fields: Object.keys(dto) },
    });
    return this.getAdmin(id);
  }

  async remove(id: string, meta: RequestMeta): Promise<void> {
    const deleted = await this.deleteMany([id]);
    if (deleted === 0) throw Errors.notFound('Media');
    await this.audit.record(meta, { action: 'ADMIN_DELETED_MEDIA', entityType: 'Media', entityId: id });
  }

  async bulk(dto: BulkMediaDto, meta: RequestMeta): Promise<BulkResult> {
    const ids = [...new Set(dto.ids)];
    if (dto.albumId) await this.assertAlbum(dto.albumId);

    if (dto.action === 'DELETE') {
      const affected = await this.deleteMany(ids);
      await this.audit.record(meta, { action: 'ADMIN_DELETED_MEDIA', entityType: 'Media', metadata: { ids, affected } });
      return { affected };
    }

    if (dto.action === 'MOVE') {
      if (dto.albumId === undefined) throw Errors.validation({ albumId: ['Choose an album (or none) to move to.'] });
      const affected = await this.moveToAlbum(ids, dto.albumId);
      await this.audit.record(meta, { action: 'ADMIN_MOVED_MEDIA', entityType: 'Media', metadata: { ids, albumId: dto.albumId, affected } });
      return { affected };
    }

    if (dto.action === 'REJECT') {
      const { count } = await this.prisma.media.updateMany({
        where: { id: { in: ids } },
        data: { status: 'REJECTED', reviewedAt: new Date(), reviewedById: meta.actor?.id ?? null },
      });
      await this.audit.record(meta, { action: 'ADMIN_REJECTED_MEDIA', entityType: 'Media', metadata: { ids, affected: count } });
      return { affected: count };
    }

    // APPROVE: optionally into an album; guest uploads with no album go to the default guest album.
    const settings = await this.settings.getSettings();
    const affected = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.media.updateMany({
        where: { id: { in: ids } },
        data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: meta.actor?.id ?? null },
      });
      if (dto.albumId) {
        await this.moveToAlbum(ids, dto.albumId, tx);
      } else if (settings.guestUploadAlbumId) {
        const homeless = await tx.media.findMany({ where: { id: { in: ids }, albumId: null, source: 'GUEST_UPLOAD' }, select: { id: true } });
        if (homeless.length) await this.moveToAlbum(homeless.map((m) => m.id), settings.guestUploadAlbumId, tx);
      }
      return count;
    });
    await this.audit.record(meta, { action: 'ADMIN_APPROVED_MEDIA', entityType: 'Media', metadata: { ids, albumId: dto.albumId ?? null, affected } });
    return { affected };
  }

  /** Appends the media to the end of the album (or detaches them when albumId is null). */
  private async moveToAlbum(ids: string[], albumId: string | null, client: Prisma.TransactionClient = this.prisma): Promise<number> {
    if (albumId === null) {
      const { count } = await client.media.updateMany({ where: { id: { in: ids } }, data: { albumId: null } });
      return count;
    }
    const max = (await client.media.aggregate({ where: { albumId }, _max: { sortOrder: true } }))._max.sortOrder ?? -1;
    const rows = await client.media.findMany({ where: { id: { in: ids } }, select: { id: true, albumId: true }, orderBy: { createdAt: 'asc' } });
    const moving = rows.filter((row) => row.albumId !== albumId);
    if (!moving.length) return rows.length;
    // Each row gets its own sort order, so one UPDATE ... FROM (VALUES ...) sets them all.
    const values = Prisma.join(moving.map((row, i) => Prisma.sql`(${row.id}::uuid, ${max + 1 + i}::int)`));
    await client.$executeRaw`
      UPDATE "media" AS m SET "album_id" = ${albumId}::uuid, "sort_order" = v.sort_order, "updated_at" = now()
      FROM (VALUES ${values}) AS v(id, sort_order)
      WHERE m."id" = v.id`;
    return rows.length;
  }

  /** Deletes rows first, then the stored objects. Returns how many rows were deleted. */
  async deleteMany(ids: string[]): Promise<number> {
    const rows = await this.prisma.media.findMany({ where: { id: { in: ids } }, select: { id: true, storageKey: true, thumbKey: true, mediumKey: true } });
    if (!rows.length) return 0;
    await this.prisma.media.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    try {
      await this.storage.deleteMany(rows.flatMap((r) => [r.storageKey, r.thumbKey, r.mediumKey]));
    } catch (error) {
      this.logger.error(`Deleted ${rows.length} media rows but some stored files remain: ${(error as Error).message}`);
    }
    return rows.length;
  }

  async reorderAlbum(albumId: string, ids: string[], meta: RequestMeta): Promise<void> {
    await this.assertAlbum(albumId);
    await this.prisma.$transaction(
      ids.map((id, index) => this.prisma.media.updateMany({ where: { id, albumId }, data: { sortOrder: index } })),
    );
    await this.audit.record(meta, { action: 'ADMIN_UPDATED_MEDIA', entityType: 'Album', entityId: albumId, metadata: { reordered: ids.length } });
  }

  private async assertAlbum(albumId: string): Promise<void> {
    const album = await this.prisma.album.findUnique({ where: { id: albumId }, select: { id: true } });
    if (!album) throw Errors.validation({ albumId: ['That album does not exist.'] });
  }
}
