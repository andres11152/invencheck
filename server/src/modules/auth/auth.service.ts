import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsuarioRepository } from './usuario.repository';
import type {
  AuthenticatedUser,
  JwtPayload,
} from './interfaces/jwt-payload.interface';

export interface LoginResult {
  accessToken: string;
  usuario: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usuarioRepository: UsuarioRepository,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const usuario = await this.usuarioRepository.findByEmail(email);
    // Mismo mensaje para "no existe" y "password incorrecto": evita que la
    // API sirva de oráculo para enumerar emails registrados.
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValida = await bcrypt.compare(password, usuario.passwordHash);
    if (!passwordValida) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload: JwtPayload = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      org: usuario.organizacionId,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: usuario.rol,
        organizacionId: usuario.organizacionId,
      },
    };
  }

  /** Revalida contra la BD en cada petición: una cuenta desactivada pierde acceso de inmediato aunque el JWT siga vigente. */
  async validateUserById(id: string): Promise<AuthenticatedUser | null> {
    const usuario = await this.usuarioRepository.findById(id);
    if (!usuario || !usuario.activo) return null;
    return {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      rol: usuario.rol,
      organizacionId: usuario.organizacionId,
    };
  }
}
