import { Injectable, Logger } from '@nestjs/common';
import type { AuditLogEntry } from '@birthday/types';
import { Prisma } from '../generated/prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import type { RequestMeta } from '../common/request-context';

export type AuditAction =
  | 'ADMIN_LOGGED_IN'
  | 'ADMIN_LOGIN_FAILED'
  | 'ADMIN_ACCOUNT_LOCKED'
  | 'ADMIN_LOGGED_OUT'
  | 'ADMIN_PASSWORD_CHANGED'
  | 'ADMIN_PASSWORD_RESET'
  | 'REFRESH_TOKEN_REUSE_DETECTED'
  | 'ADMIN_CREATED_USER'
  | 'ADMIN_UPDATED_USER'
  | 'ADMIN_DELETED_USER'
  | 'ADMIN_CHANGED_EVENT_SETTINGS'
  | 'ADMIN_CHANGED_EVENT'
  | 'ADMIN_CHANGED_SETTINGS'
  | 'ADMIN_ROTATED_UPLOAD_TOKEN'
  | 'ADMIN_UPDATED_CELEBRANT'
  | 'ADMIN_CHANGED_TIMELINE'
  | 'ADMIN_CHANGED_FAMILY'
  | 'ADMIN_CHANGED_ALBUM'
  | 'ADMIN_CHANGED_PROGRAMME'
  | 'ADMIN_UPLOADED_MEDIA'
  | 'ADMIN_UPDATED_MEDIA'
  | 'ADMIN_APPROVED_MEDIA'
  | 'ADMIN_REJECTED_MEDIA'
  | 'ADMIN_DELETED_MEDIA'
  | 'ADMIN_MOVED_MEDIA'
  | 'ADMIN_APPROVED_TESTIMONIAL'
  | 'ADMIN_REJECTED_TESTIMONIAL'
  | 'ADMIN_UPDATED_TESTIMONIAL'
  | 'ADMIN_PUBLISHED_TESTIMONIAL'
  | 'ADMIN_UNPUBLISHED_TESTIMONIAL'
  | 'ADMIN_DELETED_TESTIMONIAL'
  | 'ADMIN_CREATED_GUEST'
  | 'ADMIN_UPDATED_GUEST'
  | 'ADMIN_DELETED_GUEST'
  | 'ADMIN_OVERRODE_CAPACITY'
  | 'ADMIN_CHANGED_GUEST_CATEGORY'
  | 'ADMIN_CHANGED_RSVP_QUESTION'
  | 'ADMIN_SENT_INVITATION'
  | 'ADMIN_REVOKED_INVITATION'
  | 'ADMIN_REINSTATED_INVITATION'
  | 'ADMIN_REGENERATED_INVITATION'
  | 'ADMIN_CHECKED_IN_GUEST'
  | 'ADMIN_REVERSED_CHECK_IN'
  | 'GUEST_SUBMITTED_RSVP'
  | 'GUEST_UPLOADED_MEDIA'
  | 'GUEST_SUBMITTED_TESTIMONIAL';

export interface AuditRecord {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a sensitive action. Pass `tx` to write inside the caller's transaction so the
   * audit row commits (or rolls back) with the change. Without `tx`, a failure is logged, not thrown.
   */
  async record(meta: RequestMeta | null, record: AuditRecord, tx?: Tx): Promise<void> {
    const data: Prisma.AuditLogUncheckedCreateInput = {
      action: record.action,
      entityType: record.entityType,
      entityId: record.entityId ?? null,
      actorId: meta?.actor?.id ?? null,
      actorEmail: meta?.actor?.email ?? null,
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
      metadata: (record.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    };
    if (tx) {
      await tx.auditLog.create({ data });
      return;
    }
    try {
      await this.prisma.auditLog.create({ data });
    } catch (error) {
      this.logger.error(`Could not write audit record ${record.action}: ${(error as Error).message}`);
    }
  }

  static toEntry(row: {
    id: string;
    actorId: string | null;
    actorEmail: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    ip: string | null;
    metadata: unknown;
    createdAt: Date;
  }): AuditLogEntry {
    return {
      id: row.id,
      actorId: row.actorId,
      actorEmail: row.actorEmail,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      ip: row.ip,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
