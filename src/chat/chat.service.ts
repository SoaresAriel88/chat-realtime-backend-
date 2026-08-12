import { Injectable } from '@nestjs/common';
import { Conversation, MessageType } from '@prisma/client';

import { PrismaService } from 'src/database/prisma.service';
import { ChannelsFactory } from 'src/channels/channels.factory';

import { ChatEventsService } from './chat-events.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelsFactory: ChannelsFactory,
    private readonly chatEvents: ChatEventsService,
  ) {}

  // ============================================================
  // CONVERSATIONS
  // ============================================================

  async roomCreate(data: {
    name: string;
    tenantId: string;
    channelId?: string;
  }): Promise<Conversation> {
    const tenantId = data.tenantId?.trim();
    const name = data.name?.trim();

    if (!tenantId) {
      throw new Error('Tenant inválido');
    }

    if (!name) {
      throw new Error('Nome da sala é obrigatório');
    }

    return this.prisma.conversation.create({
      data: {
        name,

        tenant: {
          connect: {
            id: tenantId,
          },
        },

        channel: data.channelId
          ? {
              connect: {
                id: data.channelId,
              },
            }
          : undefined,
      },
    });
  }

  async findRoomByName(tenantId: string, name: string) {
    return this.prisma.conversation.findFirst({
      where: {
        tenantId,
        name,
      },
    });
  }

  async findConversationById(tenantId: string, id: string) {
    return this.prisma.conversation.findFirst({
      where: {
        tenantId,
        id,
      },
    });
  }

  async findRoomByIdOrName(identifier: string, tenantId: string) {
    const normalizedIdentifier = identifier?.trim();

    if (!normalizedIdentifier || !tenantId) {
      return null;
    }

    return this.prisma.conversation.findFirst({
      where: {
        tenantId,
        OR: [
          {
            id: normalizedIdentifier,
          },
          {
            name: normalizedIdentifier,
          },
        ],
      },
    });
  }

  async findAllConversations(tenantId: string) {
    return this.prisma.conversation.findMany({
      where: {
        tenantId,
      },

      orderBy: {
        updatedAt: 'desc',
      },

      include: {
        contact: {
          select: {
            id: true,
            name: true,
          },
        },

        messages: {
          orderBy: {
            createdAt: 'desc',
          },

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

  // ============================================================
  // MESSAGES
  // ============================================================

  async getMessagesByConversationId(tenantId: string, conversationId: string) {
    return this.prisma.message.findMany({
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

    // ----------------------------------------------------------
    // Validações
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // Validação da conversa
    // ----------------------------------------------------------

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        tenantId,
      },
    });

    if (!conversation) {
      throw new Error('Conversa não encontrada');
    }

    // ----------------------------------------------------------
    // Criação da mensagem
    // ----------------------------------------------------------

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

    return {
      ...message,
      conversation,
    };
  }

  async findConversationParticipants(
    conversationId: string,
    tenantId: string,
    authorId: string,
  ) {
    return this.prisma.conversationParticipant.findMany({
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

  // ============================================================
  // EXTERNAL CHANNELS
  // ============================================================
  async sendExternalMessage(data: {
    conversationId: string;
    tenantId: string;
    authorId: string;
    message: string;
  }) {
    const content = data.message.trim();

    if (!content) {
      throw new Error('Mensagem vazia');
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: data.conversationId,
        tenantId: data.tenantId,
      },

      include: {
        contact: {
          include: {
            identities: {
              where: {
                channel: 'WHATSAPP',
              },
            },
          },
        },

        group: true,

        channel: true,
      },
    });

    if (!conversation) {
      throw new Error('Conversa não encontrada');
    }

    if (!conversation.channelId) {
      throw new Error('Essa conversa não possui canal externo');
    }

    const channel = conversation.channel;

    if (!channel) {
      throw new Error('Canal não encontrado');
    }

    if (channel.tenantId !== data.tenantId) {
      throw new Error('Canal não pertence à empresa');
    }

    if (channel.type !== 'WHATSAPP') {
      throw new Error('O canal dessa conversa não é WhatsApp');
    }

    // ==========================================================
    // DESTINATÁRIO
    // ==========================================================

    let recipient: string;

    // ----------------------------------------------------------
    // GRUPO
    // ----------------------------------------------------------

    if (conversation.group) {
      recipient = conversation.group.externalId;

      console.log('DESTINATÁRIO WHATSAPP - GRUPO:', {
        conversationId: conversation.id,
        groupId: conversation.group.id,
        groupName: conversation.group.name,
        externalId: recipient,
      });
    }

    // ----------------------------------------------------------
    // CONVERSA INDIVIDUAL
    // ----------------------------------------------------------
    else {
      const identity = conversation.contact?.identities[0];

      if (!identity) {
        throw new Error('Contato não possui identidade WhatsApp');
      }

      recipient = identity.externalId;

      console.log('DESTINATÁRIO WHATSAPP - INDIVIDUAL:', {
        conversationId: conversation.id,
        contactId: conversation.contact?.id,
        contactName: conversation.contact?.name,
        externalId: recipient,
      });
    }

    // ==========================================================
    // SALVA A MENSAGEM
    // ==========================================================

    const savedMessage = await this.saveMessageByConversation({
      conversationId: conversation.id,
      tenantId: data.tenantId,
      authorId: data.authorId,
      type: MessageType.TEXT,
      content,
    });

    // ==========================================================
    // ENVIA PARA O WHATSAPP
    // ==========================================================

    const provider = this.channelsFactory.getProvider(channel.type);

    await provider.sendMessage({
      channel,
      to: recipient,
      message: content,
    });

    // ==========================================================
    // REALTIME
    // ==========================================================

    this.chatEvents.emitNewMessage(conversation.id, savedMessage);

    return savedMessage;
  }
  async sendExternalAttachment(data: {
    conversationId: string;
    tenantId: string;
    authorId: string;
    filePath: string;
    fileUrl: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    type: MessageType;
    caption?: string;
  }) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: data.conversationId,
        tenantId: data.tenantId,
      },
      include: {
        contact: {
          include: {
            identities: {
              where: {
                channel: 'WHATSAPP',
              },
            },
          },
        },
        group: true,
        channel: true,
      },
    });

    if (!conversation) {
      throw new Error('Conversa não encontrada');
    }

    if (!conversation.channelId || !conversation.channel) {
      throw new Error('Essa conversa não possui canal externo');
    }

    if (conversation.channel.type !== 'WHATSAPP') {
      throw new Error('O canal dessa conversa não é WhatsApp');
    }

    let to: string;

    // ==========================================
    // GRUPO
    // ==========================================

    if (conversation.group) {
      to = conversation.group.externalId;
    }

    // ==========================================
    // INDIVIDUAL
    // ==========================================
    else {
      const identity = conversation.contact?.identities[0];

      if (!identity) {
        throw new Error('Contato não possui identidade WhatsApp');
      }

      to = identity.externalId;
    }

    // ==========================================
    // SALVA NO BANCO
    // ==========================================

    const savedMessage = await this.saveMessageByConversation({
      conversationId: conversation.id,
      tenantId: data.tenantId,
      authorId: data.authorId,
      type: data.type,
      content: data.caption,
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
    });

    // ==========================================
    // ENVIA PARA WHATSAPP
    // ==========================================

    const provider = this.channelsFactory.getProvider(
      conversation.channel.type,
    );

    if (!provider.sendAttachment) {
      throw new Error('O provider WhatsApp não suporta envio de anexos');
    }

    await provider.sendAttachment({
      channel: conversation.channel,
      to,
      type: data.type,
      filePath: data.filePath,
      fileName: data.fileName,
      mimeType: data.mimeType,
      caption: data.caption,
    });

    // ==========================================
    // REALTIME
    // ==========================================

    this.chatEvents.emitNewMessage(conversation.id, savedMessage);

    return savedMessage;
  }
}
