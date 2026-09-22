# InvenCheck

Voice-driven physical inventory count PWA for warehouses and hotel storerooms. Replaces manual paper counting: the operator dictates what they're counting ("fifteen kilos of yellow potato"), the system matches it against the real catalog in real time, and anomalies (implausible quantities, ambiguous units) block consolidation until someone confirms or corrects them.

Built as a prototype for physical inventory control and counting in hospitality. Scope includes voice capture, catalog matching, anomaly detection, and physical-vs-historical variance reports. Recipe/order/production functionality was evaluated and deliberately removed to simplify scope — see the git log for the history of that decision.

## Project status

This project is in functional-demo-prototype status, not production-deployment status. The table below honestly summarizes which production controls exist and which don't, so that anyone picking it up knows exactly where things stand.

| Area | Status |
| --- | --- |
| Authentication (JWT, global guard) | Implemented |
| Role-based authorization (segregation of duties in closing/audit) | Implemented |
| Rate limiting (login and global) | Implemented |
| Centralized error handling | Implemented |
| Health check | Implemented |
| CI (lint + typecheck + unit tests + e2e + build, server and client, on every push/PR) | Implemented |
| Unit tests | Partial, with a coverage threshold enforced in CI (build fails if it drops) — server: ~57% statements; client: ~80% statements but the threshold only requires 6 of the 12 files that already have tests (auth-storage, api, voice-sanitize, use-offline-sync, use-speech-recognition, AnomaliaModal) — see the Tests section |
| Integration/e2e tests | Implemented — 15 specs against a real Postgres (auth, fuzzy matching, matching ambiguity, thousands-separator numbers, counting concurrency, alert deduplication and auto-resolution, concurrent race on the same alert, manual selection of an ambiguous candidate, unit mixing, anomaly blocking, role authorization, variance report, ERP webhooks) |
| Containerization (server/client Dockerfile) | Doesn't exist — there's only a docker-compose.yml for local Postgres |
| Dependencies with known vulnerabilities | exceljs (server, prod): no clean fix upstream — see limitation #2. prisma CLI (server, dev-only): the finding is from an older version than the one already installed and from a command (`prisma dev`) this project doesn't use. next/postcss (client): pending, requires a major migration — see limitation #2 |
| Observability (structured logging, APM, metrics) | Doesn't exist — only Nest's Logger to stdout |
| Secrets management | Plain environment variables (.env), no vault |

## Architecture

Monorepo with npm workspaces:

- `server/` NestJS + Prisma + PostgreSQL — REST API under `/api`
- `client/` Next.js 14 (App Router) — PWA, everything `"use client"`
- `shared/` TypeScript enums shared between server and client

### Server

Every module in `server/src/modules/` (almacenes, articulos, ai-engine, inventarios, reportes, integration, auth, health) follows the same layering: Controller → Service → Repository. Repositories return types derived from Prisma via `satisfies Prisma.XInclude + Prisma.XGetPayload<{...}>` instead of hand-declared interfaces, so the type can never drift from the actual query.

Raw SQL (`$queryRaw`) is used only where Prisma's query builder isn't enough: trigram fuzzy matching (`pg_trgm` + `unaccent`) in `articulo.repository.ts`, and the aggregated variance report in `reporte.repository.ts`. Always through `Prisma.sql` with typed parameters, never string concatenation.

**Authentication and authorization.** `JwtAuthGuard` is registered globally (`APP_GUARD`); every route requires a valid JWT unless marked `@Public()`. `RolesGuard`, also global, applies `@Roles(...)` wherever declared — today it restricts inventory consolidation (`PATCH /inventarios/:id/estado`) and creating blind audits (`POST /inventarios/:id/auditoria-ciega`) to the `AUDITOR` and `ADMIN` roles: whoever counted can't self-approve (classic segregation of duties in inventory processes). `usuarioId`/`auditorId` are always derived from the JWT via `@CurrentUser()`, never accepted from the request body.

ERP integration webhooks (`POST /integration/webhook/sync-articulo`, `sync-almacen`) use a separate `ApiKeyGuard` (`X-Api-Key` header) instead of JWT, because they're called by an external system, not a logged-in user. `POST /integration/mock-erp/receive-inventario` is public: it simulates the external ERP's endpoint for the demo flow and isn't part of this application's trust perimeter.

**Anomaly detection.** `AnomaliasService.evaluarConteo` evaluates, in order, three rules per counted line:

1. Unit ambiguity: if the dictated unit differs from the item's catalog unit and there's no known conversion factor, it fires `UNIDAD_AMBIGUA` and doesn't convert.
2. Inherited negative stock: `teorico < 0` fires `STOCK_NEGATIVO`.
3. Historical deviation: variance against that specific warehouse's historical average (falling back to the item's global average if the warehouse has no history of its own) outside `[-80%, +200%]` fires `ANOMALIA_CANTIDAD`.

Any unresolved alert blocks the transition to `CONCILIADO`/`ENVIADO_ERP`, verified server-side — the confirmation modal on the client is only a UX layer, not the real control.

**Concurrency.** Count accumulation uses Prisma's atomic `{ increment: delta }` operator instead of a read-add-write in application code, so that two near-simultaneous dictations of the same item don't overwrite each other (lost update). Unit conversion happens before the increment, never after, to avoid mixing different magnitudes in the sum. Every other write of a counted line (increment, anomaly evaluation, alert creation/resolution) runs inside a single Prisma transaction (`InventarioRepository.ejecutarEnTransaccion`) — previously these were several loose sequential writes, with a real window to end up half-applied if one failed partway through. Deduplication of active alerts (`crearAlertas`) no longer depends on a check-then-act in application code (read active → filter → insert, vulnerable to a real race under genuinely simultaneous dictations): a partial unique Postgres index on `(itemInventarioId, tipo)` — active only while the alert remains unresolved — guarantees it at the database level, combined with `skipDuplicates: true` in the `createMany`.

**Manual selection of an ambiguous candidate** (`POST /inventarios/:id/procesar-articulo`). When two catalog items are similar enough that no voice-dictated phrase can distinguish between them without reproducing the same ambiguity (the real case: "PAPA CRIOLLA" is an exact prefix of "PAPA CRIOLLA PRECOCIDA"), the client offers picking directly by `articuloId` instead of forcing an impossible re-dictation loop. The disambiguation-suggestion text (`describirMotivoNoMatch`/`sugerenciaDesambiguacion`) lives in `articulo-text.util.ts`, alongside the rest of the voice-matching text utilities, not in `InventarioService` — it's item-name interpretation logic, not inventory orchestration.

**Voice dictation cascade.** `AiEngineService.procesarDictadoVoz`: Gemini (if `GEMINI_API_KEY` is configured) with retries and exponential backoff on transient errors (429/5xx) → local Spanish-language parser (`voice-parser.util.ts`, regex + a number table, no external calls). The local parser isn't a stub: it's the real fallback the demo runs on by default, with its own test suite.

### Client

Next.js 14 App Router, every component `"use client"` — no server components or server actions, everything talks to the API through a typed `request<T>` wrapper in `client/src/lib/api.ts`. `auth-provider.tsx` keeps the JWT session in `localStorage` and redirects to `/login` on a missing or expired session.

App Router routes (`page.tsx`) only declare Next's reserved exports (`default`, `dynamic`, etc.) — for that reason the counting screen (`app/inventario/[id]/`) separates the actual component (`inventario-page-content.tsx`, with all the state and handlers) from a `page.tsx` that only wraps it in `ClientProviders`, so it can be imported and tested directly with Testing Library.

Offline support: dictations made without a connection are queued in IndexedDB (`use-offline-sync.ts`) and retried once signal is recovered.

`shared/src/enums/` (`EstadoInventario`, `TipoAlerta`, `UnidadMedida`) is the only type-sync point between server and client. The client doesn't import the rest of the server's types: `client/src/lib/types.ts` hand-declares its own interfaces mirroring the server's responses. Any change to a response shape on the server has to be reflected there manually — the compiler doesn't catch that drift between packages.

## Requirements

- Node.js 24.x (tested with v24.18.0); there's no `.nvmrc` in the repo yet
- npm 10+ (tested with 11.16.0)
- Docker Desktop (for local Postgres via docker compose)

## Getting started

```
git clone https://github.com/andres11152/invencheck.git
cd invencheck
npm install # installs all 3 workspaces at once

cp server/.env.example server/.env # fill in JWT_SECRET and ERP_WEBHOOK_API_KEY
cp client/.env.example client/.env # NEXT_PUBLIC_API_URL's default already works for local

cd server
npm run db:up # docker compose up -d — Postgres must be up before the next step
npm run prisma:migrate # applies migrations
npm run prisma:seed # WIPES articulos/almacenes/inventarios, creates 5 items + 3 demo users
npm run prisma:import-excel # re-imports the real catalog (936 items, 48 warehouses) from data/BODEGAS Y STOCK.xlsx
```

`prisma:seed` and `prisma:import-excel` must run in that order: the seed always resets `articulos`/`almacenes` to a handful of test fixtures, so the real catalog has to be re-imported after every seed.

### Required environment variables (server)

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Required — the process fails to start without it. Generate with `openssl rand -hex 32`, never reuse the example value |
| `ERP_WEBHOOK_API_KEY` | Required — the process fails to start without it. Authenticates the external ERP's webhooks |
| `GEMINI_API_KEY` | Optional. Without it, voice dictation uses the local Spanish-language parser |
| `JWT_EXPIRES_IN_SECONDS` | Optional, default 43200 (12h) |
| `CORS_ORIGIN` | Optional, default http://localhost:3001 |

## Development

Two servers, fixed ports, run both:

```
npm run dev:server # from the root, or `npm run start:dev` in server/ — NestJS on :3000, prefix /api
npm run dev:client # from the root, or `npm run dev` in client/ — Next.js on :3001
```

Docker Desktop must be running (`docker compose up -d` in `server/`) before starting the server.

**Known gotcha:** running `next build` (client) or `nest build` (server) while the corresponding dev server is still alive against the same `.next`/`dist` output corrupts that output and the dev server starts responding 500. After a production build: `rm -rf .next` (or `dist/`) and restart the dev server.

### Demo users (created by the seed)

| Email | Password | Role |
| --- | --- | --- |
| operario@invencheck.demo | operario123 | OPERARIO |
| auditor@invencheck.demo | auditor123 | AUDITOR |
| admin@invencheck.demo | admin123 | ADMIN |

`OPERARIO` can count and dictate, but can't consolidate an inventory, send it to the ERP, or start a blind audit — those actions require `AUDITOR` or `ADMIN`.

## Commands

Run from the corresponding package directory unless noted otherwise.

**Server:**

```
npm run lint              # eslint --fix
npx tsc --noEmit          # typecheck (no dedicated npm script, invoked directly)
npm test                  # jest, unit tests
npx jest <name>.spec.ts   # a single test file
npm run test:cov          # with coverage report + threshold (what CI runs)
npm run test:e2e          # 15 e2e specs against a real Postgres — see Tests section for .env.test setup
npm run build              # nest build
```

**Client:**

```
npm run lint       # next lint
npx tsc --noEmit   # typecheck
npm run test       # vitest run — unit/component
npm run test:watch # vitest in watch mode
npm run test:cov   # with coverage report + threshold (what CI runs)
npm run build       # next build
```

**Shared:** `npm run build` (tsc).

## CI

`.github/workflows/ci.yml` runs on every push to `master` and on every pull request: installs all 3 workspaces, builds `shared`, then lint + typecheck + unit tests (with a coverage threshold, `test:cov`) + build for the server, then the server's e2e tests against a Postgres container spun up as a job service, and finally lint + typecheck + tests (also with a threshold, `test:cov`) + build for the client. If either package's coverage falls below its threshold, the build fails — see threshold detail in the Tests section.

## Tests

### Server — unit tests

Current coverage (`npm run test:cov`): ~57% statements (~56% lines, ~54% branches, ~41% functions), excluding the generated Prisma client, `*.module.ts` files (Nest wiring with no logic) and `main.ts` from the calculation. Modules with real coverage: anomaly detection, the local voice parser, fuzzy item matching and its ambiguity detection (at the service level, mocking the repository), auth/roles/API-key guards, `JwtStrategy`, `HealthController`, `AlmacenService`, `ReporteService` (including CSV escaping), `InventarioService.cambiarEstado`, the transactionality of `procesarTomaPorVoz` (every write of a counted line goes through the same `Prisma.TransactionClient`, verified with a mocked sentinel marker), the reason behind `itemsNoMatcheados` due to ambiguity (`describirMotivoNoMatch` in `articulo-text.util.ts`, tested as a pure function, not just indirectly through the service), `AiEngineService` (Gemini retries/backoff, including 429 handling with and without `Retry-After`), the global exception filter, and the main inventory/auth controllers specifically verifying that `usuarioId` is derived from the JWT and never from the body.

Threshold set in CI (`jest.coverageThreshold` in `server/package.json`, applied with `npm run test:cov`): 43% statements / 41% branches / 25% functions / 42% lines — deliberately a bit below what's already achieved: it leaves room for normal fluctuation, but a real regression (deleting tests, adding untested code) breaks the build. Deliberately not 100%: chasing full coverage on getters/DTOs/Nest wiring doesn't protect anything real, it just inflates the number — a lower but genuinely enforced threshold, over the logic that actually matters, is better.

### Server — e2e (`server/test/*.e2e-spec.ts`)

15 specs, run against a real Postgres (no mocks) via `Test.createTestingModule` + supertest, covering what unit tests can't really test:

- `auth.e2e-spec.ts` — real login, harness smoke test.
- `articulo-matching.e2e-spec.ts` — `findBestMatches` (`pg_trgm` trigrams + `f_unaccent`, impossible to meaningfully mock) and `ArticuloService`'s ambiguity detection between color variants.
- `procesar-voz-ambiguedad.e2e-spec.ts` — an ambiguous dictation (two items nearly tied) doesn't silently register any count: it falls into `itemsNoMatcheados` with a reason listing the candidates.
- `procesar-voz-miles.e2e-spec.ts` — "15.000kg de papa criolla" (with and without a space) really registers 15,000 kg, not 15 — regression test for a real bug in the Colombian thousands-separator convention.
- `procesar-articulo.e2e-spec.ts` — direct manual selection of an ambiguous candidate by `articuloId`, breaking the re-dictation loop when one candidate is an exact prefix of another ("PAPA CRIOLLA" / "PAPA CRIOLLA PRECOCIDA"); also a 404 on a nonexistent `articuloId` and a 400 on a non-positive quantity.
- `unidad-ambigua-mezcla.e2e-spec.ts` — an ambiguous unit seeded on one scale (`UNIDAD`) followed by valid dictations on another (`KILOGRAMO`) doesn't mix magnitudes in the accumulated total.
- `alertas-deduplicacion.e2e-spec.ts` — dictating the same problem twice doesn't duplicate the alert; once resolved and reviewed by an auditor, if the problem reappears it does generate a new alert.
- `alertas-superadas.e2e-spec.ts` — an alert created while the accumulated count was still anomalous auto-resolves on re-evaluation once it stops being so; if it's still anomalous, it stays active.
- `alertas-carrera-concurrente.e2e-spec.ts` — 10 genuinely concurrent HTTP dictations (`Promise.all`, not sequential) of the same ambiguous item generate a single active alert, closing at the database level a race condition that a check-then-act in application code couldn't guarantee.
- `inventario-concurrency.e2e-spec.ts` — 20 concurrent HTTP dictations of the same item, verifies the atomic increment doesn't lose any of them (lost update).
- `anomalia-blocking.e2e-spec.ts` — the core business flow: an unresolved anomaly blocks `CONCILIADO`, resolving it unblocks it.
- `roles-authorization.e2e-spec.ts` — `OPERARIO` gets a 403 on closing/audit; `AUDITOR`/`ADMIN` can proceed.
- `reporte-variacion.e2e-spec.ts` — raw SQL variance aggregation against seeded data with known values.
- `integration-webhook.e2e-spec.ts` — the ERP webhooks' `ApiKeyGuard`, with and without a valid key.
- `procesar-sku.e2e-spec.ts` — exact resolution by SKU (barcode scanner).

Local setup: requires an `invencheck_test` database in the same docker-compose Postgres (`CREATE DATABASE invencheck_test;`) and a `server/.env.test` (gitignored) with `DATABASE_URL` pointing to that database plus fixed test `JWT_SECRET`/`ERP_WEBHOOK_API_KEY` — `GEMINI_API_KEY` is deliberately left empty to force the local voice parser. `npm run test:e2e` applies migrations automatically (`pretest:e2e`) before running. In CI, `.env.test` isn't needed: the same variables are injected as job env against the services' Postgres.

Not covered yet: `IntegrationErpService.enviarInventarioAERP`'s real outbound call to the ERP (the `ENVIADO_ERP` transition), and the full blind-audit flow beyond role authorization (`compararAuditoria`).

### Client

Vitest + Testing Library, 52 tests across 12 files:

- `lib/auth-storage.test.ts` — localStorage session, including corrupted JSON.
- `lib/api.test.ts` — the `request<T>` wrapper: `Authorization` header, `ApiError` on network failure (status 0) vs. a non-2xx response, the guard that avoids redirecting to `/login` when the 401 comes from the login endpoint itself, and `getReporteVariacion`'s query-string construction.
- `lib/voice-sanitize.test.ts` — `limpiarRepeticiones`, the helper that collapses repeated phrases that Android's speech recognition engine resends as duplicates.
- `hooks/use-offline-sync.test.ts` — automatic retry of pending items with `intentos === 0`, no retry of already-failed ones unless `incluirFallidos`, and immediate sync on reconnection.
- `hooks/use-speech-recognition.test.ts` — doesn't duplicate a final result re-sent by the Android engine, doesn't lose an interim result that finalizes while another later interim already exists, and doesn't cascade-duplicate when each "final" carries the full accumulated phrase instead of just the new word (all three are real bugs reported on Android devices).
- `components/anomalia-modal.test.tsx` — `navigator.vibrate` (with a guard because jsdom doesn't implement it), conditional historical-average text, confirm/re-dictate callbacks.
- `components/item-inventario-card.test.tsx` — the click to review an anomaly is derived from whether active alerts remain, not from the `esAnomalia` boolean (which can drift from the real alerts — see Architecture).
- `components/barcode-scanner-modal.test.tsx` — the camera stream connects to the freshly mounted `<video>`, not before; if `getUserMedia` fails, the video isn't shown and manual entry remains.
- `components/items-no-matcheados-card.test.tsx` — the persistent queue of dictated items with no match/ambiguous: retry, discard, and picking a candidate directly on screen.
- `components/alertas-revision-auditor.test.tsx` — only lists alerts confirmed by the operator and still unreviewed by an auditor; marking as reviewed calls the API and fires the callback.
- `components/acciones-cierre.test.tsx` — the role/state hierarchy of closing buttons: consolidate disabled with active alerts, hidden for `OPERARIO`, "Send to ERP" instead of "Consolidate" once `CONCILIADO`.
- `app/inventario/[id]/inventario-page-content.test.tsx` — the composite counting screen: manually selecting an ambiguous candidate disables voice/text dictation while that write is in flight (regression test for a real race condition — see Architecture), the same way voice dictation and SKU scanning already did.

Threshold set in CI (`test.coverage` in `client/vitest.config.ts`, applied with `npm run test:cov`): 73% statements / 60% branches / 52% functions / 78% lines, but scoped to 6 of the 12 files above (`coverage.include`: `auth-storage.ts`, `api.ts`, `voice-sanitize.ts`, `use-offline-sync.ts`, `use-speech-recognition.ts`, `anomalia-modal.tsx`), not all of `client/src/`. The other 6 (`ItemInventarioCard`, `BarcodeScannerModal`, `ItemsNoMatcheadosCard`, `AlertasRevisionAuditor`, `AccionesCierre`, the counting screen) already have real tests but don't yet count toward the enforced CI threshold. A high threshold over what's already in `include` is more honest than a low, vague one over the whole project — expanding `include` is the natural next step every time a newly tested file stabilizes.

Not covered yet: the rest of the components without dedicated tests (`voice-capture.tsx`, `inventario-header.tsx`, `auditoria-ciega-card.tsx`, `cola-offline-indicator.tsx`, `account-menu.tsx`, `almacen-card.tsx`, `alerta-badge.tsx`), `offline-queue.ts` (IndexedDB), `export-erp.ts`, and the pages outside `/inventario/[id]` (`/`, `/login`, `/reportes`, `/beneficios`) — pending a broader fetch/IndexedDB mocking layer (something like MSW) before tackling them systematically.

## Domain structure

```
Usuario (OPERARIO | AUDITOR | ADMIN)
Almacen (warehouse or point of consumption)
Articulo (master catalog, optional sku, aliases for voice matching)
Inventario (physical count of a warehouse as of a cutoff date)
  -> ItemInventario (line: ERP theoretical vs. physical count)
  -> AlertaInventario (detected anomaly, blocks consolidation until resolved)
  -> auditoriaCiega (second independent count of the same warehouse, for comparison)
```

`Inventario.usuarioId`/`auditorId` are plain strings, deliberately without a foreign key to `Usuario`: they're a historical record of who performed each count (like an audit log) that must survive even if the account is later deleted. Identity is verified on every request via the JWT, not through referential integrity in the database.

## Known limitations and next steps

In roughly descending order of impact:

- **No Dockerfile for server/client** — there's no way to build a deployable image yet, only to run locally.

- **npm audit** — broken down by package, none has a trivial fix available today:
  - `exceljs` (^4.4.0, production dependency): flagged high via transitive `archiver`/`uuid`, but the flagged range is `>=3.5.0` — there's no version ≥3.5.0 without the finding; the only "fix" `npm audit fix --force` offers is downgrading to 3.4.0 (breaking, older, no guarantee it's actually better). `server/src/scripts/import-excel.ts` only reads files (`readFile`/`getWorksheet`/`eachRow`/`getCell().value`), never writes — the `archiver` code path (zip creation), which is where the vulnerability lives, never runs in this code. Real risk: essentially nil, no clean upstream fix available yet.
  - `prisma` (CLI, devDependency, ^7.9.0): the finding (`@prisma/dev`→`find-my-way`) is in the `prisma dev` command (spins up a local server), which this project never runs (only `migrate dev`/`db seed`/`generate` via npm scripts), and the CLI isn't deployed alongside the server. `@prisma/client`/`@prisma/adapter-pg`, the packages that actually run in production, have no findings.
  - `eslint`/`jest`/`ts-jest`/`@nestjs/cli` (devDependencies): the "fixes" `npm audit` suggests are major downgrades (e.g. `jest`→19.0.2, `eslint`→10.8.0) that would break the entire build/test toolchain to resolve findings with no real attack surface — no untrusted input reaches development tools.
  - `next`/`postcss` (client): high severity, confirmed, only fixable with a major migration from Next 14 to 16 — deliberately left out of scope as a separate effort, not something to squeeze in along the way.

- **No observability**: logs only go to stdout, no aggregator or APM. A production incident today can only be diagnosed with direct access to the process.

- **In-process-memory rate limiting**: valid for a single instance; scaling horizontally would require shared storage (Redis) for the throttler — deliberately not implemented yet, premature for a single-instance prototype.

- **e2e (server) and client tests already exist but with a bounded scope**: still missing coverage of the real outbound ERP call and the blind-audit comparison beyond role authorization on the server; on the client, the main counting screen already has a test (`inventario-page-content.test.tsx`) but several secondary components and the pages outside `/inventario/[id]` don't yet — see the Tests section for the exact detail of what's left out.

- **Voice matching against the real catalog: 8.3% silent ambiguity. Resolved.** A real audit (`npm run audit:voice-matching` in `server`, against the real 938-item catalog, not synthetic fixtures) found that 8.3% (78/938) silently resolved to a *different* catalog item, with a high confidence score — the app had no signal to distinguish a correct match from an equally "confident" incorrect one. Fixed with 3 changes: (a) `ArticuloService.normalizarEntradaHablada` now requests the top-3 (not just the top-1) and, if the runner-up is within `AMBIGUEDAD_GAP` (0.3) of the top match, it doesn't auto-confirm either — the item falls into `itemsNoMatcheados` with a reason naming the candidates, instead of guessing; (b) `normalizeSpokenText` stopped discarding numbers that actually identify the product (size, gauge, milliliters); (c) `buildAliases` now also generates category+last qualifier ("red onion", not just "yellow onion"), so the more natural short way of saying it already distinguishes color/size. Result after the fix: 0/938 silent incorrect matches (was 78); 175/938 (18.7%) now ask the operator for precision instead of auto-confirming — a trade-off chosen deliberately, with data, in favor of never failing silently. Full detail in `server/README.md`.

- **Segregation of duties: an OPERARIO could self-resolve their own anomaly. Resolved.** A business-logic audit from the operator/auditor perspective found that `PATCH /inventarios/:id/alertas/:alertaId/resolver` had no `@Roles()` (unlike its neighbors `cambiarEstado`/`crearAuditoriaCiega`) — confirmed empirically against the real server: with the token of the very `OPERARIO` who caused a 931% `ANOMALIA_CANTIDAD`, that same user was able to resolve it (200 OK), with no independent review at all. In practice this nullified the central principle that "every anomaly blocks until someone reviews it" (see the "Anomaly detection" section in `CLAUDE.md`). Fixed by separating two concepts that used to share a single field (`resuelto`): the operator's self-check (confirms on the spot that it wasn't a dictation error — still unrestricted by role, UX unchanged) and the real audit review (`AlertaInventario.revisadoPorAuditor`, a new `PATCH .../revisar` endpoint restricted to `AUDITOR`/`ADMIN`, with `revisadoPor`/`revisadoEn` to leave a trail). `cambiarEstado` to `CONCILIADO`/`ENVIADO_ERP` now requires both steps, not just the first. The same hole was closed in `GET /inventarios/:id/comparacion-auditoria` (visible to any `OPERARIO`, defeating the point of a "blind" audit). Full detail in `server/README.md`.

- **A counted line's write wasn't atomic; alert deduplication depended on an application-level race; disambiguation text lived in the wrong module; a client write didn't block concurrent dictations. Resolved.** An architecture audit (SOLID/DRY, not user-reported bugs — findings from a thorough review of `InventarioService`/`InventarioRepository`) found four real problems:
  1. **Atomicity.** `procesarLineaArticulo` performed several loose sequential Prisma writes (increment, anomaly evaluation, alerts) — a failure partway through could leave the count applied but its corresponding alert uncreated, or vice versa. Now everything runs inside a single transaction (`InventarioRepository.ejecutarEnTransaccion`), verified with 3 new unit tests confirming every write receives the same `Prisma.TransactionClient` and that an error midway through the sequence rolls everything back.
  2. **Real race condition (TOCTOU) in alert deduplication.** `crearAlertas` deduplicated with a check-then-act in application code (read active alerts → filter → insert) — not atomic: two genuinely simultaneous dictations of the same item (two operators counting the same warehouse, or a network retry) could both read "0 active" before either inserted, letting through the exact duplicate that code was already trying to prevent. Closed at the database level with a Postgres partial unique index on `(itemInventarioId, tipo)` (active only while the alert remains unresolved) plus `skipDuplicates: true`, verified with an e2e test that fires 10 genuinely concurrent HTTP dictations (`Promise.all`, not sequential) against the same item.
  3. **SRP.** `describirMotivoNoMatch`/`sugerenciaDesambiguacion` (the text that tells the operator what to add to disambiguate two candidates) lived as private methods of `InventarioService`, which on top of that had to import `VoiceMatchResult` from `articulos` just to type a parameter. Moved to `articulo-text.util.ts` (the same module that already holds the rest of the voice-matching text utilities) as pure functions, with their own direct unit tests — no behavior change, verified against the real server with the same ambiguous pair "PAPA CRIOLLA"/"PAPA CRIOLLA PRECOCIDA".
  4. **Client: `handleElegirCandidato` didn't block dictation while it wrote.** Unlike voice dictation and SKU scanning, selecting an ambiguous candidate on screen didn't set `procesandoVoz` — voice/text input stayed enabled while that write was in flight. Since `aplicarResultado` replaces the entire inventory with the snapshot each response returns (it doesn't merge), a dictation fired in that window could respond first and then get overwritten by the slower response from the manual selection, wiping an item from the screen that had in fact been registered. Fixed by matching the pattern already used by `handleProcesar`/`handleProcesarSku`; required extracting the counting screen (`InventarioPageContent`) from `app/inventario/[id]/page.tsx` into `inventario-page-content.tsx` so it could be tested directly (Next.js App Router routes can only export reserved names), with a test that reproduces the exact race.

## License

Project developed for inventory management. No open-source license published — restricted use unless stated otherwise.
