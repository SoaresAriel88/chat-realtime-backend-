import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { Prisma, Permission } from '@prisma/client';

@Injectable()
export class PermissionService {
constructor(private readonly prisma: PrismaService) {}

  // POST
  async createPermission(
    data: Prisma.PermissionCreateInput,
  ): Promise<Permission> {
    return this.prisma.permission.create({ data });
  }

  // GET POR ID
  async permission(
    permissionWhereUniqueInput: Prisma.PermissionWhereUniqueInput,
  ): Promise<Permission | null> {
    return this.prisma.permission.findFirst({
      where: {
        ...permissionWhereUniqueInput,
        deletedAt: null,
      },
    });
  }

  // LISTA TODAS AS PERMISSIONS
  async permissions(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.PermissionWhereUniqueInput;
    where?: Prisma.PermissionWhereInput;
    orderBy?: Prisma.PermissionOrderByWithRelationInput;
  }): Promise<Permission[]> {
    const { skip, take, cursor, where, orderBy } = params;

    return this.prisma.permission.findMany({
      skip,
      take,
      cursor,
      where: { ...where, deletedAt: null },
      orderBy,
    });
  }

  // UPDATE
  async updatePermission(params: {
    where: Prisma.PermissionWhereUniqueInput;
    data: { name: string };
  }): Promise<Permission> {
    const { where, data } = params;
    return this.prisma.permission.update({ where, data });
  }

  // DELETE
  async deletePermission(
    where: Prisma.PermissionWhereUniqueInput,
  ): Promise<Permission> {
    return this.prisma.permission.update({
      where,
      data: { deletedAt: new Date() },
    });
  }
}
