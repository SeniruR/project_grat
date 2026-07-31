-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DESIGNER';

-- CreateTable
CREATE TABLE IF NOT EXISTS "template_favorites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "template_favorites_user_id_idx" ON "template_favorites"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "template_favorites_user_id_template_id_key" ON "template_favorites"("user_id", "template_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "template_favorites" ADD CONSTRAINT "template_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "template_favorites" ADD CONSTRAINT "template_favorites_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
