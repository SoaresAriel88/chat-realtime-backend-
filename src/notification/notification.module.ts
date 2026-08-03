import { Module } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [DatabaseModule],

  providers: [FirebaseService, NotificationService],

  exports: [FirebaseService, NotificationService],

  controllers: [NotificationController],
})
export class NotificationModule {}
