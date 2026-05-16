-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('google', 'apple');

-- CreateTable
CREATE TABLE "oauth_identities" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_uuid" UUID NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "provider_email" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_identities_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "idx_oauth_user" ON "oauth_identities"("user_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_identities_provider_provider_user_id_key" ON "oauth_identities"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_identities_user_uuid_provider_key" ON "oauth_identities"("user_uuid", "provider");

-- AddForeignKey
ALTER TABLE "oauth_identities" ADD CONSTRAINT "oauth_identities_user_uuid_fkey" FOREIGN KEY ("user_uuid") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
