/**
 * Colapsa frases repetidas consecutivamente (1 a 4 palabras) en el texto
 * transcrito por voz — ej. "80 80 80 kg 80 kg 80 kg de maíz" -> "80 kg de
 * maíz". Necesario sobre todo en Android: el motor de reconocimiento de voz
 * a veces reenvía resultados ya finalizados en un evento `onresult`
 * posterior (bug conocido de la Web Speech API en Chrome/Android), y aunque
 * `useSpeechRecognition` ya evita reprocesar resultados duplicados por
 * índice, esto queda como respaldo defensivo independiente del motor de
 * voz usado.
 *
 * Se usa `\S+` (no espacio) en vez de `\w+` para no romper palabras con
 * tildes/acentos del español ("maíz", "café") — `\w` en regex JS sin la
 * flag `u` con `\p{L}` no las reconoce como parte de una palabra.
 */
export function limpiarRepeticiones(texto: string): string {
  let resultado = texto;
  for (let tamFrase = 1; tamFrase <= 4; tamFrase++) {
    const token = '\\S+';
    const frase = Array.from({ length: tamFrase }, () => token).join('\\s+');
    const patron = new RegExp(`\\b(${frase})\\b(?:\\s+\\1\\b)+`, "gi");
    resultado = resultado.replace(patron, "$1");
  }
  return resultado.replace(/\s+/g, " ").trim();
}
