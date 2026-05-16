-- CreateEnum
CREATE TYPE "Language" AS ENUM ('ko', 'en');

-- CreateTable
CREATE TABLE "users" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT,
    "display_name" TEXT,
    "language" "Language" NOT NULL,
    "timezone" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("uuid"),
    CONSTRAINT email_format CHECK (
    email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    )
);

-- 활성 사용자에 대해서만 이메일 유니크 (탈퇴 후 재가입 허용)
CREATE UNIQUE INDEX idx_users_email_active ON users(lower(email)) 
  WHERE email IS NOT NULL AND deleted_at IS NULL;
