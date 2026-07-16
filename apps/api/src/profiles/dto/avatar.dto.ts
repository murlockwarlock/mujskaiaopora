import { IsIn, IsInt, IsUUID, Min } from 'class-validator';

export class CreateAvatarUploadDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType!: string;

  @IsInt()
  @Min(1)
  byteSize!: number;
}

export class ConfirmAvatarUploadDto {
  @IsUUID()
  uploadId!: string;
}
