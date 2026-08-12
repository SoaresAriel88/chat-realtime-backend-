import { Injectable } from '@nestjs/common';
import { WhatsAppProvider } from './providers/whatsapp/whatsapp.provider';
import { InstagramProvider } from './providers/instagram.provider';
import { TelegramProvider } from './providers/telegram.provider';
import { ChannelProvider } from './providers/channel-provider.interface';
import { ChannelType } from '@prisma/client';

@Injectable()
export class ChannelsFactory {
  constructor(
    private readonly whatsappProvider: WhatsAppProvider,
    private readonly instagramProvider: InstagramProvider,
    private readonly telegramProvider: TelegramProvider,
  ) {}

  getProvider(type: ChannelType): ChannelProvider {
    switch (type) {
      case ChannelType.WHATSAPP:
        return this.whatsappProvider;

      case ChannelType.INSTAGRAM:
        return this.instagramProvider;

      case ChannelType.TELEGRAM:
        return this.telegramProvider;

      default:
        throw new Error(`Unsupported channel type: ${type}`);
    }
  }
}
