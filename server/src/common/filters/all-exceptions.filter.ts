import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

/**
 * Códigos de error de Prisma que representan un conflicto/entrada inválida
 * del cliente (4xx), no una falla del servidor — el resto de códigos
 * conocidos de Prisma se tratan como error interno (500) más abajo.
 */
const PRISMA_CLIENT_ERROR_STATUS: Record<string, HttpStatus> = {
  P2002: HttpStatus.CONFLICT, // unique constraint
  P2003: HttpStatus.BAD_REQUEST, // foreign key constraint
  P2025: HttpStatus.NOT_FOUND, // registro no encontrado (update/delete)
};

/**
 * Único punto de salida para cualquier excepción no capturada. Sin esto,
 * un error de Prisma sin manejar (o cualquier throw inesperado) llega al
 * cliente con el mensaje/stack interno tal cual — acá se normaliza a una
 * respuesta consistente y se loguea el detalle completo solo del lado
 * servidor.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const status =
        PRISMA_CLIENT_ERROR_STATUS[exception.code] ??
        HttpStatus.INTERNAL_SERVER_ERROR;
      this.logger.error(
        `Prisma ${exception.code}: ${exception.message}`,
        exception.stack,
      );
      response.status(status).json({
        statusCode: status,
        message:
          status === HttpStatus.INTERNAL_SERVER_ERROR
            ? 'Error interno del servidor'
            : 'Conflicto con el estado actual de los datos',
      });
      return;
    }

    // Cualquier otro error (bug, dependencia externa caída, etc.): se loguea
    // completo del lado servidor, pero al cliente nunca le llega el mensaje
    // ni el stack original — solo un 500 genérico.
    this.logger.error(
      exception instanceof Error ? exception.message : 'Error desconocido',
      exception instanceof Error ? exception.stack : undefined,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Error interno del servidor',
    });
  }
}
