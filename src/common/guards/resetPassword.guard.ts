import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class ResetPasswordGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const authHeader = request.headers.authorization;

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Token não encontrado');
    }

    const [type, token] = authHeader.split(' ') ?? []; //DESTRUCTION

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Formato do token inválido');
    }

    let payload: any;

    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    if (payload.purpose !== 'reset-password') {
      throw new UnauthorizedException('Código inválido');
    }

    request.user = payload;

    return true;
  }
}
