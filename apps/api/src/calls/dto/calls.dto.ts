import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';

export class CreateCallRoomDto {
  @IsString()
  @Length(2, 100)
  title!: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @Min(2)
  maxParticipants?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;
}

export class StartConversationCallDto {
  @IsIn(['AUDIO', 'VIDEO'])
  mode!: 'AUDIO' | 'VIDEO';
}
