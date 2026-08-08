# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

InvenCheck — a PWA for hotel storage and food service operations that replaces manual paper-based physical inventory counts with voice-dictated counts. Operators dictate what they counted ("quince kilos de papa criolla"), it's matched against the real product catalog in real time, and anomalies (implausible quantities, ambiguous units) block consolidation until confirmed or corrected. See `client/src/app/inventario/[id]/page.tsx` for the core screen.

Monorepo: npm workspaces — `server` (NestJS + Prisma/Postgres), `client` (Next.js 14 App Router PWA), `shared` (types/enums consumed by both).

## Commands

Run from the relevant package directory unless noted.

**Local setup (first time / after a pull):**
```bash
cd server && npm run db:up              # docker compose up -d — Postgres must be running first
cd server && npm run prisma:migrate     # apply migrations
cd server && npm run prisma:seed        # WIPES articulos/almacenes/inventarios, creates 5 test articles + 3 demo users
cd server && npm run prisma:import-excel  # re-imports the real 936-article/48-warehouse catalog from data/BODEGAS Y STOCK.xlsx
```
`prisma:seed` and `prisma:import-excel` must run in that order — seed always resets `articulos`/`almacenes` to a handful of test fixtures, so the real catalog has to be re-imported after every seed.

**Dev servers** (two, fixed ports, run both):
```bash
npm run dev:server   # from root, or `npm run start:dev` in server/ — NestJS on :3000, prefix /api
npm run dev:client   # from root, or `npm run dev` in client/ — Next.js on :3001
```
Docker Desktop must be running (`docker compose up -d` in `server/`) before the server will connect to Postgres. `server/main.ts` fails fast at boot if `JWT_SECRET` or `ERP_WEBHOOK_API_KEY` aren't set (see `server/.env.example`).

**Build/lint/test** — server:
```bash
npm run lint          # eslint --fix
npx tsc --noEmit       # typecheck
npm test               # jest unit tests
npx jest <name>.spec.ts  # single test file
npm run test:e2e
npm run build          # nest build
```
Client:
```bash
npm run lint
npx tsc --noEmit
npm run build           # next build
```
Shared: `npm run build` (tsc).

**Gotcha:** running `next build` (client) or `nest build` (server) while the corresponding dev server is running against the same `.next`/`dist` output corrupts it and the dev server starts 500ing. After a production build, `rm -rf .next` and restart the client dev server.

**Demo login users** (from seed, password hashed with bcrypt): `operario@invencheck.demo` / `operario123` (OPERARIO), `auditor@invencheck.demo` / `auditor123` (AUDITOR), `admin@invencheck.demo` / `admin123` (ADMIN).

## Architecture

### Server: Controller → Service → Repository, per module

Every module in `server/src/modules/` (`almacenes`, `articulos`, `ai-engine`, `inventarios`, `reportes`, `integration`, `auth`) follows the same layering: thin controllers, business logic in services, all Prisma access behind a repository. Repositories return Prisma-derived types via `satisfies Prisma.XInclude` + `Prisma.XGetPayload<{...}>` (see `inventario.repository.ts`) rather than hand-declared interfaces, so the type can't drift from the actual query shape.

Raw SQL (`$queryRaw`) is used only where Prisma's query builder can't express it: pg_trgm/unaccent fuzzy matching in `articulo.repository.ts` (`findBestMatches`, used to match dictated product names against the catalog) and the aggregated variación report in `reporte.repository.ts`. Both always go through `Prisma.sql` tagged templates — never string concatenation.

### Auth: global JWT guard, identity never trusted from the client

`JwtAuthGuard` is registered as `APP_GUARD` in `app.module.ts` — every endpoint requires a valid Bearer token by default. Routes that must bypass it use `@Public()` (login, and the two ERP webhook endpoints). `usuarioId`/`auditorId` on `Inventario` are always derived server-side from `@CurrentUser()` (the JWT payload), never accepted in a request DTO — don't reintroduce a client-supplied `usuarioId` field, that was a deliberately fixed impersonation hole.

The ERP webhooks (`POST /integration/webhook/sync-articulo`, `sync-almacen`) use a separate `ApiKeyGuard` (header `X-Api-Key`, env `ERP_WEBHOOK_API_KEY`) instead of JWT, since they're called by an external system rather than a logged-in operario. `POST /integration/mock-erp/receive-inventario` is fully `@Public()` — it simulates the external ERP's own endpoint for the demo integration flow, so it isn't part of this app's trust boundary.

`Inventario.usuarioId`/`auditorId` are plain strings, deliberately **not** a foreign key to `Usuario` — they're a historical record of who did each count (like an audit log) that should survive account deletion; identity is verified per-request via the JWT, not via DB referential integrity.

### Module boundary: `InventarioRepositoryModule`

`server/src/modules/inventarios/inventario-repository.module.ts` exists only so `IntegrationModule` can depend on `InventarioRepository` without importing all of `InventariosModule`. This avoids recreating a circular dependency (`InventariosModule` ↔ `IntegrationModule`) that used to be "solved" with `forwardRef()` and a `ModuleRef.get()` service-locator call inside `InventarioService`. If `IntegrationErpService` ever needs something beyond the repository from `InventariosModule`, reconsider the module boundary rather than reaching for `forwardRef()` again.

### Anomaly detection is the core business logic

`AnomaliasService.evaluarConteo` (`server/src/modules/inventarios/services/anomalias.service.ts`) evaluates three rules per counted line, in order:
1. **Unit conversion/ambiguity** — if the dictated unit differs from the article's catalog unit and no factor is known (`unit-conversion.util.ts`), raises `UNIDAD_AMBIGUA` and does not convert.
2. **Inherited negative stock** — `teorico < 0` raises `STOCK_NEGATIVO`.
3. **Historical deviation** — variación vs. `Articulo.stockHistoricoAvg` outside `[ANOMALIA_VARIACION_MIN, ANOMALIA_VARIACION_MAX]` (currently -80%/+200%, named exported constants) raises `ANOMALIA_CANTIDAD`.

Any unresolved alerta blocks `InventarioService.cambiarEstado` from transitioning to `CONCILIADO`/`ENVIADO_ERP` (checked via `contarAlertasActivas`) — this is enforced server-side. The client's `AnomaliaModal` is only the UX layer on top; don't assume disabling a button client-side is the actual guard when reasoning about whether a flow is safe.

### AI dictation cascade

`AiEngineService.procesarDictadoVoz` (`server/src/modules/ai-engine/`): Gemini (if `GEMINI_API_KEY` set) → local Spanish parser (`voice-parser.util.ts`, regex + number-word table, zero external calls, always available). The local parser is the offline/no-API-key fallback and is what the demo runs on by default — it's a real fallback, not a stub, and has its own test suite (`voice-parser.util.spec.ts`).

### `shared` package — enums only, not the DTO source of truth

`shared/src/enums/` (`EstadoInventario`, `TipoAlerta`, `UnidadMedida`) are imported by both `server` and `client` and are the one place these must stay in sync. The client does **not** import types from `shared` beyond those enums — `client/src/lib/types.ts` hand-declares its own parallel interfaces mirroring the server's response shapes. Keep that in mind when changing a server response shape: the client type has to be updated by hand, the compiler won't catch drift across the two.

### Client structure

Next.js App Router, all client components (`"use client"`), no server components/actions — everything talks to the NestJS API through `client/src/lib/api.ts` (a single typed `request<T>` wrapper + an `api` object of endpoint functions). `client/src/components/auth-provider.tsx` holds the JWT session in `localStorage`, attaches it to every request, and redirects to `/login` on missing/expired session — session state doesn't live in the URL or server, so any new protected page needs nothing extra as long as it's rendered under the root layout's `<AuthProvider>`.

Offline support: dictations made while offline are queued in IndexedDB (`use-offline-sync.ts` hook) and replayed when connectivity returns — this is why `procesarVoz` failures are branched on `err.status === 0` (network failure) vs. other API errors in `inventario/[id]/page.tsx`.
