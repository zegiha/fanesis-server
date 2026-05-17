-- CreateEnum
CREATE TYPE "AccentColorKey" AS ENUM ('red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "TaskBacklogKind" AS ENUM ('inbox', 'folder');

-- CreateEnum
CREATE TYPE "TaskActiveKind" AS ENUM ('todo', 'big3');

-- CreateEnum
CREATE TYPE "TaskTimeboxKind" AS ENUM ('timeline');

-- CreateEnum
CREATE TYPE "TaskAffiliation" AS ENUM ('google');

-- CreateTable
CREATE TABLE "folders" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_uuid" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" "AccentColorKey" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("uuid"),
    CONSTRAINT "folders_name_length" CHECK (length(name) > 0 AND length(name) <= 100)
);

-- CreateIndex
CREATE INDEX "idx_folders_user" ON "folders"("user_uuid");

-- 동일 유저 내 폴더명 대소문자 무시 unique
CREATE UNIQUE INDEX "idx_folders_user_name" ON "folders"("user_uuid", lower("name"));

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_user_uuid_fkey" FOREIGN KEY ("user_uuid") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "tasks" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_uuid" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "priority" "TaskPriority",
    "affiliation" "TaskAffiliation",
    "backlog_kind" "TaskBacklogKind" NOT NULL,
    "backlog_folder_id" UUID,
    "active_kind" "TaskActiveKind",
    "timebox_kind" "TaskTimeboxKind",
    "scheduled_date" DATE,
    "start_time" TIME(6),
    "duration_sec" INTEGER,
    "chunk_sec" INTEGER,
    "break_sec" INTEGER,
    "done_date" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("uuid"),
    CONSTRAINT "duration_sec_positive" CHECK (duration_sec IS NULL OR duration_sec > 0),
    CONSTRAINT "chunk_sec_positive" CHECK (chunk_sec IS NULL OR chunk_sec > 0),
    CONSTRAINT "break_sec_nonnegative" CHECK (break_sec IS NULL OR break_sec >= 0),
    CONSTRAINT "backlog_folder_consistency" CHECK (
        (backlog_kind = 'folder' AND backlog_folder_id IS NOT NULL) OR
        (backlog_kind = 'inbox' AND backlog_folder_id IS NULL)
    ),
    CONSTRAINT "timebox_requires_active" CHECK (
        timebox_kind IS NULL OR active_kind IS NOT NULL
    ),
    CONSTRAINT "chunk_within_duration" CHECK (
        chunk_sec IS NULL OR duration_sec IS NULL OR chunk_sec <= duration_sec
    ),
    CONSTRAINT "chunk_break_paired" CHECK (
        (chunk_sec IS NULL AND break_sec IS NULL) OR (chunk_sec IS NOT NULL)
    ),
    CONSTRAINT "big3_requires_date" CHECK (
        active_kind IS NULL OR active_kind != 'big3' OR scheduled_date IS NOT NULL
    )
);

-- CreateIndex
CREATE INDEX "idx_tasks_user" ON "tasks"("user_uuid");

-- 스케줄된 task만 인덱싱 (날짜 조회 가속)
CREATE INDEX "idx_tasks_user_scheduled" ON "tasks"("user_uuid", "scheduled_date")
  WHERE "scheduled_date" IS NOT NULL;

-- active 단계인 task만 인덱싱
CREATE INDEX "idx_tasks_user_active" ON "tasks"("user_uuid", "active_kind")
  WHERE "active_kind" IS NOT NULL;

-- 폴더가 있는 task만 인덱싱
CREATE INDEX "idx_tasks_folder" ON "tasks"("backlog_folder_id")
  WHERE "backlog_folder_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_uuid_fkey" FOREIGN KEY ("user_uuid") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_backlog_folder_id_fkey" FOREIGN KEY ("backlog_folder_id") REFERENCES "folders"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- Folder 삭제 시 해당 task들을 inbox로 reset (FK는 SET NULL이지만 backlog_kind도 함께 'inbox'로 변경해야 CHECK 통과)
CREATE OR REPLACE FUNCTION reset_task_to_inbox_on_folder_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tasks
     SET backlog_kind = 'inbox',
         backlog_folder_id = NULL,
         updated_at = NOW()
   WHERE backlog_folder_id = OLD.uuid;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_folder_delete_reset_tasks
BEFORE DELETE ON folders
FOR EACH ROW
EXECUTE FUNCTION reset_task_to_inbox_on_folder_delete();
