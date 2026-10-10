import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { CheckInOverview, CheckInRecord, CheckInSearchResult, CheckInVerifyResult, Paginated } from '@birthday/types';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import { PaginationQuery } from '../common/utils/pagination';
import { Clean } from '../common/utils/text';
import { CheckInService } from './checkin.service';

class VerifyDto {
  @ApiProperty({ description: 'Scanned QR text (URL or token) or a typed invitation code' }) @IsString() @MinLength(1) @MaxLength(500) value: string;
}

class CheckInDto {
  @ApiProperty() @IsUUID() invitationId: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(50) partySize?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) deviceInfo?: string;
}

class SearchQuery {
  @ApiProperty() @IsString() @MaxLength(100) q: string;
}

class ListQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() includeReversed?: boolean;
}

class ReverseDto {
  @ApiProperty() @Clean() @IsString() @MinLength(3) @MaxLength(300) reason: string;
}

@ApiTags('Check-in')
@ApiCookieAuth()
@Controller()
export class CheckInController {
  constructor(private readonly checkins: CheckInService) {}

  @Post('checkin/verify')
  @HttpCode(200)
  @RequirePermissions('checkin:use')
  verify(@Body() dto: VerifyDto): Promise<CheckInVerifyResult> {
    return this.checkins.verify(dto.value);
  }

  @Post('checkin')
  @RequirePermissions('checkin:use')
  checkIn(@Body() dto: CheckInDto, @Req() req: RequestWithUser): Promise<CheckInRecord> {
    return this.checkins.checkIn(dto.invitationId, dto.partySize, dto.deviceInfo, requestMeta(req));
  }

  @Get('checkin/recent')
  @RequirePermissions('checkin:use')
  recent(): Promise<CheckInOverview> {
    return this.checkins.overview();
  }

  @Get('checkin/search')
  @RequirePermissions('checkin:use')
  search(@Query() query: SearchQuery): Promise<CheckInSearchResult[]> {
    return this.checkins.search(query.q);
  }

  @Get('admin/checkins')
  @RequirePermissions('guests:manage')
  list(@Query() query: ListQuery): Promise<Paginated<CheckInRecord>> {
    return this.checkins.list(query);
  }

  @Post('admin/checkins/:id/reverse')
  @HttpCode(200)
  @RequirePermissions('checkin:reverse')
  reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseDto, @Req() req: RequestWithUser): Promise<CheckInRecord> {
    return this.checkins.reverse(id, dto.reason, requestMeta(req));
  }
}
