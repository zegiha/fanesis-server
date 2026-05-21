-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'expired');

-- CreateEnum
CREATE TYPE "SubscriptionPlatform" AS ENUM ('ios', 'android', 'web');

-- CreateEnum
CREATE TYPE "SubscriptionEventKind" AS ENUM ('trial_started', 'trial_converted', 'renewed', 'canceled', 'refunded', 'expired', 'reactivated');

-- CreateTable
CREATE TABLE "subscriptions" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_uuid" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "platform" "SubscriptionPlatform" NOT NULL,
    "trial_start_at" TIMESTAMPTZ(6),
    "trial_end_at" TIMESTAMPTZ(6),
    "current_period_start" TIMESTAMPTZ(6),
    "current_period_end" TIMESTAMPTZ(6),
    "external_product_id" TEXT,
    "external_transaction_id" TEXT,
    "canceled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_uuid" UUID NOT NULL,
    "user_uuid" UUID NOT NULL,
    "kind" "SubscriptionEventKind" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "idx_subscriptions_user" ON "subscriptions"("user_uuid");

-- CreateIndex
CREATE INDEX "idx_sub_events_subscription" ON "subscription_events"("subscription_uuid");

-- CreateIndex
CREATE INDEX "idx_sub_events_user_kind" ON "subscription_events"("user_uuid", "kind");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_uuid_fkey" FOREIGN KEY ("user_uuid") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_uuid_fkey" FOREIGN KEY ("subscription_uuid") REFERENCES "subscriptions"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_user_uuid_fkey" FOREIGN KEY ("user_uuid") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- 활성 구독 1개 부분 unique (trialing·active·past_due 상태에서 user당 1개만 허용)
CREATE UNIQUE INDEX "idx_subscriptions_user_active"
  ON "subscriptions"("user_uuid")
  WHERE status IN ('trialing', 'active', 'past_due');

-- trial 날짜 일관성 CHECK
ALTER TABLE "subscriptions" ADD CONSTRAINT "trial_dates" CHECK (
  (trial_start_at IS NULL AND trial_end_at IS NULL) OR
  (trial_start_at IS NOT NULL AND trial_end_at IS NOT NULL
   AND trial_end_at > trial_start_at)
);

-- trial 만료 추적 인덱스
CREATE INDEX "idx_subscriptions_trial_end" ON "subscriptions"("trial_end_at")
  WHERE status = 'trialing';
