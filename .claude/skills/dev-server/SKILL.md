---
name: dev-server
description: Launch InvenCheck locally (Postgres via Docker, NestJS server on :3000, Next.js client on :3001) and verify both are actually serving. Use whenever asked to run, start, or demo this app, or to check a change in the real running app.
---

# Launching InvenCheck locally

This is a monorepo: `server` (NestJS + Prisma/Postgres, port 3000, API prefixed `/api`) and `client` (Next.js, port 3001). Both must be running for the app to work; the client calls the server over HTTP, nothing is mocked.

## 1. Postgres must be up first

```bash
cd server && docker compose up -d
```

If this fails with `cannot connect to the docker API` / `no such file or directory`, Docker Desktop isn't running. On macOS:
```bash
open -a Docker
# wait for it, then retry — `docker info` succeeds once the daemon is ready
until docker info >/dev/null 2>&1; do sleep 2; done
cd server && docker compose up -d
```

## 2. Required env vars

`server/main.ts` fails fast at boot if these aren't set — check `server/.env` exists and has real values (see `server/.env.example` for the full list): `DATABASE_URL`, `JWT_SECRET`, `ERP_WEBHOOK_API_KEY`. `GEMINI_API_KEY` is optional — without it, voice dictation falls back to the local Spanish parser (no external calls, this is a real fallback the demo runs on by default, not a stub).

## 3. Start both dev servers

```bash
# from repo root, in two separate background processes/terminals:
npm run dev:server   # -> http://localhost:3000/api
npm run dev:client   # -> http://localhost:3001
```

Wait for actual readiness rather than assuming immediate startup:
```bash
for i in $(seq 1 25); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/almacenes)
  [ "$code" != "000" ] && echo "server up ($code)" && break
  sleep 1
done
```
A `401` here is correct and expected — the API requires auth by default (see `JwtAuthGuard` in CLAUDE.md). It means the server booted fine.

## 4. Log in to actually use it

There's no anonymous access. Use one of the seeded demo accounts (see CLAUDE.md for the full list), e.g. `operario@invencheck.demo` / `operario123`, via `POST /api/auth/login` or the `/login` page in the browser.

## Gotcha: production build corrupts a running dev server

`next build` (client) and `nest build` (server) write to the same `.next`/`dist` output the dev server is using. If you need to run a production build to verify it compiles, do it, but afterward:
```bash
cd client && rm -rf .next && npm run dev -- -p 3001
```
Otherwise the dev server starts returning 500s on every route until restarted clean. This has bitten this exact workflow before — always restart clean after a build check, don't just assume the dev server survived it.

## If the catalog looks empty or wrong (5 articles instead of ~936)

Someone ran `prisma:seed` without following it with `prisma:import-excel` — see the `reset-db` skill.
