-- Wrapper inmutable para unaccent() necesario para índices de expresión en PostgreSQL
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
  RETURNS text AS
$func$
SELECT public.unaccent('public.unaccent', $1)
$func$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

-- Índice GIN de trigramas para búsqueda difusa por nombre insensible a acentos/mayúsculas
CREATE INDEX IF NOT EXISTS idx_articulos_trgm_nombre 
ON articulos USING gin (public.f_unaccent(lower(nombre)) gin_trgm_ops);

-- Índice GIN para consultas rápidas sobre el array de aliases
CREATE INDEX IF NOT EXISTS idx_articulos_aliases_gin 
ON articulos USING gin (aliases);
