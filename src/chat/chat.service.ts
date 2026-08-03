import { Injectable } from '@nestjs/common';
import { Conversation } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { MessageType } from '@prisma/client';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async roomCreate(data: {
    name: string;
    tenantId: string;
  }): Promise<Conversation> {
    if (!data.tenantId) {
      throw new Error('Tenant inválido');
    }

    if (!data.name) {
      throw new Error('Nome da sala é obrigatório');
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        name: data.name,
        tenant: {
          connect: {
            id: data.tenantId,
          },
        },
      },
    });

    return conversation;
  }

  async findRoomByName(tenantId: string, name: string) {
    return await this.prisma.conversation.findFirst({
      where: {
        tenantId,
        name,
      },
    });
  }

  async findConversationById(tenantId: string, id: string) {
    return await this.prisma.conversation.findFirst({
      where: {
        tenantId,
        id,
      },
    });
  }

  async findAllConversations(tenantId: string) {
    return await this.prisma.conversation.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            author: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async getMessagesByConversationId(tenantId: string, conversationId: string) {
    return await this.prisma.message.findMany({
      where: {
        tenantId,
        conversationId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async saveMessageByConversation(data: {
    conversationId: string;
    tenantId: string;
    authorId: string;

    type?: MessageType;
    content?: string;

    fileUrl?: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;

    audioDuration?: number;
  }) {
    const conversationId = data.conversationId?.trim();
    const tenantId = data.tenantId?.trim();
    const authorId = data.authorId?.trim();

    const type = data.type ?? MessageType.TEXT;
    const content = data.content?.trim() || null;

    const fileUrl = data.fileUrl?.trim() || null;
    const fileName = data.fileName?.trim() || null;
    const mimeType = data.mimeType?.trim() || null;

    if (!tenantId) {
      throw new Error('ID da empresa é obrigatório');
    }

    if (!conversationId) {
      throw new Error('ID da conversa é obrigatório');
    }

    if (!authorId) {
      throw new Error('ID do autor é obrigatório');
    }

    if (type === MessageType.TEXT && !content) {
      throw new Error('Mensagem de texto vazia');
    }

    if (type !== MessageType.TEXT && !fileUrl) {
      throw new Error('Arquivo da mensagem não informado');
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        tenantId,
        id: conversationId,
      },
    });

    if (!conversation) {
      throw new Error('Conversation não encontrada');
    }

    const message = await this.prisma.message.create({
      data: {
        type,
        content,

        fileUrl,
        fileName,
        mimeType,
        fileSize: data.fileSize ?? null,
        audioDuration: data.audioDuration ?? null,

        tenantId,
        conversationId,
        authorId,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return message;
  }

  async findRoomByIdOrName(identifier: string, tenantId: string) {
    console.log('FIND ROOM DEBUG:', {
      identifier,
      tenantId,
    });

    return await this.prisma.conversation.findFirst({
      where: {
        tenantId,
        OR: [
          {
            id: identifier,
          },
          {
            name: identifier,
          },
        ],
      },
    });
  }

  async findConversationParticipants(
    conversationId: string,
    tenantId: string,
    authorId: string,
  ) {
    return await this.prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        tenantId,
        userId: {
          not: authorId,
        },
        leftAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }
  async addParticipant(data: {
    userId: string;
    conversationId: string;
    tenantId: string;
  }) {
    return this.prisma.conversationParticipant.upsert({
      where: {
        userId_conversationId: {
          userId: data.userId,
          conversationId: data.conversationId,
        },
      },

      update: {
        leftAt: null,
      },

      create: {
        userId: data.userId,
        conversationId: data.conversationId,
        tenantId: data.tenantId,
      },
    });
  }
  async getConversationParticipants(conversationId: string, tenantId: string) {
    return this.prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        tenantId,
      },
      select: {
        userId: true,
      },
    });
  }
}
