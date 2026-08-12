import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from 'src/database/prisma.service';
import { ConversationController } from './conversation.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatUploadController } from './chat-upload.controller';
import { NotificationModule } from 'src/notification/notification.module';
import { ChannelsModule } from 'src/channels/channels.module';
import { ChatEventsService } from './chat-events.service';

@Module({
  imports: [JwtModule, NotificationModule, forwardRef(() => ChannelsModule)],
  controllers: [ConversationController, ChatUploadController],
  providers: [ChatGateway, ChatService, PrismaService, ChatEventsService],
  exports: [ChatService, ChatEventsService],
})
export class ChatModule {}
