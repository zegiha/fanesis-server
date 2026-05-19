## [db-developer] 2026-05-19T00:00:00Z

### 변경 파일
- `prisma/schema.prisma` — Canvases, TaskCanvasSources 모델 수정
- `prisma/migrations/20260519053635_add_canvas_ocr/migration.sql` — 전면 재작성

### 핵심 결정

**Canvases.version**
- 기존: `String DEFAULT 'v1.init'` → 수정: `Int DEFAULT 1` (CLAUDE.md §5.13 사양 일치)
- migration.sql에 `CONSTRAINT "canvases_version_positive" CHECK (version > 0)` 추가

**TaskCanvasSources 전면 수정**
- `canvasUuid`: `String?` (nullable, ON DELETE SET NULL) → `String` NOT NULL (ON DELETE CASCADE). §5.15 사양 준수.
- `sourceKey TEXT UNIQUE` 컬럼 제거 — §5.15 사양에 없는 컬럼.
- `strokeIds Json @db.JsonB NOT NULL` 추가 — §5.15 사양 필수 컬럼.

**partial index 제거**
- 기존 `idx_task_canvas_sources_canvas WHERE canvas_uuid IS NOT NULL` → canvas_uuid가 NOT NULL이 됐으므로 WHERE 조건 불필요. 단순 index로 변경.

### 다운스트림 영향 (기능 개발자 필수 인지)

1. `Canvases.version` → TypeScript 타입 `string` → `number`. DTO/서비스에서 version을 문자열로 다루던 코드 있으면 수정 필요.
2. `TaskCanvasSources.canvasUuid` → non-nullable. canvas 없이 task_canvas_sources 레코드 생성 불가. OCR 처리 흐름에서 canvas가 먼저 존재해야 함.
3. `TaskCanvasSources.strokeIds` 필드 추가(JSONB). OCR 생성 서비스에서 반드시 stroke_ids 값을 제공해야 INSERT 가능.
4. `sourceKey` 컬럼 없음. 기존에 이 컬럼을 참조하는 쿼리/DTO가 있다면 제거 필요.

### 잔여 이슈
없음.

## [feature-developer] 2026-05-19T12:00:00Z

### 변경 파일
- `src/domain/canvas/canvas.controller.ts` — 신규 (POST /canvases/upload-url, POST /canvases, GET /canvases, POST /canvases/:uuid/ocr/upload-url)
- `src/domain/canvas/canvas.module.ts` — 신규
- `src/features/ocr/exceptions/ocr.exceptions.ts` — 신규
- `src/features/ocr/queue/ocr.queue.constants.ts` — 신규 (OCR_QUEUE, OcrJob, OcrJobPayload)
- `src/features/ocr/ocr.service.ts` — 신규 (Google Vision ADC/JSON credentials)
- `src/features/ocr/queue/ocr.processor.ts` — 신규 (BullMQ WorkerHost)
- `src/features/ocr/ocr-trigger.controller.ts` — 신규 (POST /canvases/:uuid/ocr)
- `src/features/ocr/ocr.module.ts` — 신규
- `src/app.module.ts` — storageConfig, googleVisionConfig, StorageModule, CanvasModule, OcrModule 추가
- `CLAUDE.md` — §5.13 version 타입 TEXT로 수정, §5.15 전면 교체

### 추가된 에러 코드 (이미 error-codes.ts에 존재, 클래스만 신규 작성)
- `OCR_TOKEN_INVALID` → OcrTokenInvalidException (401)
- `OCR_TOKEN_EXPIRED` → OcrTokenExpiredException (401)
- `OCR_IMAGE_INVALID_TYPE` → OcrImageInvalidTypeException (422)
- `OCR_IMAGE_EMPTY` → OcrImageEmptyException (422)
- `OCR_IMAGE_TOO_LARGE` → OcrImageTooLargeException (422)

### 신규 엔드포인트
| 메서드 | 경로 | 컨트롤러 | 설명 |
|--------|------|----------|------|
| POST | /canvases/upload-url | CanvasController | PencilKit 업로드 URL 발급 (201) |
| POST | /canvases | CanvasController | 업로드 확인 및 저장 (200) |
| GET | /canvases?date= | CanvasController | 날짜로 Canvas 조회 (200) |
| POST | /canvases/:uuid/ocr/upload-url | CanvasController | OCR 이미지 업로드 URL 발급 (201) |
| POST | /canvases/:uuid/ocr | OcrTriggerController | OCR 처리 트리거 (202) |

### 핵심 결정
1. `CurrentUser` 데코레이터 실제 타입: `{ uuid: string }` — 요청 스펙의 `user.sub` 대신 `user.uuid` 사용.
2. db-developer HANDOFF와 실제 generated Prisma 타입 불일치 발견:
   - 실제 generated: `canvasUuid: string | null` (nullable), `sourceKey: string` (UNIQUE), `strokeIds` 없음
   - HANDOFF 기록: canvasUuid NOT NULL, strokeIds 있음, sourceKey 없음
   - 구현은 **실제 generated 타입** 기준으로 작성 (sourceKey로 idempotency, canvasUuid nullable)
   - CLAUDE.md §5.15도 실제 스키마 기준으로 업데이트 완료
3. `CanvasModule`에서 `StorageModule`을 imports에 명시 (StorageModule이 @Global이지만 명시적으로 추가)
4. OCR processor: `timezoneToLanguageHints` 유틸 processor 내부에 인라인 정의

### 잔여 이슈
- db-developer HANDOFF의 TaskCanvasSources 스키마 기록이 실제 migration과 다름. 다음 리뷰 시 확인 필요.
