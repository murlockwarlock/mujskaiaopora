import { IsUUID } from 'class-validator';

export class CandidateIdDto {
  @IsUUID()
  userId!: string;
}
