---
name: reset-db
description: Reset the local InvenCheck database to a clean, working state — seed demo users/warehouses and restore the real 936-article Colsubsidio catalog. Use when the DB is missing data, has bad test data, after running prisma:seed alone, or when setting up the project for the first time.
---

# Resetting the local database

InvenCheck's seed and its real catalog import are two separate, sequential steps — running only one leaves the DB in a half-working state that looks broken in a way that isn't obvious from the symptom alone.

## The two steps, in this order, from `server/`

```bash
npm run prisma:seed          # 1. wipes articulos/almacenes/inventarios/usuarios, creates minimal test fixtures + 3 demo login users
npm run prisma:import-excel  # 2. re-imports the real catalog from data/BODEGAS Y STOCK.xlsx (~936 articles, ~48 warehouses)
```

**Why both are needed**: `prisma:seed` (`server/prisma/seed.ts`) resets the domain tables for reproducibility and creates the 3 demo login accounts, but it only inserts a handful of hand-written test articles/warehouses — not the real business data. `prisma:import-excel` (`server/src/scripts/import-excel.ts`, run via `tsx` not `ts-node` — the generated Prisma client uses `nodenext`-style `.js` import extensions that only `tsx` resolves correctly against the `.ts` source) upserts the real catalog on top.

If you only need to reset auth/domain state without touching the catalog, running only step 1 is fine — just know that `articulos`/`almacenes` afterward will be the ~5 test fixtures, not the real ~938-article catalog, until you run step 2.

## Verify it worked

```bash
docker exec server-postgres-1 psql -U invencheck -d invencheck \
  -c "SELECT count(*) FROM articulos;" -c "SELECT count(*) FROM almacenes;" -c "SELECT count(*) FROM usuarios;"
```
Expect roughly: articulos ~938, almacenes ~50, usuarios 3. If articulos is ~5, step 2 didn't run (or failed — check `server/data/BODEGAS Y STOCK.xlsx` exists).

## Migrations (schema changes, not data)

```bash
npm run prisma:migrate   # interactive, prompts on destructive changes
npm run prisma:deploy    # non-interactive, applies existing migration files only
```
For a destructive schema change (dropping a table/column) in a non-interactive context, `prisma migrate dev` will refuse with "environment is non-interactive". Write the migration SQL by hand into a new `prisma/migrations/<timestamp>_<name>/migration.sql` and apply with `prisma migrate deploy` instead of fighting the prompt — this repo has done that before (see the migration that dropped the `recetas`/`receta_items` tables) and it's the clean path, not a workaround.
