import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { Clean } from '../common/utils/text';

export class SpouseDto {
  @ApiProperty() @Clean() @IsString() @MinLength(2) @MaxLength(150) fullName: string;
  @ApiPropertyOptional({ example: 'Son-in-law' }) @IsOptional() @Clean() @IsString() @MaxLength(80) relationshipLabel?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1800) @Max(2200) birthYear?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1800) @Max(2200) deathYear?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Clean({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(2000) bio?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() photoMediaId?: string | null;
}

export class UpsertFamilyMemberDto {
  @ApiProperty() @Clean() @IsString() @MinLength(2) @MaxLength(150) fullName: string;
  @ApiProperty({ example: 'Daughter' }) @Clean() @IsString() @MinLength(2) @MaxLength(80) relationshipLabel: string;
  @ApiPropertyOptional({ minimum: -3, maximum: 6, description: 'Only for people without parents in the tree; otherwise derived from the parents' })
  @IsOptional() @IsInt() @Min(-3) @Max(6)
  generation?: number;
  @ApiPropertyOptional({ type: [String], description: '0–2 parents already in the tree; replaces existing parent links' })
  @IsOptional() @IsArray() @ArrayMaxSize(2) @IsUUID('all', { each: true })
  parentIds?: string[];
  @ApiPropertyOptional({ type: SpouseDto, nullable: true, description: 'Creates/updates the spouse; null removes them' })
  @IsOptional() @ValidateIf((_, v) => v !== null) @ValidateNested() @Type(() => SpouseDto)
  spouse?: SpouseDto | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCelebrant?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Clean({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(2000) bio?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1800) @Max(2200) birthYear?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1800) @Max(2200) deathYear?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() photoMediaId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublished?: boolean;
}

export class CreateRelationshipDto {
  @ApiProperty() @IsUUID() fromId: string;
  @ApiProperty() @IsUUID() toId: string;
  @ApiProperty({ enum: ['PARENT_OF', 'SPOUSE_OF'] }) @IsIn(['PARENT_OF', 'SPOUSE_OF']) type: 'PARENT_OF' | 'SPOUSE_OF';
}
