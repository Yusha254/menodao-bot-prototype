ALTER TABLE "AdminUser"
ADD COLUMN IF NOT EXISTS "googleId" TEXT,
ADD COLUMN IF NOT EXISTS "authProvider" TEXT NOT NULL DEFAULT 'local';

UPDATE "AdminUser"
SET "authProvider" = 'local'
WHERE "authProvider" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "AdminUser_googleId_key"
ON "AdminUser"("googleId");
