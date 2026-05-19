-- CreateTable
CREATE TABLE "canvases" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_uuid" UUID NOT NULL,
    "date" DATE NOT NULL,
    "storage_key" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1.init',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canvases_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "task_canvas_sources" (
    "task_uuid" UUID NOT NULL,
    "canvas_uuid" UUID,
    "source_key" TEXT NOT NULL,
    "ocr_text" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_canvas_sources_pkey" PRIMARY KEY ("task_uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "canvases_user_uuid_date_key" ON "canvases"("user_uuid", "date");

-- CreateIndex
CREATE UNIQUE INDEX "task_canvas_sources_source_key_key" ON "task_canvas_sources"("source_key");

-- AddForeignKey
ALTER TABLE "canvases" ADD CONSTRAINT "canvases_user_uuid_fkey" FOREIGN KEY ("user_uuid") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_canvas_sources" ADD CONSTRAINT "task_canvas_sources_task_uuid_fkey" FOREIGN KEY ("task_uuid") REFERENCES "tasks"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_canvas_sources" ADD CONSTRAINT "task_canvas_sources_canvas_uuid_fkey" FOREIGN KEY ("canvas_uuid") REFERENCES "canvases"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex (composite with DESC — Prisma cannot express sort direction)
CREATE INDEX "idx_canvases_user_updated" ON "canvases"("user_uuid", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_canvases_user_date" ON "canvases"("user_uuid", "date");

-- CreateIndex (partial — Prisma cannot express WHERE clause)
CREATE INDEX "idx_task_canvas_sources_canvas" ON "task_canvas_sources"("canvas_uuid") WHERE canvas_uuid IS NOT NULL;
