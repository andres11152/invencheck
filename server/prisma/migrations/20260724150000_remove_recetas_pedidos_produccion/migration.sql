-- DropForeignKey
ALTER TABLE "produccion_insumos_consumidos" DROP CONSTRAINT "produccion_insumos_consumidos_articuloId_fkey";

-- DropForeignKey
ALTER TABLE "produccion_insumos_consumidos" DROP CONSTRAINT "produccion_insumos_consumidos_produccionId_fkey";

-- DropForeignKey
ALTER TABLE "producciones_receta" DROP CONSTRAINT "producciones_receta_inventarioId_fkey";

-- DropForeignKey
ALTER TABLE "producciones_receta" DROP CONSTRAINT "producciones_receta_almacenId_fkey";

-- DropForeignKey
ALTER TABLE "producciones_receta" DROP CONSTRAINT "producciones_receta_recetaId_fkey";

-- DropForeignKey
ALTER TABLE "pedido_items" DROP CONSTRAINT "pedido_items_articuloId_fkey";

-- DropForeignKey
ALTER TABLE "pedido_items" DROP CONSTRAINT "pedido_items_pedidoId_fkey";

-- DropForeignKey
ALTER TABLE "pedidos" DROP CONSTRAINT "pedidos_almacenId_fkey";

-- DropForeignKey
ALTER TABLE "receta_items" DROP CONSTRAINT "receta_items_articuloId_fkey";

-- DropForeignKey
ALTER TABLE "receta_items" DROP CONSTRAINT "receta_items_recetaId_fkey";

-- DropForeignKey
ALTER TABLE "recetas" DROP CONSTRAINT "recetas_articuloId_fkey";

-- DropTable
DROP TABLE "produccion_insumos_consumidos";

-- DropTable
DROP TABLE "producciones_receta";

-- DropTable
DROP TABLE "pedido_items";

-- DropTable
DROP TABLE "pedidos";

-- DropTable
DROP TABLE "receta_items";

-- DropTable
DROP TABLE "recetas";

-- Postgres no permite quitar un valor de un enum directamente: se recrea el
-- tipo sin PRODUCCION_ANOMALA (fuera de alcance del reto, ver CLAUDE.md).
DELETE FROM "alertas_inventario" WHERE "tipo" = 'PRODUCCION_ANOMALA';

ALTER TYPE "TipoAlerta" RENAME TO "TipoAlerta_old";

CREATE TYPE "TipoAlerta" AS ENUM ('ANOMALIA_CANTIDAD', 'STOCK_NEGATIVO', 'SKU_FALTANTE', 'UNIDAD_AMBIGUA');

ALTER TABLE "alertas_inventario" ALTER COLUMN "tipo" TYPE "TipoAlerta" USING ("tipo"::text::"TipoAlerta");

DROP TYPE "TipoAlerta_old";
