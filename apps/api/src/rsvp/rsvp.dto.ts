import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Clean } from '../common/utils/text';

export class CompanionDto {
  @ApiProperty() @Clean() @IsString() @MinLength(2) @MaxLength(120) fullName: string;
  @ApiPropertyOptional() @IsOptional() @Clean({ nullable: true }) @IsString() @MaxLength(500) dietary?: string;
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
  @ApiPropertyOptional() @IsOptional() @Clean({ nullable: true }) @IsString() @MaxLength(500) dietary?: string;
  @ApiPropertyOptional() @IsOptional() @Clean({ nullable: true }) @IsString() @MaxLength(1000) accessibility?: string;
  @ApiPropertyOptional() @IsOptional() @Clean({ nullable: true }) @IsString() @MaxLength(1000) message?: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true }) @IsOptional() @IsObject() answers?: Record<string, string | boolean>;
  @ApiPropertyOptional({ type: RsvpTributeDto }) @IsOptional() @ValidateNested() @Type(() => RsvpTributeDto) tribute?: RsvpTributeDto;
}
