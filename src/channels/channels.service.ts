import { Injectable, NotFoundException } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { Prisma } from '@prisma/client';
import { ChannelsFactory } from './channels.factory';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelsFactory: ChannelsFactory,
  ) {}

  async create(tenantId: string, dto: CreateChannelDto) {
    const existing = await this.prisma.channel.findFirst({
      where: {
        tenantId,
        name: dto.name,
      },
    });

    if (existing) {
      throw new ConflictException('Já existe um canal com esse nome.');
    }
    return this.prisma.channel.create({
      data: {
        tenantId,

        type: dto.type,

        name: dto.name,

        settings: dto.settings
          ? (dto.settings as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.channel.findMany({
      where: {
        tenantId,
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const channel = await this.prisma.channel.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!channel) {
      throw new NotFoundException('Canal não encontrado');
    }

    return channel;
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    await this.prisma.channel.delete({
      where: {
        id,
      },
    });

    return {
      message: 'Canal removido com sucesso',
    };
  }
  async connect(tenantId: string, id: string) {
    const channel = await this.prisma.channel.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!channel) {
      throw new NotFoundException('Canal não encontrado');
    }

    const provider = this.channelsFactory.getProvider(channel.type);

    await provider.connect(channel);

    await this.prisma.channel.update({
      where: {
        id: channel.id,
      },
      data: {
        status: 'CONNECTED',
      },
    });

    return {
      message: 'Canal conectado com sucesso',
      channelId: channel.id,
      type: channel.type,
      status: 'CONNECTED',
    };
  }
}
