import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ConfirmAvatarUploadDto, CreateAvatarUploadDto } from './dto/avatar.dto';
import { ProfilesService } from './profiles.service';

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.profilesService.getProfile(user.sub);
  }

  @Patch()
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.profilesService.updateProfile(user.sub, dto);
  }

  @Post('avatar/uploads')
  createAvatarUpload(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAvatarUploadDto) {
    return this.profilesService.createAvatarUpload(user.sub, dto);
  }

  @Post('avatar/confirm')
  confirmAvatarUpload(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfirmAvatarUploadDto) {
    return this.profilesService.confirmAvatarUpload(user.sub, dto);
  }
}
