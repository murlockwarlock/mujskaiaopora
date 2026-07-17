import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateDirectConversationDto {
  @IsUUID()
  userId!: string;
}

export class CreateGroupConversationDto {
  @IsString()
  @Length(2, 80)
  title!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  @IsUUID('4', { each: true })
  userIds!: string[];
}

export class AddConversationMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  @IsUUID('4', { each: true })
  userIds!: string[];
}

export class CreateMessageDto {
  @IsUUID()
  clientMessageId!: string;

  @IsString()
  @Length(1, 4000)
  body!: string;
}

export class MessageCursorDto {
  @IsOptional()
  @IsString()
  cursor?: string;
}
