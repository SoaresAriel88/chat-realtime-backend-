import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('channels')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private readonly service: ChannelsService) {}

  @Post()
  create(@Req() req, @Body() dto: CreateChannelDto) {
    const tenantId: string = req.user.tenantId;
    return this.service.create(tenantId, dto);
  }

  @Get()
  findAll(@Req() req) {
    const tenantId: string = req.user.tenantId;
    return this.service.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Req() req, @Param('id') id: string) {
    const tenantId: string = req.user.tenantId;
    return this.service.remove(tenantId, id);
  }

  @Delete(':id')
  remove(@Req() req, @Param('id') id: string) {
    const tenantId: string = req.user.tenantId;
    return this.service.remove(tenantId, id);
  }
}
