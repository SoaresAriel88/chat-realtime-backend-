import {
  BadRequestException,
  Controller,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MessageType } from '@prisma/client';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { Express } from 'express';

import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

type AuthenticatedRequest = {
  user: {
    id: string;
    email: string;
    tenantId: string;
  };
};

const allowedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',

  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
];

@Controller('chat')
export class ChatUploadController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Post('conversations/:conversationId/attachments')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/chat',

        filename: (_request, file, callback) => {
          const extension = extname(file.originalname).toLowerCase();

          const fileName = `${randomUUID()}${extension}`;

          callback(null, fileName);
        },
      }),

      limits: {
        fileSize: 10 * 1024 * 1024,
      },

      fileFilter: (_request, file, callback) => {
        const isAllowed = allowedMimeTypes.includes(file.mimetype);

        if (!isAllowed) {
          callback(
            new BadRequestException('Tipo de arquivo não permitido'),
            false,
          );

          return;
        }

        callback(null, true);
      },
    }),
  )
  async uploadAttachment(
    @Param('conversationId') conversationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado');
    }

    const messageType = this.resolveMessageType(file.mimetype);

    const fileUrl = `/uploads/chat/${file.filename}`;

    const savedMessage = await this.chatService.saveMessageByConversation({
      conversationId,
      tenantId: request.user.tenantId,
      authorId: request.user.id,

      type: messageType,
      fileUrl,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
    });

    this.chatGateway.emitNewMessage(savedMessage.conversationId, savedMessage);

    return savedMessage;
  }

  private resolveMessageType(mimeType: string): MessageType {
    if (mimeType.startsWith('image/')) {
      return MessageType.IMAGE;
    }

    if (mimeType.startsWith('audio/')) {
      return MessageType.AUDIO;
    }

    return MessageType.FILE;
  }
}
