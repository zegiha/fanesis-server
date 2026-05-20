-- CreateEnum
CREATE TYPE "RoutineRepeatKind" AS ENUM ('day_of_week', 'week', 'day');

-- CreateTable
CREATE TABLE "routines" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_uuid" UUID NOT NULL,
    "lineage_uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "repeat_kind" "RoutineRepeatKind" NOT NULL,
    "repeat_weekdays" SMALLINT[],
    "repeat_interval" INTEGER,
    "anchor_date" DATE NOT NULL,
    "start_time" TIME(6) NOT NULL,
    "duration_sec" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "routines_pkey" PRIMARY KEY ("uuid"),
    CONSTRAINT "routines_title_length" CHECK (length(title) > 0 AND length(title) <= 200),
    CONSTRAINT "routines_duration_positive" CHECK (duration_sec > 0),
    -- day_of_week ↔ weekdays(1~7, 1~7개) / week,day ↔ interval(양수). 빈 배열 또는 NULL은 "없음"으로 동일하게 처리.
    CONSTRAINT "repeat_data_consistency" CHECK (
        (repeat_kind = 'day_of_week'
            AND repeat_weekdays IS NOT NULL
            AND array_length(repeat_weekdays, 1) BETWEEN 1 AND 7
            AND repeat_interval IS NULL)
        OR
        (repeat_kind IN ('week', 'day')
            AND repeat_interval IS NOT NULL
            AND repeat_interval > 0
            AND (repeat_weekdays IS NULL OR array_length(repeat_weekdays, 1) IS NULL))
    ),
    CONSTRAINT "repeat_weekdays_valid" CHECK (
        repeat_weekdays IS NULL OR repeat_weekdays <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]
    )
);

-- CreateIndex
CREATE INDEX "idx_routines_user" ON "routines"("user_uuid");

-- CreateIndex
CREATE INDEX "idx_routines_user_lineage" ON "routines"("user_uuid", "lineage_uuid");

-- AddForeignKey
ALTER TABLE "routines" ADD CONSTRAINT "routines_user_uuid_fkey" FOREIGN KEY ("user_uuid") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
