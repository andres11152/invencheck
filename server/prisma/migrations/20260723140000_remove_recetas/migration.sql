-- DropForeignKey
ALTER TABLE "receta_items" DROP CONSTRAINT "receta_items_recetaId_fkey";

-- DropForeignKey
ALTER TABLE "receta_items" DROP CONSTRAINT "receta_items_articuloId_fkey";

-- DropTable
DROP TABLE "receta_items";

-- DropTable
DROP TABLE "recetas";
