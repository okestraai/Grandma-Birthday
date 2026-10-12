import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsISO8601, IsLatitude, IsLongitude, IsOptional, IsString, IsUrl, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { Clean } from '../common/utils/text';
import { Text } from '../celebration/celebration.dto';

export class UpsertEventDto {
  @ApiProperty() @Clean() @IsString() @MinLength(2) @MaxLength(150) name: string;
  @ApiPropertyOptional({ description: 'Made from the name when left out' })
  @IsOptional() @Clean({ lowercase: true }) @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Use lowercase letters, numbers and hyphens.' }) @MaxLength(80)
  slug?: string;
  @ApiPropertyOptional({ nullable: true }) @Text(4000) description?: string | null;
  @ApiProperty() @IsISO8601({ strict: true }) startsAt: string;
  @ApiProperty() @IsISO8601({ strict: true }) endsAt: string;
  @ApiProperty() @Clean() @IsString() @MinLength(2) @MaxLength(150) venueName: string;
  @ApiProperty() @Clean() @IsString() @MinLength(2) @MaxLength(300) address: string;
  @ApiPropertyOptional({ nullable: true }) @Text(100) city?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @Clean({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsUrl({ protocols: ['https', 'http'], require_protocol: true }) @MaxLength(500)
  mapUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsLatitude() latitude?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsLongitude() longitude?: number | null;
  @ApiPropertyOptional({ nullable: true }) @Text(200) dressCode?: string | null;
  @ApiPropertyOptional({ nullable: true }) @Text(150) theme?: string | null;
  @ApiPropertyOptional({ nullable: true }) @Text(1000) parkingInfo?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'People attending this event at most; null = no event limit' })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(100_000)
  capacity?: number | null;
  @ApiPropertyOptional({ type: [String], description: 'Guest categories invited; empty = everyone' })
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true })
  invitedCategoryIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() rsvpEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublic?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}
