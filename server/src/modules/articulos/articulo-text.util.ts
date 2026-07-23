import { collapseWhitespace, stripAccents } from '../../common/utils/text.util';

const NUMBER_WORDS: Record<string, string> = {
  '0': 'cero',
  '1': 'uno',
  '2': 'dos',
  '3': 'tres',
  '4': 'cuatro',
  '5': 'cinco',
  '6': 'seis',
  '7': 'siete',
  '8': 'ocho',
  '9': 'nueve',
  '10': 'diez',
};

const STOPWORDS = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'y',
  'en',
  'con',
  'sin',
  'x',
]);

/** Tokens de cantidad/unidad hablada que no aportan a la identidad del artículo. */
const SPOKEN_QUANTITY_WORDS = new Set([
  'un',
  'una',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'kilo',
  'kilos',
  'kilogramo',
  'kilogramos',
  'gramo',
  'gramos',
  'litro',
  'litros',
  'mililitro',
  'mililitros',
  'unidad',
  'unidades',
  'porcion',
  'porciones',
  'caja',
  'cajas',
  'canastilla',
  'canastillas',
  ...STOPWORDS,
]);

/** "500ml", "1.5kg", "50x60" -> descartables como token identificador. */
const SIZE_OR_NUMBER_TOKEN =
  /^\d+([.,]\d+)?(ml|mg|g|gr|kg|lt|l|cm|mm|un|und)?$/i;

function baseClean(texto: string): string {
  return collapseWhitespace(
    stripAccents(texto)
      .toLowerCase()
      .replace(/\(pa\)/gi, ' ')
      .replace(/[^a-z0-9.\s]/g, ' '),
  );
}

/**
 * Tokens significativos de un nombre de artículo: sin acentos, sin (PA),
 * sin medidas/tamaños ("250ml") ni conectores ("de", "x").
 */
function significantTokens(nombre: string): string[] {
  return baseClean(nombre)
    .split(' ')
    .filter(Boolean)
    .map((t) => NUMBER_WORDS[t] ?? t)
    .filter(
      (t) => t.length > 1 && !STOPWORDS.has(t) && !SIZE_OR_NUMBER_TOKEN.test(t),
    );
}

/**
 * Genera alias por defecto para búsqueda/voz a partir del nombre de catálogo.
 * Ej: "CERVEZA HEINEKEN 0 LATA 250ML" -> ["cerveza heineken", "heineken cero", "heineken lata"].
 *
 * El segundo token suele ser la marca/palabra distintiva (el primero suele ser
 * la categoría genérica: "cerveza", "aceite", "salsa"...), así que se usa como
 * ancla para combinarlo con el resto de descriptores.
 */
export function buildAliases(nombre: string): string[] {
  const tokens = significantTokens(nombre);
  if (tokens.length === 0) return [];

  const aliases = new Set<string>();
  aliases.add(tokens.join(' '));

  if (tokens.length >= 2) {
    aliases.add(tokens.slice(0, 2).join(' '));
    const anchor = tokens[1];
    for (const t of tokens.slice(2)) {
      aliases.add(`${anchor} ${t}`);
    }
  }

  const nombreLower = nombre.trim().toLowerCase();
  return [...aliases].filter((a) => a !== nombreLower).slice(0, 5);
}

/**
 * Limpia un texto dictado ("tres kilos de aji casero") dejando solo las
 * palabras que identifican el artículo ("aji casero"), para maximizar el
 * score de coincidencia difusa contra nombre/aliases.
 */
export function normalizeSpokenText(texto: string): string {
  return baseClean(texto)
    .split(' ')
    .filter(Boolean)
    .filter((t) => !SPOKEN_QUANTITY_WORDS.has(t) && !/^\d+([.,]\d+)?$/.test(t))
    .join(' ')
    .trim();
}
