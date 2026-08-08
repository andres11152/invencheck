import dotenv from 'dotenv';
import path from 'path';
import { defineConfig } from 'prisma/config';

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, '.env') });
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // La CLI de Prisma (migrate/seed/studio) se conecta con el rol DUEÑO de
    // las tablas, no con el rol de la aplicación: necesita DDL, y además el
    // dueño se salta las policies de RLS, que es lo que permite que las
    // migraciones y el seed toquen filas de cualquier organización sin
    // casos especiales. `DATABASE_URL` (rol invencheck_app, sin privilegios)
    // es solo para el proceso de NestJS. Ver la migración
    // _rol_aplicacion_sin_privilegios.
    url: process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL,
  },
});
