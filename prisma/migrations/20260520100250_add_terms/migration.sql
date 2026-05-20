-- CreateEnum
CREATE TYPE "TermsKind" AS ENUM ('service', 'privacy', 'marketing');

-- CreateTable
CREATE TABLE "terms" (
    "uuid"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "kind"         "TermsKind" NOT NULL,
    "version"      INTEGER     NOT NULL CHECK (version > 0),
    "is_required"  BOOLEAN     NOT NULL,
    "effective_at" TIMESTAMPTZ NOT NULL,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "terms_pkey" PRIMARY KEY ("uuid"),
    UNIQUE ("kind", "version")
);

-- CreateIndex
CREATE INDEX "idx_terms_kind_version" ON "terms"("kind", "version" DESC);

-- CreateTable
CREATE TABLE "terms_contents" (
    "terms_uuid" UUID       NOT NULL,
    "language"   "Language" NOT NULL,
    "content"    TEXT       NOT NULL CHECK (length(content) > 0),

    CONSTRAINT "terms_contents_pkey" PRIMARY KEY ("terms_uuid", "language")
);

-- AddForeignKey
ALTER TABLE "terms_contents"
    ADD CONSTRAINT "terms_contents_terms_uuid_fkey"
    FOREIGN KEY ("terms_uuid") REFERENCES "terms"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "terms_agreements" (
    "uuid"       UUID        NOT NULL DEFAULT gen_random_uuid(),
    "user_uuid"  UUID        NOT NULL,
    "terms_uuid" UUID        NOT NULL,
    "agreed"     BOOLEAN     NOT NULL,
    "agreed_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "ip_address" INET,
    "user_agent" TEXT,

    CONSTRAINT "terms_agreements_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "idx_terms_agreements_user" ON "terms_agreements"("user_uuid");

-- CreateIndex
CREATE INDEX "idx_terms_agreements_terms" ON "terms_agreements"("terms_uuid");

-- CreateIndex
CREATE INDEX "idx_terms_agreements_user_agreed_at" ON "terms_agreements"("user_uuid", "agreed_at" DESC);

-- AddForeignKey
ALTER TABLE "terms_agreements"
    ADD CONSTRAINT "terms_agreements_user_uuid_fkey"
    FOREIGN KEY ("user_uuid") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_agreements"
    ADD CONSTRAINT "terms_agreements_terms_uuid_fkey"
    FOREIGN KEY ("terms_uuid") REFERENCES "terms"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
