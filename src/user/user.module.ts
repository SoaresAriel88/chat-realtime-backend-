import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { DatabaseModule } from 'src/database/database.module';
import { MailModule } from 'src/mail/mail.module';
import { MailQueueModule } from 'src/mail-queue/mail-queue.module';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [DatabaseModule, MailModule, MailQueueModule, RedisModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
