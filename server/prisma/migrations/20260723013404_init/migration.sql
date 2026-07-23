-- CreateEnum
CREATE TYPE "UnidadMedida" AS ENUM ('UNIDAD', 'KILOGRAMO', 'GRAMO', 'LITRO', 'MILILITRO', 'PORCION', 'CANASTILLA', 'CAJA');

-- CreateEnum
CREATE TYPE "EstadoInventario" AS ENUM ('BORRADOR', 'EN_AUDITORIA', 'CONCILIADO', 'ENVIADO_ERP');

-- CreateEnum
CREATE TYPE "TipoAlerta" AS ENUM ('ANOMALIA_CANTIDAD', 'STOCK_NEGATIVO', 'SKU_FALTANTE', 'UNIDAD_AMBIGUA');

-- CreateTable
CREATE TABLE "almacenes" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "almacenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articulos" (
    "id" TEXT NOT NULL,
    "sku" TEXT,
    "nombre" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categoria" TEXT NOT NULL,
    "unidadEstd" "UnidadMedida" NOT NULL,
    "esProcesado" BOOLEAN NOT NULL DEFAULT false,
    "stockHistoricoAvg" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articulos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventarios" (
    "id" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "auditorId" TEXT,
    "estado" "EstadoInventario" NOT NULL DEFAULT 'BORRADOR',
    "fechaCorte" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_inventario" (
    "id" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "teorico" DOUBLE PRECISION NOT NULL,
    "conteoFisico" DOUBLE PRECISION NOT NULL,
    "unidadUsada" "UnidadMedida" NOT NULL,
    "esAnomalia" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas_inventario" (
    "id" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "itemInventarioId" TEXT,
    "tipo" "TipoAlerta" NOT NULL,
    "mensaje" TEXT NOT NULL,
    "resuelto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertas_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recetas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "porciones" INTEGER NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "almacenes_codigo_key" ON "almacenes"("codigo");

-- CreateIndex
CREATE INDEX "almacenes_unidad_idx" ON "almacenes"("unidad");

-- CreateIndex
CREATE INDEX "articulos_sku_idx" ON "articulos"("sku");

-- CreateIndex
CREATE INDEX "articulos_nombre_idx" ON "articulos"("nombre");

-- CreateIndex
CREATE INDEX "inventarios_almacenId_idx" ON "inventarios"("almacenId");

-- CreateIndex
CREATE INDEX "inventarios_estado_idx" ON "inventarios"("estado");

-- CreateIndex
CREATE INDEX "items_inventario_inventarioId_idx" ON "items_inventario"("inventarioId");

-- CreateIndex
CREATE INDEX "items_inventario_articuloId_idx" ON "items_inventario"("articuloId");

-- CreateIndex
CREATE INDEX "alertas_inventario_inventarioId_idx" ON "alertas_inventario"("inventarioId");

-- CreateIndex
CREATE INDEX "alertas_inventario_tipo_idx" ON "alertas_inventario"("tipo");

-- CreateIndex
CREATE INDEX "receta_items_recetaId_idx" ON "receta_items"("recetaId");

-- CreateIndex
CREATE INDEX "receta_items_articuloId_idx" ON "receta_items"("articuloId");

-- AddForeignKey
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_inventario" ADD CONSTRAINT "items_inventario_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "inventarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_inventario" ADD CONSTRAINT "items_inventario_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas_inventario" ADD CONSTRAINT "alertas_inventario_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "inventarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas_inventario" ADD CONSTRAINT "alertas_inventario_itemInventarioId_fkey" FOREIGN KEY ("itemInventarioId") REFERENCES "items_inventario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receta_items" ADD CONSTRAINT "receta_items_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "recetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receta_items" ADD CONSTRAINT "receta_items_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
