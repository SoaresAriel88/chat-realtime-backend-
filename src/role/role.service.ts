import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { Prisma, Role } from '@prisma/client';

@Injectable()
export class RoleService {
constructor(private readonly prisma: PrismaService) {}

  // POST - CRIAR ROLE
  async createRole(data: { name: string; tenantId: string }): Promise<Role> {
    const { name, tenantId } = data;

    return this.prisma.role.create({
      data: {
        name,
        tenant: {
          connect: {
            id: tenantId,
          },
        },
      },
    });
  }

  // POST - VINCULAR PERMISSION NA ROLE
  async addPermissionToRole(
    roleId: string,
    permissionId: string,
    tenantId: string,
  ): Promise<Role> {
    const role = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!role) {
      throw new NotFoundException('Role não encontrada nesse tenant');
    }

    const permission = await this.prisma.permission.findUnique({
      where: {
        id: permissionId,
      },
    });

    if (!permission) {
      throw new NotFoundException('Permission não encontrada');
    }

    return this.prisma.role.update({
      where: {
        id: role.id,
      },
      data: {
        permissions: {
          connect: {
            id: permission.id,
          },
        },
      },
      include: {
        permissions: true,
      },
    });
  }

  // GET POR ID
  async role(
    roleWhereUniqueInput: Prisma.RoleWhereUniqueInput,
  ): Promise<Role | null> {
    return this.prisma.role.findFirst({
      where: {
        ...roleWhereUniqueInput,
        deletedAt: null,
      },
    });
  }

  // LISTA TODOS OS ROLES
  async roles(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.RoleWhereUniqueInput;
    where?: Prisma.RoleWhereInput;
    orderBy?: Prisma.RoleOrderByWithRelationInput;
  }): Promise<Role[]> {
    const { skip, take, cursor, where, orderBy } = params;

    return this.prisma.role.findMany({
      skip,
      take,
      cursor,
      where: {
        ...where,
        deletedAt: null,
      },
      orderBy,
    });
  }

  // UPDATE
  async updateRole(params: {
    where: Prisma.RoleWhereUniqueInput;
    data: { name: string };
  }): Promise<Role> {
    const { where, data } = params;

    return this.prisma.role.update({
      where,
      data,
    });
  }

  // DELETE
  async deleteRole(where: Prisma.RoleWhereUniqueInput): Promise<Role> {
    return this.prisma.role.update({
      where,
      data: {
        deletedAt: new Date(),
      },
    });
  }
}
