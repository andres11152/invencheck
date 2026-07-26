-- DropIndex
DROP INDEX "idx_articulos_aliases_gin";

-- AlterTable
ALTER TABLE "alertas_inventario" ADD COLUMN     "revisadoEn" TIMESTAMP(3),
ADD COLUMN     "revisadoPor" TEXT,
ADD COLUMN     "revisadoPorAuditor" BOOLEAN NOT NULL DEFAULT false;
