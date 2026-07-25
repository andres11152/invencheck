import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsuarioRepository } from './usuario.repository';
import { JwtStrategy } from './jwt.strategy';
import type { EnvironmentVariables } from '../../config/env.validation';

/** 12 horas, para que un turno completo no requiera volver a loguearse. */
const DEFAULT_JWT_EXPIRES_IN_SECONDS = 12 * 60 * 60;

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
      ) => ({
        secret: configService.get('JWT_SECRET', { infer: true }),
        signOptions: {
          expiresIn:
            configService.get('JWT_EXPIRES_IN_SECONDS', { infer: true }) ??
            DEFAULT_JWT_EXPIRES_IN_SECONDS,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, UsuarioRepository, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
