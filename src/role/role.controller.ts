import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  Put,
  Delete,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Role as RoleModel } from '@prisma/client';
import { RoleService } from './role.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { JwtUser } from 'src/auth/types/jwt-user.type';

@UseGuards(JwtAuthGuard)
@Controller('role')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get(':id')
  async getRoleById(@Param('id') id: string): Promise<RoleModel | null> {
    return this.roleService.role({ id });
  }

  @Get()
  async getRoles(@Req() request: { user: JwtUser }): Promise<RoleModel[]> {
    return this.roleService.roles({
      where: {
        tenantId: request.user.tenantId,
      },
    });
  }

  @Post()
  async createRole(
    @Req() request: { user: JwtUser },
    @Body() roleData: { name: string },
  ): Promise<RoleModel> {
    if (!request.user.tenantId) {
      throw new BadRequestException('Tenant não encontrado no token');
    }

    return this.roleService.createRole({
      name: roleData.name,
      tenantId: request.user.tenantId,
    });
  }

  @Post(':roleId/permission')
  async addPermission(
    @Req() request: { user: JwtUser },
    @Param('roleId') roleId: string,
    @Body() body: { permissionId: string },
  ): Promise<RoleModel> {
    return this.roleService.addPermissionToRole(
      roleId,
      body.permissionId,
      request.user.tenantId,
    );
  }

  @Put(':id')
  async updateRole(
    @Param('id') id: string,
    @Body() roleData: { name: string },
  ): Promise<RoleModel> {
    return this.roleService.updateRole({
      where: { id },
      data: roleData,
    });
  }

  @Delete(':id')
  async deleteRole(@Param('id') id: string): Promise<RoleModel> {
    return this.roleService.deleteRole({ id });
  }
}
