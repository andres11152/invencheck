import { buildAliases, normalizeSpokenText } from './articulo-text.util';

describe('normalizeSpokenText', () => {
  it('quita cantidad, unidad y conectores, dejando solo el nombre del artículo', () => {
    expect(normalizeSpokenText('tres kilos de aji casero')).toBe('aji casero');
  });

  it('es insensible a tildes y mayúsculas', () => {
    expect(normalizeSpokenText('DOS KILOS DE PAPA CRIOLLA')).toBe(
      'papa criolla',
    );
  });

  // SPOKEN_QUANTITY_WORDS solo cubre 1-10 en palabras ("un".."diez"), no
  // números más grandes ("quince", "veinte"...). No es un bug vivo: en el
  // pipeline real esta función recibe `articuloBusqueda` ya separado de la
  // cantidad por el parser de voz (ver inventario.service.ts), nunca texto
  // crudo con el número incluido — se documenta el límite actual para que
  // un cambio futuro sea intencional, no una regresión silenciosa.
  it('no elimina números en palabras mayores a diez (limitación conocida, no usada en el pipeline real)', () => {
    expect(normalizeSpokenText('quince kilos de papa criolla')).toBe(
      'quince papa criolla',
    );
  });

  it('quita dígitos sueltos además de números en palabras', () => {
    expect(normalizeSpokenText('2.5 litros de aceite')).toBe('aceite');
  });

  it('deja el texto vacío si solo había cantidad/unidad/conectores', () => {
    expect(normalizeSpokenText('cinco kilos de')).toBe('');
  });

  it('no rompe con texto ya limpio (sin cantidad ni unidad)', () => {
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

  it('limita a un máximo de 5 alias', () => {
    const aliases = buildAliases(
      'SALSA ROSADA CASERA CON AJI TOMATE CEBOLLA LARGA PISCILAGO EXTRA',
    );
    expect(aliases.length).toBeLessThanOrEqual(5);
  });
});
