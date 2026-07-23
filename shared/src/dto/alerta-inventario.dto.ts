import { TipoAlerta } from '../enums/tipo-alerta.enum';

/**
 * Discrepancia detectada durante una toma física (ej. stock negativo en
 * el ERP, desviación > 40% frente al histórico, o unidad ambigua
 * reportada por voz).
 */
export interface AlertaInventarioDto {
  id: string;
  inventarioId: string;
  itemInventarioId: string | null;
  tipo: TipoAlerta;
  mensaje: string;
  resuelto: boolean;
  createdAt: Date;
}
