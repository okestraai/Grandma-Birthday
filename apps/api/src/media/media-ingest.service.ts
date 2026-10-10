import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ApiErrorCode } from '@birthday/types';
import { AppException } from '../common/errors';
import { sanitizeFilename } from '../common/utils/text';
import { formatSize } from '../common/utils/bytes';
import type { Media, MediaSource, ModerationStatus, Settings } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { detectType, extensionMatches, PHOTO_MIME_TYPES, readHead, VIDEO_MIME_TYPES } from '../storage/file-inspector';
import { processPhoto } from '../storage/image-processor';
import { QuotaService } from '../storage/quota.service';
import { StorageService } from '../storage/storage.service';
import { UPLOAD_TMP_DIR } from './upload.interceptor';

export interface IngestOptions {
  source: MediaSource;
  status: ModerationStatus;
  settings: Settings;
  albumId?: string | null;
  caption?: string | null;
  altText?: string | null;
  uploadedById?: string | null;
  uploaderName?: string | null;
  uploaderMessage?: string | null;
  uploadSessionId?: string | null;
  /** Restrict to photos (e.g. portraits). */
  photosOnly?: boolean;
}

export interface IncomingFile {
  path: string;
  originalname: string;
}

export const ACCEPTED_MIME_TYPES = (settings: Pick<Settings, 'videoUploadsEnabled'>): string[] => [
  ...PHOTO_MIME_TYPES,
  ...(settings.videoUploadsEnabled ? VIDEO_MIME_TYPES : []),
];

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/**
 * The single path every stored file takes: sniff the real type, enforce size and video
 * rules from Settings, build previews, write to object storage, then reserve quota and
 * insert the row under the storage lock. If the quota check fails, the stored objects
 * are deleted again, so storage never holds files the database does not know about.
 */
@Injectable()
export class MediaIngestService {
  private readonly logger = new Logger('MediaIngest');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly quota: QuotaService,
  ) {}

  async ingest(file: IncomingFile, options: IngestOptions): Promise<Media> {
    const filename = sanitizeFilename(file.originalname);
    const detected = detectType(await readHead(file.path));
    if (!detected) {
      throw this.fail(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_FILE_TYPE', 'This is not a photo or video we can use. Please share JPEG, PNG, WebP, GIF or AVIF photos, or MP4, MOV or WebM videos.');
    }
    if (!extensionMatches(filename, detected.mime)) {
      throw this.fail(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_FILE_TYPE', 'The file name does not match its contents.');
    }
    if (detected.kind === 'VIDEO' && options.photosOnly) {
      throw this.fail(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_FILE_TYPE', 'Only photos are accepted here.');
    }
    if (detected.kind === 'VIDEO' && !options.settings.videoUploadsEnabled) {
      throw this.fail(HttpStatus.BAD_REQUEST, 'VIDEO_UPLOADS_DISABLED', 'Video uploads are turned off.');
    }

    const id = randomUUID();
    const now = new Date();
    const prefix = `media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}`;
    const keys: string[] = [];

    try {
      let sizeBytes: number;
      let storedBytes: number;
      let width: number | null = null;
      let height: number | null = null;
      let thumbKey: string | null = null;
      let mediumKey: string | null = null;
      let mime = detected.mime;
      let storageKey: string;
      let checksum: string;

      if (detected.kind === 'PHOTO') {
        const input = await readFile(file.path);
        if (input.length > options.settings.maxPhotoBytes) {
          throw this.fail(HttpStatus.PAYLOAD_TOO_LARGE, 'FILE_TOO_LARGE', `This photo is ${formatSize(input.length)}. Photos can be at most ${formatSize(options.settings.maxPhotoBytes)}.`);
        }
        checksum = createHash('sha256').update(input).digest('hex');
        const photo = await processPhoto(input, detected.mime);
        mime = photo.originalMime;
        width = photo.width;
        height = photo.height;
        const ext = mime === 'image/jpeg' ? 'jpg' : detected.extension;
        storageKey = `${prefix}/original.${ext}`;
        thumbKey = `${prefix}/thumb.webp`;
        mediumKey = `${prefix}/medium.webp`;
        await this.storage.putBuffer(storageKey, photo.original, mime);
        keys.push(storageKey);
        await this.storage.putBuffer(mediumKey, photo.medium, 'image/webp');
        keys.push(mediumKey);
        await this.storage.putBuffer(thumbKey, photo.thumb, 'image/webp');
        keys.push(thumbKey);
        sizeBytes = photo.original.length;
        storedBytes = photo.original.length + photo.medium.length + photo.thumb.length;
      } else {
        checksum = await sha256File(file.path);
        storageKey = `${prefix}/original.${detected.extension}`;
        const size = await this.storage.putFile(storageKey, file.path, mime);
        keys.push(storageKey);
        if (size > options.settings.maxVideoBytes) {
          throw this.fail(HttpStatus.PAYLOAD_TOO_LARGE, 'FILE_TOO_LARGE', `This video is ${formatSize(size)}. Videos can be at most ${formatSize(options.settings.maxVideoBytes)}.`);
        }
        sizeBytes = size;
        storedBytes = size;
      }

      return await this.prisma.$transaction(async (tx) => {
        await this.quota.reserve(tx, storedBytes);
        const sortOrder = options.albumId
          ? ((await tx.media.aggregate({ where: { albumId: options.albumId }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1
          : 0;
        return tx.media.create({
          data: {
            id,
            kind: detected.kind,
            source: options.source,
            status: options.status,
            originalFilename: filename,
            mimeType: mime,
            sizeBytes: BigInt(sizeBytes),
            storedBytes: BigInt(storedBytes),
            width,
            height,
            storageKey,
            thumbKey,
            mediumKey,
            checksum,
            caption: options.caption ?? null,
            altText: options.altText ?? null,
            albumId: options.albumId ?? null,
            sortOrder,
            uploadedById: options.uploadedById ?? null,
            uploaderName: options.uploaderName ?? null,
            uploaderMessage: options.uploaderMessage ?? null,
            uploadSessionId: options.uploadSessionId ?? null,
            reviewedAt: options.status === 'PENDING' ? null : now,
            reviewedById: options.status === 'PENDING' ? null : (options.uploadedById ?? null),
          },
        });
      });
    } catch (error) {
      if (keys.length) {
        await this.storage.deleteMany(keys).catch((e: Error) => this.logger.error(`Orphan cleanup failed for ${prefix}: ${e.message}`));
      }
      throw error;
    }
  }

  /** For seeding and server-generated files: writes the buffer to a temp file and ingests it. */
  async ingestBuffer(buffer: Buffer, originalname: string, options: IngestOptions): Promise<Media> {
    const path = join(UPLOAD_TMP_DIR, `buf-${randomUUID()}`);
    await writeFile(path, buffer);
    try {
      return await this.ingest({ path, originalname }, options);
    } finally {
      await unlink(path).catch(() => undefined);
    }
  }

  private fail(status: number, code: ApiErrorCode, message: string): AppException {
    return new AppException(status, code, message);
  }
}
