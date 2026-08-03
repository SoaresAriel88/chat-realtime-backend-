import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailQueueService } from './mail-queue.service';
import { MailQueueProcessor } from './mail-queue.processor';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'mail-queue',
    }),
    MailModule,
  ],
  providers: [MailQueueService, MailQueueProcessor],
  exports: [MailQueueService],
})
export class MailQueueModule {}
