import { forwardRef, Module } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { ChannelsController } from './channels.controller';
import { InstagramProvider } from './providers/instagram.provider';
import { TelegramProvider } from './providers/telegram.provider';
import { WhatsAppProvider } from './providers/whatsapp/whatsapp.provider';
import { ChannelsFactory } from './channels.factory';
import { DatabaseModule } from 'src/database/database.module';
import { WhatsAppSessionManager } from './providers/whatsapp/whatsapp-session.manager';
import { WhatsAppMessageService } from './providers/whatsapp/whatsapp-message.service';
import { ChatModule } from 'src/chat/chat.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => ChatModule)],
  controllers: [ChannelsController],
  providers: [
    ChannelsService,
    WhatsAppProvider,
    InstagramProvider,
    TelegramProvider,
    ChannelsFactory,
    WhatsAppSessionManager,
    WhatsAppMessageService,
  ],
  exports: [ChannelsService, ChannelsFactory, WhatsAppSessionManager],
})
export class ChannelsModule {}
