import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';

@Controller('channels')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private readonly service: ChannelsService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateChannelDto) {
    const tenantId: string = req.user.tenantId;
    return this.service.create(tenantId, dto);
  }

  @Get()
  findAll(@Req() req: any) {
    const tenantId: string = req.user.tenantId;
    return this.service.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    const tenantId: string = req.user.tenantId;
    return this.service.findOne(tenantId, id);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    const tenantId: string = req.user.tenantId;
    return this.service.remove(tenantId, id);
  }
  @Post(':id/connect')
  connect(@Req() req, @Param('id') id: string) {
    const tenantId: string = req.user.tenantId;

    return this.service.connect(tenantId, id);
  }
}
