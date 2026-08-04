import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('connect')
  connect(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.connect(req.user.tenantId);
  }

  @Get('status')
  status(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.getStatus(req.user.tenantId);
  }
}
