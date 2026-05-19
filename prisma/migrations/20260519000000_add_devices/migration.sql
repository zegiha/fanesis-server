-- CreateTable
CREATE TABLE "devices" (
    "uuid"           UUID        NOT NULL DEFAULT gen_random_uuid(),
    "user_uuid"      UUID        NOT NULL,
    "push_token"     TEXT        NOT NULL,
    "device_name"    TEXT,
    "device_model"   TEXT,
    "app_version"    TEXT,
    "os_version"     TEXT,
    "is_active"      BOOLEAN     NOT NULL DEFAULT true,
    "last_active_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_push_token_key" ON "devices"("push_token");

-- CreateIndex (일반)
CREATE INDEX "idx_devices_user" ON "devices"("user_uuid");

-- CreateIndex (partial — Prisma 표현 불가, raw SQL 직접 작성)
CREATE INDEX "idx_devices_active_user"
  ON "devices"("user_uuid")
  WHERE is_active = TRUE;

-- AddForeignKey
ALTER TABLE "devices"
  ADD CONSTRAINT "devices_user_uuid_fkey"
  FOREIGN KEY ("user_uuid") REFERENCES "users"("uuid")
  ON DELETE CASCADE ON UPDATE CASCADE;
