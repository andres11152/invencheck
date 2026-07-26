# InvenCheck — Client

[![CI](https://github.com/andres11152/invencheck/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/andres11152/invencheck/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-52%20tests%20%2F%2012%20specs-blue)](src)
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

Vitest + Testing Library, 52 tests en 12 archivos:

| Archivo | Qué prueba |
|---|---|
| `src/lib/auth-storage.test.ts` | Sesión en `localStorage`, incluyendo JSON corrupto |
| `src/lib/api.test.ts` | Wrapper `request<T>`: header `Authorization`, `ApiError` en fallo de red vs. respuesta no-2xx, el guard que evita redirigir a `/login` cuando el 401 viene del propio login, construcción de query string |
| `src/lib/voice-sanitize.test.ts` | `limpiarRepeticiones`: colapsa frases repetidas que el motor de reconocimiento de voz de Android reenvía duplicadas |
| `src/hooks/use-offline-sync.test.ts` | Reintento automático de pendientes (`intentos === 0`), no-reintento de los ya fallados salvo `incluirFallidos`, sync inmediato al recuperar conexión |
| `src/hooks/use-speech-recognition.test.ts` | No duplica un resultado final reenviado por Android, no pierde un interim que se finaliza mientras hay otro interim más adelante, no duplica en cascada cuando cada "final" trae la frase completa acumulada — 3 bugs reales de Android |
| `src/components/anomalia-modal.test.tsx` | `navigator.vibrate` (con guard, jsdom no la implementa), texto condicional de promedio histórico, callbacks de confirmar/re-dictar |
| `src/components/item-inventario-card.test.tsx` | El click para revisar una anomalía se deriva de si quedan alertas activas, no del booleano `esAnomalia` (puede quedar desalineado — ver Arquitectura) |
| `src/components/barcode-scanner-modal.test.tsx` | El stream de la cámara se conecta al `<video>` ya montado, no antes; si `getUserMedia` falla, no se muestra el video |
| `src/components/items-no-matcheados-card.test.tsx` | Cola persistente de ítems sin match/ambiguos: reintentar, descartar, elegir un candidato directamente |
| `src/components/alertas-revision-auditor.test.tsx` | Solo lista alertas confirmadas por el operario y sin revisión de auditor; marcar revisada llama a la API y al callback |
| `src/components/acciones-cierre.test.tsx` | Jerarquía de botones de cierre por rol/estado: consolidar deshabilitado con alertas activas, oculto para OPERARIO, "Enviar a ERP" tras `CONCILIADO` |
| `src/app/inventario/[id]/inventario-page-content.test.tsx` | Seleccionar un candidato ambiguo deshabilita el dictado por voz/texto mientras esa escritura está en vuelo — regresión de una condición de carrera real (ver Arquitectura) |

**Umbral de cobertura** (`test.coverage` en `vitest.config.ts`): 73% statements / 60% branches / 52% funciones / 78% líneas, **acotado a 6 de los 12 archivos de arriba** (`coverage.include`: `auth-storage.ts`, `api.ts`, `voice-sanitize.ts`, `use-offline-sync.ts`, `use-speech-recognition.ts`, `anomalia-modal.tsx`) — no a todo `src/`. Los otros 6 ya tienen tests reales pero todavía no cuentan para el umbral exigido en CI; incluir el resto del código sin test dedicado hoy solo diluiría el número sin proteger nada real. Es más honesto un umbral alto sobre lo que sí está en `include` que uno bajo y vago sobre todo el proyecto — ampliar `include` es el paso natural cada vez que un archivo recién testeado se estabiliza.

Cada test importa `describe`/`it`/`expect`/`vi` explícitos de `vitest` (sin modo global) para no tocar la config de ESLint.

Sin cubrir todavía: el resto de componentes sin test dedicado (`voice-capture.tsx`, `inventario-header.tsx`, `auditoria-ciega-card.tsx`, `cola-offline-indicator.tsx`, `account-menu.tsx`, `almacen-card.tsx`, `alerta-badge.tsx`), `offline-queue.ts` (IndexedDB), `export-erp.ts`, y las páginas fuera de `/inventario/[id]` (`/`, `/login`, `/reportes`, `/beneficios`) — pendiente de una capa de mocking de `fetch`/IndexedDB más amplia (tipo MSW) antes de abordarlas de forma sistemática.

## Arquitectura

- **`src/lib/api.ts`** — único punto de entrada a la API. Adjunta el JWT si existe, normaliza errores en `ApiError` (`status: 0` = fallo de red, no confundir con un 4xx/5xx real), y limpia la sesión + redirige a `/login` en un 401 fuera del propio login.
- **`src/components/auth-provider.tsx`** — sesión JWT en `localStorage`, redirige a `/login` si está ausente o expirada. Cualquier página nueva bajo el layout raíz queda protegida automáticamente.
- **`src/hooks/use-offline-sync.ts` + `src/lib/offline-queue.ts`** — dictados hechos sin conexión se encolan en IndexedDB y se reintentan al recuperar señal (evento `online` + poll de respaldo cada 8s). Un pendiente con `intentos === 0` nunca llegó al backend (se reintenta solo); uno con `intentos > 0` ya fue rechazado por el backend (requiere `incluirFallidos` explícito para reintentarse).
- **`src/lib/types.ts`** — interfaces propias que reflejan a mano las respuestas del server. El único tipo compartido real viene de `@invencheck/shared` (`EstadoInventario`, `TipoAlerta`, `UnidadMedida`) — un cambio de forma de respuesta en el server no lo detecta el compilador acá, hay que actualizar `types.ts` manualmente.
- **Anomalías y desalineación de `esAnomalia`**: el booleano `esAnomalia` de un `ItemInventario` refleja solo la ÚLTIMA evaluación del server y puede quedar en `false` mientras una alerta vieja (de cuando sí aplicaba) sigue activa. Por eso la UI (`item-inventario-card.tsx`, `inventario-header.tsx`, `inventario-page-content.tsx`) deriva el click/badge/conteo de anomalías siempre de las `alertas` reales sin resolver, nunca de ese booleano cacheado.
- **`app/inventario/[id]/`** — la ruta (`page.tsx`) solo declara los exports que Next.js App Router permite en un archivo de ruta (`default`, `dynamic`, ...); toda la lógica (estado, handlers, JSX) vive en `inventario-page-content.tsx`, envuelta por `page.tsx` en `ClientProviders`. Esa separación es lo que permite importar y testear el componente directamente con Testing Library. Seleccionar un candidato ambiguo en pantalla (`handleElegirCandidato`) marca `procesandoVoz` igual que el dictado por voz y el escaneo por SKU — `aplicarResultado` reemplaza el inventario completo con el snapshot que devuelve cada respuesta (no hace merge), así que sin ese bloqueo un dictado disparado mientras esa escritura está en vuelo podía responder primero y luego ser pisado por la respuesta más lenta.

## Estructura

```
src/
  app/            rutas App Router: /, /login, /inventario/[id] (page.tsx delgado + inventario-page-content.tsx), /reportes, /beneficios
  components/     UI compartida (AnomaliaModal, VoiceCapture, AuthProvider, ...) + components/ui (primitivas Radix)
  hooks/          use-offline-sync, use-speech-recognition
  lib/            api.ts, auth-storage.ts, offline-queue.ts, types.ts, format.ts, voice-sanitize.ts
```
