import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ResetPasswordGuard } from 'src/common/guards/resetPassword.guard';
import { JwtUser } from './types/jwt-user.type';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(
    @Body() body: { email: string; password: string; tenantSlug: string },
  ) {
    return this.authService.login(body.email, body.password, body.tenantSlug);
  }
  @Post('forgot-password')
  async generateOtpCodeForForgotPassword(
    @Body() body: { email: string; tenantSlug: string },
  ): Promise<void> {
    return this.authService.generateOtpResetPassword(
      body.email,
      body.tenantSlug,
    );
  }
  @Post('verify-reset-password-otp')
  async verifyOtpCodeResetPassword(
    @Body()
    body: {
      email: string;
      resetPasswordOtp: string;
      tenantSlug: string;
    },
  ) {
    return this.authService.verifyOtpResetPassword(
      body.email,
      body.resetPasswordOtp,
      body.tenantSlug,
    );
  }
  @Post('reset-password')
  @UseGuards(ResetPasswordGuard)
  async resetPassword(
    @Req() request: { user: JwtUser },
    @Body() body: { newPassword: string },
  ) {
    const userId = request.user.sub;

    return this.authService.resetPassword(userId, body.newPassword);
  }
  @Get('test-throttle')
  async test() {
    console.log('RODANDO REQUEST');
    return 'ok';
  }
}
