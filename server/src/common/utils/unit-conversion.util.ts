import { UnidadMedida } from '../../generated/prisma/client';

/** factor tal que valorEnUnidadDestino = valorEnUnidadOrigen * factor. */
const CONVERSION_FACTORS: Partial<
  Record<UnidadMedida, Partial<Record<UnidadMedida, number>>>
> = {
  GRAMO: { KILOGRAMO: 0.001 },
  KILOGRAMO: { GRAMO: 1000 },
  MILILITRO: { LITRO: 0.001 },
  LITRO: { MILILITRO: 1000 },
};

/** `undefined` si no hay conversión conocida entre esas dos unidades. */
export function factorConversion(
  origen: UnidadMedida,
  destino: UnidadMedida,
): number | undefined {
  if (origen === destino) return 1;
  return CONVERSION_FACTORS[origen]?.[destino];
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
