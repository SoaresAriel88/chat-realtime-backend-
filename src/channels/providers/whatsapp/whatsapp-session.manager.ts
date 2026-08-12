import { Injectable } from '@nestjs/common';
import makeWASocket, {
  useMultiFileAuthState,
  downloadMediaMessage,
  type ConnectionState,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';

import { WhatsAppIncomingMessage } from './types/whatsapp-message.interface';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

type ConnectionHandler = (channelId: string) => Promise<void>;

type QrCodeHandler = (channelId: string, qr: string) => Promise<void>;

type MessageHandler = (
  channelId: string,
  message: WhatsAppIncomingMessage,
) => Promise<void>;

@Injectable()
export class WhatsAppSessionManager {
  /**
   * Sessões WhatsApp atualmente ativas.
   *
   * A chave continua sendo o channelId para manter
   * compatibilidade com a arquitetura atual.
   */
  private readonly sessions = new Map<string, WASocket>();

  /**
   * QR Codes atualmente disponíveis.
   *
   * channelId -> QR Code
   */
  private readonly qrCodes = new Map<string, string>();

  /**
   * Status atual de cada sessão.
   */
  private readonly connectionStatus = new Map<string, ConnectionStatus>();

  /**
   * Logger utilizado pelo Baileys.
   */
  private readonly logger = pino({
    level: 'silent',
  });

  /**
   * Eventos da sessão.
   */
  private onConnected?: ConnectionHandler;

  private onQrGenerated?: QrCodeHandler;

  private onDisconnected?: ConnectionHandler;

  private onMessage?: MessageHandler;

  // ============================================================
  // STATUS
  // ============================================================

  exists(channelId: string): boolean {
    return this.sessions.has(channelId);
  }

  isConnected(channelId: string): boolean {
    return this.connectionStatus.get(channelId) === 'connected';
  }

  getConnectionStatus(channelId: string): ConnectionStatus {
    return this.connectionStatus.get(channelId) ?? 'disconnected';
  }

  // ============================================================
  // QR CODE
  // ============================================================

  getQrCode(channelId: string): string | null {
    return this.qrCodes.get(channelId) ?? null;
  }

  hasQrCode(channelId: string): boolean {
    return this.qrCodes.has(channelId);
  }

  private setQrCode(channelId: string, qr: string): void {
    this.qrCodes.set(channelId, qr);
  }

  private clearQrCode(channelId: string): void {
    this.qrCodes.delete(channelId);
  }

  // ============================================================
  // CRIAR SESSÃO
  // ============================================================

  async create(channelId: string): Promise<void> {
    /**
     * Evita criar duas sessões para o mesmo canal.
     */
    if (this.sessions.has(channelId)) {
      console.log(`WhatsApp já possui uma sessão ativa: ${channelId}`);

      return;
    }

    this.connectionStatus.set(channelId, 'connecting');

    const { state, saveCreds } = await useMultiFileAuthState(
      `sessions/${channelId}`,
    );

    const socket = makeWASocket({
      auth: state,
      logger: this.logger,
    });

    this.sessions.set(channelId, socket);

    // ==========================================================
    // CREDENCIAIS
    // ==========================================================

    socket.ev.on('creds.update', () => {
      void saveCreds();
    });

    // ==========================================================
    // CONEXÃO
    // ==========================================================

    socket.ev.on('connection.update', (update) => {
      void this.handleConnectionUpdate(update, channelId);
    });

    // ==========================================================
    // MENSAGENS
    // ==========================================================

    socket.ev.on('messages.upsert', ({ messages, type }) => {
      const message = messages[0];

      if (!message) {
        return;
      }

      void this.handleIncomingMessage(channelId, socket, message, type);
    });
  }

  // ============================================================
  // CONNECTION UPDATE
  // ============================================================

  private async handleConnectionUpdate(
    update: Partial<ConnectionState>,
    channelId: string,
  ): Promise<void> {
    const { connection, qr } = update;

    // ==========================================================
    // QR CODE
    // ==========================================================

    if (qr) {
      this.setQrCode(channelId, qr);

      this.connectionStatus.set(channelId, 'connecting');

      console.log(`QR CODE GERADO PARA: ${channelId}`);

      /**
       * Durante o desenvolvimento continuamos
       * mostrando o QR no terminal.
       */
      qrcode.generate(qr, {
        small: true,
      });

      /**
       * Avisa o restante da aplicação que existe
       * um novo QR disponível.
       */
      if (this.onQrGenerated) {
        await this.onQrGenerated(channelId, qr);
      }
    }

    // ==========================================================
    // CONECTADO
    // ==========================================================

    if (connection === 'open') {
      console.log(`WhatsApp conectado: ${channelId}`);

      this.connectionStatus.set(channelId, 'connected');

      /**
       * Depois que o WhatsApp conectou,
       * o QR não precisa mais existir.
       */
      this.clearQrCode(channelId);

      if (this.onConnected) {
        await this.onConnected(channelId);
      }

      return;
    }

    // ==========================================================
    // DESCONECTADO
    // ==========================================================

    if (connection === 'close') {
      console.log(`WhatsApp fechado: ${channelId}`);

      this.connectionStatus.set(channelId, 'disconnected');

      this.sessions.delete(channelId);

      this.clearQrCode(channelId);

      if (this.onDisconnected) {
        await this.onDisconnected(channelId);
      }
    }
  }

  // ============================================================
  // EVENT HANDLERS
  // ============================================================

  setConnectionHandler(callback: ConnectionHandler): void {
    this.onConnected = callback;
  }

  setQrCodeHandler(callback: QrCodeHandler): void {
    this.onQrGenerated = callback;
  }

  setDisconnectedHandler(callback: ConnectionHandler): void {
    this.onDisconnected = callback;
  }

  setMessageHandler(callback: MessageHandler): void {
    this.onMessage = callback;
  }

  // ============================================================
  // SESSION
  // ============================================================

  getSession(channelId: string): WASocket | undefined {
    return this.sessions.get(channelId);
  }

  async disconnect(channelId: string): Promise<void> {
    const socket = this.sessions.get(channelId);

    if (!socket) {
      this.connectionStatus.set(channelId, 'disconnected');

      this.clearQrCode(channelId);

      return;
    }

    try {
      await socket.logout();
    } finally {
      this.sessions.delete(channelId);

      this.clearQrCode(channelId);

      this.connectionStatus.set(channelId, 'disconnected');
    }
  }

  // ============================================================
  // INCOMING MESSAGE
  // ============================================================

  private async handleIncomingMessage(
    channelId: string,
    socket: WASocket,
    message: WAMessage,
    type: string,
  ): Promise<void> {
    console.log('===========================');
    console.log('Tipo:', type);
    console.log('RemoteJid:', message.key?.remoteJid);
    console.log('RemoteJidAlt:', message.key?.remoteJidAlt);
    console.log('Participant:', message.key?.participant);
    console.log('ParticipantAlt:', message.key?.participantAlt);
    console.log('FromMe:', message.key?.fromMe);
    console.log('PushName:', message.pushName);
    console.log('Message:', JSON.stringify(message.message, null, 2));
    console.log('===========================');

    const remoteJid = message.key?.remoteJid ?? '';

    const participantJid = message.key?.participant ?? '';

    const participantAlt = message.key?.participantAlt ?? '';

    const isGroup = remoteJid.endsWith('@g.us');

    const phoneJid = isGroup
      ? participantAlt || participantJid
      : message.key?.remoteJidAlt || remoteJid;

    const phone = phoneJid.replace('@s.whatsapp.net', '').replace('@lid', '');

    let groupName: string | undefined;

    // ==========================================================
    // GRUPO
    // ==========================================================

    if (isGroup) {
      try {
        const metadata = await socket.groupMetadata(remoteJid);

        groupName = metadata.subject;

        console.log('WHATSAPP GROUP METADATA:', {
          groupJid: remoteJid,
          groupName,
        });
      } catch (error) {
        console.error('ERRO AO BUSCAR METADADOS DO GRUPO:', remoteJid, error);
      }
    }

    // ==========================================================
    // NORMALIZAÇÃO
    // ==========================================================

    const incomingMessage: WhatsAppIncomingMessage = {
      phone,

      pushName: message.pushName || undefined,

      text:
        message.message?.conversation ??
        message.message?.extendedTextMessage?.text ??
        '',

      fromMe: Boolean(message.key?.fromMe),

      groupJid: isGroup ? remoteJid : undefined,

      groupName,

      participantJid: isGroup ? participantJid : undefined,

      participantAlt: isGroup ? participantAlt : undefined,

      raw: message,
    };

    console.log('WHATSAPP INCOMING NORMALIZADO:', {
      phone: incomingMessage.phone,

      groupJid: incomingMessage.groupJid,

      groupName: incomingMessage.groupName,

      participantJid: incomingMessage.participantJid,

      participantAlt: incomingMessage.participantAlt,

      pushName: incomingMessage.pushName,

      fromMe: incomingMessage.fromMe,
    });

    // ==========================================================
    // CALLBACK
    // ==========================================================

    if (this.onMessage) {
      await this.onMessage(channelId, incomingMessage);
    }
  }

  // ============================================================
  // DOWNLOAD MEDIA
  // ============================================================

  async downloadMedia(channelId: string, message: WAMessage): Promise<Buffer> {
    const socket = this.sessions.get(channelId);

    if (!socket) {
      throw new Error('WhatsApp não está conectado');
    }

    return downloadMediaMessage(
      message,
      'buffer',
      {},
      {
        reuploadRequest: async (msg: WAMessage) => {
          return socket.updateMediaMessage(msg);
        },

        logger: this.logger,
      },
    );
  }
}
