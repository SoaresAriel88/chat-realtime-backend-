import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendOtpEmailVerifyMail(
    to: string,
    otp: string,
    name: string,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: 'Confirmação de email',
      html: ` <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; border-radius: 8px;">
        <h1 style="color: #333333; border-bottom: 2px solid #00A128; padding-bottom: 10px; text-align: center">
          Olá ${name}! 
        </h1>
        <p style="color: #666666; font-size: 16px; line-height: 1.6; text-align: center;">
          Seu cadastro foi realizado com sucesso. Código de Verificação ${otp}
        </p>

        <p style="color: #999999; font-size: 12px; text-align: center; margin-top: 20px;">
          Se você não solicitou este e-mail, por favor ignore-o.
        </p>
      </div>`,
    });
  }
  async sendOtpEmailResetPassword(
    to: string,
    otp: string,
    name: string,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: 'Recuperação de Senha',
      html: ` <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; border-radius: 8px;">
        <h1 style="color: #333333; border-bottom: 2px solid #00A128; padding-bottom: 10px; text-align: center">
          Olá ${name}! 
        </h1>
        <p style="color: #666666; font-size: 16px; line-height: 1.6; text-align: center;">
          Seu código de recuperação de senha: ${otp}
        </p>

        <p style="color: #999999; font-size: 12px; text-align: center; margin-top: 20px;">
          Caso você não tenha solicitado a recuperação de senha, pedimos que verifique sua conta.
        </p>
      </div>`,
    });
  }
  async sendOtpConfirmatioResetPassword(
    to: string,
    name: string,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: 'Senha alterada com sucesso!',
      html: ` <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; border-radius: 8px;">
      <h1 style="color: #333333; border-bottom: 2px solid #00A128; padding-bottom: 10px; text-align: center">
        Olá ${name}! 
      </h1>
      <p style="color: #999999; font-size: 12px; text-align: center; margin-top: 20px;">
        Redefinição de senha confirmada com sucesso! Caso não tenha sido você, pedimos que verifique sua conta.
      </p>
    </div>`,
    });
  }
}
