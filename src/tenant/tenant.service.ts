import { Injectable, NotFoundException } from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async createTenant(data: { name: string; slug: string }): Promise<Tenant> {
    const tenant = await this.prisma.tenant.create({ data });
    return tenant;
  }
  async getTenantBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }
  async getTenants(): Promise<Tenant[]> {
    const tenants = await this.prisma.tenant.findMany();
    return tenants;
  }
}
