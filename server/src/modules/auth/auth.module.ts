import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsuarioRepository } from './usuario.repository';
import { JwtStrategy } from './jwt.strategy';

/** 12 horas, para que un turno completo no requiera volver a loguearse. */
const DEFAULT_JWT_EXPIRES_IN_SECONDS = 12 * 60 * 60;

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn:
          Number(process.env.JWT_EXPIRES_IN_SECONDS) ||
          DEFAULT_JWT_EXPIRES_IN_SECONDS,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, UsuarioRepository, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
