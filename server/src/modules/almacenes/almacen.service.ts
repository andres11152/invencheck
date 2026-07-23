import { Injectable } from '@nestjs/common';
import { AlmacenRepository } from './almacen.repository';

@Injectable()
export class AlmacenService {
  constructor(private readonly almacenRepository: AlmacenRepository) {}

  findAll(unidad?: string) {
    return this.almacenRepository.findAll({ unidad });
  }
}
