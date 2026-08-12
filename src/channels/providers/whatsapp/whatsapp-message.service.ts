import { Injectable, Logger } from '@nestjs/common';
import { MessageType, Prisma } from '@prisma/client';
import { ChatEventsService } from 'src/chat/chat-events.service';
import { PrismaService } from 'src/database/prisma.service';

import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import type { WAMessage } from '@whiskeysockets/baileys';

import { WhatsAppSessionManager } from './whatsapp-session.manager';

export interface WhatsAppProviderMessage {
  phone?: string;
  pushName?: string;
  text?: string;
  fromMe?: boolean;

  groupJid?: string;
  groupName?: string;

  participantJid?: string;
  participantAlt?: string;

  raw?: WAMessage;
}

interface ParsedWhatsAppMessage {
  channelId: string;

  remoteJid: string;
  remoteJidAlt: string;

  phone: string;
  pushName: string;

  fromMe: boolean;

  text: string;

  type: MessageType | 'NEWSLETTER';

  isGroup: boolean;
  isNewsletter: boolean;

  groupJid?: string;
  groupName?: string;

  participantJid?: string;
  participantAlt?: string;

  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  audioDuration?: number;

  raw: WAMessage;
}

@Injectable()
export class WhatsAppMessageService {
  private readonly logger = new Logger(WhatsAppMessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatEvents: ChatEventsService,
    private readonly sessionManager: WhatsAppSessionManager,
  ) {}

  // ============================================================
  // PROCESSAMENTO PRINCIPAL
  // ============================================================

  async process(
    channelId: string,
    message: WhatsAppProviderMessage,
  ): Promise<void> {
    console.log(
      'RAW WHATSAPP PROVIDER MESSAGE:',
      JSON.stringify(message, null, 2),
    );

    const channel = await this.prisma.channel.findUnique({
      where: {
        id: channelId,
      },
    });

    if (!channel) {
      this.logger.warn(`Canal ${channelId} não encontrado`);
      return;
    }

    const parsed = this.parseMessage(channelId, message);

    // ----------------------------------------------------------
    // Mensagem enviada pelo próprio WhatsApp
    // ----------------------------------------------------------

    if (parsed.fromMe) {
      this.logger.debug(
        `Mensagem enviada pelo próprio sistema: ${parsed.remoteJid}`,
      );

      return;
    }

    // ----------------------------------------------------------
    // Newsletter
    // ----------------------------------------------------------

    if (parsed.isNewsletter) {
      this.logger.debug(`Mensagem de newsletter ignorada: ${parsed.remoteJid}`);

      return;
    }

    // ----------------------------------------------------------
    // Telefone obrigatório para conversa individual
    // ----------------------------------------------------------

    if (!parsed.phone && !parsed.isGroup) {
      this.logger.warn(
        `Não foi possível identificar telefone. remoteJid=${parsed.remoteJid}`,
      );

      return;
    }

    // ----------------------------------------------------------
    // Download de mídia
    // ----------------------------------------------------------

    let fileUrl: string | undefined;

    if (
      parsed.type === MessageType.IMAGE ||
      parsed.type === MessageType.FILE ||
      parsed.type === MessageType.AUDIO
    ) {
      if (!parsed.mimeType) {
        this.logger.warn(`Mídia recebida sem MIME type: ${parsed.remoteJid}`);
      } else {
        try {
          const media = await this.saveWhatsAppMedia(
            channelId,
            parsed.raw,
            parsed.mimeType,
          );

          fileUrl = media.fileUrl;

          parsed.fileName = media.fileName;

          this.logger.log(`Mídia WhatsApp baixada: ${fileUrl}`);
        } catch (error) {
          this.logger.error('Erro ao baixar mídia WhatsApp', error);

          return;
        }
      }
    }

    // ----------------------------------------------------------
    // Log normalizado
    // ----------------------------------------------------------

    console.log('PARSED WHATSAPP MESSAGE:', {
      phone: parsed.phone,
      text: parsed.text,
      pushName: parsed.pushName,
      fromMe: parsed.fromMe,

      remoteJid: parsed.remoteJid,
      remoteJidAlt: parsed.remoteJidAlt,

      isGroup: parsed.isGroup,

      groupJid: parsed.groupJid,
      groupName: parsed.groupName,

      participantJid: parsed.participantJid,
      participantAlt: parsed.participantAlt,

      type: parsed.type,

      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
      fileSize: parsed.fileSize,
      audioDuration: parsed.audioDuration,
    });

    // ----------------------------------------------------------
    // Resolve contato e conversa
    // ----------------------------------------------------------

    const { conversation, contactId } = await this.resolveConversation(
      channel.tenantId,
      channel.id,
      parsed,
    );

    // ----------------------------------------------------------
    // Salva mensagem
    // ----------------------------------------------------------

    const savedMessage = await this.prisma.message.create({
      data: {
        tenantId: channel.tenantId,

        conversationId: conversation.id,

        contactId,

        authorId: null,

        type: parsed.type === 'NEWSLETTER' ? MessageType.TEXT : parsed.type,

        content: parsed.text || null,

        fileUrl: fileUrl ?? null,

        fileName: parsed.fileName ?? null,

        mimeType: parsed.mimeType ?? null,

        fileSize: parsed.fileSize ?? null,

        audioDuration: parsed.audioDuration ?? null,
      },

      include: {
        contact: true,
        author: true,
      },
    });

    this.logger.log(`Mensagem salva: ${savedMessage.id}`);

    // ----------------------------------------------------------
    // Busca conversa
    // ----------------------------------------------------------

    const conversationWithContact = await this.prisma.conversation.findFirst({
      where: {
        id: conversation.id,
        tenantId: channel.tenantId,
      },

      include: {
        contact: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!conversationWithContact) {
      throw new Error('Conversa não encontrada após salvar mensagem');
    }

    // ----------------------------------------------------------
    // Realtime
    // ----------------------------------------------------------

    this.chatEvents.emitNewMessage(conversation.id, savedMessage);

    this.chatEvents.emitConversationUpdated(
      channel.tenantId,
      conversationWithContact,
      savedMessage,
    );

    this.logger.log(
      `Mensagem ${savedMessage.id} processada na conversa ${conversation.id}`,
    );
  }

  // ============================================================
  // RESOLUÇÃO DA CONVERSA
  // ============================================================

  private async resolveConversation(
    tenantId: string,
    channelId: string,
    parsed: ParsedWhatsAppMessage,
  ): Promise<{
    conversation: {
      id: string;
    };

    contactId: string | null;
  }> {
    // ----------------------------------------------------------
    // GRUPO
    // ----------------------------------------------------------

    if (parsed.isGroup && parsed.groupJid) {
      const group = await this.findOrCreateWhatsAppGroup(
        tenantId,
        channelId,
        parsed.groupJid,
        parsed.groupName,
      );

      const conversation = await this.findOrCreateGroupConversation(
        tenantId,
        channelId,
        group,
      );

      let contactId: string | null = null;

      if (parsed.phone) {
        const contact = await this.findOrCreateContact(
          tenantId,
          parsed.phone,
          parsed.pushName || undefined,
        );

        contactId = contact.id;
      }

      return {
        conversation,
        contactId,
      };
    }

    // ----------------------------------------------------------
    // CONVERSA INDIVIDUAL
    // ----------------------------------------------------------

    const contact = await this.findOrCreateContact(
      tenantId,
      parsed.phone,
      parsed.pushName || undefined,
    );

    const conversation = await this.findOrCreateConversation(
      tenantId,
      channelId,
      contact.id,
    );

    return {
      conversation,
      contactId: contact.id,
    };
  }

  // ============================================================
  // PARSE DA MENSAGEM
  // ============================================================

  private parseMessage(
    channelId: string,
    message: WhatsAppProviderMessage,
  ): ParsedWhatsAppMessage {
    const original = message.raw;

    if (!original) {
      throw new Error('Mensagem WhatsApp recebida sem payload raw');
    }

    const remoteJid = original.key?.remoteJid ?? '';

    const remoteJidAlt = original.key?.remoteJidAlt ?? '';

    const participant = original.key?.participant ?? '';

    const participantAlt = original.key?.participantAlt ?? '';

    const fromMe = Boolean(original.key?.fromMe ?? message.fromMe);

    const pushName = String(message.pushName ?? original.pushName ?? '');

    const isGroup = remoteJid.endsWith('@g.us');

    const isNewsletter = remoteJid.endsWith('@newsletter');

    // ----------------------------------------------------------
    // Newsletter
    // ----------------------------------------------------------

    if (isNewsletter) {
      return {
        channelId,

        remoteJid,

        remoteJidAlt,

        phone: '',

        pushName,

        fromMe,

        text: '',

        type: 'NEWSLETTER',

        isGroup: false,

        isNewsletter: true,

        raw: original,
      };
    }

    // ----------------------------------------------------------
    // Identifica remetente
    // ----------------------------------------------------------

    const jid = isGroup
      ? participantAlt || participant
      : remoteJidAlt || remoteJid;

    const phone = this.normalizePhone(jid);

    // ----------------------------------------------------------
    // Tipos
    // ----------------------------------------------------------

    const imageMessage = original.message?.imageMessage;

    const documentMessage = original.message?.documentMessage;

    const audioMessage = original.message?.audioMessage;

    // ----------------------------------------------------------
    // Texto
    // ----------------------------------------------------------

    const text = String(
      message.text ??
        original.message?.conversation ??
        original.message?.extendedTextMessage?.text ??
        imageMessage?.caption ??
        documentMessage?.caption ??
        '',
    );

    // ----------------------------------------------------------
    // Tipo
    // ----------------------------------------------------------

    let type: MessageType = MessageType.TEXT;

    if (imageMessage) {
      type = MessageType.IMAGE;
    } else if (documentMessage) {
      type = MessageType.FILE;
    } else if (audioMessage) {
      type = MessageType.AUDIO;
    }

    // ----------------------------------------------------------
    // Metadados
    // ----------------------------------------------------------

    let fileName: string | undefined;

    let mimeType: string | undefined;

    let fileSize: number | undefined;

    let audioDuration: number | undefined;

    if (imageMessage) {
      mimeType = imageMessage.mimetype ?? undefined;

      fileSize = this.parseFileSize(imageMessage.fileLength);
    }

    if (documentMessage) {
      fileName = documentMessage.fileName ?? undefined;

      mimeType = documentMessage.mimetype ?? undefined;

      fileSize = this.parseFileSize(documentMessage.fileLength);
    }

    if (audioMessage) {
      mimeType = audioMessage.mimetype ?? undefined;

      fileSize = this.parseFileSize(audioMessage.fileLength);

      audioDuration =
        audioMessage.seconds !== null && audioMessage.seconds !== undefined
          ? Number(audioMessage.seconds)
          : undefined;
    }

    return {
      channelId,

      remoteJid,

      remoteJidAlt,

      phone,

      pushName,

      fromMe,

      text,

      type,

      isGroup,

      isNewsletter,

      groupJid: isGroup ? remoteJid : undefined,

      groupName: message.groupName,

      participantJid: isGroup ? participant : undefined,

      participantAlt: isGroup ? participantAlt : undefined,

      fileName,

      mimeType,

      fileSize,

      audioDuration,

      raw: original,
    };
  }

  // ============================================================
  // TAMANHO
  // ============================================================

  private parseFileSize(value: unknown): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    try {
      const parsed = Number(value);

      return Number.isFinite(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  // ============================================================
  // TELEFONE
  // ============================================================

  private normalizePhone(value: string): string {
    return String(value)
      .trim()
      .replace(/^mailto:/, '')
      .replace(/^https?:\/\//, '')
      .replace('@s.whatsapp.net', '')
      .replace('@lid', '')
      .replace(/\D/g, '');
  }

  // ============================================================
  // CONTATO
  // ============================================================

  async findOrCreateContact(tenantId: string, phone: string, name?: string) {
    const normalizedPhone = this.normalizePhone(phone);

    if (!normalizedPhone) {
      throw new Error('Telefone inválido para criação do contato');
    }

    const identity = await this.prisma.contactIdentity.findUnique({
      where: {
        channel_externalId: {
          channel: 'WHATSAPP',
          externalId: normalizedPhone,
        },
      },

      include: {
        contact: true,
      },
    });

    // ----------------------------------------------------------
    // Já existe
    // ----------------------------------------------------------

    if (identity) {
      if (identity.contact.tenantId !== tenantId) {
        throw new Error('Contato WhatsApp pertence a outro tenant');
      }

      if (name && identity.contact.name !== name) {
        return this.prisma.contact.update({
          where: {
            id: identity.contact.id,
          },

          data: {
            name,
          },
        });
      }

      return identity.contact;
    }

    // ----------------------------------------------------------
    // Cria contato
    // ----------------------------------------------------------

    const contact = await this.prisma.contact.create({
      data: {
        tenantId,

        name: name || normalizedPhone,
      },
    });

    // ----------------------------------------------------------
    // Cria identidade
    // ----------------------------------------------------------

    try {
      await this.prisma.contactIdentity.create({
        data: {
          contactId: contact.id,

          channel: 'WHATSAPP',

          externalId: normalizedPhone,
        },
      });

      this.logger.log(`Contato WhatsApp criado: ${contact.id}`);

      return contact;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existingIdentity = await this.prisma.contactIdentity.findUnique({
          where: {
            channel_externalId: {
              channel: 'WHATSAPP',
              externalId: normalizedPhone,
            },
          },

          include: {
            contact: true,
          },
        });

        if (existingIdentity) {
          await this.prisma.contact.delete({
            where: {
              id: contact.id,
            },
          });

          if (existingIdentity.contact.tenantId !== tenantId) {
            throw new Error('Contato WhatsApp pertence a outro tenant');
          }

          return existingIdentity.contact;
        }
      }

      throw error;
    }
  }

  // ============================================================
  // CONVERSA INDIVIDUAL
  // ============================================================

  async findOrCreateConversation(
    tenantId: string,
    channelId: string,
    contactId: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        tenantId,

        channelId,

        contactId,
      },
    });

    if (conversation) {
      return conversation;
    }

    const created = await this.prisma.conversation.create({
      data: {
        tenantId,

        channelId,

        contactId,

        name: `WhatsApp-${contactId}`,
      },
    });

    this.logger.log(`Conversation criada: ${created.id}`);

    return created;
  }

  // ============================================================
  // GRUPO
  // ============================================================

  private async findOrCreateWhatsAppGroup(
    tenantId: string,
    channelId: string,
    groupJid: string,
    groupName?: string,
  ) {
    const existing = await this.prisma.whatsAppGroup.findUnique({
      where: {
        tenantId_channelId_externalId: {
          tenantId,

          channelId,

          externalId: groupJid,
        },
      },
    });

    if (existing) {
      if (groupName && existing.name !== groupName) {
        return this.prisma.whatsAppGroup.update({
          where: {
            id: existing.id,
          },

          data: {
            name: groupName,
          },
        });
      }

      return existing;
    }

    const created = await this.prisma.whatsAppGroup.create({
      data: {
        tenantId,

        channelId,

        externalId: groupJid,

        name: groupName || groupJid,
      },
    });

    this.logger.log(`WhatsAppGroup criado: ${created.id}`);

    return created;
  }

  // ============================================================
  // CONVERSA DE GRUPO
  // ============================================================

  private async findOrCreateGroupConversation(
    tenantId: string,
    channelId: string,
    group: {
      id: string;
      name: string | null;
    },
  ) {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        tenantId,

        channelId,

        groupId: group.id,
      },
    });

    if (existing) {
      return existing;
    }

    const created = await this.prisma.conversation.create({
      data: {
        tenantId,

        channelId,

        groupId: group.id,

        name: group.name || `WhatsApp-${group.id}`,
      },
    });

    this.logger.log(`Conversation de grupo criada: ${created.id}`);

    return created;
  }

  // ============================================================
  // DOWNLOAD E SALVAMENTO DE MÍDIA
  // ============================================================

  private async saveWhatsAppMedia(
    channelId: string,
    message: WAMessage,
    mimeType: string,
  ): Promise<{
    fileUrl: string;
    filePath: string;
    fileName: string;
  }> {
    const buffer = await this.sessionManager.downloadMedia(channelId, message);

    const uploadDirectory = 'uploads/chat';

    await mkdir(uploadDirectory, {
      recursive: true,
    });

    const extension = this.getExtensionFromMimeType(mimeType);

    const fileName = `${randomUUID()}${extension}`;

    const filePath = `${uploadDirectory}/${fileName}`;

    await writeFile(filePath, buffer);

    const fileUrl = `/uploads/chat/${fileName}`;

    this.logger.log(
      `Mídia WhatsApp salva: ${fileName} (${buffer.length} bytes)`,
    );

    return {
      fileUrl,

      filePath,

      fileName,
    };
  }

  // ============================================================
  // EXTENSÃO
  // ============================================================

  private getExtensionFromMimeType(mimeType: string): string {
    const mime = mimeType.split(';')[0].trim().toLowerCase();

    const extensions: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',

      'application/pdf': '.pdf',

      'application/msword': '.doc',

      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        '.docx',

      'application/vnd.ms-excel': '.xls',

      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        '.xlsx',

      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'audio/webm': '.webm',
    };

    return extensions[mime] ?? '';
  }
}
