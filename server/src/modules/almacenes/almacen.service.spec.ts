import { AlmacenService } from './almacen.service';
import type { AlmacenRepository } from './almacen.repository';

describe('AlmacenService.findAll', () => {
  function buildService(findAll: jest.Mock) {
    const repository = { findAll } as unknown as AlmacenRepository;
    return new AlmacenService(repository);
  }

  it('delega en el repositorio sin filtro cuando no se pasa unidad', async () => {
    const findAll = jest.fn().mockResolvedValue([]);
    const service = buildService(findAll);

    await service.findAll();

    expect(findAll).toHaveBeenCalledWith({ unidad: undefined });
  });

  it('delega el filtro de unidad tal cual al repositorio', async () => {
    const findAll = jest.fn().mockResolvedValue([]);
    const service = buildService(findAll);

    await service.findAll('Piscilago');

    expect(findAll).toHaveBeenCalledWith({ unidad: 'Piscilago' });
  });
});
