import {
  buildAliases,
  describirMotivoNoMatch,
  normalizeSpokenText,
} from './articulo-text.util';

describe('normalizeSpokenText', () => {
  it('quita unidad y conectores, dejando el nombre del artículo', () => {
    expect(normalizeSpokenText('de aji casero')).toBe('aji casero');
  });

  it('es insensible a tildes y mayúsculas', () => {
    expect(normalizeSpokenText('DE PAPA CRIOLLA')).toBe('papa criolla');
  });

  // Deliberado: esta función recibe `articuloBusqueda` ya separado de la
  // cantidad por el parser de voz (local o Gemini) — cualquier número que
  // sobreviva hasta acá casi siempre es parte del identificador del propio
  // producto (calibre "2-0", talla, mililitros, cantidad de dígitos), no
  // cantidad sobrante. Descartarlo colapsaba variantes distintas del
  // catálogo real entre sí — ver audit-voice-matching.ts.
  it('NO elimina números en palabras (uno-diez): pueden ser parte del identificador del producto', () => {
    expect(
      normalizeSpokenText('acido poliglicolico dos cero uso zoologico'),
    ).toBe('acido poliglicolico dos cero uso zoologico');
  });

  it('NO elimina dígitos sueltos por la misma razón', () => {
    expect(normalizeSpokenText('calculadora manual 8 digitos')).toBe(
      'calculadora manual 8 digitos',
    );
  });

  it('sí quita palabras de unidad de medida dictada y conectores alrededor de un número', () => {
    expect(normalizeSpokenText('2.5 litros de aceite')).toBe('2.5 aceite');
  });

  it('deja el texto vacío si solo había unidad/conectores (sin número, sin nombre)', () => {
    expect(normalizeSpokenText('kilos de')).toBe('');
  });

  it('no rompe con texto ya limpio (sin unidad ni conectores)', () => {
    expect(normalizeSpokenText('papa criolla')).toBe('papa criolla');
  });

  it('colapsa espacios múltiples', () => {
    expect(normalizeSpokenText('  papa    criolla  ')).toBe('papa criolla');
  });
});

describe('buildAliases', () => {
  it('genera alias combinando categoría+marca y ancla+descriptor', () => {
    const aliases = buildAliases('CERVEZA HEINEKEN 0 LATA 250ML');
    expect(aliases).toContain('cerveza heineken');
    // "heineken" es el token ancla (segundo token); se combina con el resto.
    expect(aliases.some((a) => a.startsWith('heineken'))).toBe(true);
  });

  it('descarta medidas/tamaños como "250ml" al construir los tokens', () => {
    const aliases = buildAliases('ACEITE OLIVA 250ML');
    expect(aliases.every((a) => !a.includes('250ml'))).toBe(true);
  });

  it('quita el sufijo (PA) de preparaciones de cocina', () => {
    const aliases = buildAliases('AJI CASERO PISCILAGO (PA)');
    expect(aliases.every((a) => !a.includes('pa'))).toBe(true);
  });

  it('devuelve lista vacía si el nombre no tiene tokens significativos', () => {
    expect(buildAliases('250ml')).toEqual([]);
  });

  it('nunca incluye el nombre completo original como alias (sería redundante)', () => {
    const nombre = 'PAPA CRIOLLA';
    const aliases = buildAliases(nombre);
    expect(aliases).not.toContain(nombre.toLowerCase());
  });

  it('genera categoría+último calificador para poder distinguir variantes de color/tamaño', () => {
    const rojas = buildAliases('CEBOLLA CABEZONA ROJA');
    const blancas = buildAliases('CEBOLLA CABEZONA BLANCA');

    expect(rojas).toContain('cebolla roja');
    expect(blancas).toContain('cebolla blanca');
    // El alias corto original (ancla+2do token) seguía siendo ambiguo entre
    // ambas — sigue existiendo, pero ya no es el único disponible.
    expect(rojas).toContain('cebolla cabezona');
    expect(blancas).toContain('cebolla cabezona');
  });

  it('no genera el alias categoría+último calificador para nombres de solo 2 tokens (sería idéntico al nombre completo)', () => {
    // Con 2 tokens, tokens[0]+tokens[-1] coincide con el nombre completo
    // (ya filtrado como redundante) — no debe aparecer ningún duplicado.
    const aliases = buildAliases('MAYONESA LIGHT');
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it('limita a un máximo de 5 alias', () => {
    const aliases = buildAliases(
      'SALSA ROSADA CASERA CON AJI TOMATE CEBOLLA LARGA PISCILAGO EXTRA',
    );
    expect(aliases.length).toBeLessThanOrEqual(5);
  });
});

describe('describirMotivoNoMatch', () => {
  it('reporta "sin coincidencia" cuando no hay candidatos ambiguos', () => {
    expect(describirMotivoNoMatch(undefined)).toBe(
      'Sin coincidencia en el catálogo de artículos',
    );
    expect(describirMotivoNoMatch([])).toBe(
      'Sin coincidencia en el catálogo de artículos',
    );
  });

  it('lista los nombres candidatos y sugiere qué agregar para distinguirlos', () => {
    const motivo = describirMotivoNoMatch([
      { nombre: 'CEBOLLA CABEZONA ROJA' },
      { nombre: 'CEBOLLA CABEZONA BLANCA' },
    ]);
    expect(motivo).toContain('"CEBOLLA CABEZONA ROJA"');
    expect(motivo).toContain('"CEBOLLA CABEZONA BLANCA"');
    expect(motivo).toContain('agrega "roja"');
    expect(motivo).toContain('agrega "blanca"');
  });

  it('cuando un candidato es prefijo exacto del otro, aclara que ese se dicta tal cual sin agregar nada', () => {
    const motivo = describirMotivoNoMatch([
      { nombre: 'PAPA CRIOLLA' },
      { nombre: 'PAPA CRIOLLA PRECOCIDA' },
    ]);
    expect(motivo).toContain(
      'dilo tal cual, sin agregar nada, si es "PAPA CRIOLLA"',
    );
    expect(motivo).toContain(
      'agrega "precocida" si es "PAPA CRIOLLA PRECOCIDA"',
    );
  });
});
