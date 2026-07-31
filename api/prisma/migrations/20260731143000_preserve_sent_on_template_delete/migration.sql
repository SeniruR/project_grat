-- Preserve send history when templates are deleted.

-- Snapshot columns (backfill from joined template when possible)
ALTER TABLE "draft_jobs" ADD COLUMN IF NOT EXISTS "template_name" TEXT NOT NULL DEFAULT 'Deleted template';
ALTER TABLE "draft_jobs" ADD COLUMN IF NOT EXISTS "template_version_number" INTEGER;

UPDATE "draft_jobs" dj
SET
  "template_name" = COALESCE(t."name", 'Deleted template'),
  "template_version_number" = tv."version"
FROM "templates" t, "template_versions" tv
WHERE dj."template_id" = t."id"
  AND dj."template_version_id" = tv."id";

-- Drop cascade FKs
ALTER TABLE "draft_jobs" DROP CONSTRAINT IF EXISTS "draft_jobs_template_id_fkey";
ALTER TABLE "draft_jobs" DROP CONSTRAINT IF EXISTS "draft_jobs_template_version_id_fkey";

-- Allow null refs after template/version delete
ALTER TABLE "draft_jobs" ALTER COLUMN "template_id" DROP NOT NULL;
ALTER TABLE "draft_jobs" ALTER COLUMN "template_version_id" DROP NOT NULL;

ALTER TABLE "draft_jobs"
  ADD CONSTRAINT "draft_jobs_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "templates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "draft_jobs"
  ADD CONSTRAINT "draft_jobs_template_version_id_fkey"
  FOREIGN KEY ("template_version_id") REFERENCES "template_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
