-- AlterTable
ALTER TABLE "template_assets" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'source';

-- CreateIndex
CREATE INDEX "template_assets_template_id_kind_idx" ON "template_assets"("template_id", "kind");
