import {
  Body,
  Controller,
  Post,
  Get,
  UseGuards,
  Request,
  Param,
  Req,
} from '@nestjs/common';
import { User as UserModel } from '@prisma/client';
import { UserService } from './user.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { SaveDeviceTokenDto } from './dto/save-device-token.dto';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @Post('verify-otp')
  async verificationOtpCode(
    @Body() userData: { email: string; otpCode: string; tenantSlug: string },
  ): Promise<UserModel> {
    return this.userService.verifyOtp(
      userData.email,
      userData.otpCode,
      userData.tenantSlug,
    );
  }
  @Post('resend-otp')
  async resendOtp(
    @Body() body: { email: string; tenantSlug: string },
  ): Promise<void> {
    return this.userService.resendOtp(body.email, body.tenantSlug);
  }

  @Post('register')
  async signupUser(
    @Body()
    userData: {
      email: string;
      name: string;
      password: string;
      tenantSlug: string;
    },
  ): Promise<UserModel> {
    return this.userService.createUser(userData);
  }

  @Post(':id/role')
  async addRole(
    @Param('id') userId: string,
    @Body() body: { roleId: string },
  ): Promise<UserModel> {
    return this.userService.addRoleToUser(body.roleId, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(
    @Request() req: { user: { id: string; email: string; tenantId: string } },
  ) {
    return this.userService.getMe(req.user.id, req.user.tenantId);
  }
  @Post('device-token')
  @UseGuards(JwtAuthGuard)
  saveDeviceToken(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SaveDeviceTokenDto,
  ) {
    return this.userService.saveDeviceToken(req.user.id, dto);
  }
}
