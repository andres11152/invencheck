import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { Prisma } from '../../generated/prisma/client';

describe('AllExceptionsFilter', () => {
  function buildHost() {
    const json = jest.fn<void, [Record<string, unknown>]>();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;
    return { host, status, json };
  }

  it('deja pasar un HttpException tal cual (statusCode y body original)', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = buildHost();
    const exception = new BadRequestException('Datos inválidos');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(exception.getResponse());
  });

  it('mapea P2002 (unique constraint) de Prisma a 409 sin exponer el mensaje interno', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = buildHost();
    const exception = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      { code: 'P2002', clientVersion: '7.9.0' },
    );

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    const body = json.mock.calls[0][0] as { message: string };
    expect(body.message).not.toContain('Unique constraint');
  });

  it('mapea P2025 (registro no encontrado) a 404', () => {
    const filter = new AllExceptionsFilter();
    const { host, status } = buildHost();
    const exception = new Prisma.PrismaClientKnownRequestError('No record', {
      code: 'P2025',
      clientVersion: '7.9.0',
    });

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it('un código de Prisma desconocido cae a 500 genérico', () => {
    const filter = new AllExceptionsFilter();
    const { host, status } = buildHost();
    const exception = new Prisma.PrismaClientKnownRequestError('Boom', {
      code: 'P9999',
      clientVersion: '7.9.0',
    });

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('cualquier error no reconocido devuelve 500 genérico sin filtrar el mensaje original', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = buildHost();
    const exception = new Error('detalle interno sensible del stack');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = json.mock.calls[0][0] as { message: string };
    expect(body.message).toBe('Error interno del servidor');
    expect(body.message).not.toContain('detalle interno sensible');
  });
});
