import { Injectable } from '@nestjs/common';

type NewMessageCallback = (roomId: string, message: any) => void;

type ConversationUpdatedCallback = (
  tenantId: string,
  conversation: any,
  message: any,
) => void;

type WhatsAppQrCallback = (channelId: string, qrCode: string) => void;

type WhatsAppConnectionCallback = (
  channelId: string,
  status: 'connected' | 'disconnected',
) => void;

@Injectable()
export class ChatEventsService {
  private newMessageCallback?: NewMessageCallback;

  private conversationUpdatedCallback?: ConversationUpdatedCallback;

  private whatsappQrCallback?: WhatsAppQrCallback;

  private whatsappConnectionCallback?: WhatsAppConnectionCallback;

  // ============================================================
  // NOVA MENSAGEM
  // ============================================================

  registerNewMessage(callback: NewMessageCallback): void {
    this.newMessageCallback = callback;
  }

  emitNewMessage(roomId: string, message: any): void {
    console.log('EVENT SERVICE - NEW MESSAGE:', {
      roomId,
      id: message.id,
      content: message.content,
      type: message.type,
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      mimeType: message.mimeType,
      fileSize: message.fileSize,
      audioDuration: message.audioDuration,
    });

    if (!this.newMessageCallback) {
      console.warn('Nenhum callback de nova mensagem registrado');

      return;
    }

    this.newMessageCallback(roomId, message);
  }

  // ============================================================
  // CONVERSA ATUALIZADA
  // ============================================================

  registerConversationUpdated(callback: ConversationUpdatedCallback): void {
    this.conversationUpdatedCallback = callback;
  }

  emitConversationUpdated(
    tenantId: string,
    conversation: any,
    message: any,
  ): void {
    console.log('EVENT SERVICE - CONVERSATION UPDATED:', {
      tenantId,
      conversationId: conversation.id,
      messageId: message.id,
      type: message.type,
      content: message.content,
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      mimeType: message.mimeType,
      fileSize: message.fileSize,
      audioDuration: message.audioDuration,
    });

    if (!this.conversationUpdatedCallback) {
      console.warn('Nenhum callback de conversa atualizada registrado');

      return;
    }

    this.conversationUpdatedCallback(tenantId, conversation, message);
  }

  // ============================================================
  // WHATSAPP QR CODE
  // ============================================================

  registerWhatsAppQr(callback: WhatsAppQrCallback): void {
    this.whatsappQrCallback = callback;
  }

  emitWhatsAppQr(channelId: string, qrCode: string): void {
    console.log('EVENT SERVICE - WHATSAPP QR:', {
      channelId,
    });

    if (!this.whatsappQrCallback) {
      console.warn('Nenhum callback de QR Code do WhatsApp registrado');

      return;
    }

    this.whatsappQrCallback(channelId, qrCode);
  }

  // ============================================================
  // CONEXÃO WHATSAPP
  // ============================================================

  registerWhatsAppConnection(callback: WhatsAppConnectionCallback): void {
    this.whatsappConnectionCallback = callback;
  }

  emitWhatsAppConnection(
    channelId: string,
    status: 'connected' | 'disconnected',
  ): void {
    console.log('EVENT SERVICE - WHATSAPP CONNECTION:', {
      channelId,
      status,
    });

    if (!this.whatsappConnectionCallback) {
      console.warn('Nenhum callback de conexão WhatsApp registrado');

      return;
    }

    this.whatsappConnectionCallback(channelId, status);
  }
}
