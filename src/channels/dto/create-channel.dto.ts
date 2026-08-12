import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ChannelType, Prisma } from '@prisma/client';

export class CreateChannelDto {
  @IsString()
  name!: string;

  @IsEnum(ChannelType)
  type!: ChannelType;

  @IsOptional()
  settings?: Prisma.InputJsonValue;
}
