import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { FirebaseService } from './firebase.service';

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseService: FirebaseService,
  ) {}

  async sendPushToUser(userId: string, title: string, body: string) {
    const devices = await this.prisma.userDevice.findMany({
      where: {
        userId,
      },
    });

    console.log('DEVICES ENCONTRADOS:', devices.length);

    for (const device of devices) {
      try {
        console.log('ENVIANDO PARA TOKEN:', device.token);

        await this.firebaseService.sendNotification(device.token, title, body);

        console.log('NOTIFICAÇÃO ENVIADA');
      } catch (error: any) {
        console.log('ERRO TOKEN:', device.token, error.code);

        if (error.code === 'messaging/registration-token-not-registered') {
          await this.prisma.userDevice.delete({
            where: {
              id: device.id,
            },
          });
        }

        continue;
      }
    }
  }
}
