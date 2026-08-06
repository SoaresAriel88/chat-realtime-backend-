import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Prisma } from '@prisma/client';

enum ChannelTypeDto {
  WHATSAPP = 'WHATSAPP',
  TELEGRAM = 'TELEGRAM',
  INSTAGRAM = 'INSTAGRAM',
  WEBSITE = 'WEBSITE',
}

export class CreateChannelDto {
  @IsString()
  name!: string;

  @IsEnum(ChannelTypeDto)
  type!: ChannelTypeDto;

  @IsOptional()
  settings?: Prisma.InputJsonValue;
}
