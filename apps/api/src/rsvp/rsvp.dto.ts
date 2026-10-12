import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Clean } from '../common/utils/text';

export class CompanionDto {
  @ApiProperty() @Clean() @IsString() @MinLength(2) @MaxLength(120) fullName: string;
  @ApiPropertyOptional() @IsOptional() @Clean({ nullable: true }) @IsString() @MaxLength(500) dietary?: string;
}

export class RsvpEventChoiceDto {
  @ApiProperty() @IsUUID() eventId: string;
  @ApiProperty({ description: 'Companions coming to this event; at most the number named' }) @IsInt() @Min(0) @Max(20) companionCount: number;
}

export class RsvpTributeDto {
  @ApiProperty({ description: 'Birthday message for the celebrant (reviewed before it can appear publicly)' })
  @Clean()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ example: 'Niece' }) @IsOptional() @Clean({ nullable: true }) @IsString() @MaxLength(80) relationship?: string;
}

export class SubmitRsvpDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) inviteToken?: string;
  @ApiProperty() @Clean() @IsString() @MinLength(2) @MaxLength(120) fullName: string;
  @ApiProperty() @Clean({ lowercase: true }) @IsEmail() @MaxLength(254) email: string;
  @ApiPropertyOptional() @IsOptional() @Clean({ nullable: true }) @IsString() @MaxLength(40) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiProperty({ enum: ['ATTENDING', 'DECLINED'] }) @IsIn(['ATTENDING', 'DECLINED']) response: 'ATTENDING' | 'DECLINED';
  @ApiProperty({ type: [CompanionDto] }) @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CompanionDto) companions: CompanionDto[];
  @ApiPropertyOptional({ type: [RsvpEventChoiceDto], description: 'Events attending. Omitted: every event the guest may reply to' })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => RsvpEventChoiceDto)
  events?: RsvpEventChoiceDto[];
  @ApiPropertyOptional() @IsOptional() @Clean({ nullable: true }) @IsString() @MaxLength(500) dietary?: string;
  @ApiPropertyOptional() @IsOptional() @Clean({ nullable: true }) @IsString() @MaxLength(1000) accessibility?: string;
  @ApiPropertyOptional() @IsOptional() @Clean({ nullable: true }) @IsString() @MaxLength(1000) message?: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true }) @IsOptional() @IsObject() answers?: Record<string, string | boolean>;
  @ApiPropertyOptional({ type: RsvpTributeDto }) @IsOptional() @ValidateNested() @Type(() => RsvpTributeDto) tribute?: RsvpTributeDto;
}
