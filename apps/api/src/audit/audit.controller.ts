import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { AuditLogEntry, Paginated } from '@birthday/types';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { PaginationQuery, paginated, skipTake } from '../common/utils/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { Prisma } from '../generated/prisma/client';

class AuditQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) action?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() actorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) entityType?: string;
}

@ApiTags('Admin: audit')
@ApiCookieAuth()
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('audit:read')
  @ApiOperation({ summary: 'Paginated audit log, newest first' })
  async list(@Query() query: AuditQuery): Promise<Paginated<AuditLogEntry>> {
    const where: Prisma.AuditLogWhereInput = {
      action: query.action ? { contains: query.action.toUpperCase() } : undefined,
      actorId: query.actorId,
      entityType: query.entityType,
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(query) }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(rows.map(AuditService.toEntry), total, query);
  }
}
