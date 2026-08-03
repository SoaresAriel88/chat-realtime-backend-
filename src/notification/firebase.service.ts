import { Injectable, OnModuleInit } from '@nestjs/common';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private messaging!: Messaging;

  onModuleInit() {
    const app = getApps().length
      ? getApps()[0]
      : initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        });

    this.messaging = getMessaging(app);

    console.log('Firebase Admin inicializado');
  }

  async sendNotification(token: string, title: string, body: string) {
    return this.messaging.send({
      token,

      notification: {
        title,
        body,
      },

      data: {
        type: 'chat_message',
        conversationId: 'xxx',
      },

      android: {
        priority: 'high',
      },
    });
  }
}
