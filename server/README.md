# InvenCheck — Server

[![CI](https://github.com/andres11152/invencheck/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/andres11152/invencheck/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-124%20unit%20%2B%2030%20e2e-blue)](test)
[![coverage threshold](https://img.shields.io/badge/coverage%20threshold-43%25%20stmts%20(CI--enforced)-success)](#tests)

API REST de InvenCheck — NestJS 11 + Prisma 7 (driver adapters) + PostgreSQL. Sirve el catálogo de artículos, el flujo de toma física por voz, la detección de anomalías y los reportes de variación bajo el prefijo `/api`.

> Documentación específica de este paquete. Para el contexto completo del monorepo (por qué existe cada decisión, el flujo de negocio end-to-end, y cómo se relaciona con `client`/`shared`) ver el [README raíz](../README.md).

## Stack

| Capa | Tecnología |
|---|---|
| Framework | NestJS 11 |
| ORM | Prisma 7 (`prisma-client` generator, driver adapters vía `@prisma/adapter-pg`) |
| Base de datos | PostgreSQL 16 (`pg_trgm` + `unaccent` para matching difuso) |
| Auth | JWT (`@nestjs/jwt` + `passport-jwt`), guard global |
| Validación | `class-validator` + `class-transformer`, `ValidationPipe({ whitelist: true, transform: true })` global |
| Tests | Jest (unitarios + e2e), Supertest |

## Requisitos

- Node.js 24.x
- PostgreSQL 16 (vía `docker compose`, incluido en este paquete)

## Puesta en marcha

```bash
npm install                    # o `npm install` desde la raíz del monorepo
cp .env.example .env           # completar JWT_SECRET y ERP_WEBHOOK_API_KEY

npm run db:up                  # docker compose up -d
npm run prisma:migrate         # aplica migraciones
npm run prisma:seed            # WIPEA articulos/almacenes/inventarios, crea 5 artículos + 3 usuarios demo
npm run prisma:import-excel    # reimporta el catálogo real (936 artículos, 48 bodegas) desde data/BODEGAS Y STOCK.xlsx
```

`prisma:seed` y `prisma:import-excel` corren en ese orden siempre: el seed resetea el catálogo a fixtures de prueba, así que el catálogo real hay que reimportarlo después de cada seed.

### Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión a Postgres |
| `JWT_SECRET` | Sí | El proceso falla al arrancar si falta. Generar con `openssl rand -hex 32` |
| `ERP_WEBHOOK_API_KEY` | Sí | El proceso falla al arrancar si falta. Autentica `POST /integration/webhook/*` |
| `GEMINI_API_KEY` | No | Sin ella, el dictado de voz usa el parser local en español (`voice-parser.util.ts`) |
| `GEMINI_MODEL` | No | Default `gemini-3.5-flash` |
| `JWT_EXPIRES_IN_SECONDS` | No | Default 43200 (12h) |
| `CORS_ORIGIN` | No | Default `http://localhost:3001` |
| `ERP_INTEGRATION_URL` | No | Endpoint del ERP externo para `IntegrationErpService.enviarInventarioAERP`; default apunta al mock local |

Ver `.env.example` para la plantilla completa. Nunca reutilizar los valores de ejemplo en un ambiente real.

## Ejecución

```bash
npm run start:dev    # watch mode, :3000, prefijo /api
npm run start        # sin watch
npm run start:prod   # requiere `npm run build` primero (dist/main.js)
```

Docker Desktop debe estar corriendo (`npm run db:up`) antes de levantar el server.

## Tests

```bash
npm test                     # unitarios (Jest)
npm run test:cov             # unitarios + reporte de cobertura + umbral (el que corre en CI)
npx jest <nombre>.spec.ts    # un solo archivo
npm run test:e2e             # e2e contra Postgres real — ver setup abajo
```

**Umbral de cobertura** (`jest.coverageThreshold` en `package.json`): 43% statements / 41% branches / 25% funciones / 42% líneas, sobre `src/` excluyendo el cliente Prisma generado, `*.module.ts` (wiring sin lógica) y `main.ts`. Se aplica con `test:cov` y falla el build en CI si baja. No es 100% a propósito — el objetivo es proteger la lógica de negocio real (anomalías, autorización, guards, agregaciones), no inflar el número con getters y DTOs.

**e2e (`test/*.e2e-spec.ts`)** — 10 specs, 30 tests, contra Postgres real vía `Test.createTestingModule` + Supertest (no mocks): login, matching difuso (`pg_trgm`/`f_unaccent`, imposible de mockear con sentido) y su detección de ambigüedad, resolución exacta por SKU, números dictados/escritos con separador de miles ("15.000kg"), concurrencia de conteo (prueba que el `increment` atómico no pierde escrituras), el flujo central de bloqueo por anomalía, autorización por rol, agregación de reportes, y los webhooks de integración ERP.

Setup local:
```bash
# con Postgres ya arriba (npm run db:up)
docker compose exec postgres psql -U invencheck -d invencheck -c "CREATE DATABASE invencheck_test;"
cp .env.example .env.test    # ajustar DATABASE_URL a invencheck_test; dejar GEMINI_API_KEY vacío
npm run test:e2e             # aplica migraciones automáticamente (pretest:e2e) y corre los specs
```

`.env.test` está gitignored — en CI las mismas variables se inyectan como env del job contra el Postgres del `services` container, sin necesidad de ese archivo.

### Auditoría de matching de voz contra el catálogo real

```bash
npm run prisma:import-excel     # si el catálogo real todavía no está cargado
npm run audit:voice-matching
```

`src/scripts/audit-voice-matching.ts` corre el mismo `ArticuloService.normalizarEntradaHablada` que usa `procesarTomaPorVoz` en producción contra cada artículo del catálogo real importado (no fixtures sintéticos), simulando "lo que diría un operario" con el alias autogenerado del artículo. No corre en CI ni es parte de `test:e2e` — el catálogo real vive en `data/` (gitignored), así que este script es una auditoría manual, no una regresión automatizada.

La primera corrida (938 artículos) encontró 78 (8.3%) que resolvían en silencio a OTRO artículo del catálogo con score alto — sin ninguna señal de que fuera incorrecto. Se corrigió con 3 cambios (detección de ambigüedad top-1/top-2 en `ArticuloService`, `normalizeSpokenText` ya no descarta números que identifican al producto, `buildAliases` prioriza el calificador final). Última corrida tras el fix: **0/938 matches incorrectos silenciosos**, 175/938 (18.7%) ahora caen en `itemsNoMatcheados` pidiendo precisión al operario en vez de auto-confirmar — trade-off elegido con los datos de la propia auditoría (`AMBIGUEDAD_GAP = 0.3` en `articulo.service.ts`, con el razonamiento completo en el comentario de esa constante). Detalle completo: limitación #6 (ya resuelta) en el README raíz.

## Arquitectura

Cada módulo en `src/modules/` (`almacenes`, `articulos`, `ai-engine`, `inventarios`, `reportes`, `integration`, `auth`, `health`) sigue **Controller → Service → Repository**. Los repositorios devuelven tipos derivados de Prisma vía `satisfies Prisma.XInclude` + `Prisma.XGetPayload<{...}>`, nunca interfaces declaradas a mano.

- **Auth**: `JwtAuthGuard` global (`APP_GUARD`) — toda ruta exige JWT salvo `@Public()`. `RolesGuard` restringe `PATCH /inventarios/:id/estado` y `POST /inventarios/:id/auditoria-ciega` a `AUDITOR`/`ADMIN`. `usuarioId`/`auditorId` siempre se derivan del JWT vía `@CurrentUser()`, nunca del body.
- **Integración ERP**: `POST /integration/webhook/sync-articulo`/`sync-almacen` usan `ApiKeyGuard` (header `X-Api-Key`) en vez de JWT — llamador sistema-a-sistema, no un usuario.
- **Detección de anomalías** (`AnomaliasService.evaluarConteo`): unidad ambigua sin factor de conversión → `UNIDAD_AMBIGUA`; `teorico < 0` → `STOCK_NEGATIVO`; variación fuera de `[-80%, +200%]` vs. el promedio histórico de esa bodega (con fallback al promedio global) → `ANOMALIA_CANTIDAD`. Cualquier alerta sin resolver bloquea la transición a `CONCILIADO`/`ENVIADO_ERP`, verificado en `InventarioService.cambiarEstado`.
- **Concurrencia**: `InventarioRepository.incrementarConteo` usa `{ increment: delta }` atómico de Prisma, no leer-sumar-escribir — evita lost updates entre dictados simultáneos del mismo artículo.
- **SQL crudo**: solo donde el query builder no alcanza — matching difuso (`articulo.repository.ts`, `pg_trgm` + `unaccent`) y el reporte agregado de variación (`reporte.repository.ts`), siempre vía `Prisma.sql` parametrizado.
- **Dictado de voz**: `AiEngineService.procesarDictadoVoz` intenta Gemini (si `GEMINI_API_KEY` está seteada, con reintentos/backoff) y cae al parser local en español (`voice-parser.util.ts`) — el fallback real de la demo, no un stub.

## Estructura

```
src/
  common/          filtro global de excepciones, utils compartidos (texto, conversión de unidad)
  generated/prisma  cliente Prisma generado (no editar a mano)
  modules/         un directorio por dominio, Controller → Service → Repository
  prisma/          PrismaService (driver adapter pg)
  scripts/         import-excel.ts — ingesta del catálogo real desde data/BODEGAS Y STOCK.xlsx
prisma/
  schema.prisma
  migrations/
  seed.ts
test/
  *.e2e-spec.ts
  utils/           bootstrap de app de test, seeds programáticos, helpers de auth/HTTP
```
