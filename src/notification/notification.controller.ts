import { Controller, Post, Param } from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('test/:userId')
  async testNotification(@Param('userId') userId: string) {
    await this.notificationService.sendPushToUser(
      userId,
      'Teste Backend',
      'Notificação enviada pelo NestJS 🚀',
    );

    return {
      message: 'Notificação enviada',
    };
  }
}
