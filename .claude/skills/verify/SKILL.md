---
name: verify
description: Run the full verification suite (typecheck, lint, unit tests, build) across all three InvenCheck packages before considering a change done. Use after any non-trivial edit to server or client code, and always before telling the user something is "done" or "working".
---

# Full verification suite

Three independent packages, each needs its own check — a passing client build says nothing about the server, and vice versa. Run in this order (shared first, since server/client depend on it via the npm workspace symlink).

## shared
```bash
cd shared && npm run build
```

## server
```bash
cd server
npx tsc --noEmit
npm run lint        # eslint --fix — no-explicit-any, no-floating-promises and no-unsafe-argument are 'error', not 'warn'
npm test            # jest unit tests
npm run build       # nest build
```
`server/tsconfig.json` has full `"strict": true`. A new `class-validator` DTO class needs `!` definite-assignment on required fields (`campo!: string`) — plain `campo: string` fails `strictPropertyInitialization` because these classes are populated by `class-transformer`, not a constructor. This is expected, not a bug to work around differently.

## client
```bash
cd client
npx tsc --noEmit
npm run lint         # next lint
npm run build        # next build
```

## After running any build (`nest build` / `next build`)

If a dev server was running for that package, its `.next`/`dist` output is now stale/corrupted for the dev server's purposes. Restart it clean:
```bash
cd client && rm -rf .next && npm run dev -- -p 3001   # if client build was run
```
See the `dev-server` skill for the full restart+readiness-check sequence. Don't skip this and then run a live/Playwright check against a dev server that's still serving the pre-build state — it will look broken when it isn't, or pass when it shouldn't.

## Runtime smoke test (when the change touches request/response behavior, not just types)

A green `tsc`/`lint`/`build` does not prove an endpoint or a UI flow actually works — it only proves the code compiles. For anything touching auth, the anomaly-detection flow, or module wiring, confirm against the running app:
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"operario@invencheck.demo","password":"operario123"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['accessToken'])")
curl -s http://localhost:3000/api/almacenes -H "Authorization: Bearer $TOKEN" | head -c 200
```
For a UI change, prefer an actual Playwright pass over trusting the build output — see the general `run` skill for the browser-driving pattern. This repo doesn't have Playwright installed in either package; install it ad hoc in the scratchpad directory (`npm init -y && npm install playwright && npx playwright install chromium`) rather than adding it as a project dependency.
