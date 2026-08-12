import type { WAMessage } from '@whiskeysockets/baileys';

export interface WhatsAppRawMessage {
  key?: {
    remoteJid?: string;
    remoteJidAlt?: string;
    participant?: string;
    participantAlt?: string;
    fromMe?: boolean;
  };

  pushName?: string;

  message?: {
    conversation?: string;

    extendedTextMessage?: {
      text?: string;
    };

    imageMessage?: {
      caption?: string;
      mimetype?: string;
      fileLength?: number | string;
    };

    documentMessage?: {
      fileName?: string;
      mimetype?: string;
      fileLength?: number | string;
      caption?: string;
    };

    audioMessage?: {
      mimetype?: string;
      fileLength?: number | string;
      seconds?: number;
      ptt?: boolean;
    };
  };
}

export interface WhatsAppIncomingMessage {
  phone: string;

  pushName?: string;

  text: string;

  fromMe: boolean;

  groupJid?: string;

  groupName?: string;

  participantJid?: string;

  participantAlt?: string;

  raw: WAMessage;
}
