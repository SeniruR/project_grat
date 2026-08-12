-- CreateTable
CREATE TABLE IF NOT EXISTS "template_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "template_categories_name_key" ON "template_categories"("name");

DO $$ BEGIN
  ALTER TABLE "template_categories"
    ADD CONSTRAINT "template_categories_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "category_id" TEXT;

CREATE INDEX IF NOT EXISTS "templates_category_id_idx" ON "templates"("category_id");

DO $$ BEGIN
  ALTER TABLE "templates"
    ADD CONSTRAINT "templates_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "template_categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "draft_jobs" ADD COLUMN IF NOT EXISTS "category_name" TEXT;
