const COMBINING_DIACRITICS = /[\u0300-\u036f]/g;

/** Quita tildes/diacríticos: "AJÍ" -> "AJI". */
export function stripAccents(texto: string): string {
  return texto.normalize('NFD').replace(COMBINING_DIACRITICS, '');
}

/** Colapsa espacios múltiples/tabs a uno solo y recorta bordes. */
export function collapseWhitespace(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}
