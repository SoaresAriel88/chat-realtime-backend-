import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateChannelDto) {
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
    return this.prisma.channel.findFirst({
      where: {
        id,
        tenantId,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    return this.prisma.channel.delete({
      where: {
        id,
      },
    });
  }
}
