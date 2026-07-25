# InvenCheck

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
| CI (lint + typecheck + test + build en cada push/PR) | Implementado |
| Tests unitarios | Parcial — 34% de cobertura de statements en `server`, 0% en `client` |
| Tests de integración/e2e | No existen |
| Contenerización (Dockerfile de `server`/`client`) | No existe — solo hay `docker-compose.yml` para Postgres local |
| Dependencias con vulnerabilidades conocidas | Sí — ver `npm audit` en `server` y `client` |
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
npm run test:cov             # con reporte de cobertura
npm run test:e2e             # configurado, pero sin specs *.e2e-spec.ts todavía
npm run build                # nest build
```

**Client:**

```bash
npm run lint     # next lint
npx tsc --noEmit  # typecheck
npm run build     # next build
```

**Shared:** `npm run build` (tsc).

## CI

`.github/workflows/ci.yml` corre en cada push a `main` y en cada pull request: instala las 3 workspaces, build de `shared`, luego lint + typecheck + test + build de `server`, luego lint + typecheck + build de `client`. No requiere Postgres ni variables de entorno — los tests actuales son unitarios puros, sin dependencia de base de datos real.

## Tests

Cobertura actual en `server` (`npm run test:cov`): ~34% de statements. Módulos con cobertura real: detección de anomalías, parser de voz local, matching difuso de artículos (a nivel de servicio, mockeando el repositorio), guards de auth/roles, filtro global de excepciones, y los controllers principales de inventario/auth verificando específicamente que `usuarioId` se derive del JWT y nunca del body.

Sin cobertura todavía: las queries SQL crudas en sí (`articulo.repository.findBestMatches`, agregaciones de `reporte.repository`) — probarlas de verdad requiere Postgres con las extensiones `pg_trgm`/`unaccent` en CI, no mocks; `inventario.repository` (incluyendo la ruta atómica de `increment`); `integration-erp.service`; el módulo `reportes` de punta a punta. `client` no tiene tests.

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
2. `npm audit`: vulnerabilidades en dependencias transitivas (`exceljs`/`archiver` en server, Next.js/PostCSS en client). Ninguna es explotable directamente en el flujo actual de la app, pero deben resolverse antes de cualquier despliegue real.
3. Sin tests de integración contra Postgres real (fuzzy matching, agregaciones de reportes, race conditions).
4. Sin observabilidad: logs solo van a stdout, sin agregador ni APM. Un incidente en producción hoy solo se diagnostica con acceso directo al proceso.
5. Rate limiting en memoria del proceso: válido para una sola instancia; escalar horizontalmente requeriría un storage compartido (Redis) para el throttler.
6. Cliente sin tests automatizados de ningún tipo.

## Licencia

Proyecto desarrollado para el reto Colsubsidio 30X. Sin licencia de código abierto publicada — uso restringido al alcance del reto salvo indicación contraria de Colsubsidio.
