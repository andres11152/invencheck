-- AlterEnum
ALTER TYPE "TipoAlerta" ADD VALUE 'PRODUCCION_ANOMALA';

-- AlterTable
ALTER TABLE "pedido_items" ADD COLUMN     "alertaMensaje" TEXT,
ADD COLUMN     "esAnomalia" BOOLEAN NOT NULL DEFAULT false;
