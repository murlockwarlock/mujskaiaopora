import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1400)
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(2, 32, { each: true })
  @Transform(({ value }: { value: string[] }) => value.map((item) => item.trim().toLowerCase()))
  languages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(2, 32, { each: true })
  @Transform(({ value }: { value: string[] }) => value.map((item) => item.trim().toLowerCase()))
  interests?: string[];

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @IsOptional()
  @IsBoolean()
  messageSoundEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  callSoundEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  browserNotificationsEnabled?: boolean;
}
