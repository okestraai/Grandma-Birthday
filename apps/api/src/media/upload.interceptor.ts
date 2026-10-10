import { CallHandler, ExecutionContext, HttpStatus, Injectable, mixin, NestInterceptor, Type } from '@nestjs/common';
import multer, { MulterError } from 'multer';
import { mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import { finalize, type Observable } from 'rxjs';
import { AppException } from '../common/errors';
import { formatSize } from '../common/utils/bytes';
import type { Settings } from '../generated/prisma/client';
import { SettingsService } from '../settings/settings.service';
import { QuotaService } from '../storage/quota.service';

export const UPLOAD_TMP_DIR = join(tmpdir(), 'birthday-uploads');
mkdirSync(UPLOAD_TMP_DIR, { recursive: true });

export interface UploadFieldSpec {
  name: string;
  maxCount: number | 'settings';
}

/**
 * Multipart parsing whose limits come from the live admin Settings (not fixed at boot).
 * Files stream to a private temp directory; oversize files abort mid-stream. Temp files are
 * always deleted when the request finishes. Uploads are refused up front when storage is full.
 */
export function UploadInterceptor(fields: UploadFieldSpec[]): Type<NestInterceptor> {
  @Injectable()
  class MixinUploadInterceptor implements NestInterceptor {
    constructor(
      private readonly settings: SettingsService,
      private readonly quota: QuotaService,
    ) {}

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
      const http = context.switchToHttp();
      const req = http.getRequest<Request>();
      const res = http.getResponse<Response>();

      await this.quota.assertNotFull();
      const settings = await this.settings.getSettings();
      const maxFileBytes = Math.max(settings.maxPhotoBytes, settings.videoUploadsEnabled ? settings.maxVideoBytes : 0);
      const maxFiles = fields.reduce((sum, f) => sum + (f.maxCount === 'settings' ? settings.maxFilesPerUpload : f.maxCount), 0);

      const parser = multer({
        storage: multer.diskStorage({ destination: UPLOAD_TMP_DIR }),
        limits: { fileSize: maxFileBytes, files: maxFiles, fields: 20, fieldSize: 16 * 1024, parts: maxFiles + 20 },
      }).fields(fields.map((f) => ({ name: f.name, maxCount: f.maxCount === 'settings' ? settings.maxFilesPerUpload : f.maxCount })));

      try {
        await new Promise<void>((resolve, reject) => parser(req, res, (err: unknown) => (err ? reject(err) : resolve())));
      } catch (error) {
        await cleanup(req);
        throw toAppError(error, settings, maxFiles);
      }

      return next.handle().pipe(finalize(() => void cleanup(req)));
    }
  }
  return mixin(MixinUploadInterceptor);
}

function allFiles(req: Request): Express.Multer.File[] {
  const files = req.files as Record<string, Express.Multer.File[]> | Express.Multer.File[] | undefined;
  if (!files) return [];
  return Array.isArray(files) ? files : Object.values(files).flat();
}

async function cleanup(req: Request): Promise<void> {
  await Promise.all(allFiles(req).map((f) => unlink(f.path).catch(() => undefined)));
}

function toAppError(error: unknown, settings: Settings, maxFiles: number): unknown {
  if (error instanceof MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE': {
        const limits = settings.videoUploadsEnabled
          ? `Photos can be up to ${formatSize(settings.maxPhotoBytes)} and videos up to ${formatSize(settings.maxVideoBytes)}.`
          : `Photos can be up to ${formatSize(settings.maxPhotoBytes)}.`;
        return new AppException(HttpStatus.PAYLOAD_TOO_LARGE, 'FILE_TOO_LARGE', `One of your files is too big. ${limits} Please remove it and try again.`);
      }
      case 'LIMIT_FILE_COUNT':
        return new AppException(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', `You can share up to ${maxFiles} ${maxFiles === 1 ? 'file' : 'files'} at a time. Please choose fewer and try again.`);
      case 'LIMIT_UNEXPECTED_FILE':
        return new AppException(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', `Please send at most ${maxFiles} ${maxFiles === 1 ? 'file' : 'files'} at a time, using the upload button.`);
      default:
        return new AppException(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'The upload could not be read.');
    }
  }
  if (error instanceof Error && /Multipart|Unexpected end of form|boundary/i.test(error.message)) {
    return new AppException(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'The upload was interrupted or is not valid multipart data.');
  }
  return error;
}

export function uploadedFiles(req: Request, field: string): Express.Multer.File[] {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return files?.[field] ?? [];
}
