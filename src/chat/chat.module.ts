import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from 'src/database/prisma.service';
import { ConversationController } from './conversation.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatUploadController } from './chat-upload.controller';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [JwtModule, NotificationModule],
  controllers: [ConversationController, ChatUploadController],
  providers: [ChatGateway, ChatService, PrismaService],
  exports: [ChatService],
})
export class ChatModule {}
