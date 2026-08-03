import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { MailService } from 'src/mail/mail.service';
import { MailQueueService } from 'src/mail-queue/mail-queue.service';
import { RedisService } from 'src/redis/redis.service';
import { SaveDeviceTokenDto } from './dto/save-device-token.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly mailQueueService: MailQueueService,
    private readonly redisService: RedisService,
  ) {}

  async createUser(data: {
    email: string;
    name: string;
    password: string;
    tenantSlug: string;
  }): Promise<User> {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const { tenantSlug, email, name } = data;
    const otpKey = `tenant:${tenantSlug}:auth:otp:verify-email:${email}`;

    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        tenant: {
          connect: {
            slug: tenantSlug,
          },
        },
      },
    });
    await this.redisService.setWithExpiration(otpKey, otpCode, 600);
    await this.mailQueueService.sendOtpEmailVerifyMail(
      user.email,
      otpCode,
      name,
    );

    return user;
  }
  async addRoleToUser(roleId: string, userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const role = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        tenantId: user.tenantId,
      },
    });

    if (!role) {
      throw new NotFoundException('Role não encontrada nesse tenant');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        roles: {
          connect: {
            id: roleId,
          },
        },
      },
      include: {
        roles: true,
      },
    });
  }
  async getMe(id: string, tenantId: string): Promise<Partial<User> | null> {
    if (!tenantId) {
      throw new BadRequestException('Tenant não encontrado');
    }
    return this.prisma.user.findUnique({
      where: { id, tenantId },
      select: {
        id: true,
        tenantId: true,
        name: true,
      },
    });
  }
  async verifyOtp(
    email: string,
    otpCode: string,
    tenantSlug: string,
  ): Promise<User> {
    if (!tenantSlug) {
      throw new BadRequestException('Tenant é obrigatório');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        email,
        tenant: {
          slug: tenantSlug,
        },
      },
    });
    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    const blockedKey = `tenant:${tenantSlug}:auth:blocked:otp:verify-email:${email}`;
    const attemptsKey = `tenant:${tenantSlug}:auth:attempts:otp:verify-email:${email}`;
    const existsBlockedKey = await this.redisService.exists(blockedKey);
    if (existsBlockedKey) {
      throw new UnauthorizedException(
        'Muitas tentativas. Tente novamente mais tarde',
      );
    }

    const otpKey = `tenant:${tenantSlug}:auth:otp:verify-email:${email}`;
    const savedOtp = await this.redisService.getValue(otpKey);
    if (!savedOtp) {
      throw new UnauthorizedException('Código expirado');
    }

    if (savedOtp !== otpCode) {
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
      throw new UnauthorizedException('Código inválido');
    }

    const userEmailVerified = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
      },
    });
    await this.redisService.deleteKey(otpKey);
    return userEmailVerified;
  }
  async resendOtp(email: string, tenantSlug: string): Promise<void> {
    if (!tenantSlug) {
      throw new BadRequestException('Tenant é obrigatório');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        email,
        tenant: {
          slug: tenantSlug,
        },
      },
    });

    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    if (user.emailVerified) {
      throw new BadRequestException('E-mail já verificado');
    }

    const otpKeyCooldown = `tenant:${tenantSlug}:auth:cooldown:verify-email:${email}`;
    const existsOtpCooldown = await this.redisService.exists(otpKeyCooldown);
    if (existsOtpCooldown) {
      throw new UnauthorizedException('Aguarde para reenviar o código');
    } else {
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const name = user.name;
      const otpKey = `tenant:${tenantSlug}:auth:otp:verify-email:${email}`;
      await this.redisService.setWithExpiration(otpKey, otpCode, 600);
      await this.redisService.setWithExpiration(otpKeyCooldown, 'blocked', 60);
      await this.mailQueueService.sendOtpEmailVerifyMail(
        user.email,
        otpCode,
        name,
      );
    }
  }
  async saveDeviceToken(userId: string, dto: SaveDeviceTokenDto) {
    console.log('SALVANDO DEVICE TOKEN');
    console.log('USER ID:', userId);
    console.log('TOKEN:', dto.token);
    console.log('PLATFORM:', dto.platform);

    return this.prisma.userDevice.upsert({
      where: {
        userId_token: {
          userId,
          token: dto.token,
        },
      },

      update: {
        platform: dto.platform,
      },

      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
      },
    });
  }
}
