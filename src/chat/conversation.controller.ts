import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { ChatGateway } from './chat.gateway';

@UseGuards(JwtAuthGuard)
@SkipThrottle()
@Controller('conversations')
export class ConversationController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get()
  async findAll(@Req() req: any) {
    const tenantId: string = req.user.tenantId;

    const conversations = await this.chatService.findAllConversations(tenantId);

    return conversations.map((conversation) => {
      const lastMessage = conversation.messages[0];

      return {
        id: conversation.id,
        tenantId: conversation.tenantId,

        // IMPORTANTE:
        // null = chat interno
        // valor = chat externo
        channelId: conversation.channelId,

        name:
          conversation.channelId && conversation.contact
            ? conversation.contact.name
            : conversation.name,

        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,

        lastMessage: lastMessage
          ? {
              content: lastMessage.content,
              createdAt: lastMessage.createdAt,
              authorName: lastMessage.author?.name ?? 'Cliente',
            }
          : undefined,
      };
    });
  }

  @Get(':id/messages')
  async getMessages(@Param('id') id: string, @Req() req: any) {
    const tenantId: string = req.user.tenantId;
    const conversation = await this.chatService.findConversationById(
      tenantId,
      id,
    );

    if (!conversation) {
      throw new NotFoundException('Conversation não encontrada');
    }

    const messages = await this.chatService.getMessagesByConversationId(
      tenantId,
      conversation.id,
    );

    return messages.map((message) => ({
      id: message.id,
      tenantId: conversation.tenantId,
      type: message.type,
      content: message.content,

      fileUrl: message.fileUrl,
      fileName: message.fileName,
      mimeType: message.mimeType,
      fileSize: message.fileSize,
      audioDuration: message.audioDuration,

      createdAt: message.createdAt,
      authorId: message.authorId,
      conversationId: message.conversationId,
      author: message.author,
    }));
  }
  @Post(':id/messages')
  async sendMessage(
    @Param('id') id: string,
    @Body() body: { message?: string },
    @Req() req: any,
  ) {
    const tenantId: string = req.user.tenantId;
    const authorId: string = req.user.id;

    const message = body?.message?.trim();

    if (!tenantId) {
      throw new BadRequestException('Tenant inválido');
    }

    if (!authorId) {
      throw new BadRequestException('Usuário autenticado inválido');
    }

    if (!message) {
      throw new BadRequestException('Mensagem é obrigatória');
    }

    const savedMessage = await this.chatService.sendExternalMessage({
      conversationId: id,
      tenantId,
      authorId,
      message,
    });

    return {
      id: savedMessage.id,
      tenantId: savedMessage.tenantId,
      conversationId: savedMessage.conversationId,
      contactId: savedMessage.contactId,
      type: savedMessage.type,
      content: savedMessage.content,
      fileUrl: savedMessage.fileUrl,
      fileName: savedMessage.fileName,
      mimeType: savedMessage.mimeType,
      fileSize: savedMessage.fileSize,
      audioDuration: savedMessage.audioDuration,
      createdAt: savedMessage.createdAt,
      authorId: savedMessage.authorId,
      author: savedMessage.author,
    };
  }

  @Post()
  async create(@Body() body: { name?: string }, @Req() req: any) {
    const name = body?.name?.trim();
    const tenantId: string = req.user.tenantId;
    if (!tenantId) throw new BadRequestException('Tenant inválido');
    if (!name)
      throw new BadRequestException('Nome da conversation é obrigatório');

    const conversation = await this.chatService.roomCreate({ name, tenantId });

    const payload = {
      id: conversation.id,
      tenantId: conversation.tenantId,
      name: conversation.name,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };

    this.chatGateway.emitRoomCreatedToTenant(tenantId, payload);
    return payload;
  }
}
