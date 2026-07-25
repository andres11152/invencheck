import { config } from 'dotenv';
import { resolve } from 'path';

// No-op si el archivo no existe o si las variables ya están en process.env
// (CI las exporta directo a nivel de job) — dotenv nunca sobreescribe una
// variable ya presente, así que este mismo setup sirve para local y CI.
config({ path: resolve(__dirname, '../../.env.test'), quiet: true });
