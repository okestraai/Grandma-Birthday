import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Clean } from '../common/utils/text';

export class LoginDto {
  @ApiProperty({ example: 'admin@demo.local' }) @Clean({ lowercase: true }) @IsEmail() @MaxLength(254) email: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(128) password: string;
}

export class ForgotPasswordDto {
  @ApiProperty() @Clean({ lowercase: true }) @IsEmail() @MaxLength(254) email: string;
}

export class ResetPasswordDto {
  @ApiProperty() @IsString() @MinLength(20) @MaxLength(200) token: string;
  @ApiProperty({ minLength: 12 }) @IsString() @MaxLength(128) password: string;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() @MaxLength(128) currentPassword: string;
  @ApiProperty({ minLength: 12 }) @IsString() @MaxLength(128) newPassword: string;
}
