import 'dotenv/config';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { ContextoOrganizacionService } from '../prisma/contexto-organizacion.service';
import { extensionAlcanceOrganizacion } from '../prisma/extension-alcance-organizacion';
import { ORGANIZACION_LEGADO_SLUG } from '../prisma/organizacion-legado';
import { PrismaService } from '../prisma/prisma.service';
import { ArticuloRepository } from '../modules/articulos/articulo.repository';
import { ArticuloService } from '../modules/articulos/articulo.service';

const logger = new Logger('AuditVoiceMatching');

/** Debe coincidir con el umbral real de articulo.service.ts. */
const VOICE_MATCH_MIN_SCORE = 0.35;
/** Un match correcto pero con score bajo este valor se considera "frágil": pasa hoy, pero cualquier variación de frase podría tumbarlo por debajo del umbral. */
const SCORE_FRAGIL = 0.5;

type Resultado =
  'OK' | 'FRAGIL' | 'SIN_MATCH' | 'MATCH_INCORRECTO' | 'AMBIGUO_DETECTADO';

interface Caso {
  articuloId: string;
  nombre: string;
  sku: string | null;
  categoria: string;
  teniaAlias: boolean;
  fraseUsada: string;
  matcheadoA: string | null;
  candidatosAmbiguos: string[] | null;
  score: number;
  resultado: Resultado;
}

/**
 * Auditoría de calidad del matching por voz contra el catálogo REAL (no
 * fixtures sintéticos). Para cada artículo, simula "lo que diría un
 * operario" usando el primer alias autogenerado (`buildAliases`, el mismo
 * que usa `prisma:import-excel`) — o el nombre crudo si el artículo no
 * generó ningún alias — y corre esa frase por el MISMO
 * `ArticuloService.normalizarEntradaHablada` que usa `procesarTomaPorVoz`
 * en producción. No es una reimplementación aparte: si esto pasa, el
 * pipeline real pasa.
 *
 * No corre en CI (el catálogo real vive en `data/`, gitignored) — se
 * ejecuta a mano cuando se quiere auditar la calidad real del matching.
 */
/** `--organizacion=<slug>` — default al slug de la organización de legado (uso local sin flag). */
function leerOrganizacionSlug(): string {
  const flag = process.argv.find((arg) => arg.startsWith('--organizacion='));
  return flag ? flag.slice('--organizacion='.length) : ORGANIZACION_LEGADO_SLUG;
}

async function main() {
  const contexto = new ContextoOrganizacionService();
  const prisma = new PrismaService(contexto);
  const prismaOrg = prisma.$extends(extensionAlcanceOrganizacion(contexto));
  const articuloRepository = new ArticuloRepository(prismaOrg, contexto);
  const articuloService = new ArticuloService(articuloRepository);

  const slug = leerOrganizacionSlug();

  try {
    const organizacion = await prisma.sinAlcanceDeOrganizacion(
      `audit-voice-matching: resolver organización por slug "${slug}"`,
      () => prisma.organizacion.findUnique({ where: { slug } }),
    );
    if (!organizacion) {
      throw new Error(
        `No existe ninguna organización con slug "${slug}". Pásala con --organizacion=<slug>.`,
      );
    }

    await contexto.ejecutarConOrganizacion(organizacion.id, async () => {
      const articulos = await prismaOrg.articulo.findMany({
        orderBy: { nombre: 'asc' },
      });
      logger.log(
        `Auditando ${articulos.length} artículos del catálogo real (${organizacion.nombre})...`,
      );

      const casos: Caso[] = [];
      let procesados = 0;

      for (const articulo of articulos) {
        const teniaAlias = articulo.aliases.length > 0;
        const fraseUsada = articulo.aliases[0] ?? articulo.nombre;

        const match =
          await articuloService.normalizarEntradaHablada(fraseUsada);

        let resultado: Resultado;
        if (match.candidatosAmbiguos && match.candidatosAmbiguos.length > 0) {
          // Antes esto se auto-confirmaba en silencio contra el top-1 (a veces
          // el artículo correcto, a veces no); ahora ArticuloService lo detecta
          // como ambiguo y no elige ninguno — es una mejora sobre MATCH_INCORRECTO,
          // no un fallo nuevo, así que se reporta aparte.
          resultado = 'AMBIGUO_DETECTADO';
        } else if (!match.articulo) {
          resultado = 'SIN_MATCH';
        } else if (match.articulo.id !== articulo.id) {
          resultado = 'MATCH_INCORRECTO';
        } else if (match.score < SCORE_FRAGIL) {
          resultado = 'FRAGIL';
        } else {
          resultado = 'OK';
        }

        casos.push({
          articuloId: articulo.id,
          nombre: articulo.nombre,
          sku: articulo.sku,
          categoria: articulo.categoria,
          teniaAlias,
          fraseUsada,
          matcheadoA: match.articulo?.nombre ?? null,
          candidatosAmbiguos:
            match.candidatosAmbiguos?.map((a) => a.nombre) ?? null,
          score: Number(match.score.toFixed(3)),
          resultado,
        });

        procesados++;
        if (procesados % 100 === 0) {
          logger.log(`  ${procesados}/${articulos.length}...`);
        }
      }

      const resumen = {
        total: casos.length,
        OK: casos.filter((c) => c.resultado === 'OK').length,
        FRAGIL: casos.filter((c) => c.resultado === 'FRAGIL').length,
        SIN_MATCH: casos.filter((c) => c.resultado === 'SIN_MATCH').length,
        MATCH_INCORRECTO: casos.filter(
          (c) => c.resultado === 'MATCH_INCORRECTO',
        ).length,
        AMBIGUO_DETECTADO: casos.filter(
          (c) => c.resultado === 'AMBIGUO_DETECTADO',
        ).length,
        sinAlias: casos.filter((c) => !c.teniaAlias).length,
        umbralUsado: VOICE_MATCH_MIN_SCORE,
      };

      logger.log('--- Resumen ---');
      logger.log(JSON.stringify(resumen, null, 2));

      const outPath = resolve(
        __dirname,
        '../../audit-voice-matching-report.json',
      );
      writeFileSync(outPath, JSON.stringify({ resumen, casos }, null, 2));
      logger.log(`Reporte completo escrito en ${outPath}`);
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  logger.error(err);
  process.exitCode = 1;
});
