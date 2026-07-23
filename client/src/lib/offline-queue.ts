import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * Cola de escritura offline: cuando el operario dicta/escribe un conteo y el
 * backend no responde (bodega sin señal), el texto queda guardado aquí en
 * IndexedDB en vez de perderse. `useOfflineSync` la vacía automáticamente
 * al recuperar conexión, reproduciendo cada dictado contra
 * POST /inventarios/:id/procesar-voz en el mismo orden en que se capturó.
 */

export interface DictadoPendiente {
  id?: number;
  inventarioId: string;
  texto: string;
  creadoEn: string;
  intentos: number;
  ultimoError?: string;
}

interface OfflineDB extends DBSchema {
  "dictados-pendientes": {
    key: number;
    value: DictadoPendiente;
    indexes: { inventarioId: string };
  };
}

const DB_NAME = "invencheck-offline";
const DB_VERSION = 1;
const STORE = "dictados-pendientes";

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null;

function getDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB no disponible en este entorno"));
  }
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("inventarioId", "inventarioId");
      },
    }).catch((err: unknown) => {
      // No memoizar un fallo: si fue transitorio (ej. bloqueo puntual de
      // otra pestaña), la próxima llamada debe reintentar abrir la DB en
      // vez de quedar rota por el resto de la sesión.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export async function encolarDictado(inventarioId: string, texto: string): Promise<number> {
  const db = await getDb();
  return db.add(STORE, {
    inventarioId,
    texto,
    creadoEn: new Date().toISOString(),
    intentos: 0,
  });
}

export async function listarPendientes(inventarioId: string): Promise<DictadoPendiente[]> {
  const db = await getDb();
  const items = await db.getAllFromIndex(STORE, "inventarioId", inventarioId);
  return items.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

export async function eliminarPendiente(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
}

export async function registrarIntentoFallido(id: number, error: string): Promise<void> {
  const db = await getDb();
  const item = await db.get(STORE, id);
  if (!item) return;
  await db.put(STORE, { ...item, intentos: item.intentos + 1, ultimoError: error });
}
