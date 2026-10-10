import { HttpStatus, Injectable } from '@nestjs/common';
import type { StorageSummary } from '@birthday/types';
import { AppException } from '../common/errors';
import { LOCK_KEYS, PrismaService, type Tx } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

export function storageLevel(percent: number): StorageSummary['level'] {
  if (percent >= 100) return 'FULL';
  if (percent >= 95) return 'CRITICAL';
  if (percent >= 80) return 'WARNING';
  return 'OK';
}

/**
 * Storage quota. Usage is the sum of bytes the server actually stored (originals plus
 * previews), recomputed from the media table, so it cannot drift from reality.
 */
@Injectable()
export class QuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async summary(client: PrismaService | Tx = this.prisma): Promise<StorageSummary> {
    const [settings, groups] = await Promise.all([
      this.settings.getSettings(client),
      client.media.groupBy({ by: ['kind'], _count: { _all: true }, _sum: { storedBytes: true, sizeBytes: true } }),
    ]);
    const quotaBytes = Number(settings.storageQuotaBytes);
    let usedBytes = 0;
    let photoBytes = 0;
    let videoBytes = 0;
    let photoCount = 0;
    let videoCount = 0;
    for (const group of groups) {
      const stored = Number(group._sum.storedBytes ?? 0);
      const originals = Number(group._sum.sizeBytes ?? 0);
      usedBytes += stored;
      if (group.kind === 'PHOTO') {
        photoBytes = originals;
        photoCount = group._count._all;
      } else {
        videoBytes = originals;
        videoCount = group._count._all;
      }
    }
    const percentUsed = quotaBytes > 0 ? Math.round((usedBytes / quotaBytes) * 1000) / 10 : 100;
    return {
      quotaBytes,
      usedBytes,
      remainingBytes: Math.max(0, quotaBytes - usedBytes),
      percentUsed,
      level: storageLevel(percentUsed),
      photoCount,
      videoCount,
      photoBytes,
      videoBytes,
      // Generated previews (thumbnails and web-sized copies).
      otherBytes: Math.max(0, usedBytes - photoBytes - videoBytes),
    };
  }

  /** Fails fast before accepting an upload when storage is already full. */
  async assertNotFull(): Promise<void> {
    const summary = await this.summary();
    if (summary.remainingBytes <= 0) throw this.quotaError();
  }

  /**
   * Inside a transaction, takes the storage lock and checks that `bytes` more fit.
   * Concurrent uploads queue on the lock, so two cannot both squeeze into the last gap.
   */
  async reserve(tx: Tx, bytes: number): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEYS.storage})`;
    const settings = await this.settings.getSettings(tx);
    const used = await tx.media.aggregate({ _sum: { storedBytes: true } });
    const usedBytes = Number(used._sum.storedBytes ?? 0);
    if (usedBytes + bytes > Number(settings.storageQuotaBytes)) throw this.quotaError();
  }

  quotaError(): AppException {
    return new AppException(
      HttpStatus.PAYLOAD_TOO_LARGE,
      'STORAGE_QUOTA_EXCEEDED',
      'The storage space for this celebration is full, so new uploads cannot be accepted.',
    );
  }
}
