import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';
import { ContextoOrganizacionService } from '../../prisma/contexto-organizacion.service';
import type {
  AuthenticatedUser,
  JwtPayload,
} from './interfaces/jwt-payload.interface';
import type { EnvironmentVariables } from '../../config/env.validation';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    private readonly contexto: ContextoOrganizacionService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    // JWT_SECRET es requerido en EnvironmentVariables — si falta, la app no
    // llega a arrancar (ConfigModule.forRoot valida esto una sola vez, acá
    // ya no hace falta repetir el chequeo).
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET', { infer: true }),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Se asigna ANTES de tocar la BD a propósito: `validateUserById` es una
    // consulta a `usuarios`, que también queda bajo el alcance de
    // organización. Fijándolo desde el claim del token, esa consulta ya
    // sale acotada — si el usuario fue movido a otra organización o
    // eliminado, simplemente no aparece y el 401 sale solo, sin necesitar
    // ninguna comparación extra acá.
    this.contexto.asignar(payload.org);
    const usuario = await this.authService.validateUserById(payload.sub);
    if (!usuario) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }
    return usuario;
  }
}
