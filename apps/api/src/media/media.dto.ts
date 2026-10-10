import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { Clean } from '../common/utils/text';
import { PaginationQuery } from '../common/utils/pagination';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
const SOURCES = ['ADMIN', 'GUEST_UPLOAD', 'TESTIMONIAL'] as const;
const KINDS = ['PHOTO', 'VIDEO'] as const;

export class PublicMediaQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'Album slug' }) @IsOptional() @IsString() @MaxLength(80) album?: string;
  @ApiPropertyOptional({ enum: KINDS }) @IsOptional() @IsIn(KINDS) kind?: (typeof KINDS)[number];
}

export class AdminMediaQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: STATUSES }) @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @ApiPropertyOptional({ enum: SOURCES }) @IsOptional() @IsIn(SOURCES) source?: (typeof SOURCES)[number];
  @ApiPropertyOptional({ enum: KINDS }) @IsOptional() @IsIn(KINDS) kind?: (typeof KINDS)[number];
  @ApiPropertyOptional({ description: 'Album id, or "none" for media without an album' })
  @IsOptional()
  @ValidateIf((o: AdminMediaQuery) => o.albumId !== 'none')
  @IsUUID()
  albumId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ enum: ['newest', 'oldest', 'largest', 'order'] })
  @IsOptional()
  @IsIn(['newest', 'oldest', 'largest', 'order'])
  sort?: 'newest' | 'oldest' | 'largest' | 'order';
}

export class UpdateMediaDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Clean({ nullable: true }) @IsString() @MaxLength(500) caption?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Clean({ nullable: true }) @IsString() @MaxLength(300) altText?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() albumId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional({ enum: STATUSES }) @IsOptional() @IsEnum(STATUSES) status?: (typeof STATUSES)[number];
}

export class BulkMediaDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids: string[];

  @ApiProperty({ enum: ['APPROVE', 'REJECT', 'DELETE', 'MOVE'] })
  @IsIn(['APPROVE', 'REJECT', 'DELETE', 'MOVE'])
  action: 'APPROVE' | 'REJECT' | 'DELETE' | 'MOVE';

  @ApiPropertyOptional({ nullable: true, description: 'MOVE target (null = no album); optional album for APPROVE' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  albumId?: string | null;
}

export class AdminUploadFieldsDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() albumId?: string;
  @ApiPropertyOptional() @IsOptional() @Clean({ nullable: true }) @IsString() @MaxLength(500) caption?: string;
}

export class MediaVariantParams {
  @IsUUID() id: string;
  @IsIn(['thumb', 'medium', 'original']) variant: 'thumb' | 'medium' | 'original';
}

export const toInt = () => Type(() => Number);
