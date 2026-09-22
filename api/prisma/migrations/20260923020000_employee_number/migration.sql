ALTER TABLE "users" ADD COLUMN "employee_number" TEXT;

UPDATE "users"
SET "employee_number" = CASE "email"
  WHEN 'admin@example.com' THEN '100001'
  WHEN 'designer@example.com' THEN '100002'
  WHEN 'user@example.com' THEN '100003'
  WHEN 'ava.fernando@example.com' THEN '100004'
  WHEN 'ben.jayasuriya@example.com' THEN '100005'
  WHEN 'cara.silva@example.com' THEN '100006'
  WHEN 'diego.bandara@example.com' THEN '100007'
  WHEN 'elena.wickramasinghe@example.com' THEN '100008'
  WHEN 'randivranasinghe@gmail.com' THEN '100009'
  WHEN 'senirurandiv@gmail.com' THEN '100010'
  ELSE "employee_number"
END;

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS n
  FROM "users"
  WHERE "employee_number" IS NULL
)
UPDATE "users" AS u
SET "employee_number" = '19' || LPAD(numbered.n::text, 4, '0')
FROM numbered
WHERE u."id" = numbered."id";

ALTER TABLE "users" ALTER COLUMN "employee_number" SET NOT NULL;

CREATE UNIQUE INDEX "users_employee_number_key" ON "users"("employee_number");
