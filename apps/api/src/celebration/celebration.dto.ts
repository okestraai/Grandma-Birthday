import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { Clean } from '../common/utils/text';

const nullableText = (max: number) => [IsOptional(), Clean({ nullable: true }), ValidateIf((_: unknown, v: unknown) => v !== null), IsString(), MaxLength(max)];
export function Text(max: number): PropertyDecorator {
  return (target, key) => nullableText(max).forEach((d) => d(target, key));
}

export class AllocationDto {
  @ApiProperty() @IsUUID() categoryId: string;
  @ApiProperty({ nullable: true, description: 'Places for this category; null = no separate limit' })
  @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(100_000)
  capacity: number | null;
}

export class UpdateAllocationsDto {
  @ApiProperty({ type: [AllocationDto] }) @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => AllocationDto)
  allocations: AllocationDto[];
}

export class UpdateCelebrationDto {
  @ApiPropertyOptional() @IsOptional() @Clean() @IsString() @MinLength(2) @MaxLength(150) name?: string;
  @ApiPropertyOptional({ nullable: true }) @Text(200) tagline?: string | null;
  @ApiPropertyOptional({ nullable: true }) @Text(4000) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @ApiPropertyOptional({ nullable: true }) @Text(100) contactName?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @Clean({ nullable: true, lowercase: true }) @ValidateIf((_, v) => v !== null) @IsEmail() @MaxLength(254)
  contactEmail?: string | null;
  @ApiPropertyOptional({ nullable: true }) @Text(40) contactPhone?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100_000) capacity?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() rsvpOpen?: boolean;
  @ApiPropertyOptional({ enum: ['OPEN', 'INVITE_ONLY'] }) @IsOptional() @IsIn(['OPEN', 'INVITE_ONLY']) rsvpMode?: 'OPEN' | 'INVITE_ONLY';
  @ApiPropertyOptional({ enum: ['PER_EVENT', 'WHOLE_CELEBRATION'], description: 'Guests choose events, or reply once for every event they may attend' })
  @IsOptional() @IsIn(['PER_EVENT', 'WHOLE_CELEBRATION'])
  rsvpScope?: 'PER_EVENT' | 'WHOLE_CELEBRATION';
  @ApiPropertyOptional({ enum: ['PER_EVENT', 'ONCE'], description: 'Check guests in at each event, or once for the whole celebration' })
  @IsOptional() @IsIn(['PER_EVENT', 'ONCE'])
  checkInScope?: 'PER_EVENT' | 'ONCE';
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsISO8601({ strict: true }) rsvpDeadline?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(20) defaultCompanions?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(20) maxCompanions?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowCompanions?: boolean;
}
