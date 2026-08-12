import { Injectable, Logger } from '@nestjs/common';
import { Channel, MessageType } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

import { ChannelProvider } from '../channel-provider.interface';
import { WhatsAppSessionManager } from './whatsapp-session.manager';
import {
  WhatsAppMessageService,
  type WhatsAppProviderMessage,
} from './whatsapp-message.service';

@Injectable()
export class WhatsAppProvider implements ChannelProvider {
  private readonly logger = new Logger(WhatsAppProvider.name);

  constructor(
    private readonly sessionManager: WhatsAppSessionManager,
    private readonly whatsAppMessageService: WhatsAppMessageService,
  ) {}

  // ============================================================
  // CONNECTION
  // ============================================================

  async connect(channel: Channel): Promise<void> {
    const channelId = channel.id;

    /**
     * Se já existe uma sessão ativa, não criamos outra.
     */
    if (this.sessionManager.exists(channelId)) {
      this.logger.log(`WhatsApp já possui uma sessão ativa: ${channelId}`);

      return;
    }

    /**
     * Registra o handler de mensagens.
     */
    this.sessionManager.setMessageHandler(
      async (receivedChannelId, message) => {
        if (receivedChannelId !== channelId) {
          return;
        }

        this.logger.debug(`Mensagem WhatsApp recebida no canal ${channelId}`);

        await this.handleIncomingMessage(channel, message);
      },
    );

    /**
     * QR Code gerado.
     *
     * Neste momento o QR já fica armazenado no
     * WhatsAppSessionManager.
     *
     * Futuramente podemos usar este evento para
     * emitir o QR através de WebSocket.
     */
    this.sessionManager.setQrCodeHandler(async (receivedChannelId, qr) => {
      if (receivedChannelId !== channelId) {
        return;
      }

      this.logger.log(`Novo QR Code gerado para WhatsApp: ${channelId}`);

      /**
       * Por enquanto não precisamos fazer nada aqui.
       *
       * O SessionManager já armazena o QR.
       */
      void qr;
    });

    /**
     * WhatsApp conectado.
     */
    this.sessionManager.setConnectionHandler(async (receivedChannelId) => {
      if (receivedChannelId !== channelId) {
        return;
      }

      this.logger.log(`WhatsApp conectado com sucesso: ${channelId}`);
    });

    /**
     * WhatsApp desconectado.
     */
    this.sessionManager.setDisconnectedHandler(async (receivedChannelId) => {
      if (receivedChannelId !== channelId) {
        return;
      }

      this.logger.warn(`WhatsApp desconectado: ${channelId}`);
    });

    /**
     * Cria a sessão.
     *
     * Se não estiver autenticado, o Baileys irá gerar
     * um QR Code.
     */
    await this.sessionManager.create(channelId);

    this.logger.log(`Sessão WhatsApp iniciada: ${channelId}`);
  }

  async disconnect(channel: Channel): Promise<void> {
    const channelId = channel.id;

    this.logger.log(`Desconectando WhatsApp: ${channelId}`);

    await this.sessionManager.disconnect(channelId);

    this.logger.log(`WhatsApp desconectado: ${channelId}`);
  }

  // ============================================================
  // STATUS
  // ============================================================

  isConnected(channel: Channel): boolean {
    return this.sessionManager.isConnected(channel.id);
  }

  getConnectionStatus(
    channel: Channel,
  ): 'connecting' | 'connected' | 'disconnected' {
    return this.sessionManager.getConnectionStatus(channel.id);
  }

  // ============================================================
  // QR CODE
  // ============================================================

  getQrCode(channel: Channel): string | null {
    return this.sessionManager.getQrCode(channel.id);
  }

  hasQrCode(channel: Channel): boolean {
    return this.sessionManager.hasQrCode(channel.id);
  }

  // ============================================================
  // SEND TEXT MESSAGE
  // ============================================================

  async sendMessage(data: {
    channel: Channel;
    to: string;
    message: string;
  }): Promise<void> {
    const channelId = data.channel.id;

    const socket = this.sessionManager.getSession(channelId);

    if (!socket) {
      throw new Error('WhatsApp não está conectado');
    }

    const jid = this.normalizeRecipient(data.to);

    this.logger.log(`Enviando WhatsApp para ${jid}`);

    await socket.sendMessage(jid, {
      text: data.message,
    });
  }

  // ============================================================
  // SEND ATTACHMENT
  // ============================================================

  async sendAttachment(data: {
    channel: Channel;
    to: string;
    type: MessageType;
    filePath: string;
    fileName?: string;
    mimeType?: string;
    caption?: string;
  }): Promise<void> {
    const channelId = data.channel.id;

    const socket = this.sessionManager.getSession(channelId);

    if (!socket) {
      throw new Error('WhatsApp não está conectado');
    }

    const jid = this.normalizeRecipient(data.to);

    const buffer = await readFile(data.filePath);

    this.logger.log(
      `Enviando anexo WhatsApp para ${jid}: ${data.fileName ?? 'sem nome'}`,
    );

    switch (data.type) {
      // ========================================================
      // IMAGE
      // ========================================================

      case MessageType.IMAGE:
        await socket.sendMessage(jid, {
          image: buffer,
          mimetype: data.mimeType ?? 'image/jpeg',
          caption: data.caption || undefined,
        });

        break;

      // ========================================================
      // AUDIO
      // ========================================================

      case MessageType.AUDIO: {
        this.logger.log(
          `Convertendo áudio para OGG/Opus: ${data.fileName ?? 'áudio'}`,
        );

        const audioBuffer = await this.convertAudioToOggOpus(data.filePath);

        this.logger.log(
          `Áudio convertido com sucesso: ${audioBuffer.length} bytes`,
        );

        await socket.sendMessage(jid, {
          audio: audioBuffer,
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true,
        });

        break;
      }

      // ========================================================
      // FILE
      // ========================================================

      case MessageType.FILE:
        await socket.sendMessage(jid, {
          document: buffer,
          mimetype: data.mimeType ?? 'application/octet-stream',
          fileName: data.fileName ?? 'arquivo',
          caption: data.caption || undefined,
        });

        break;

      // ========================================================
      // UNSUPPORTED
      // ========================================================

      default:
        throw new Error(
          `Tipo de mensagem não suportado para WhatsApp: ${data.type}`,
        );
    }
  }

  // ============================================================
  // AUDIO CONVERSION
  // ============================================================

  private async convertAudioToOggOpus(filePath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const errors: Buffer[] = [];

      const ffmpeg = spawn('ffmpeg', [
        '-i',
        filePath,

        '-c:a',
        'libopus',

        '-f',
        'ogg',

        'pipe:1',
      ]);

      ffmpeg.stdout.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      ffmpeg.stderr.on('data', (chunk: Buffer) => {
        errors.push(chunk);
      });

      ffmpeg.on('error', (error) => {
        reject(
          new Error(`Não foi possível iniciar o FFmpeg: ${error.message}`),
        );
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          const errorMessage = Buffer.concat(errors).toString();

          reject(
            new Error(`FFmpeg falhou com código ${code}: ${errorMessage}`),
          );

          return;
        }

        resolve(Buffer.concat(chunks));
      });
    });
  }

  // ============================================================
  // RECIPIENT NORMALIZATION
  // ============================================================

  private normalizeRecipient(to: string): string {
    if (to.endsWith('@g.us')) {
      return to;
    }

    if (to.endsWith('@s.whatsapp.net')) {
      return to;
    }

    const phone = to.replace(/\D/g, '');

    if (!phone) {
      throw new Error('Destinatário WhatsApp inválido');
    }

    return `${phone}@s.whatsapp.net`;
  }

  // ============================================================
  // INCOMING MESSAGE
  // ============================================================

  private async handleIncomingMessage(
    channel: Channel,
    data: WhatsAppProviderMessage,
  ): Promise<void> {
    await this.whatsAppMessageService.process(channel.id, data);
  }
}
