import { WASocket } from '@whiskeysockets/baileys';
import { ConnectionStatus } from './connection-status.enum';

export interface WhatsAppSession {
  socket: WASocket;

  status: ConnectionStatus;

  qr?: string;

  qrImage?: string;
}
