export * from './enums';
export * from './dto';

export interface Usuario {
  id: string;
  nombre: string;
  rol: 'ADMIN' | 'OPERARIO' | 'AUDITOR';
}

export interface Producto {
  id: string;
  codigoBarras: string;
  descripcion: string;
  ubicacion: string;
  cantidadTeorica: number;
}

export interface TomaFisicaDetalle {
  productoId: string;
  cantidadContada: number;
  notasVozUrl?: string; // Para la toma física guiada por voz
  transcripcionVoz?: string;
  fechaCaptura: Date;
}
