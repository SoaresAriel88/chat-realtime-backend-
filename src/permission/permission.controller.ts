import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  Put,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { Permission as PermissionModel } from '@prisma/client';
import { PermissionService } from './permission.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('permission')
export class PermissionController {
  constructor(private permissionService: PermissionService) {}

  @Get(':id')
  async getPermissionById(
    @Param('id') id: string,
  ): Promise<PermissionModel | null> {
    return this.permissionService.permission({ id });
  }

  @Get()
  async getPermissions(): Promise<PermissionModel[]> {
    return this.permissionService.permissions({});
  }

  @Post()
  async createPermission(
    @Body() permissionData: { name: string },
  ): Promise<PermissionModel> {
    return this.permissionService.createPermission(permissionData);
  }

  @Put(':id')
  async updatePermission(
    @Param('id') id: string,
    @Body() permissionData: { name: string },
  ): Promise<PermissionModel> {
    return this.permissionService.updatePermission({
      where: { id },
      data: permissionData,
    });
  }

  @Delete(':id')
  async deletePermission(@Param('id') id: string): Promise<PermissionModel> {
    return this.permissionService.deletePermission({ id });
  }
}
