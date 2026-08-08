import { ContextoOrganizacionService } from '../src/prisma/contexto-organizacion.service';
import { extensionAlcanceOrganizacion } from '../src/prisma/extension-alcance-organizacion';
import { ORGANIZACION_LEGADO_ID } from '../src/prisma/organizacion-legado';
import { PrismaService } from '../src/prisma/prisma.service';
import { ArticuloRepository } from '../src/modules/articulos/articulo.repository';
import { ArticuloService } from '../src/modules/articulos/articulo.service';
import { AnomaliasService } from '../src/modules/inventarios/services/anomalias.service';
import { factorConversion } from '../src/common/utils/unit-conversion.util';
import { UnidadMedida, type Articulo } from '../src/generated/prisma/client';

/**
 * Auditoría automatizada de "cero errores" contra el catálogo REAL completo
 * (no fixtures sintéticos) — pedido explícito: probar CADA producto del
 * sistema, pensando como el cliente final, cuyo requisito central
 * de la solución es exactamente esto: "si alguien dice 'cinco kilos de harina',
 * no lo confunde con cinco gramos" y "reconoce productos ... sin
 * ambigüedades" contra el catálogo real.
 *
 * Corre en su propio config de Jest (`jest-catalogo.json`, `npm run
 * test:catalogo-real`), NO como parte de `test`/`test:e2e` — a propósito:
 * necesita el catálogo real importado (`npm run prisma:import-excel`), que
 * no existe en CI (los datos reales del catálogo están en `data/`,
 * gitignored, igual que `audit-voice-matching.ts`). Todo lo que hace este
 * archivo es de SOLO LECTURA sobre el catálogo — nunca crea inventarios ni
 * escribe en `items_inventario`/`alertas_inventario`, para no ensuciar la
 * base de datos de desarrollo con cientos de filas de prueba.
 */
describe('Catálogo real — cero errores (auditoría automatizada, todos los productos)', () => {
  let prisma: PrismaService;
  let contexto: ContextoOrganizacionService;
  let articuloService: ArticuloService;
  let anomaliasService: AnomaliasService;
  let articulos: Articulo[];

  const CATALOGO_MINIMO_ESPERADO = 900;

  beforeAll(async () => {
    contexto = new ContextoOrganizacionService();
    prisma = new PrismaService(contexto);
    await prisma.$connect();
    const prismaOrg = prisma.$extends(extensionAlcanceOrganizacion(contexto));
    articuloService = new ArticuloService(
      new ArticuloRepository(prismaOrg, contexto),
    );
    anomaliasService = new AnomaliasService();
    // `npm run prisma:import-excel` importa el catálogo real bajo la
    // organización de legado por defecto (ver import-excel.ts).
    articulos = await contexto.ejecutarConOrganizacion(
      ORGANIZACION_LEGADO_ID,
      () => prismaOrg.articulo.findMany({ orderBy: { nombre: 'asc' } }),
    );
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('el catálogo real está importado (si falla: correr npm run prisma:import-excel primero)', () => {
    expect(articulos.length).toBeGreaterThanOrEqual(CATALOGO_MINIMO_ESPERADO);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 1. Matching por voz: CADA producto, dictando su propio nombre/alias,
  //    nunca debe resolver en silencio a OTRO artículo del catálogo.
  //    Ambigüedad detectada (candidatosAmbiguos) es un resultado ACEPTABLE
  //    — el objetivo no es que todo matchee solo, es que nada matchee mal.
  // ─────────────────────────────────────────────────────────────────────
  it('CADA producto: dictar su propio nombre/alias nunca matchea en silencio contra otro artículo', async () => {
    const incorrectos: string[] = [];

    await contexto.ejecutarConOrganizacion(ORGANIZACION_LEGADO_ID, async () => {
      for (const articulo of articulos) {
        const frase = articulo.aliases[0] ?? articulo.nombre;
        const match = await articuloService.normalizarEntradaHablada(frase);

        if (match.articulo && match.articulo.id !== articulo.id) {
          incorrectos.push(
            `"${frase}" (esperado: "${articulo.nombre}" / sku ${articulo.sku ?? 'N/A'}) -> matcheó "${match.articulo.nombre}" (score ${match.score.toFixed(2)})`,
          );
        }
      }
    });

    expect(incorrectos).toEqual([]);
  }, 120000);

  // ─────────────────────────────────────────────────────────────────────
  // 2. Ambigüedad real detectada: si el catálogo SÍ ofrece candidatos,
  //    cada uno debe ser un artículo real y distinto del principal — un
  //    candidato duplicado o inventado sería un bug del propio chequeo de
  //    ambigüedad, no un resultado válido.
  // ─────────────────────────────────────────────────────────────────────
  it('cuando se detecta ambigüedad, los candidatos son artículos reales y distintos entre sí', async () => {
    const problemas: string[] = [];
    const idsReales = new Set(articulos.map((a) => a.id));

    await contexto.ejecutarConOrganizacion(ORGANIZACION_LEGADO_ID, async () => {
      for (const articulo of articulos) {
        const frase = articulo.aliases[0] ?? articulo.nombre;
        const match = await articuloService.normalizarEntradaHablada(frase);
        if (!match.candidatosAmbiguos) continue;

        const ids = match.candidatosAmbiguos.map((c) => c.id);
        const idsUnicos = new Set(ids);
        if (idsUnicos.size !== ids.length) {
          problemas.push(
            `"${frase}": candidatos duplicados (${ids.join(', ')})`,
          );
        }
        for (const id of ids) {
          if (!idsReales.has(id)) {
            problemas.push(
              `"${frase}": candidato ${id} no existe en el catálogo`,
            );
          }
        }
      }
    });

    expect(problemas).toEqual([]);
  }, 120000);

  // ─────────────────────────────────────────────────────────────────────
  // 3. Seguridad de unidades: CADA producto, dictado en CUALQUIERA de las
  //    8 unidades del sistema, nunca debe mezclar magnitudes incompatibles
  //    a ciegas ("cinco kilos" nunca se confunde con "cinco gramos" — el
  //    ejemplo textual del brief, verificado contra los 936 productos
  //    reales, no solo un puñado de casos de prueba). Es una función pura
  //    (AnomaliasService.evaluarConteo no toca la base de datos), así que
  //    corre sin riesgo de escribir nada.
  // ─────────────────────────────────────────────────────────────────────
  it('CADA producto, dictado en cualquiera de las 8 unidades: nunca convierte a ciegas entre unidades incompatibles', () => {
    // Tabla de factores CORRECTOS escrita a mano, independiente de
    // `factorConversion` — si este test derivara el valor "esperado"
    // llamando a la misma función que está probando, un bug en la propia
    // tabla de conversión (ej. gramos->kilogramos con factor 1 en vez de
    // 0.001) pasaría inadvertido porque lo "esperado" y lo "obtenido"
    // estarían igual de mal. Confirmado empíricamente: romper el factor a
    // propósito y correr el test con la versión anterior (que sí reusaba
    // factorConversion) seguía en verde — por eso esta tabla está aparte.
    const FACTOR_CORRECTO_CONOCIDO: Partial<
      Record<UnidadMedida, Partial<Record<UnidadMedida, number>>>
    > = {
      GRAMO: { KILOGRAMO: 0.001 },
      KILOGRAMO: { GRAMO: 1000 },
      MILILITRO: { LITRO: 0.001 },
      LITRO: { MILILITRO: 1000 },
    };

    const TODAS_LAS_UNIDADES = Object.values(UnidadMedida);
    const fallos: string[] = [];
    const CANTIDAD_DICTADA = 10;

    for (const articulo of articulos) {
      for (const unidadDictada of TODAS_LAS_UNIDADES) {
        if (unidadDictada === articulo.unidadEstd) continue;

        const factorConocido =
          FACTOR_CORRECTO_CONOCIDO[unidadDictada]?.[articulo.unidadEstd];
        // Estas dos DEBEN coincidir siempre — si `factorConversion` alguna
        // vez conoce una conversión que esta tabla de mano no anticipó (o
        // viceversa), es una señal de que la tabla de arriba quedó
        // desactualizada respecto al código real, no un fallo del producto.
        const factorReal = factorConversion(unidadDictada, articulo.unidadEstd);
        if ((factorConocido === undefined) !== (factorReal === undefined)) {
          fallos.push(
            `Tabla de conversión desincronizada: ${unidadDictada}->${articulo.unidadEstd} (factorConversion=${factorReal}, tabla de mano=${factorConocido})`,
          );
          continue;
        }

        const evaluacion = anomaliasService.evaluarConteo({
          articulo,
          teorico: articulo.stockHistoricoAvg ?? 0,
          conteoFisico: CANTIDAD_DICTADA,
          unidadDictada,
        });

        if (factorConocido === undefined) {
          // Sin conversión conocida: DEBE marcarse como ambigüedad, nunca
          // aceptar el número crudo como si ya estuviera en la unidad
          // estándar del artículo.
          const tieneAmbigua = evaluacion.alertas.some(
            (a) => a.tipo === 'UNIDAD_AMBIGUA',
          );
          if (!tieneAmbigua) {
            fallos.push(
              `"${articulo.nombre}" (unidadEstd=${articulo.unidadEstd}): dictar en ${unidadDictada} no disparó UNIDAD_AMBIGUA`,
            );
          }
          if (evaluacion.conteoFisico !== CANTIDAD_DICTADA) {
            fallos.push(
              `"${articulo.nombre}": dictado en ${unidadDictada} (incompatible) alteró el número (${CANTIDAD_DICTADA} -> ${evaluacion.conteoFisico}) en vez de dejarlo intacto para revisión`,
            );
          }
        } else {
          // Conversión conocida (ej. GRAMO<->KILOGRAMO, MILILITRO<->LITRO):
          // debe aplicarse EXACTAMENTE con el factor correcto (tabla de
          // mano de arriba), y el resultado debe quedar en la unidad
          // estándar del artículo — nunca mezclar escalas.
          const esperado =
            Math.round(CANTIDAD_DICTADA * factorConocido * 100) / 100;
          if (evaluacion.conteoFisico !== esperado) {
            fallos.push(
              `"${articulo.nombre}": ${CANTIDAD_DICTADA} ${unidadDictada} -> esperado ${esperado} ${articulo.unidadEstd}, obtuvo ${evaluacion.conteoFisico} ${evaluacion.unidadUsada}`,
            );
          }
          if (evaluacion.unidadUsada !== articulo.unidadEstd) {
            fallos.push(
              `"${articulo.nombre}": conversión de ${unidadDictada} no dejó unidadUsada en ${articulo.unidadEstd} (quedó en ${evaluacion.unidadUsada})`,
            );
          }
        }
      }
    }

    expect(fallos).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 4. Calidad de datos del catálogo — edge cases que un cliente real
  //    notaría de inmediato si algo se coló mal en la importación.
  // ─────────────────────────────────────────────────────────────────────
  it('ningún producto tiene nombre vacío/en blanco', () => {
    const vacios = articulos.filter((a) => a.nombre.trim().length === 0);
    expect(vacios.map((a) => a.id)).toEqual([]);
  });

  it('no hay dos productos con el mismo nombre exacto (colisión de catálogo maestro)', () => {
    const porNombre = new Map<string, string[]>();
    for (const a of articulos) {
      const key = a.nombre.trim().toUpperCase();
      porNombre.set(key, [...(porNombre.get(key) ?? []), a.id]);
    }
    const duplicados = [...porNombre.entries()].filter(
      ([, ids]) => ids.length > 1,
    );
    expect(duplicados).toEqual([]);
  });

  it('ningún SKU está repetido entre dos productos distintos', () => {
    const porSku = new Map<string, string[]>();
    for (const a of articulos) {
      if (!a.sku) continue;
      porSku.set(a.sku, [...(porSku.get(a.sku) ?? []), a.id]);
    }
    const duplicados = [...porSku.entries()].filter(
      ([, ids]) => ids.length > 1,
    );
    expect(duplicados).toEqual([]);
  });

  it('ningún producto tiene un promedio histórico negativo (dato sin sentido de negocio, corrompería la detección de anomalías)', () => {
    const negativos = articulos.filter(
      (a) => a.stockHistoricoAvg !== null && a.stockHistoricoAvg < 0,
    );
    expect(negativos.map((a) => `${a.nombre}: ${a.stockHistoricoAvg}`)).toEqual(
      [],
    );
  });

  it('todos los productos tienen una unidadEstd válida del enum conocido', () => {
    const validas = new Set(Object.values(UnidadMedida));
    const invalidas = articulos.filter((a) => !validas.has(a.unidadEstd));
    expect(invalidas.map((a) => `${a.nombre}: ${a.unidadEstd}`)).toEqual([]);
  });
});
