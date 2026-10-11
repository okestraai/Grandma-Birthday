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

/** Azure reports a container that no longer exists with this code (HTTP 404). */
function isContainerMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ContainerNotFound';
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
  /** Memoised container check; null means "not verified yet, try again". */
  private ready: Promise<void> | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const service = BlobServiceClient.fromConnectionString(config.storage.connectionString);
    this.container = service.getContainerClient(config.storage.container);
  }

  /**
   * Makes sure the private container exists, remembering success so the check costs nothing
   * on the usual path. A failure clears the memo, so the next call tries again instead of
   * leaving the service permanently broken.
   *
   * This has to be lazy rather than startup-only. If the storage endpoint is unreachable or
   * empty when the API boots, a startup-only check leaves `ping()` reporting storage down for
   * the whole life of the process, and the only cure is restarting the API by hand. Retrying
   * on demand lets the API recover by itself as soon as storage answers again.
   */
  private ensureContainer(): Promise<void> {
    this.ready ??= this.container
      .createIfNotExists()
      .then((created) => {
        if (created.succeeded) this.logger.log(`Created container "${this.config.storage.container}"`);
      })
      .catch((error: unknown) => {
        this.ready = null; // let the next caller retry
        throw error;
      });
    return this.ready;
  }

  /** Creates the private container if missing (development). In production it should already exist. */
  async onModuleInit(): Promise<void> {
    if (this.config.nodeEnv === 'test') return;
    try {
      await this.ensureContainer();
    } catch (error) {
      // Not fatal: the container is re-checked on the next upload or health check.
      this.logger.error(
        `Container "${this.config.storage.container}" is not reachable: ${(error as Error).message}. Retrying when it is next used.`,
      );
    }
  }

  /**
   * Runs a write, recreating the container and retrying once if it has vanished. Storage that
   * restarts empty would otherwise fail every upload until the API is restarted by hand.
   */
  private async withContainer<T>(write: () => Promise<T>): Promise<T> {
    await this.ensureContainer();
    try {
      return await write();
    } catch (error) {
      if (!isContainerMissing(error)) throw error;
      this.ready = null;
      await this.ensureContainer();
      return write();
    }
  }

  async putBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.withContainer(() =>
      this.container.getBlockBlobClient(key).uploadData(body, {
        blobHTTPHeaders: { blobContentType: contentType },
      }),
    );
  }

  /** Streams a file from disk in blocks (large videos never sit in memory). Returns its size. */
  async putFile(key: string, path: string, contentType: string): Promise<number> {
    const { size } = await stat(path);
    await this.withContainer(() =>
      this.container.getBlockBlobClient(key).uploadFile(path, {
        blockSize: 8 * 1024 * 1024,
        concurrency: 4,
        blobHTTPHeaders: { blobContentType: contentType },
      }),
    );
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
      if (await this.container.exists()) return true;
      // The container is gone, which means storage was reset underneath us. Drop the memo
      // and recreate it, so readiness recovers on its own instead of needing a restart.
      this.ready = null;
      await this.ensureContainer();
      return await this.container.exists();
    } catch {
      return false;
    }
  }
}
