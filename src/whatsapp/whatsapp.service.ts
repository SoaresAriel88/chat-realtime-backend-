import { Injectable, Logger } from '@nestjs/common';
import {
  makeWASocket,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import type { ConnectionState } from '@whiskeysockets/baileys';
import * as path from 'node:path';
import QRCode from 'qrcode';

import { ConnectionStatus } from './interfaces/connection-status.enum';
import { WhatsAppSession } from './interfaces/whatsapp-session.interface';
import { WhatsappMessageService } from './whatsapp-message.service';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  constructor(
    private readonly whatsappMessageService: WhatsappMessageService,
  ) {}
  private readonly sessions = new Map<string, WhatsAppSession>();

  async connect(tenantId: string) {
    const authPath = path.resolve(process.cwd(), 'sessions', tenantId);

    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    const socket = makeWASocket({
      auth: state,
    });

    this.sessions.set(tenantId, {
      socket,
      status: ConnectionStatus.CONNECTING,
    });

    this.registerConnectionEvents(tenantId, socket, saveCreds);

    return {
      success: true,
    };
  }

  private registerConnectionEvents(
    tenantId: string,
    socket: WASocket,
    saveCreds: () => Promise<void>,
  ) {
    socket.ev.on('creds.update', () => {
      void saveCreds();
    });

    socket.ev.on('connection.update', (update) => {
      void this.handleConnectionUpdate(tenantId, update);
    });
  }

  private async handleConnectionUpdate(
    tenantId: string,
    update: Partial<ConnectionState>,
  ) {
    const { connection, qr } = update;

    const session = this.sessions.get(tenantId);

    if (!session) {
      return;
    }

    if (qr) {
      session.status = ConnectionStatus.WAITING_QR;
      session.qr = qr;
      session.qrImage = await QRCode.toDataURL(qr);
    }

    if (connection === 'open') {
      session.status = ConnectionStatus.CONNECTED;

      session.qr = undefined;
      session.qrImage = undefined;

      this.whatsappMessageService.registerMessageListener(
        tenantId,
        session.socket,
      );

      this.logger.log(`WhatsApp conectado tenant ${tenantId}`);
    }

    if (connection === 'close') {
      session.status = ConnectionStatus.DISCONNECTED;
    }
  }

  getSocket(tenantId: string): WASocket {
    const session = this.sessions.get(tenantId);

    if (!session) {
      throw new Error('WhatsApp não conectado');
    }

    return session.socket;
  }

  getStatus(tenantId: string) {
    const session = this.sessions.get(tenantId);

    if (!session) {
      return {
        connected: false,
        status: ConnectionStatus.DISCONNECTED,
        qr: null,
      };
    }

    return {
      connected: session.status === ConnectionStatus.CONNECTED,

      status: session.status,

      qr: session.qrImage ?? null,
    };
  }
}
