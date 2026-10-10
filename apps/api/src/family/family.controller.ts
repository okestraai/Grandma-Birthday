import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { AdminFamilyMember, AdminFamilyTree, FamilyRelationship, FamilyTree } from '@birthday/types';
import { Public, RequirePermissions } from '../common/decorators/auth.decorators';
import { PublicCacheHeaders } from '../common/decorators/cache.decorators';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import { CreateRelationshipDto, UpsertFamilyMemberDto } from './family.dto';
import { FamilyService } from './family.service';

@ApiTags('Family')
@Controller()
export class FamilyController {
  constructor(private readonly family: FamilyService) {}

  @Get('family')
  @Public()
  @PublicCacheHeaders()
  tree(): Promise<FamilyTree> {
    return this.family.publicTree();
  }

  @Get('admin/family')
  @ApiCookieAuth()
  @RequirePermissions('content:manage')
  adminTree(): Promise<AdminFamilyTree> {
    return this.family.adminTree();
  }

  @Post('admin/family')
  @ApiCookieAuth()
  @RequirePermissions('content:manage')
  create(@Body() dto: UpsertFamilyMemberDto, @Req() req: RequestWithUser): Promise<AdminFamilyMember> {
    return this.family.create(dto, requestMeta(req));
  }

  @Post('admin/family/relationships')
  @ApiCookieAuth()
  @RequirePermissions('content:manage')
  relate(@Body() dto: CreateRelationshipDto, @Req() req: RequestWithUser): Promise<FamilyRelationship> {
    return this.family.relate(dto, requestMeta(req));
  }

  @Delete('admin/family/relationships/:id')
  @ApiCookieAuth()
  @RequirePermissions('content:manage')
  @HttpCode(204)
  unrelate(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser): Promise<void> {
    return this.family.unrelate(id, requestMeta(req));
  }

  @Put('admin/family/:id')
  @ApiCookieAuth()
  @RequirePermissions('content:manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertFamilyMemberDto, @Req() req: RequestWithUser): Promise<AdminFamilyMember> {
    return this.family.update(id, dto, requestMeta(req));
  }

  @Delete('admin/family/:id')
  @ApiCookieAuth()
  @RequirePermissions('content:manage')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser): Promise<void> {
    return this.family.remove(id, requestMeta(req));
  }
}
