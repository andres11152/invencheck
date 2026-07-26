import { collapseWhitespace, stripAccents } from '../../common/utils/text.util';
import { UnidadMedida } from '../../generated/prisma/client';

export interface DictadoVozItem {
  articuloBusqueda: string;
  cantidad: number;
  unidadDictada: UnidadMedida;
}

const UNITS_WORDS: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
};

const TEENS_WORDS: Record<string, number> = {
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
};

const TWENTIES_WORDS: Record<string, number> = {
  veinte: 20,
  veintiuno: 21,
  veintiun: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
};

const TENS_WORDS: Record<string, number> = {
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
};

const HUNDREDS_WORDS: Record<string, number> = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  trescientos: 300,
  cuatrocientos: 400,
  quinientos: 500,
  seiscientos: 600,
  setecientos: 700,
  ochocientos: 800,
  novecientos: 900,
};

const UNIT_WORD_TO_ENUM: Record<string, UnidadMedida> = {
  kilo: UnidadMedida.KILOGRAMO,
  kilos: UnidadMedida.KILOGRAMO,
  kilogramo: UnidadMedida.KILOGRAMO,
  kilogramos: UnidadMedida.KILOGRAMO,
  kg: UnidadMedida.KILOGRAMO,
  kgs: UnidadMedida.KILOGRAMO,
  libra: UnidadMedida.KILOGRAMO,
  libras: UnidadMedida.KILOGRAMO,
  lb: UnidadMedida.KILOGRAMO,
  lbs: UnidadMedida.KILOGRAMO,
  gramo: UnidadMedida.GRAMO,
  gramos: UnidadMedida.GRAMO,
  gr: UnidadMedida.GRAMO,
  grs: UnidadMedida.GRAMO,
  litro: UnidadMedida.LITRO,
  litros: UnidadMedida.LITRO,
  lt: UnidadMedida.LITRO,
  lts: UnidadMedida.LITRO,
  mililitro: UnidadMedida.MILILITRO,
  mililitros: UnidadMedida.MILILITRO,
  ml: UnidadMedida.MILILITRO,
  unidad: UnidadMedida.UNIDAD,
  unidades: UnidadMedida.UNIDAD,
  und: UnidadMedida.UNIDAD,
  unds: UnidadMedida.UNIDAD,
  canastilla: UnidadMedida.CANASTILLA,
  canastillas: UnidadMedida.CANASTILLA,
  caja: UnidadMedida.CAJA,
  cajas: UnidadMedida.CAJA,
  porcion: UnidadMedida.PORCION,
  porciones: UnidadMedida.PORCION,
};

/** Abreviaturas que, igual que "libra"/"libras", se manejan en KILOGRAMO pero valen la mitad. */
const ABREVIATURAS_LIBRA = new Set(['libra', 'libras', 'lb', 'lbs']);

const CONNECTOR_WORDS = new Set(['de', 'del']);

interface NumberMatch {
  value: number;
  tokensConsumed: number;
}

/**
 * Convención colombiana para números escritos con dígitos: el punto agrupa
 * miles ("15.000" = quince mil), no es separador decimal. Heurística:
 * - Uno o más grupos de EXACTAMENTE 3 dígitos tras el primer punto
 *   ("15.000", "1.234.567") -> se interpreta como separador de miles.
 * - Un solo punto con 1 o 2 dígitos después ("2.5", "2.50") -> decimal real
 *   (una cantidad dictada con fracción de kilo/litro rara vez tiene
 *   exactamente 3 decimales, así que este caso no colisiona con el de arriba).
 * Devuelve `null` si el token no es numérico en absoluto.
 */
function parseNumeroConSeparadores(token: string): number | null {
  if (/^\d{1,3}(\.\d{3})+$/.test(token)) {
    return parseInt(token.replace(/\./g, ''), 10);
  }
  if (/^\d+([.,]\d+)?$/.test(token)) {
    return parseFloat(token.replace(',', '.'));
  }
  return null;
}

/** Reconoce un número en palabras (0-999) a partir de tokens[i]. Sin "mil". */
function parseUpTo999(tokens: string[], i: number): NumberMatch | null {
  const t = tokens[i];
  if (t === undefined) return null;

  if (HUNDREDS_WORDS[t] !== undefined) {
    let value = HUNDREDS_WORDS[t];
    let tokensConsumed = 1;
    const rest = parseUpTo999(tokens, i + 1);
    if (rest && rest.value < 100) {
      value += rest.value;
      tokensConsumed += rest.tokensConsumed;
    }
    return { value, tokensConsumed };
  }

  if (TENS_WORDS[t] !== undefined) {
    let value = TENS_WORDS[t];
    let tokensConsumed = 1;
    if (tokens[i + 1] === 'y' && UNITS_WORDS[tokens[i + 2]] !== undefined) {
      value += UNITS_WORDS[tokens[i + 2]];
      tokensConsumed = 3;
    }
    return { value, tokensConsumed };
  }

  if (TWENTIES_WORDS[t] !== undefined) {
    return { value: TWENTIES_WORDS[t], tokensConsumed: 1 };
  }
  if (TEENS_WORDS[t] !== undefined) {
    return { value: TEENS_WORDS[t], tokensConsumed: 1 };
  }
  if (UNITS_WORDS[t] !== undefined) {
    return { value: UNITS_WORDS[t], tokensConsumed: 1 };
  }

  return null;
}

/** Reconoce un número (dígitos, palabras o fracciones habladas en español) a partir de tokens[i]. */
function parseNumberAt(tokens: string[], i: number): NumberMatch | null {
  const t = tokens[i];
  if (t === undefined) return null;

  // Fracciones autónomas: "medio", "media", "un cuarto", "tres cuartos"
  if (t === 'medio' || t === 'media') {
    return { value: 0.5, tokensConsumed: 1 };
  }
  if (t === 'un' && tokens[i + 1] === 'cuarto') {
    return { value: 0.25, tokensConsumed: 2 };
  }
  if (t === 'tres' && tokens[i + 1] === 'cuartos') {
    return { value: 0.75, tokensConsumed: 2 };
  }

  const numeroConSeparadores = parseNumeroConSeparadores(t);
  if (numeroConSeparadores !== null) {
    let value = numeroConSeparadores;
    let tokensConsumed = 1;
    if (
      tokens[i + 1] === 'y' &&
      (tokens[i + 2] === 'medio' || tokens[i + 2] === 'media')
    ) {
      value += 0.5;
      tokensConsumed += 2;
    } else if (tokens[i + 1] === 'y' && tokens[i + 2] === 'cuarto') {
      value += 0.25;
      tokensConsumed += 2;
    }
    return { value, tokensConsumed };
  }

  // "mil", "cinco mil", "cinco mil quinientos"...
  let miles: NumberMatch | null = null;
  if (t === 'mil') {
    miles = { value: 1, tokensConsumed: 1 };
  } else {
    const lead = parseUpTo999(tokens, i);
    if (lead && tokens[i + lead.tokensConsumed] === 'mil') {
      miles = { value: lead.value, tokensConsumed: lead.tokensConsumed + 1 };
    }
  }
  if (miles) {
    let value = miles.value * 1000;
    let tokensConsumed = miles.tokensConsumed;
    const remainder = parseUpTo999(tokens, i + tokensConsumed);
    if (remainder) {
      value += remainder.value;
      tokensConsumed += remainder.tokensConsumed;
    }
    return { value, tokensConsumed };
  }

  const base = parseUpTo999(tokens, i);
  if (base) {
    let value = base.value;
    let tokensConsumed = base.tokensConsumed;
    if (
      tokens[i + tokensConsumed] === 'y' &&
      (tokens[i + tokensConsumed + 1] === 'medio' ||
        tokens[i + tokensConsumed + 1] === 'media')
    ) {
      value += 0.5;
      tokensConsumed += 2;
    } else if (
      tokens[i + tokensConsumed] === 'y' &&
      tokens[i + tokensConsumed + 1] === 'cuarto'
    ) {
      value += 0.25;
      tokensConsumed += 2;
    }
    return { value, tokensConsumed };
  }

  return null;
}

function tokenize(texto: string): string[] {
  const clean = collapseWhitespace(
    stripAccents(texto)
      .toLowerCase()
      .replace(/,/g, ' y ')
      .replace(/[^a-z0-9.\s]/g, ' ')
      // Separa dígitos pegados a letras ("15.000kg" -> "15.000 kg", "500ml"
      // -> "500 ml"). Al hablar de viva voz esto no ocurre (el
      // reconocimiento de voz ya entrega palabras separadas), pero el
      // textarea de dictado es editable a mano y alguien puede escribirlo
      // así — sin este split, "15.000kg" queda como un solo token que
      // ninguna regla de número reconoce, y el ítem completo se
      // descartaba en silencio (ver audit/reporte de bug de voz por texto).
      .replace(/(\d)([a-z])/g, '$1 $2')
      .replace(/([a-z])(\d)/g, '$1 $2'),
  );
  return clean.split(' ').filter(Boolean);
}

/**
 * Parser local (sin IA) de dictado de voz: "quince kilos de papa criolla y
 * noventa kilos de cebolla" -> dos ítems con cantidad/unidad/nombre.
 */
export function parseVoiceItemsLocally(texto: string): DictadoVozItem[] {
  const tokens = tokenize(texto);
  const items: DictadoVozItem[] = [];
  let i = 0;

  while (i < tokens.length) {
    const num = parseNumberAt(tokens, i);
    if (!num) {
      i++;
      continue;
    }

    let j = i + num.tokensConsumed;
    const unitToken = tokens[j];
    const unidadDictada = UNIT_WORD_TO_ENUM[unitToken];
    let cantidadCalculada = num.value;

    if (unidadDictada) {
      j++;
      // Si la unidad fue "libra"/"libras" (o su abreviatura "lb"/"lbs"), convertir a KILOGRAMOS (0.5 kg por libra)
      if (ABREVIATURAS_LIBRA.has(unitToken)) {
        cantidadCalculada = cantidadCalculada * 0.5;
      }
      // Soporte para "cinco kilos y medio de arroz" (fracción tras la unidad)
      if (
        tokens[j] === 'y' &&
        (tokens[j + 1] === 'medio' || tokens[j + 1] === 'media')
      ) {
        cantidadCalculada += 0.5;
        j += 2;
      } else if (tokens[j] === 'y' && tokens[j + 1] === 'cuarto') {
        cantidadCalculada += 0.25;
        j += 2;
      }
    }

    if (CONNECTOR_WORDS.has(tokens[j])) j++;

    const nameTokens: string[] = [];
    while (j < tokens.length) {
      const isNextItemStart =
        tokens[j] === 'y' && parseNumberAt(tokens, j + 1) !== null;
      if (isNextItemStart || parseNumberAt(tokens, j) !== null) break;
      nameTokens.push(tokens[j]);
      j++;
    }

    if (nameTokens.length > 0) {
      items.push({
        articuloBusqueda: nameTokens.join(' '),
        cantidad: cantidadCalculada,
        unidadDictada: unidadDictada ?? UnidadMedida.UNIDAD,
      });
    }

    i = tokens[j] === 'y' ? j + 1 : j;
  }

  return items;
}
