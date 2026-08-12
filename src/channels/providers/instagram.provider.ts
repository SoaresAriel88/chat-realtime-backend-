import { Injectable } from '@nestjs/common';
import { Channel } from '@prisma/client';
import { ChannelProvider } from './channel-provider.interface';

@Injectable()
export class InstagramProvider implements ChannelProvider {
  async connect(channel: Channel) {
    console.log(`Instagram conectado ${channel.id}`);
  }

  async disconnect(channel: Channel) {
    console.log(`Instagram desconectado ${channel.id}`);
  }

  async sendMessage(data: { channel: Channel; to: string; message: string }) {
    console.log(`Instagram mensagem para ${data.to}`);
  }
}
