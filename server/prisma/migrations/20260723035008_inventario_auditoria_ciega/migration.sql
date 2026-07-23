-- AlterTable
ALTER TABLE "inventarios" ADD COLUMN     "auditaAId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "inventarios_auditaAId_key" ON "inventarios"("auditaAId");

-- AddForeignKey
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_auditaAId_fkey" FOREIGN KEY ("auditaAId") REFERENCES "inventarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
