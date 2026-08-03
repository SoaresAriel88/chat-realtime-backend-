import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class MailQueueService {
  constructor(@InjectQueue('mail-queue') private readonly mailQueue: Queue) {}

  async sendOtpEmailVerifyMail(
    email: string,
    otpCode: string,
    name: string,
  ): Promise<void> {
    await this.mailQueue.add('send-otp', { email, otpCode, name });
  }
  async sendOtpEmailResetPassword(
    email: string,
    resetPasswordOtp: string,
    name: string,
  ): Promise<void> {
    await this.mailQueue.add('send-otp-reset-password', {
      email,
      resetPasswordOtp,
      name,
    });
  }
  async sendOtpConfirmatioResetPassword(
    email: string,
    name: string,
  ): Promise<void> {
    await this.mailQueue.add('send-confirmation-reset-password', {
      email,
      name,
    });
  }
}
