import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsHexColor, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { Clean } from '../common/utils/text';
import { PaginationQuery } from '../common/utils/pagination';
import { CompanionDto, RsvpEventChoiceDto } from '../rsvp/rsvp.dto';

export class GuestListQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional({ description: 'Only guests attending this event; checkIn then refers to it' }) @IsOptional() @IsUUID() eventId?: string;
  @ApiPropertyOptional({ enum: ['ATTENDING', 'DECLINED', 'NONE'] }) @IsOptional() @IsIn(['ATTENDING', 'DECLINED', 'NONE']) rsvp?: 'ATTENDING' | 'DECLINED' | 'NONE';
  @ApiPropertyOptional({ enum: ['IN', 'OUT'] }) @IsOptional() @IsIn(['IN', 'OUT']) checkIn?: 'IN' | 'OUT';
  @ApiPropertyOptional({ description: 'Registered on or after (YYYY-MM-DD or ISO)' }) @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional({ description: 'Registered on or before (YYYY-MM-DD or ISO)' }) @IsOptional() @IsISO8601() to?: string;
  @ApiPropertyOptional({ enum: ['newest', 'oldest', 'name', '-name'] }) @IsOptional() @IsIn(['newest', 'oldest', 'name', '-name']) sort?: 'newest' | 'oldest' | 'name' | '-name';
  @ApiPropertyOptional({ enum: ['ACTIVE', 'REVOKED'], description: 'Invitation status (invitations list)' }) @IsOptional() @IsIn(['ACTIVE', 'REVOKED']) status?: 'ACTIVE' | 'REVOKED';
}

export class GuestRsvpDto {
  @ApiProperty({ enum: ['ATTENDING', 'DECLINED'] }) @IsIn(['ATTENDING', 'DECLINED']) response: 'ATTENDING' | 'DECLINED';
  @ApiProperty({ type: [CompanionDto] }) @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CompanionDto) companions: CompanionDto[];
  @ApiPropertyOptional({ type: [RsvpEventChoiceDto], description: "Omitted: the guest's current choices, or every event they may attend" })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => RsvpEventChoiceDto)
  events?: RsvpEventChoiceDto[];
  @ApiPropertyOptional() @IsOptional() @Clean({ nullable: true }) @IsString() @MaxLength(500) dietary?: string;
  @ApiPropertyOptional() @IsOptional() @Clean({ nullable: true }) @IsString() @MaxLength(1000) accessibility?: string;
}

const EXTRA_EVENTS = 'Events to invite the guest to beyond their category (replaces the list)';

export class CreateGuestDto {
  @ApiProperty() @Clean() @IsString() @MinLength(2) @MaxLength(120) fullName: string;
  @ApiProperty() @Clean({ lowercase: true }) @IsEmail() @MaxLength(254) email: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Clean({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(40) phone?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() categoryId?: string | null;
  @ApiProperty() @IsInt() @Min(0) @Max(20) allowedCompanions: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Clean({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(2000) notes?: string | null;
  @ApiPropertyOptional({ type: [String], description: EXTRA_EVENTS }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) extraEventIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sendInvitation?: boolean;
  @ApiPropertyOptional({ type: GuestRsvpDto }) @IsOptional() @ValidateNested() @Type(() => GuestRsvpDto) rsvp?: GuestRsvpDto;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() overrideCapacity?: boolean;
}

export class UpdateGuestDto {
  @ApiPropertyOptional() @IsOptional() @Clean() @IsString() @MinLength(2) @MaxLength(120) fullName?: string;
  @ApiPropertyOptional() @IsOptional() @Clean({ lowercase: true }) @IsEmail() @MaxLength(254) email?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Clean({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(40) phone?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() categoryId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(20) allowedCompanions?: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Clean({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(2000) notes?: string | null;
  @ApiPropertyOptional({ type: [String], description: EXTRA_EVENTS }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) extraEventIds?: string[];
  @ApiPropertyOptional({ type: GuestRsvpDto }) @IsOptional() @ValidateNested() @Type(() => GuestRsvpDto) rsvp?: GuestRsvpDto;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() overrideCapacity?: boolean;
}

export class SendInvitationsDto {
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) guestIds?: string[];
  @ApiPropertyOptional({ description: 'Every active invitation that has never been sent' }) @IsOptional() @IsBoolean() onlyUnsent?: boolean;
}

export class RevokeInvitationDto {
  @ApiPropertyOptional() @IsOptional() @Clean({ nullable: true }) @IsString() @MaxLength(300) reason?: string;
}

export class UpsertCategoryDto {
  @ApiProperty() @Clean() @IsString() @MinLength(2) @MaxLength(60) name: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Clean({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(300) description?: string | null;
  @ApiProperty() @IsInt() @Min(0) @Max(20) defaultCompanions: number;
  @ApiPropertyOptional({ nullable: true, description: 'Places set aside for this category; null = no separate limit' })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(100_000)
  capacity?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() selfSelectable?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsHexColor() color?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpsertQuestionDto {
  @ApiProperty() @Clean() @IsString() @MinLength(2) @MaxLength(200) label: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Clean({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(300) helpText?: string | null;
  @ApiProperty({ enum: ['TEXT', 'TEXTAREA', 'SELECT', 'CHECKBOX'] }) @IsIn(['TEXT', 'TEXTAREA', 'SELECT', 'CHECKBOX']) type: 'TEXT' | 'TEXTAREA' | 'SELECT' | 'CHECKBOX';
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(100, { each: true }) options?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() required?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}
