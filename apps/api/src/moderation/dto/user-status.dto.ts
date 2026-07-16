import { IsString, Length } from 'class-validator';

export class UpdateUserStatusDto {
  @IsString()
  @Length(2, 500)
  reason!: string;
}
