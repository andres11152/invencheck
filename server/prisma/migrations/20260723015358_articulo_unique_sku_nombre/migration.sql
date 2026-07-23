-- DropIndex
DROP INDEX "articulos_nombre_idx";

-- DropIndex
DROP INDEX "articulos_sku_idx";

-- CreateIndex
CREATE UNIQUE INDEX "articulos_sku_key" ON "articulos"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "articulos_nombre_key" ON "articulos"("nombre");
