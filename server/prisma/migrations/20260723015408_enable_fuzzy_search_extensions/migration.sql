-- Extensiones requeridas para el matching difuso de voz (ArticuloService.normalizarEntradaHablada):
-- pg_trgm habilita similarity()/% para comparar por trigramas.
-- unaccent habilita comparar "ají" con "aji" sin acentos.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
