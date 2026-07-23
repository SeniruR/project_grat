-- CreateTable
CREATE TABLE "template_assets" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_assets_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "template_assets" ADD CONSTRAINT "template_assets_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
