import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsHexColor, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Clean } from '../common/utils/text';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

export class UpdateSettingsDto {
  @ApiPropertyOptional({ description: 'Bytes; 100 MB to 2 TB' })
  @IsOptional() @IsInt() @Min(100 * MB) @Max(2048 * GB)
  storageQuotaBytes?: number;

  @ApiPropertyOptional({ description: 'Bytes; 100 KB to 1 GB' })
  @IsOptional() @IsInt() @Min(100 * 1024) @Max(1024 * MB)
  maxPhotoBytes?: number;

  @ApiPropertyOptional({ description: 'Bytes; 1 MB to 10 GB' })
  @IsOptional() @IsInt() @Min(MB) @Max(10 * GB)
  maxVideoBytes?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() videoUploadsEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() uploadModerationEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() guestUploadsOpen?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) maxFilesPerUpload?: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() guestUploadAlbumId?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() testimonialsOpen?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() testimonialsRequireApproval?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() testimonialsAllowPhotos?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() testimonialsAllowVideos?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsHexColor() primaryColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsHexColor() secondaryColor?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() logoMediaId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() heroMediaId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() ogImageMediaId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Clean({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(120) siteTitle?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Clean({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(300) siteDescription?: string | null;
}
