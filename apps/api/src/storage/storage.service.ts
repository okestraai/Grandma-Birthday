import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import { stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { APP_CONFIG, type AppConfig } from '../config/app-config';

export interface StoredObject {
  body: Readable;
  contentLength: number | undefined;
  contentRange: string | undefined;
  contentType: string | undefined;
  etag: string | undefined;
  lastModified: Date | undefined;
}

export class ObjectNotFoundError extends Error {}

/** Parses an HTTP Range header ("bytes=start-end") into Azure's offset/count form. */
export function parseRange(range: string | undefined): { offset: number; count?: number } | null {
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (match[1] === '' && match[2] === '')) return null;
  if (match[1] === '') return null; // suffix ranges ("bytes=-500") are served in full
  const offset = Number(match[1]);
  const end = match[2] === '' ? undefined : Number(match[2]);
  if (end !== undefined && end < offset) return null;
  return { offset, count: end === undefined ? undefined : end - offset + 1 };
}

/**
 * Object storage on Azure Blob Storage (Azurite locally). The container is private:
 * files are only served through the API, which checks moderation status first.
 * The connection string never leaves the server.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger('Storage');
  private readonly container: ContainerClient;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const service = BlobServiceClient.fromConnectionString(config.storage.connectionString);
    this.container = service.getContainerClient(config.storage.container);
  }

  /** Creates the private container if missing (development). In production it should already exist. */
  async onModuleInit(): Promise<void> {
    if (this.config.nodeEnv === 'test') return;
    try {
      const created = await this.container.createIfNotExists();
      if (created.succeeded) this.logger.log(`Created container "${this.config.storage.container}"`);
    } catch (error) {
      this.logger.error(
        `Container "${this.config.storage.container}" is not reachable: ${(error as Error).message}. Uploads will fail until it is.`,
      );
    }
  }

  async putBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.container.getBlockBlobClient(key).uploadData(body, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
  }

  /** Streams a file from disk in blocks (large videos never sit in memory). Returns its size. */
  async putFile(key: string, path: string, contentType: string): Promise<number> {
    const { size } = await stat(path);
    await this.container.getBlockBlobClient(key).uploadFile(path, {
      blockSize: 8 * 1024 * 1024,
      concurrency: 4,
      blobHTTPHeaders: { blobContentType: contentType },
    });
    return size;
  }

  async get(key: string, range?: string): Promise<StoredObject> {
    const parsed = parseRange(range);
    try {
      const out = await this.container.getBlobClient(key).download(parsed?.offset ?? 0, parsed?.count);
      return {
        body: out.readableStreamBody as Readable,
        contentLength: out.contentLength,
        contentRange: parsed ? out.contentRange : undefined,
        contentType: out.contentType,
        etag: out.etag,
        lastModified: out.lastModified,
      };
    } catch (error) {
      if (error instanceof RestError && error.statusCode === 404) throw new ObjectNotFoundError(key);
      throw error;
    }
  }

  async getBuffer(key: string): Promise<Buffer> {
    try {
      return await this.container.getBlobClient(key).downloadToBuffer();
    } catch (error) {
      if (error instanceof RestError && error.statusCode === 404) throw new ObjectNotFoundError(key);
      throw error;
    }
  }

  /** Deletes blobs (and their snapshots). Missing blobs are ignored. */
  async deleteMany(keys: (string | null | undefined)[]): Promise<void> {
    const list = keys.filter((k): k is string => Boolean(k));
    for (let i = 0; i < list.length; i += 10) {
      await Promise.all(
        list.slice(i, i + 10).map((key) => this.container.getBlobClient(key).deleteIfExists({ deleteSnapshots: 'include' })),
      );
    }
  }

  async ping(): Promise<boolean> {
    try {
      return await this.container.exists();
    } catch {
      return false;
    }
  }
}
