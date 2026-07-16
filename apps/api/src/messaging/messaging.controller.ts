import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateDirectConversationDto, CreateGroupConversationDto, CreateMessageDto, MessageCursorDto } from './dto/conversation.dto';
import { MessagingService } from './messaging.service';

@ApiTags('messaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get()
  listConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.messagingService.listConversations(user.sub);
  }

  @Post('direct')
  createDirect(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDirectConversationDto) {
    return this.messagingService.createDirectConversation(user.sub, dto.userId);
  }

  @Post('group')
  createGroup(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGroupConversationDto) {
    return this.messagingService.createGroupConversation(user.sub, dto);
  }

  @Get(':conversationId/messages')
  listMessages(@CurrentUser() user: AuthenticatedUser, @Param('conversationId') conversationId: string, @Query() query: MessageCursorDto) {
    return this.messagingService.listMessages(user.sub, conversationId, query.cursor);
  }

  @Post(':conversationId/messages')
  createMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Body() dto: CreateMessageDto
  ) {
    return this.messagingService.createMessage(user.sub, conversationId, dto);
  }
}
