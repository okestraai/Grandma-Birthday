import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import type { AdminTestimonial, BulkResult, Paginated, PublicTestimonial, SubmitTestimonialResult, TestimonialCounts, TestimonialFilter } from '@birthday/types';
import { Public, RequirePermissions } from '../common/decorators/auth.decorators';
import { PublicCacheHeaders } from '../common/decorators/cache.decorators';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import { PaginationQuery } from '../common/utils/pagination';
import { Clean } from '../common/utils/text';
import { UploadInterceptor, uploadedFiles } from '../media/upload.interceptor';
import { TestimonialsService } from './testimonials.service';

class SubmitTestimonialDto {
  @ApiProperty() @Clean() @IsString() @MinLength(2) @MaxLength(80) authorName: string;
  @ApiPropertyOptional() @IsOptional() @Clean() @IsString() @MaxLength(80) relationship?: string;
  @ApiPropertyOptional() @IsOptional() @Clean({ lowercase: true }) @ValidateIf((_, v) => v !== '') @IsEmail() @MaxLength(254) email?: string;
  @ApiProperty() @Clean() @IsString() @MinLength(10) @MaxLength(2000) message: string;
}

class AdminListQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: ['all', 'pending', 'approved', 'rejected', 'featured', 'public'] })
  @IsOptional()
  @IsIn(['all', 'pending', 'approved', 'rejected', 'featured', 'public'])
  filter?: TestimonialFilter;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
}

class UpdateTestimonialDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED'] }) @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED']) status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublic?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @Clean() @IsString() @MinLength(2) @MaxLength(80) authorName?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Clean({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(80) relationship?: string | null;
  @ApiPropertyOptional() @IsOptional() @Clean() @IsString() @MinLength(2) @MaxLength(2000) message?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

class BulkTestimonialDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('all', { each: true }) ids: string[];
  @ApiProperty({ enum: ['APPROVE', 'REJECT', 'DELETE', 'PUBLISH', 'UNPUBLISH'] })
  @IsIn(['APPROVE', 'REJECT', 'DELETE', 'PUBLISH', 'UNPUBLISH'])
  action: 'APPROVE' | 'REJECT' | 'DELETE' | 'PUBLISH' | 'UNPUBLISH';
}

@ApiTags('Testimonials')
@Controller()
export class TestimonialsController {
  constructor(private readonly testimonials: TestimonialsService) {}

  @Get('testimonials/public')
  @Public()
  @PublicCacheHeaders()
  @ApiOperation({ summary: 'Approved AND public messages only, featured first' })
  listPublic(@Query() query: PaginationQuery): Promise<Paginated<PublicTestimonial>> {
    return this.testimonials.listPublic(query);
  }

  @Post('testimonials')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @UseInterceptors(UploadInterceptor([{ name: 'photo', maxCount: 1 }, { name: 'video', maxCount: 1 }]))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['authorName', 'message'],
      properties: {
        authorName: { type: 'string' },
        relationship: { type: 'string' },
        email: { type: 'string' },
        message: { type: 'string' },
        photo: { type: 'string', format: 'binary' },
        video: { type: 'string', format: 'binary' },
      },
    },
  })
  submit(@Body() dto: SubmitTestimonialDto, @Req() req: RequestWithUser): Promise<SubmitTestimonialResult> {
    return this.testimonials.submit(
      dto,
      { photo: uploadedFiles(req, 'photo')[0], video: uploadedFiles(req, 'video')[0] },
      requestMeta(req),
    );
  }

  @Get('admin/testimonials')
  @ApiCookieAuth()
  @RequirePermissions('testimonials:manage')
  list(@Query() query: AdminListQuery): Promise<Paginated<AdminTestimonial>> {
    return this.testimonials.listAdmin(query);
  }

  @Get('admin/testimonials/counts')
  @ApiCookieAuth()
  @RequirePermissions('testimonials:manage')
  counts(): Promise<TestimonialCounts> {
    return this.testimonials.counts();
  }

  @Post('admin/testimonials/bulk')
  @ApiCookieAuth()
  @HttpCode(200)
  @RequirePermissions('testimonials:manage')
  bulk(@Body() dto: BulkTestimonialDto, @Req() req: RequestWithUser): Promise<BulkResult> {
    return this.testimonials.bulk(dto.ids, dto.action, requestMeta(req));
  }

  @Patch('admin/testimonials/:id')
  @ApiCookieAuth()
  @RequirePermissions('testimonials:manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTestimonialDto, @Req() req: RequestWithUser): Promise<AdminTestimonial> {
    return this.testimonials.update(id, dto, requestMeta(req));
  }

  @Delete('admin/testimonials/:id')
  @ApiCookieAuth()
  @HttpCode(204)
  @RequirePermissions('testimonials:manage')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser): Promise<void> {
    return this.testimonials.remove(id, requestMeta(req));
  }
}
