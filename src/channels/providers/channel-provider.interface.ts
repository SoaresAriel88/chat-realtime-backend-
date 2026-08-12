import { Channel, MessageType } from '@prisma/client';

export interface ChannelProvider {
  connect(channel: Channel): Promise<void>;

  disconnect(channel: Channel): Promise<void>;

  sendMessage(data: {
    channel: Channel;
    to: string;
    message: string;
  }): Promise<void>;

  sendAttachment?(data: {
    channel: Channel;
    to: string;
    type: MessageType;
    filePath: string;
    fileName?: string;
    mimeType?: string;
    caption?: string;
  }): Promise<void>;
}
