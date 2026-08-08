import { config } from 'dotenv';
import { resolve } from 'path';

// A diferencia de utils/env.ts (que carga .env.test para los e2e normales,
// contra la base de datos de test vacía), esta auditoría necesita el
// catálogo REAL — vive en la base de datos de desarrollo (.env), no en la
// de test. Deliberadamente un archivo de setup separado para no arriesgar
// que un cambio futuro en utils/env.ts haga que esta auditoría (de solo
// lectura contra el catálogo real) apunte por accidente a la base vacía.
config({ path: resolve(__dirname, '../../.env'), quiet: true });
