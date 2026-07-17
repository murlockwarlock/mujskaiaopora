import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MatchingService } from './matching.service';
import { CandidateIdDto } from './dto/matching.dto';

@ApiTags('matching')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('matching')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Get('recommendations')
  recommendations(@CurrentUser() user: AuthenticatedUser, @Query('take') take?: string) {
    const limit = Math.min(Math.max(Number(take) || 20, 1), 50);
    return this.matchingService.recommendations(user.sub, limit);
  }

  @Get('users')
  directory(@CurrentUser() user: AuthenticatedUser, @Query('take') take?: string) {
    const limit = Math.min(Math.max(Number(take) || 100, 1), 100);
    return this.matchingService.directory(user.sub, limit);
  }

  @Post('dismissals')
  dismiss(@CurrentUser() user: AuthenticatedUser, @Body() dto: CandidateIdDto) {
    return this.matchingService.dismiss(user.sub, dto.userId);
  }

  @Post('blocks')
  block(@CurrentUser() user: AuthenticatedUser, @Body() dto: CandidateIdDto) {
    return this.matchingService.block(user.sub, dto.userId);
  }

  @Get('blocks')
  blocks(@CurrentUser() user: AuthenticatedUser) {
    return this.matchingService.listBlocks(user.sub);
  }

  @Delete('blocks/:userId')
  unblock(@CurrentUser() user: AuthenticatedUser, @Param('userId') userId: string) {
    return this.matchingService.unblock(user.sub, userId);
  }
}
