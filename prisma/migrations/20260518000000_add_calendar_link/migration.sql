-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('google');

-- CreateTable
CREATE TABLE "calendar_integrations" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_uuid" UUID NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "provider_email" TEXT NOT NULL,
    "access_token_encrypted" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT NOT NULL,
    "token_expires_at" TIMESTAMPTZ NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_integrations_pkey" PRIMARY KEY ("uuid")
);

CREATE INDEX "idx_calendar_integrations_user" ON "calendar_integrations"("user_uuid");
CREATE UNIQUE INDEX "calendar_integrations_user_provider_account_key"
  ON "calendar_integrations"("user_uuid", "provider", "provider_account_id");

ALTER TABLE "calendar_integrations"
  ADD CONSTRAINT "calendar_integrations_user_uuid_fkey"
  FOREIGN KEY ("user_uuid") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "calendar_synced_calendars" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "integration_uuid" UUID NOT NULL,
    "external_calendar_id" TEXT NOT NULL,
    "summary" TEXT,
    "sync_token" TEXT,
    "last_synced_at" TIMESTAMPTZ,
    "webhook_channel_id" TEXT,
    "webhook_resource_id" TEXT,
    "webhook_expires_at" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_synced_calendars_pkey" PRIMARY KEY ("uuid")
);

CREATE INDEX "idx_synced_calendars_integration" ON "calendar_synced_calendars"("integration_uuid");
CREATE UNIQUE INDEX "calendar_synced_calendars_integration_external_key"
  ON "calendar_synced_calendars"("integration_uuid", "external_calendar_id");
CREATE UNIQUE INDEX "calendar_synced_calendars_webhook_channel_id_key"
  ON "calendar_synced_calendars"("webhook_channel_id");
-- partial index for cron lookup of channels nearing expiration
CREATE INDEX "idx_synced_calendars_webhook_expiry"
  ON "calendar_synced_calendars"("webhook_expires_at")
  WHERE webhook_channel_id IS NOT NULL;

ALTER TABLE "calendar_synced_calendars"
  ADD CONSTRAINT "calendar_synced_calendars_integration_uuid_fkey"
  FOREIGN KEY ("integration_uuid") REFERENCES "calendar_integrations"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "task_external_links" (
    "task_uuid" UUID NOT NULL,
    "synced_calendar_uuid" UUID NOT NULL,
    "external_event_id" TEXT NOT NULL,
    "external_etag" TEXT,
    "last_synced_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_external_links_pkey" PRIMARY KEY ("task_uuid")
);

CREATE INDEX "idx_task_external_links_calendar" ON "task_external_links"("synced_calendar_uuid");
CREATE UNIQUE INDEX "task_external_links_calendar_event_key"
  ON "task_external_links"("synced_calendar_uuid", "external_event_id");

ALTER TABLE "task_external_links"
  ADD CONSTRAINT "task_external_links_task_uuid_fkey"
  FOREIGN KEY ("task_uuid") REFERENCES "tasks"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_external_links"
  ADD CONSTRAINT "task_external_links_synced_calendar_uuid_fkey"
  FOREIGN KEY ("synced_calendar_uuid") REFERENCES "calendar_synced_calendars"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
