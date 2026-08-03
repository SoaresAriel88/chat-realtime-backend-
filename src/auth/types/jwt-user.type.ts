export type JwtUser = {
  sub: string;
  email?: string;
  tenantId: string;
  purpose?: string;
};
