import { IsOptional, IsString } from 'class-validator';

export class SaveDeviceTokenDto {
  @IsString()
  token!: string;

  @IsOptional()
  @IsString()
  platform?: string;
}
