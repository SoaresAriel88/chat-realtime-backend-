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
        name: conversation.name,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        lastMessage: lastMessage
          ? {
              content: lastMessage.content,
              createdAt: lastMessage.createdAt,
              authorName: lastMessage.author.name,
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
