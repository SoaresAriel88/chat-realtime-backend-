import { Injectable } from '@nestjs/common';
import { Channel } from '@prisma/client';
import { ChannelProvider } from './channel-provider.interface';

@Injectable()
export class TelegramProvider implements ChannelProvider {
  async connect(channel: Channel): Promise<void> {
    console.log(`Telegram conectado ${channel.id}`);
  }

  async disconnect(channel: Channel): Promise<void> {
    console.log(`Telegram desconectado ${channel.id}`);
  }

  async sendMessage(data: {
    channel: Channel;
    to: string;
    message: string;
  }): Promise<void> {
    console.log(`Telegram enviando para ${data.to}: ${data.message}`);
  }
}
