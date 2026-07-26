-- Índice único PARCIAL: nunca puede haber dos alertas ACTIVAS (sin resolver
-- Y sin revisar por auditor) del mismo tipo para el mismo ítem al mismo
-- tiempo. Solo aplica a las filas que cumplen el WHERE — una vez que ambas
-- banderas quedan en true (alerta cerrada), esa fila deja de contar para
-- el constraint y el mismo (itemInventarioId, tipo) puede volver a activarse
-- más adelante si el problema reaparece.
--
-- Cierra a nivel de base de datos una condición de carrera real: la
-- deduplicación en `InventarioRepository.crearAlertas` (leer activas ->
-- filtrar -> insertar) no es atómica en código de aplicación — dos
-- dictados casi simultáneos del mismo ítem podían leer "0 activas" antes
-- de que cualquiera de los dos insertara, colando el mismo duplicado que
-- ese fix ya intentaba evitar. Con este índice, combinado con
-- `skipDuplicates: true` en el `createMany` de la app, Postgres descarta
-- en silencio el segundo insert en conflicto, sin importar el orden de
-- llegada.
CREATE UNIQUE INDEX "alertas_inventario_activa_unica_idx"
ON "alertas_inventario" ("itemInventarioId", "tipo")
WHERE (NOT "resuelto" OR NOT "revisadoPorAuditor");
