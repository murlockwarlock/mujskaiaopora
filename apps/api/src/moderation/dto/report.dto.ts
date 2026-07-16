import { IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class CreateReportDto {
  @IsUUID()
  targetUserId!: string;

  @IsOptional()
  @IsUUID()
  messageId?: string;

  @IsString()
  @Length(3, 120)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class ResolveReportDto {
  @IsString()
  @Length(2, 1000)
  resolution!: string;
}
