-- Convierte el dominio de single-tenant a multi-tenant: toda fila de negocio
-- pasa a pertenecer a una Organizacion.
--
-- El SQL generado por Prisma NO se puede aplicar tal cual: agrega
-- `organizacionId` como NOT NULL sin default sobre tablas que ya tienen datos
-- (48 almacenes, 938 artículos, 3 usuarios de la instalación existente). Por
-- eso este archivo está escrito a mano, en el orden seguro:
--   columna nullable -> backfill -> SET NOT NULL -> constraints.
-- Así la migración es reversible en la práctica y no pierde ni una fila.

-- CreateEnum
CREATE TYPE "PlanOrganizacion" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateTable
CREATE TABLE "organizaciones" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "PlanOrganizacion" NOT NULL DEFAULT 'FREE',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizaciones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizaciones_slug_key" ON "organizaciones"("slug");

-- La organización que hereda TODO lo que existía antes de la migración.
-- El id es un literal estable (no un cuid generado) a propósito: el seed, los
-- scripts CLI y los fixtures de e2e lo referencian por constante, en vez de
-- tener que resolverlo por nombre en cada arranque.
-- Ver ORGANIZACION_LEGADO_ID en src/prisma/organizacion-legado.ts.
INSERT INTO "organizaciones" ("id", "nombre", "slug", "plan", "createdAt", "updatedAt")
VALUES ('org-colsubsidio-legacy', 'Colsubsidio', 'colsubsidio', 'ENTERPRISE', now(), now())
ON CONFLICT ("id") DO NOTHING;

-- Paso 1: columnas NULLABLE, para poder rellenarlas antes de exigirlas.
ALTER TABLE "usuarios"           ADD COLUMN "organizacionId" TEXT;
ALTER TABLE "almacenes"          ADD COLUMN "organizacionId" TEXT;
ALTER TABLE "articulos"          ADD COLUMN "organizacionId" TEXT;
ALTER TABLE "inventarios"        ADD COLUMN "organizacionId" TEXT;
ALTER TABLE "items_inventario"   ADD COLUMN "organizacionId" TEXT;
ALTER TABLE "alertas_inventario" ADD COLUMN "organizacionId" TEXT;

-- Paso 2: backfill. Todo lo preexistente pertenece a la organización de legado.
UPDATE "usuarios"           SET "organizacionId" = 'org-colsubsidio-legacy' WHERE "organizacionId" IS NULL;
UPDATE "almacenes"          SET "organizacionId" = 'org-colsubsidio-legacy' WHERE "organizacionId" IS NULL;
UPDATE "articulos"          SET "organizacionId" = 'org-colsubsidio-legacy' WHERE "organizacionId" IS NULL;
UPDATE "inventarios"        SET "organizacionId" = 'org-colsubsidio-legacy' WHERE "organizacionId" IS NULL;
-- Estos dos son desnormalizaciones: se derivan del inventario padre, pero se
-- materializan para que las policies de RLS puedan evaluarse sin join.
UPDATE "items_inventario" i
   SET "organizacionId" = inv."organizacionId"
  FROM "inventarios" inv
 WHERE inv."id" = i."inventarioId" AND i."organizacionId" IS NULL;
UPDATE "alertas_inventario" a
   SET "organizacionId" = inv."organizacionId"
  FROM "inventarios" inv
 WHERE inv."id" = a."inventarioId" AND a."organizacionId" IS NULL;

-- Paso 3: ya sin NULLs, exigir la columna.
ALTER TABLE "usuarios"           ALTER COLUMN "organizacionId" SET NOT NULL;
ALTER TABLE "almacenes"          ALTER COLUMN "organizacionId" SET NOT NULL;
ALTER TABLE "articulos"          ALTER COLUMN "organizacionId" SET NOT NULL;
ALTER TABLE "inventarios"        ALTER COLUMN "organizacionId" SET NOT NULL;
ALTER TABLE "items_inventario"   ALTER COLUMN "organizacionId" SET NOT NULL;
ALTER TABLE "alertas_inventario" ALTER COLUMN "organizacionId" SET NOT NULL;

-- Paso 4: las claves de negocio dejan de ser únicas GLOBALMENTE y pasan a
-- serlo DENTRO de cada organización — dos clientes pueden tener el mismo SKU,
-- el mismo nombre de artículo o el mismo código de bodega sin colisionar.
DROP INDEX "almacenes_codigo_key";
DROP INDEX "articulos_nombre_key";
DROP INDEX "articulos_sku_key";

CREATE UNIQUE INDEX "almacenes_organizacionId_codigo_key" ON "almacenes"("organizacionId", "codigo");
CREATE UNIQUE INDEX "articulos_organizacionId_sku_key" ON "articulos"("organizacionId", "sku");
CREATE UNIQUE INDEX "articulos_organizacionId_nombre_key" ON "articulos"("organizacionId", "nombre");

-- NOTA: "alertas_inventario_activa_unica_idx" (índice único PARCIAL, ver la
-- migración _alerta_activa_unica_index) NO se toca y NO necesita
-- `organizacionId`: su clave es (itemInventarioId, tipo), y itemInventarioId
-- es un cuid único a nivel global, así que ya es inequívoca entre
-- organizaciones. Lo mismo aplica a items_inventario(inventarioId, articuloId).

CREATE INDEX "usuarios_organizacionId_idx"           ON "usuarios"("organizacionId");
CREATE INDEX "almacenes_organizacionId_idx"          ON "almacenes"("organizacionId");
CREATE INDEX "articulos_organizacionId_idx"          ON "articulos"("organizacionId");
CREATE INDEX "inventarios_organizacionId_idx"        ON "inventarios"("organizacionId");
CREATE INDEX "items_inventario_organizacionId_idx"   ON "items_inventario"("organizacionId");
CREATE INDEX "alertas_inventario_organizacionId_idx" ON "alertas_inventario"("organizacionId");

-- Paso 5: integridad referencial. ON DELETE CASCADE = dar de baja a un cliente
-- borra sus datos; es el comportamiento que se espera de un SaaS.
ALTER TABLE "usuarios"           ADD CONSTRAINT "usuarios_organizacionId_fkey"           FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "almacenes"          ADD CONSTRAINT "almacenes_organizacionId_fkey"          FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "articulos"          ADD CONSTRAINT "articulos_organizacionId_fkey"          FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventarios"        ADD CONSTRAINT "inventarios_organizacionId_fkey"        FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "items_inventario"   ADD CONSTRAINT "items_inventario_organizacionId_fkey"   FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alertas_inventario" ADD CONSTRAINT "alertas_inventario_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La tabla nueva queda cubierta por el ALTER DEFAULT PRIVILEGES de la
-- migración _rol_aplicacion_sin_privilegios, pero se concede explícito para
-- que esta migración sea autocontenida y no dependa del orden de aplicación.
GRANT SELECT, INSERT, UPDATE, DELETE ON "organizaciones" TO invencheck_app;
