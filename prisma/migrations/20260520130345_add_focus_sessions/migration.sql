-- CreateEnum
CREATE TYPE "FocusSessionKind" AS ENUM ('focus', 'break');

-- CreateTable
CREATE TABLE "focus_sessions" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_uuid" UUID NOT NULL,
    "kind" "FocusSessionKind" NOT NULL,
    "task_uuid" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "focus_sessions_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "idx_focus_sessions_user_started" ON "focus_sessions"("user_uuid", "started_at" DESC);

-- AddForeignKey
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_user_uuid_fkey" FOREIGN KEY ("user_uuid") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_task_uuid_fkey" FOREIGN KEY ("task_uuid") REFERENCES "tasks"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK constraint: ended_at은 NULL 또는 started_at 이후
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_time_order"
  CHECK (ended_at IS NULL OR ended_at >= started_at);

-- Partial unique index: 사용자당 동시에 active 세션 1개만
CREATE UNIQUE INDEX "idx_focus_sessions_user_active"
  ON "focus_sessions"("user_uuid")
  WHERE ended_at IS NULL;

-- Partial index: task_uuid가 있는 행만 인덱싱 (역방향 조회 효율)
CREATE INDEX "idx_focus_sessions_task"
  ON "focus_sessions"("task_uuid")
  WHERE task_uuid IS NOT NULL;
