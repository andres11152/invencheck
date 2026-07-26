# InvenCheck

[![CI](https://github.com/andres11152/invencheck/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/andres11152/invencheck/actions/workflows/ci.yml)
[![server e2e](https://img.shields.io/badge/server%20e2e-30%20tests%20%2F%2010%20specs-blue)](server/test)
[![client tests](https://img.shields.io/badge/client%20tests-21%20tests%20%2F%204%20specs-blue)](client/src)
[![coverage threshold](https://img.shields.io/badge/coverage%20threshold-enforced%20in%20CI-success)](#tests)

PWA de toma física de inventario por voz para Colsubsidio Hotelería. Reemplaza el conteo manual en papel: el operario dicta lo que cuenta ("quince kilos de papa criolla"), el sistema lo matchea contra el catálogo real en tiempo real, y las anomalías (cantidades implausibles, unidades ambiguas) bloquean la consolidación hasta que alguien las confirma o corrige.

Desarrollado para el reto Colsubsidio 30X ("Reto Hotelería"). El alcance está delimitado por el brief del reto: capacidad de captura por voz, matching de catálogo, detección de anomalías y reportes de variación física vs. histórico. Funcionalidad de recetas/pedidos/producción fue evaluada, implementada y luego removida deliberadamente al confirmarse con los organizadores que quedaba fuera del alcance evaluado — ver `git log` para el historial de esa decisión.

## Estado del proyecto

Este proyecto está en estado de **prototipo funcional para demo**, no de despliegue en producción. La tabla siguiente resume honestamente qué controles de producción existen y cuáles no, para que cualquiera que lo retome sepa exactamente dónde está parado.

| Área | Estado |
|---|---|
| Autenticación (JWT, guard global) | Implementado |
| Autorización por rol (segregación de funciones en cierre/auditoría) | Implementado |
| Rate limiting (login y global) | Implementado |
| Manejo centralizado de errores | Implementado |
| Health check | Implementado |
| CI (lint + typecheck + tests unitarios + e2e + build, server y client, en cada push/PR) | Implementado |
| Tests unitarios | Parcial, con umbral de cobertura exigido en CI (falla el build si baja) — `server`: ~52% statements; `client`: ~80% statements pero acotado a los módulos más críticos (`auth-storage`, `api`, `use-offline-sync`, `use-speech-recognition`, `AnomaliaModal`), no a todo `src/` — ver sección Tests |
| Tests de integración/e2e | Implementado — 10 specs contra Postgres real (auth, matching difuso, ambigüedad de matching, números con separador de miles, concurrencia de conteo, bloqueo por anomalía, autorización por rol, reporte de variación, webhooks ERP) |
| Contenerización (Dockerfile de `server`/`client`) | No existe — solo hay `docker-compose.yml` para Postgres local |
| Dependencias con vulnerabilidades conocidas | `exceljs` (server, prod): sin fix limpio upstream — ver limitación #2. `prisma` CLI (server, dev-only): el hallazgo es de una versión más vieja que la ya instalada y de un comando (`prisma dev`) que este proyecto no usa. `next`/`postcss` (client): pendiente, requiere migración mayor — ver limitación #2 |
| Observabilidad (logging estructurado, APM, métricas) | No existe — solo `Logger` de Nest a stdout |
| Gestión de secretos | Variables de entorno planas (`.env`), sin vault |

## Arquitectura

Monorepo con npm workspaces:

```
server/    NestJS + Prisma + PostgreSQL — API REST bajo /api
client/    Next.js 14 (App Router) — PWA, todo "use client"
shared/    Enums TypeScript compartidos entre server y client
```

### Server

Cada módulo en `server/src/modules/` (`almacenes`, `articulos`, `ai-engine`, `inventarios`, `reportes`, `integration`, `auth`, `health`) sigue la misma capa: **Controller → Service → Repository**. Los repositorios devuelven tipos derivados de Prisma vía `satisfies Prisma.XInclude` + `Prisma.XGetPayload<{...}>` en vez de interfaces declaradas a mano, para que el tipo no pueda desalinearse de la query real.

SQL crudo (`$queryRaw`) se usa únicamente donde el query builder de Prisma no alcanza: matching difuso por trigramas (`pg_trgm` + `unaccent`) en `articulo.repository.ts`, y el reporte agregado de variación en `reporte.repository.ts`. Siempre a través de `Prisma.sql` con parámetros tipados, nunca concatenación de strings.

**Autenticación y autorización.** `JwtAuthGuard` está registrado globalmente (`APP_GUARD`); toda ruta exige un JWT válido salvo que esté marcada `@Public()`. `RolesGuard`, también global, aplica `@Roles(...)` donde se declare — hoy restringe la consolidación de inventario (`PATCH /inventarios/:id/estado`) y la creación de auditorías ciegas (`POST /inventarios/:id/auditoria-ciega`) a los roles `AUDITOR` y `ADMIN`: quien contó no se autoaprueba (segregación de funciones clásica en procesos de inventario). `usuarioId`/`auditorId` se derivan siempre del JWT vía `@CurrentUser()`, nunca se aceptan desde el body de la petición.

Los webhooks de integración ERP (`POST /integration/webhook/sync-articulo`, `sync-almacen`) usan un `ApiKeyGuard` separado (header `X-Api-Key`) en vez de JWT, porque los llama un sistema externo, no un usuario logueado. `POST /integration/mock-erp/receive-inventario` es público: simula el endpoint del ERP externo para el flujo de demo, no forma parte del perímetro de confianza de esta aplicación.

**Detección de anomalías.** `AnomaliasService.evaluarConteo` evalúa, en orden, tres reglas por línea contada:

1. Ambigüedad de unidad: si la unidad dictada difiere de la unidad de catálogo del artículo y no hay factor de conversión conocido, dispara `UNIDAD_AMBIGUA` y no convierte.
2. Stock negativo heredado: `teorico < 0` dispara `STOCK_NEGATIVO`.
3. Desviación histórica: variación contra el promedio histórico **de esa bodega específica** (con fallback al promedio global del artículo si la bodega no tiene historial propio) fuera de `[-80%, +200%]` dispara `ANOMALIA_CANTIDAD`.

Cualquier alerta sin resolver bloquea la transición a `CONCILIADO`/`ENVIADO_ERP`, verificado del lado del servidor — el modal de confirmación en el cliente es solo la capa de UX, no el control real.

**Concurrencia.** La acumulación de conteos usa el operador atómico `{ increment: delta }` de Prisma en vez de leer-sumar-escribir en código de aplicación, para que dos dictados casi simultáneos del mismo artículo no se pisen entre sí (lost update). La conversión de unidad ocurre antes del incremento, nunca después, para no mezclar magnitudes distintas en la suma.

**Cascada de dictado por voz.** `AiEngineService.procesarDictadoVoz`: Gemini (si `GEMINI_API_KEY` está configurada) con reintentos y backoff exponencial ante errores transitorios (429/5xx) → parser local en español (`voice-parser.util.ts`, regex + tabla de números, sin llamadas externas). El parser local no es un stub: es el fallback real con el que corre la demo por defecto, con su propia suite de tests.

### Client

Next.js 14 App Router, todos los componentes `"use client"` — sin server components ni server actions, todo habla con la API a través de un wrapper `request<T>` tipado en `client/src/lib/api.ts`. `auth-provider.tsx` mantiene la sesión JWT en `localStorage` y redirige a `/login` ante sesión ausente o expirada.

Soporte offline: los dictados hechos sin conexión se encolan en IndexedDB (`use-offline-sync.ts`) y se reintentan al recuperar señal.

`shared/src/enums/` (`EstadoInventario`, `TipoAlerta`, `UnidadMedida`) es el único punto de sincronización de tipos entre server y client. El client **no** importa el resto de tipos del server: `client/src/lib/types.ts` declara sus propias interfaces reflejando las respuestas del server a mano. Cualquier cambio de forma de respuesta en el server debe reflejarse ahí manualmente — el compilador no detecta ese drift entre paquetes.

## Requisitos

- Node.js 24.x (probado con `v24.18.0`); no hay `.nvmrc` en el repo todavía
- npm 10+ (probado con `11.16.0`)
- Docker Desktop (para Postgres local vía `docker compose`)

## Puesta en marcha

```bash
git clone https://github.com/andres11152/invencheck.git
cd invencheck
npm install                              # instala las 3 workspaces de una vez

cp server/.env.example server/.env       # completar JWT_SECRET y ERP_WEBHOOK_API_KEY
cp client/.env.example client/.env       # NEXT_PUBLIC_API_URL por defecto ya sirve para local

cd server
npm run db:up                            # docker compose up -d — Postgres debe estar arriba antes de lo siguiente
npm run prisma:migrate                   # aplica migraciones
npm run prisma:seed                      # WIPEA articulos/almacenes/inventarios, crea 5 artículos + 3 usuarios demo
npm run prisma:import-excel              # reimporta el catálogo real (936 artículos, 48 bodegas) desde data/BODEGAS Y STOCK.xlsx
```

`prisma:seed` y `prisma:import-excel` deben correr en ese orden: el seed siempre resetea `articulos`/`almacenes` a un puñado de fixtures de prueba, así que el catálogo real hay que reimportarlo después de cada seed.

### Variables de entorno requeridas (server)

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión a Postgres |
| `JWT_SECRET` | Requerida — el proceso falla al arrancar si falta. Generar con `openssl rand -hex 32`, nunca reutilizar el valor de ejemplo |
| `ERP_WEBHOOK_API_KEY` | Requerida — el proceso falla al arrancar si falta. Autentica los webhooks del ERP externo |
| `GEMINI_API_KEY` | Opcional. Sin ella, el dictado de voz usa el parser local en español |
| `JWT_EXPIRES_IN_SECONDS` | Opcional, default 43200 (12h) |
| `CORS_ORIGIN` | Opcional, default `http://localhost:3001` |

## Desarrollo

Dos servidores, puertos fijos, correr ambos:

```bash
npm run dev:server    # desde la raíz, o `npm run start:dev` en server/ — NestJS en :3000, prefijo /api
npm run dev:client    # desde la raíz, o `npm run dev` en client/ — Next.js en :3001
```

Docker Desktop debe estar corriendo (`docker compose up -d` en `server/`) antes de levantar el server.

**Advertencia conocida:** correr `next build` (client) o `nest build` (server) mientras el dev server correspondiente sigue vivo contra el mismo `.next`/`dist` corrompe ese output y el dev server empieza a responder 500. Después de un build de producción: `rm -rf .next` (o `dist/`) y reiniciar el dev server.

### Usuarios demo (creados por el seed)

| Email | Password | Rol |
|---|---|---|
| `operario@invencheck.demo` | `operario123` | OPERARIO |
| `auditor@invencheck.demo` | `auditor123` | AUDITOR |
| `admin@invencheck.demo` | `admin123` | ADMIN |

OPERARIO puede contar y dictar, pero no puede consolidar un inventario ni enviarlo al ERP, ni iniciar una auditoría ciega — esas acciones requieren AUDITOR o ADMIN.

## Comandos

Ejecutar desde el directorio del paquete correspondiente salvo que se indique lo contrario.

**Server:**

```bash
npm run lint                # eslint --fix
npx tsc --noEmit             # typecheck (sin script npm dedicado, se invoca directo)
npm test                     # jest, unitarios
npx jest <nombre>.spec.ts    # un solo archivo de test
npm run test:cov             # con reporte de cobertura + umbral (el que corre CI)
npm run test:e2e             # 10 specs e2e contra Postgres real — ver sección Tests para el setup de `.env.test`
npm run build                # nest build
```

**Client:**

```bash
npm run lint       # next lint
npx tsc --noEmit    # typecheck
npm run test        # vitest run — unitarios/componente
npm run test:watch  # vitest en modo watch
npm run test:cov    # con reporte de cobertura + umbral (el que corre CI)
npm run build       # next build
```

**Shared:** `npm run build` (tsc).

## CI

`.github/workflows/ci.yml` corre en cada push a `master` y en cada pull request: instala las 3 workspaces, build de `shared`, luego lint + typecheck + tests unitarios (con umbral de cobertura, `test:cov`) + build de `server`, luego los tests e2e de `server` contra un contenedor de Postgres levantado como `services` del job, y finalmente lint + typecheck + tests (también con umbral, `test:cov`) + build de `client`. Si la cobertura de cualquiera de los dos paquetes cae por debajo del umbral fijado, el build falla — ver detalle de los umbrales en la sección Tests.

## Tests

### Server — unitarios

Cobertura actual (`npm run test:cov`): ~52% de statements (~51% líneas, ~51% branches, ~34% funciones), excluyendo del cálculo el cliente Prisma generado, los `*.module.ts` (wiring de Nest sin lógica) y `main.ts`. Módulos con cobertura real: detección de anomalías, parser de voz local, matching difuso de artículos y su detección de ambigüedad (a nivel de servicio, mockeando el repositorio), guards de auth/roles/API-key, `JwtStrategy`, `HealthController`, `AlmacenService`, `ReporteService` (incluyendo el escape de CSV), `InventarioService.cambiarEstado` y el motivo de `itemsNoMatcheados` por ambigüedad, `AiEngineService` (reintentos/backoff de Gemini, incluyendo el manejo de 429 con y sin `Retry-After`), filtro global de excepciones, y los controllers principales de inventario/auth verificando específicamente que `usuarioId` se derive del JWT y nunca del body.

**Umbral fijado en CI** (`jest.coverageThreshold` en `server/package.json`, aplicado con `npm run test:cov`): 43% statements / 41% branches / 25% funciones / 42% líneas — un poco por debajo de lo ya logrado, a propósito: deja margen para fluctuaciones normales, pero una regresión real (borrar tests, agregar código sin probar) rompe el build. Deliberadamente no es 100%: perseguir cobertura total en getters/DTOs/wiring de Nest no protege nada real, solo infla el número: mejor un umbral más bajo pero exigido de verdad, sobre la lógica que sí importa.

### Server — e2e (`server/test/*.e2e-spec.ts`)

10 specs, corren contra Postgres real (no mocks) vía `Test.createTestingModule` + `supertest`, cubriendo lo que los unitarios no pueden probar de verdad:

- `auth.e2e-spec.ts` — login real, smoke test del harness.
- `articulo-matching.e2e-spec.ts` — `findBestMatches` (trigramas `pg_trgm` + `f_unaccent`, imposible de mockear con sentido) y la detección de ambigüedad de `ArticuloService` entre variantes de color.
- `procesar-voz-ambiguedad.e2e-spec.ts` — un dictado ambiguo (dos artículos casi empatados) no registra ningún conteo silencioso: cae en `itemsNoMatcheados` con el motivo listando los candidatos.
- `procesar-voz-miles.e2e-spec.ts` — "15.000kg de papa criolla" (con y sin espacio) registra 15.000 kg de verdad, no 15 — regresión de un bug real de la convención colombiana de separador de miles.
- `inventario-concurrency.e2e-spec.ts` — 20 dictados HTTP concurrentes del mismo artículo, verifica que el `increment` atómico no pierde ninguno (lost update).
- `anomalia-blocking.e2e-spec.ts` — el flujo de negocio central: anomalía sin resolver bloquea `CONCILIADO`, resolverla lo desbloquea.
- `roles-authorization.e2e-spec.ts` — OPERARIO recibe 403 en cierre/auditoría; AUDITOR/ADMIN pueden.
- `reporte-variacion.e2e-spec.ts` — agregación SQL cruda de variación contra datos sembrados con valores conocidos.
- `integration-webhook.e2e-spec.ts` — `ApiKeyGuard` de los webhooks ERP, con y sin key válida.
- `procesar-sku.e2e-spec.ts` — resolución exacta por SKU (escáner de código de barras).

**Setup local:** requiere una base `invencheck_test` en el mismo Postgres de `docker compose` (`CREATE DATABASE invencheck_test;`) y un `server/.env.test` (gitignored) con `DATABASE_URL` apuntando a esa base más `JWT_SECRET`/`ERP_WEBHOOK_API_KEY` fijos de prueba — `GEMINI_API_KEY` se deja vacío a propósito para forzar el parser de voz local. `npm run test:e2e` aplica las migraciones automáticamente (`pretest:e2e`) antes de correr. En CI no hace falta `.env.test`: las mismas variables se inyectan como env del job contra el Postgres de `services`.

Sin cubrir todavía: la llamada saliente real de `IntegrationErpService.enviarInventarioAERP` al ERP (transición a `ENVIADO_ERP`), y el flujo completo de auditoría ciega más allá de la autorización por rol (`compararAuditoria`).

### Client

Vitest + Testing Library, 21 tests en 4 archivos:

- `lib/auth-storage.test.ts` — sesión en `localStorage`, incluyendo JSON corrupto.
- `lib/api.test.ts` — el wrapper `request<T>`: header `Authorization`, `ApiError` en fallo de red (status 0) vs. respuesta no-2xx, el guard que evita redirigir a `/login` cuando el 401 viene del propio login, y la construcción de query string de `getReporteVariacion`.
- `hooks/use-offline-sync.test.ts` — reintento automático de pendientes con `intentos === 0`, no-reintento de los que ya fallaron salvo `incluirFallidos`, y sync inmediato al recuperar conexión.
- `components/anomalia-modal.test.tsx` — primer test de componente: `navigator.vibrate` (con guard porque jsdom no la implementa), texto condicional de promedio histórico, callbacks de confirmar/re-dictar.

**Umbral fijado en CI** (`test.coverage` en `client/vitest.config.ts`, aplicado con `npm run test:cov`): 73% statements / 60% branches / 52% funciones / 78% líneas, pero **acotado a los 4 archivos de arriba** (`coverage.include`), no a todo `client/src/`. Incluir el resto del código (páginas, componentes, hooks sin test) hoy solo diluiría el número sin proteger nada — es más honesto un umbral alto sobre lo que sí se probó que uno bajo y vago sobre todo el proyecto. Ampliar `include` es el paso natural cada vez que se agregue un test nuevo.

Sin cubrir todavía: `inventario/[id]/page.tsx` (la pantalla compuesta de conteo) y el resto de componentes/hooks — se dejó fuera deliberadamente de esta ronda, pendiente de una capa de mocking de `fetch` más amplia (tipo MSW) antes de abordarla.

## Estructura del dominio

```
Usuario (OPERARIO | AUDITOR | ADMIN)
Almacen (bodega o punto de consumo)
Articulo (catálogo maestro, sku opcional, aliases para matching por voz)
Inventario (toma física de un almacén en una fecha de corte)
  -> ItemInventario (línea: teórico del ERP vs. conteo físico)
  -> AlertaInventario (anomalía detectada, bloquea consolidación hasta resolverse)
  -> auditoriaCiega (segunda toma independiente del mismo almacén, para comparar)
```

`Inventario.usuarioId`/`auditorId` son strings planos, deliberadamente sin foreign key hacia `Usuario`: son un registro histórico de quién hizo cada toma (como un log de auditoría) que debe sobrevivir aunque la cuenta se elimine después. La identidad se verifica en cada petición vía el JWT, no por integridad referencial en la base de datos.

## Limitaciones conocidas y próximos pasos

En orden aproximado de impacto:

1. Sin Dockerfile para `server`/`client` — no hay forma de construir una imagen desplegable todavía, solo de correr en local.
2. `npm audit` — desglosado por paquete, ninguno tiene un fix trivial disponible hoy:
   - `exceljs` (`^4.4.0`, dependency de producción): marcado alto vía `archiver`/`uuid` transitivos, pero el rango marcado es `>=3.5.0` — no existe ninguna versión ≥3.5.0 sin el hallazgo; la única "fix" que ofrece `npm audit fix --force` es bajar a 3.4.0 (breaking, más vieja, sin garantía de estar mejor). `server/src/scripts/import-excel.ts` solo lee archivos (`readFile`/`getWorksheet`/`eachRow`/`getCell().value`), nunca escribe — la ruta de `archiver` (creación de zip), que es donde vive la vulnerabilidad, nunca se ejecuta en este código. Riesgo real: prácticamente nulo, sin fix limpio disponible upstream todavía.
   - `prisma` (CLI, devDependency, `^7.9.0`): el hallazgo (`@prisma/dev`→`find-my-way`) es del comando `prisma dev` (levanta un servidor local), que este proyecto nunca ejecuta (solo `migrate dev`/`db seed`/`generate` vía npm scripts), y el CLI no se despliega junto al server. `@prisma/client`/`@prisma/adapter-pg`, los paquetes que sí corren en producción, no tienen hallazgos.
   - `eslint`/`jest`/`ts-jest`/`@nestjs/cli` (devDependencies): las "fix" que sugiere `npm audit` son downgrades mayores (p. ej. jest→19.0.2, eslint→10.8.0) que romperían todo el toolchain de build/test para resolver hallazgos sin superficie de ataque real — nada de input no confiable llega a herramientas de desarrollo.
   - `next`/`postcss` (client): severidad alta, confirmado, solo se arregla con una migración mayor de Next 14 a 16 — se deja deliberadamente fuera de alcance como un esfuerzo aparte, no algo para meter de paso.
3. Sin observabilidad: logs solo van a stdout, sin agregador ni APM. Un incidente en producción hoy solo se diagnostica con acceso directo al proceso.
4. Rate limiting en memoria del proceso: válido para una sola instancia; escalar horizontalmente requeriría un storage compartido (Redis) para el throttler — deliberadamente no implementado todavía, prematuro para un prototipo de una sola instancia.
5. Tests e2e (server) y de cliente ya existen pero con alcance acotado: falta cubrir la llamada saliente real al ERP y la comparación de auditoría ciega en server; en client falta la pantalla principal de conteo (`inventario/[id]/page.tsx`) y el resto de componentes/hooks — ver sección Tests para el detalle exacto de qué queda fuera.
6. ~~Matching de voz contra el catálogo real: 8.3% de ambigüedad silenciosa.~~ **Resuelto.** Una auditoría real (`npm run audit:voice-matching` en `server`, contra los 938 artículos del catálogo, no fixtures sintéticos) encontró que el 8.3% (78/938) resolvía en silencio a OTRO artículo del catálogo, con score de confianza alto — la app no tenía ninguna señal para distinguir un match correcto de uno incorrecto igual de "seguro". Se corrigió con 3 cambios: (a) `ArticuloService.normalizarEntradaHablada` ahora pide el top-3 (no solo el top-1) y, si el runner-up queda a menos de `AMBIGUEDAD_GAP` (0.3) de distancia, no auto-confirma ninguno — el ítem cae en `itemsNoMatcheados` con un `motivo` que nombra los candidatos, en vez de adivinar; (b) `normalizeSpokenText` dejó de descartar números que en realidad identifican al producto (talla, calibre, mililitros); (c) `buildAliases` ahora también genera categoría+último calificador (`"cebolla roja"`, no solo `"cebolla cabezona"`), para que la variante corta más natural de decir ya distinga color/tamaño. Resultado tras el fix: **0/938 matches incorrectos silenciosos** (antes 78); 175/938 (18.7%) ahora piden precisión al operario en vez de auto-confirmar — el trade-off elegido a propósito, con datos, en favor de nunca fallar en silencio. Detalle completo en `server/README.md`.

## Licencia

Proyecto desarrollado para el reto Colsubsidio 30X. Sin licencia de código abierto publicada — uso restringido al alcance del reto salvo indicación contraria de Colsubsidio.
