import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CallsService } from './calls.service';
import { CreateCallMessageDto, CreateCallRoomDto, InviteToCallDto, StartConversationCallDto } from './dto/calls.dto';

@ApiTags('calls')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Post('rooms')
  createRoom(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCallRoomDto) {
    return this.callsService.createRoomWithConnection(user.sub, dto);
  }

  @Post('conversations/:conversationId/start')
  startConversationCall(@CurrentUser() user: AuthenticatedUser, @Param('conversationId') conversationId: string, @Body() dto: StartConversationCallDto) {
    return this.callsService.startConversationCall(user.sub, conversationId, dto.mode);
  }

  @Get('invitations')
  listInvitations(@CurrentUser() user: AuthenticatedUser) {
    return this.callsService.listPendingInvitations(user.sub);
  }

  @Post('rooms/:roomId/join')
  joinRoom(@CurrentUser() user: AuthenticatedUser, @Param('roomId') roomId: string) {
    return this.callsService.joinRoom(user.sub, roomId);
  }

  @Post('rooms/:roomId/invitees')
  inviteUsers(@CurrentUser() user: AuthenticatedUser, @Param('roomId') roomId: string, @Body() dto: InviteToCallDto) {
    return this.callsService.inviteUsers(user.sub, roomId, dto.userIds);
  }

  @Post('invites/:inviteCode/join')
  joinByInvite(@CurrentUser() user: AuthenticatedUser, @Param('inviteCode') inviteCode: string) {
    return this.callsService.joinByInvite(user.sub, inviteCode);
  }

  @Get('rooms/:roomId/messages')
  listMessages(@CurrentUser() user: AuthenticatedUser, @Param('roomId') roomId: string) {
    return this.callsService.listMessages(user.sub, roomId);
  }

  @Post('rooms/:roomId/messages')
  createMessage(@CurrentUser() user: AuthenticatedUser, @Param('roomId') roomId: string, @Body() dto: CreateCallMessageDto) {
    return this.callsService.createMessage(user.sub, roomId, dto);
  }

  @Post('rooms/:roomId/leave')
  leaveRoom(@CurrentUser() user: AuthenticatedUser, @Param('roomId') roomId: string) {
    return this.callsService.leaveRoom(user.sub, roomId);
  }

  @Post('rooms/:roomId/decline')
  declineRoom(@CurrentUser() user: AuthenticatedUser, @Param('roomId') roomId: string) {
    return this.callsService.declineRoom(user.sub, roomId);
  }
}
