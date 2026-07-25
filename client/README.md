# InvenCheck — Client

[![CI](https://github.com/andres11152/invencheck/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/andres11152/invencheck/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-21%20specs-blue)](src)
[![coverage threshold](https://img.shields.io/badge/coverage%20threshold-73%25%20stmts%20(scoped%2C%20CI--enforced)-success)](#tests)

PWA de InvenCheck — Next.js 14 (App Router), toda la UI en componentes `"use client"`. Consume la API de `server` para el flujo de toma física por voz: dictar, matchear contra catálogo, resolver anomalías y consolidar.

> Documentación específica de este paquete. Para el contexto completo del monorepo (por qué existe cada decisión, el flujo de negocio end-to-end, y cómo se relaciona con `server`/`shared`) ver el [README raíz](../README.md).

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14 (App Router), React 18 |
| UI | Radix UI + Tailwind CSS (`tailwindcss-animate`), `lucide-react` |
| Estado de sesión | JWT en `localStorage` (`auth-provider.tsx`) |
| Offline | IndexedDB vía `idb` (`use-offline-sync.ts` + `offline-queue.ts`) |
| Tests | Vitest + React Testing Library, jsdom |

Todo habla con la API a través de un wrapper `request<T>` tipado en `src/lib/api.ts` — no hay server components ni server actions.

## Requisitos

- Node.js 24.x
- API de `server` corriendo en `:3000` (ver [server/README.md](../server/README.md))

## Puesta en marcha

```bash
npm install                  # o `npm install` desde la raíz del monorepo
cp .env.example .env         # el default ya sirve para desarrollo local
npm run dev                  # :3001
```

### Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | Base URL de la API. Default `http://localhost:3000/api` |

## Scripts

```bash
npm run dev          # next dev -p 3001
npm run build         # next build (producción)
npm run start         # next start -p 3001 (requiere build previo)
npm run lint           # next lint
npx tsc --noEmit        # typecheck
npm run test             # vitest run — unitarios/componente
npm run test:watch       # vitest en modo watch
npm run test:cov         # vitest run --coverage + umbral (el que corre en CI)
```

**Advertencia conocida:** correr `npm run build` mientras `npm run dev` sigue vivo contra el mismo `.next` corrompe ese output y el dev server empieza a responder 500. Después de un build: `rm -rf .next` y reiniciar `npm run dev`.

## Tests

Vitest + Testing Library, 21 tests en 4 archivos:

| Archivo | Qué prueba |
|---|---|
| `src/lib/auth-storage.test.ts` | Sesión en `localStorage`, incluyendo JSON corrupto |
| `src/lib/api.test.ts` | Wrapper `request<T>`: header `Authorization`, `ApiError` en fallo de red vs. respuesta no-2xx, el guard que evita redirigir a `/login` cuando el 401 viene del propio login, construcción de query string |
| `src/hooks/use-offline-sync.test.ts` | Reintento automático de pendientes (`intentos === 0`), no-reintento de los ya fallados salvo `incluirFallidos`, sync inmediato al recuperar conexión |
| `src/components/anomalia-modal.test.tsx` | `navigator.vibrate` (con guard, jsdom no la implementa), texto condicional de promedio histórico, callbacks de confirmar/re-dictar |

**Umbral de cobertura** (`test.coverage` en `vitest.config.ts`): 73% statements / 60% branches / 52% funciones / 78% líneas, **acotado a los 4 archivos de arriba** (`coverage.include`) — no a todo `src/`. Incluir el resto del código (páginas, componentes sin test) hoy solo diluiría el número sin proteger nada real; es más honesto un umbral alto sobre lo que sí se probó. Ampliar `include` es el paso natural cada vez que se agregue un test nuevo.

Cada test importa `describe`/`it`/`expect`/`vi` explícitos de `vitest` (sin modo global) para no tocar la config de ESLint.

Sin cubrir todavía: `app/inventario/[id]/page.tsx` (la pantalla compuesta de conteo) y el resto de componentes/hooks — pendiente de una capa de mocking de `fetch` más amplia (tipo MSW) antes de abordarla.

## Arquitectura

- **`src/lib/api.ts`** — único punto de entrada a la API. Adjunta el JWT si existe, normaliza errores en `ApiError` (`status: 0` = fallo de red, no confundir con un 4xx/5xx real), y limpia la sesión + redirige a `/login` en un 401 fuera del propio login.
- **`src/components/auth-provider.tsx`** — sesión JWT en `localStorage`, redirige a `/login` si está ausente o expirada. Cualquier página nueva bajo el layout raíz queda protegida automáticamente.
- **`src/hooks/use-offline-sync.ts` + `src/lib/offline-queue.ts`** — dictados hechos sin conexión se encolan en IndexedDB y se reintentan al recuperar señal (evento `online` + poll de respaldo cada 8s). Un pendiente con `intentos === 0` nunca llegó al backend (se reintenta solo); uno con `intentos > 0` ya fue rechazado por el backend (requiere `incluirFallidos` explícito para reintentarse).
- **`src/lib/types.ts`** — interfaces propias que reflejan a mano las respuestas del server. El único tipo compartido real viene de `@invencheck/shared` (`EstadoInventario`, `TipoAlerta`, `UnidadMedida`) — un cambio de forma de respuesta en el server no lo detecta el compilador acá, hay que actualizar `types.ts` manualmente.

## Estructura

```
src/
  app/            rutas App Router: /, /login, /inventario/[id], /reportes, /beneficios
  components/     UI compartida (AnomaliaModal, VoiceCapture, AuthProvider, ...) + components/ui (primitivas Radix)
  hooks/          use-offline-sync, use-speech-recognition
  lib/            api.ts, auth-storage.ts, offline-queue.ts, types.ts, format.ts
```
