import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { AdminUser, UserRole, UserStatus } from '@birthday/types';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { Errors } from '../common/errors';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import { Clean } from '../common/utils/text';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { assertStrongPassword, hashPassword } from '../auth/password';

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'CHECK_IN_STAFF'] as const;

class CreateUserDto {
  @ApiProperty() @Clean({ lowercase: true }) @IsEmail() @MaxLength(254) email: string;
  @ApiProperty() @Clean() @IsString() @MinLength(2) @MaxLength(100) name: string;
  @ApiProperty({ enum: ROLES }) @IsIn(ROLES) role: UserRole;
  @ApiProperty({ minLength: 12 }) @IsString() @MaxLength(128) password: string;
}

class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @Clean() @IsString() @MinLength(2) @MaxLength(100) name?: string;
  @ApiPropertyOptional({ enum: ROLES }) @IsOptional() @IsIn(ROLES) role?: UserRole;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] }) @IsOptional() @IsIn(['ACTIVE', 'DISABLED']) status?: UserStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) password?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() unlock?: boolean;
}

function toAdminUser(user: User): AdminUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    lockedUntil: user.lockedUntil && user.lockedUntil > new Date() ? user.lockedUntil.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

@ApiTags('Admin: users')
@ApiCookieAuth()
@Controller('admin/users')
@RequirePermissions('users:manage')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  async list(): Promise<AdminUser[]> {
    const users = await this.prisma.user.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }] });
    return users.map(toAdminUser);
  }

  @Post()
  async create(@Body() dto: CreateUserDto, @Req() req: RequestWithUser): Promise<AdminUser> {
    assertStrongPassword(dto.password, dto.email);
    if (await this.prisma.user.findUnique({ where: { email: dto.email } })) {
      throw Errors.validation({ email: ['A user with this email already exists.'] }, 'A user with this email already exists.');
    }
    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, role: dto.role, passwordHash: await hashPassword(dto.password), passwordChangedAt: new Date() },
    });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_CREATED_USER', entityType: 'User', entityId: user.id, metadata: { role: dto.role } });
    return toAdminUser(user);
  }

  @Put(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @Req() req: RequestWithUser): Promise<AdminUser> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw Errors.notFound('User');
    const self = req.user?.id === id;
    if (self && (dto.role && dto.role !== target.role)) throw Errors.forbidden('You cannot change your own role.');
    if (self && dto.status === 'DISABLED') throw Errors.forbidden('You cannot disable your own account.');
    if (target.role === 'SUPER_ADMIN' && ((dto.role && dto.role !== 'SUPER_ADMIN') || dto.status === 'DISABLED')) {
      const others = await this.prisma.user.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: id } } });
      if (others === 0) throw Errors.conflict('At least one active super admin must remain.');
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        role: dto.role,
        status: dto.status,
        ...(dto.unlock ? { lockedUntil: null, failedLoginCount: 0 } : {}),
      },
    });
    if (dto.password) {
      assertStrongPassword(dto.password, target.email);
      await this.auth.setPassword(id, dto.password);
    }
    // Role or status changes end the user's sessions so new permissions apply immediately.
    if ((dto.role && dto.role !== target.role) || dto.status === 'DISABLED') {
      await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    const { password: _password, ...logged } = dto;
    await this.audit.record(requestMeta(req), {
      action: 'ADMIN_UPDATED_USER',
      entityType: 'User',
      entityId: id,
      metadata: { ...logged, passwordReset: Boolean(dto.password) },
    });
    return toAdminUser(await this.prisma.user.findUniqueOrThrow({ where: { id } }));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser): Promise<void> {
    if (req.user?.id === id) throw Errors.forbidden('You cannot delete your own account.');
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw Errors.notFound('User');
    if (target.role === 'SUPER_ADMIN') {
      const others = await this.prisma.user.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: id } } });
      if (others === 0) throw Errors.conflict('At least one active super admin must remain.');
    }
    await this.prisma.user.delete({ where: { id } });
    await this.audit.record(requestMeta(req), { action: 'ADMIN_DELETED_USER', entityType: 'User', entityId: id, metadata: { email: target.email } });
  }
}
