import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappMessageService } from './whatsapp-message.service';

@Module({
  providers: [WhatsappService, WhatsappMessageService],
  controllers: [WhatsappController],
  exports: [WhatsappService, WhatsappMessageService],
})
export class WhatsappModule {}
