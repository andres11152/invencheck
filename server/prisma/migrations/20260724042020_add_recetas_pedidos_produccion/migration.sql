-- CreateTable
CREATE TABLE "recetas" (
    "id" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "porcionesBase" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receta_items" (
    "id" TEXT NOT NULL,
    "recetaId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "cantidadPorPorcion" DOUBLE PRECISION NOT NULL,
    "unidad" "UnidadMedida" NOT NULL,

    CONSTRAINT "receta_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "numeroOrden" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_items" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "unidad" "UnidadMedida" NOT NULL,

    CONSTRAINT "pedido_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producciones_receta" (
    "id" TEXT NOT NULL,
    "recetaId" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "inventarioId" TEXT,
    "porciones" DOUBLE PRECISION NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producciones_receta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produccion_insumos_consumidos" (
    "id" TEXT NOT NULL,
    "produccionId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "cantidadConsumida" DOUBLE PRECISION NOT NULL,
    "unidad" "UnidadMedida" NOT NULL,

    CONSTRAINT "produccion_insumos_consumidos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recetas_articuloId_key" ON "recetas"("articuloId");

-- CreateIndex
CREATE INDEX "receta_items_recetaId_idx" ON "receta_items"("recetaId");

-- CreateIndex
CREATE INDEX "receta_items_articuloId_idx" ON "receta_items"("articuloId");

-- CreateIndex
CREATE INDEX "pedidos_almacenId_idx" ON "pedidos"("almacenId");

-- CreateIndex
CREATE INDEX "pedidos_fecha_idx" ON "pedidos"("fecha");

-- CreateIndex
CREATE INDEX "pedido_items_pedidoId_idx" ON "pedido_items"("pedidoId");

-- CreateIndex
CREATE INDEX "pedido_items_articuloId_idx" ON "pedido_items"("articuloId");

-- CreateIndex
CREATE INDEX "producciones_receta_recetaId_idx" ON "producciones_receta"("recetaId");

-- CreateIndex
CREATE INDEX "producciones_receta_almacenId_idx" ON "producciones_receta"("almacenId");

-- CreateIndex
CREATE INDEX "producciones_receta_createdAt_idx" ON "producciones_receta"("createdAt");

-- CreateIndex
CREATE INDEX "produccion_insumos_consumidos_produccionId_idx" ON "produccion_insumos_consumidos"("produccionId");

-- CreateIndex
CREATE INDEX "produccion_insumos_consumidos_articuloId_idx" ON "produccion_insumos_consumidos"("articuloId");

-- AddForeignKey
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receta_items" ADD CONSTRAINT "receta_items_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "recetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receta_items" ADD CONSTRAINT "receta_items_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producciones_receta" ADD CONSTRAINT "producciones_receta_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "recetas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producciones_receta" ADD CONSTRAINT "producciones_receta_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producciones_receta" ADD CONSTRAINT "producciones_receta_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "inventarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produccion_insumos_consumidos" ADD CONSTRAINT "produccion_insumos_consumidos_produccionId_fkey" FOREIGN KEY ("produccionId") REFERENCES "producciones_receta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produccion_insumos_consumidos" ADD CONSTRAINT "produccion_insumos_consumidos_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
