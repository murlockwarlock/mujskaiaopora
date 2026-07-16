import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsString()
  @Length(2, 40)
  @Matches(/^[\p{L}\p{N}\s-]+$/u)
  displayName!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}

export class RequestPasswordResetDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @Length(32, 128)
  token!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}
