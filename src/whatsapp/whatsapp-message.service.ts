import { Injectable, Logger } from '@nestjs/common';
import { WASocket } from '@whiskeysockets/baileys';

@Injectable()
export class WhatsappMessageService {
  private readonly logger = new Logger(WhatsappMessageService.name);

  registerMessageListener(tenantId: string, socket: WASocket) {
    socket.ev.on('messages.upsert', ({ messages }) => {
      const message = messages[0];

      if (!message.message) {
        return;
      }

      if (message.key.fromMe) {
        return;
      }

      const remoteJid = message.key.remoteJidAlt ?? message.key.remoteJid;

      const text = message.message.conversation;

      this.logger.log(`Mensagem recebida tenant ${tenantId}`);

      this.logger.debug({
        remoteJid,
        text,
      });
    });
  }
}
