import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/database/prisma.service';
import * as bcrypt from 'bcrypt';
import { MailQueueService } from 'src/mail-queue/mail-queue.service';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mailQueueService: MailQueueService,
    private readonly redisService: RedisService,
  ) {}

  async login(email: string, password: string, tenantSlug: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        tenant: {
          slug: tenantSlug,
        },
      },
    });
    const blockedKey = `tenant:${tenantSlug}:auth:blocked:login:${email}`;
    const attemptsKey = `tenant:${tenantSlug}:auth:attempts:login:${email}`;
    const existsBlockedKey = await this.redisService.exists(blockedKey);
    if (existsBlockedKey) {
      throw new UnauthorizedException(
        'Muitas tentativas. Tente novamente mais tarde',
      );
    }

    if (!user) {
      throw new UnauthorizedException('Conta ou Senha Inválida');
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      const attempts = await this.redisService.increment(attemptsKey);
      if (attempts == 1) {
        await this.redisService.expire(attemptsKey, 600);
      }
      if (attempts >= 5) {
        await this.redisService.setWithExpiration(blockedKey, 'blocked', 900);
        await this.redisService.deleteKey(attemptsKey);
        throw new UnauthorizedException(
          'Muitas tentativas. Tente novamente mais tarde',
        );
      }
      throw new UnauthorizedException('Credenciais inválidas');
    }
    if (!user.emailVerified) {
      throw new UnauthorizedException('Email não verificado');
    }

    if (passwordMatch) {
      const token = this.jwt.sign({
        sub: user.id,
        email: user.email,
        tenantId: user.tenantId,
      });
      await this.redisService.deleteKey(attemptsKey);
      return { token };
    }
  }
  async generateOtpResetPassword(
    email: string,
    tenantSlug: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        tenant: {
          slug: tenantSlug,
        },
      },
    });
    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    const resetPasswordOtp = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();

    const otpKey = `tenant:${tenantSlug}:auth:otp:reset-password:${user.email}`;
    const name = user.name;

    await this.redisService.setWithExpiration(otpKey, resetPasswordOtp, 600);
    await this.mailQueueService.sendOtpEmailResetPassword(
      user.email,
      resetPasswordOtp,
      name,
    );
  }
  async verifyOtpResetPassword(
    email: string,
    resetPasswordOtp: string,
    tenantSlug: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        tenant: {
          slug: tenantSlug,
        },
      },
    });
    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    const otpKey = `tenant:${tenantSlug}:auth:otp:reset-password:${user.email}`;
    const attemptsKey = `tenant:${tenantSlug}:auth:attempts:otp:reset-password:${email}`;
    const blockedKey = `tenant:${tenantSlug}:auth:blocked:otp:reset-password:${email}`;
    const existsBlockedKey = await this.redisService.exists(blockedKey);

    const savedOtp = await this.redisService.getValue(otpKey);
    if (existsBlockedKey) {
      throw new UnauthorizedException(
        'Muitas tentativas. Tente novamente mais tarde',
      );
    }

    if (!savedOtp) {
      throw new UnauthorizedException('Código expirado');
    }

    if (savedOtp !== resetPasswordOtp) {
      const attempts = await this.redisService.increment(attemptsKey);
      if (attempts == 1) {
        await this.redisService.expire(attemptsKey, 600);
      }
      if (attempts >= 5) {
        await this.redisService.setWithExpiration(blockedKey, 'blocked', 900);
        await this.redisService.deleteKey(attemptsKey);
        throw new UnauthorizedException(
          'Muitas tentivas. Tente Novamente mais tarde',
        );
      }
      throw new UnauthorizedException('Código inválido');
    }

    await this.redisService.deleteKey(otpKey);

    const token = this.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        tenantId: user.tenantId,
        purpose: 'reset-password',
      },
      { expiresIn: '10m' },
    );

    return { token };
  }
  async resetPassword(id: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    const name = user.name;
    const passwordMatch = await bcrypt.compare(newPassword, user.password);
    if (passwordMatch) {
      throw new UnauthorizedException(
        'A sua senha não pode ser a mesma que a anterior',
      );
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        password: hashedNewPassword,
      },
    });

    await this.mailQueueService.sendOtpConfirmatioResetPassword(
      user.email,
      name,
    );

    return { message: 'Senha redefinida com sucesso' };
  }
}
