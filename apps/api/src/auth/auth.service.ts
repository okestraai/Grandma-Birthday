import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { AuthSession } from '@birthday/types';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { AppException, Errors } from '../common/errors';
import { permissionsFor } from '../common/permissions';
import type { RequestMeta } from '../common/request-context';
import { hmacSha256, randomToken, sha256 } from '../common/utils/crypto';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../notifications/mail.service';
import { passwordResetEmail } from '../notifications/templates';
import { assertStrongPassword, dummyVerify, hashPassword, verifyPassword } from './password';

export interface IssuedTokens {
  session: AuthSession;
  accessToken: string;
  /** Absent when a benign concurrent refresh re-used a just-rotated token. */
  refreshToken?: string;
  refreshExpiresAt?: Date;
}

/** A second refresh within this window after rotation is treated as a race between tabs, not theft. */
const REUSE_GRACE_MS = 15_000;
const RESET_TTL_MINUTES = 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async login(email: string, password: string, meta: RequestMeta): Promise<IssuedTokens> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const invalid = new AppException(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');

    if (!user) {
      await dummyVerify(password);
      await this.audit.record(meta, { action: 'ADMIN_LOGIN_FAILED', entityType: 'User', metadata: { reason: 'unknown_email' } });
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new AppException(423, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
    }

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= this.config.auth.maxFailedLogins;
      await this.prisma.user.update({
        where: { id: user.id },
        data: lock
          ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + this.config.auth.lockoutMinutes * 60_000) }
          : { failedLoginCount: failed },
      });
      await this.audit.record({ ...meta, actor: null }, {
        action: lock ? 'ADMIN_ACCOUNT_LOCKED' : 'ADMIN_LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        metadata: { failedAttempts: failed },
      });
      if (lock) {
        throw new AppException(423, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${this.config.auth.lockoutMinutes} minutes.`);
      }
      throw invalid;
    }
    // Revealed only after the correct password, so it cannot be used to probe accounts.
    if (user.status !== 'ACTIVE') {
      throw new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_DISABLED', 'This account has been disabled. Ask a super admin to re-enable it.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const tokens = await this.issue(user, randomUUID(), meta);
    await this.audit.record({ ...meta, actor: { ...this.actorOf(user), via: 'cookie' } }, { action: 'ADMIN_LOGGED_IN', entityType: 'User', entityId: user.id });
    return tokens;
  }

  async refresh(rawToken: string | undefined, meta: RequestMeta): Promise<IssuedTokens> {
    if (!rawToken) throw Errors.unauthenticated('Your session has ended. Please sign in again.');
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hashRefresh(rawToken) }, include: { user: true } });
    if (!record || record.expiresAt < new Date() || record.user.status !== 'ACTIVE') {
      throw Errors.unauthenticated('Your session has ended. Please sign in again.');
    }

    if (record.revokedAt) {
      const benignRace = record.replacedById !== null && Date.now() - record.revokedAt.getTime() < REUSE_GRACE_MS;
      if (benignRace) {
        // Another tab rotated this token moments ago; it already holds the new refresh cookie.
        return { ...(await this.accessOnly(record.user)) };
      }
      // A rotated token came back later: assume it was stolen and end every session in the family.
      await this.prisma.refreshToken.updateMany({ where: { familyId: record.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record(meta, { action: 'REFRESH_TOKEN_REUSE_DETECTED', entityType: 'User', entityId: record.userId, metadata: { familyId: record.familyId } });
      throw Errors.unauthenticated('Your session has ended. Please sign in again.');
    }

    const tokens = await this.issue(record.user, record.familyId, meta, record.id);
    return tokens;
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hashRefresh(rawToken) } });
    if (record) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: record.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
  }

  async session(userId: string): Promise<AuthSession> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.sessionOf(user, new Date(Date.now() + this.config.auth.accessTtlSeconds * 1000));
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE') return;
    // At most one live reset link per 2 minutes per account.
    const recent = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 120_000) } },
    });
    if (recent) return;
    const token = randomToken();
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000) },
    });
    const resetUrl = `${this.config.publicWebUrl}/admin/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.send(user.email, passwordResetEmail({ name: user.name, resetUrl, minutes: RESET_TTL_MINUTES }));
  }

  async resetPassword(token: string, password: string, meta: RequestMeta): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new AppException(400, 'PASSWORD_RESET_TOKEN_INVALID', 'This reset link is invalid or has expired. Request a new one.');
    }
    assertStrongPassword(password, record.user.email);
    await this.setPassword(record.userId, password, async (tx) => {
      await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    });
    await this.audit.record({ ...meta, actor: null }, { action: 'ADMIN_PASSWORD_RESET', entityType: 'User', entityId: record.userId });
  }

  async changePassword(userId: string, current: string, next: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(user.passwordHash, current))) {
      throw new AppException(400, 'INVALID_CREDENTIALS', 'Your current password is incorrect.', { currentPassword: ['Your current password is incorrect.'] });
    }
    assertStrongPassword(next, user.email);
    await this.setPassword(userId, next);
    await this.audit.record(meta, { action: 'ADMIN_PASSWORD_CHANGED', entityType: 'User', entityId: userId });
  }

  /** Sets a password and ends every existing session for that user. */
  async setPassword(userId: string, password: string, extra?: (tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0]) => Promise<void>): Promise<void> {
    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
      if (extra) await extra(tx);
    });
  }

  // ---------------------------------------------------------------------------

  private async issue(user: User, familyId: string, meta: RequestMeta, rotatedFromId?: string): Promise<IssuedTokens> {
    const refreshToken = randomToken();
    const refreshExpiresAt = new Date(Date.now() + this.config.auth.refreshTtlDays * 86_400_000);
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashRefresh(refreshToken),
          familyId,
          expiresAt: refreshExpiresAt,
          userAgent: meta.userAgent,
          ip: meta.ip,
        },
      });
      if (rotatedFromId) {
        const { count } = await tx.refreshToken.updateMany({
          where: { id: rotatedFromId, revokedAt: null },
          data: { revokedAt: new Date(), replacedById: created.id },
        });
        // Lost a race with another rotation of the same token.
        if (count === 0) throw Errors.unauthenticated('Your session has ended. Please sign in again.');
      }
    });
    const access = await this.accessOnly(user);
    return { ...access, refreshToken, refreshExpiresAt };
  }

  private async accessOnly(user: User): Promise<IssuedTokens> {
    const expiresAt = new Date(Date.now() + this.config.auth.accessTtlSeconds * 1000);
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, typ: 'access' },
      { secret: this.config.auth.jwtSecret, expiresIn: this.config.auth.accessTtlSeconds, algorithm: 'HS256' },
    );
    return { accessToken, session: this.sessionOf(user, expiresAt) };
  }

  private sessionOf(user: User, expiresAt: Date): AuthSession {
    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role, permissions: permissionsFor(user.role) },
      accessTokenExpiresAt: expiresAt.toISOString(),
    };
  }

  private actorOf(user: User) {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  private hashRefresh(token: string): string {
    return hmacSha256(this.config.auth.refreshSecret, token);
  }
}
