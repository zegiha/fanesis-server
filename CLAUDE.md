# Fanesis Server — Claude 개발 가이드

이 문서는 Claude가 fanesis-server 코드를 작성할 때 따라야 할 컨벤션과 워크플로우 진입점이다.

> **새 기능 개발 시 워크플로우:** main에게 작업을 요청하면 먼저 **S/M/L 크기**를 묻는다. 자세한 흐름은 [`claude-code-backend-flow.md`](./claude-code-backend-flow.md) 참조.
> **상세 코드 규약**(폴더 구조 / 에러 처리 / Swagger / 테스트 / 체크리스트)은 [`.claude/skills/nestjs-conventions/SKILL.md`](./.claude/skills/nestjs-conventions/SKILL.md)에 분리돼 있다. 본 문서는 **DB 모델 정의(§5)와 글로벌 예외 필터 사양(§6)에 집중**한다.

---

## 1. 프로젝트 개요

- **스택**: NestJS + Prisma(PostgreSQL) — Swift 클라이언트용 백엔드
- **패키지 매니저**: `pnpm`
- **주요 명령어**
  - `pnpm run start:dev` — 개발 서버 (watch 모드)
  - `pnpm run lint` — ESLint
  - `pnpm run test` — 단위 테스트
  - `pnpm run test:e2e` — e2e
  - `pnpm dlx prisma migrate dev` — DB 마이그레이션
- **Swagger UI**: `http://localhost:3000/api-docs` (`persistAuthorization` 활성화)
- **품질 체크 (변경 없이 검증만)**
  - `pnpm typecheck` — `tsc --noEmit`
  - `pnpm lint:check` — ESLint 검사만 (자동 수정 X)
  - `pnpm format:check` — Prettier 포맷 검사만
  - `pnpm check` — 위 셋을 순차 실행 (커밋/PR 전 권장)
- **자동 수정**
  - `pnpm lint` — ESLint --fix
  - `pnpm format` — Prettier --write

---

## 2. 폴더 구조 (요약)

```
src/
├── core/      # 인프라/공용: auth, prisma, cache(Redis), storage(R2), queue(BullMQ), config
├── domain/    # 핵심 데이터 모델: task, routine, folder, canvas, user
├── features/  # 도메인 조합 + 외부 트리거: ocr, focus, calendar-link, push-notification, payment
└── common/    # DTO 베이스, 필터, 인터셉터, 데코레이터, 예외
```

**Import 방향(단방향)**: `features → domain → core` (common은 모든 곳에서 import 가능, 역방향 금지)

표준 파일 구성, 배치 규칙, 신규 도메인 템플릿 등 상세는 → [`nestjs-conventions/SKILL.md` §1](./.claude/skills/nestjs-conventions/SKILL.md)

---

## 3. 에러 처리 — 핵심 규칙

- **모든 도메인 에러는 [`AppException`](src/common/exceptions/app.exception.ts)을 상속한 클래스로** 던진다.
- `throw new HttpException(...)` / `BadRequestException(...)` 직접 사용 금지. (ValidationPipe 자동 400 제외)
- 새 에러 추가 절차(error-codes 등록 → exceptions 클래스 → 컨트롤러 `@ApiErrorResponse`): → [`nestjs-conventions/SKILL.md` §2](./.claude/skills/nestjs-conventions/SKILL.md)

응답 body 스펙은 §6 참조 (변경 금지).

---

## 4. Swagger — 핵심 규칙

- 컨트롤러: `@ApiTags('<domain>')` + (인증 필요 시) `@ApiBearerAuth('access-token')` + `@UseGuards(JwtAuthGuard)`
- **400 / 401 / 500은 글로벌 자동 첨부** → 컨트롤러에서 중복 선언 금지. 도메인 고유(404·409·403 등)만 `@ApiErrorResponse`.
- DTO `@ApiProperty`: `description`(한국어) + `example` 필수. UUID는 `format: 'uuid'`, 날짜는 `format: 'date-time'`.
- Response DTO에 `static fromEntity(entity): Dto` 정적 메서드 필수.

전체 규칙·예시·DTO 골조 → [`nestjs-conventions/SKILL.md` §3](./.claude/skills/nestjs-conventions/SKILL.md)

---

## 5. DB 모델 정의 (개발 대상)

PostgreSQL 기준. Prisma 매핑 시 다음 컨벤션을 일관되게 적용한다.

### Prisma 매핑 컨벤션
- 테이블: `@@map("snake_case")`
- 컬럼: `@map("snake_case")`
- UUID PK: `String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`
- TIMESTAMPTZ: `DateTime @db.Timestamptz(6)`
- DATE: `DateTime @db.Date`
- TIME: `DateTime @db.Time(6)`
- INET: `String @db.Inet`
- JSONB: `Json @db.JsonB`
- **PostgreSQL DOMAIN**(`accent_color_key`, `routine_repeat_kind` 등)은 Prisma `enum` 블록으로 선언. CHECK constraint는 raw SQL migration으로 별도 추가.
- **부분 unique 인덱스, 트리거, expression index, CHECK constraint**는 Prisma 스키마로 표현할 수 없으므로 `migrations/.../migration.sql`에 raw SQL을 직접 추가한다. `prisma migrate dev --create-only`로 마이그레이션 파일을 만든 후 편집.

### Domain enum 카탈로그
`accent_color_key`, `routine_repeat_kind`, `oauth_provider`, `subscription_status`, `subscription_platform`, `subscription_event_kind`, `terms_kind`, `calendar_provider`, `focus_session_kind`, `language`

---

### 5.1 `users`
soft delete · email 형식 CHECK · 활성 사용자에 한해 email unique · Apple Hide-My-Email 대응으로 email nullable

```sql
CREATE TABLE users (
  uuid          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT,
  display_name  TEXT,
  language      TEXT NOT NULL DEFAULT 'ko' CHECK (language IN ('ko', 'en', 'ja')),
  timezone      TEXT NOT NULL DEFAULT 'Asia/Seoul',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  CONSTRAINT email_format CHECK (
    email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  )
);
CREATE UNIQUE INDEX idx_users_email_active ON users(lower(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;
```

### 5.2 `oauth_identities`
N:1 → users · `(provider, provider_user_id)` unique · `(user_uuid, provider)` unique · provider access/refresh token은 저장하지 않음(자체 JWT)

```sql
CREATE DOMAIN oauth_provider AS TEXT
  CHECK (VALUE IN ('google', 'apple'));

CREATE TABLE oauth_identities (
  uuid              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid         UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  provider          oauth_provider NOT NULL,
  provider_user_id  TEXT NOT NULL,
  provider_email    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id),
  UNIQUE (user_uuid, provider)
);
CREATE INDEX idx_oauth_user ON oauth_identities(user_uuid);
```

### 5.3 `folders`
N:1 → users · 같은 유저 내 이름 대소문자 무시 unique · `accent_color_key` domain

```sql
CREATE DOMAIN accent_color_key AS TEXT
  CHECK (VALUE IN ('red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray'));

CREATE TABLE folders (
  uuid       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid  UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (length(name) > 0 AND length(name) <= 100),
  color      accent_color_key NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_folders_user ON folders(user_uuid);
CREATE UNIQUE INDEX idx_folders_user_name ON folders(user_uuid, lower(name));
```

### 5.4 `tasks`
N:1 → users · 선택 N:1 → folders(soft reset via trigger) · 3-stage 모델(backlog → active → timebox) · 다수 CHECK constraint

핵심 제약:
- `backlog_kind`는 NOT NULL — 모든 task는 backlog 단계를 가짐
- `backlog_kind = 'folder'` ⟺ `backlog_folder_id IS NOT NULL`
- `timebox_kind IS NOT NULL` ⇒ `active_kind IS NOT NULL` (timebox는 active 위에서만)
- `active_kind = 'big3'` ⇒ `scheduled_date IS NOT NULL`
- `chunk_sec <= duration_sec`, `(chunk_sec NULL ⇒ break_sec NULL)`
- Folder 삭제 시 trigger로 해당 folder의 task들을 `backlog_kind='inbox'`, `backlog_folder_id=NULL`로 리셋

```sql
CREATE TABLE tasks (
  uuid              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid         UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  priority          TEXT CHECK (priority IS NULL OR priority IN ('high', 'medium', 'low')),
  affiliation       TEXT CHECK (affiliation IS NULL OR affiliation IN ('google')),
  backlog_kind      TEXT NOT NULL CHECK (backlog_kind IN ('inbox', 'folder')),
  backlog_folder_id UUID REFERENCES folders(uuid) ON DELETE SET NULL,
  active_kind       TEXT CHECK (active_kind IN ('todo', 'big3')),
  timebox_kind      TEXT CHECK (timebox_kind IN ('timeline')),
  scheduled_date    DATE,
  start_time        TIME,
  duration_sec      INTEGER CHECK (duration_sec > 0),
  chunk_sec         INTEGER CHECK (chunk_sec > 0),
  break_sec         INTEGER CHECK (break_sec >= 0),
  done_date         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT backlog_folder_consistency CHECK (
    (backlog_kind = 'folder' AND backlog_folder_id IS NOT NULL) OR
    (backlog_kind = 'inbox' AND backlog_folder_id IS NULL)
  ),
  CONSTRAINT timebox_requires_active CHECK (
    timebox_kind IS NULL OR active_kind IS NOT NULL
  ),
  CONSTRAINT chunk_within_duration CHECK (
    chunk_sec IS NULL OR duration_sec IS NULL OR chunk_sec <= duration_sec
  ),
  CONSTRAINT chunk_break_paired CHECK (
    (chunk_sec IS NULL AND break_sec IS NULL) OR (chunk_sec IS NOT NULL)
  ),
  CONSTRAINT big3_requires_date CHECK (
    active_kind != 'big3' OR scheduled_date IS NOT NULL
  )
);
CREATE INDEX idx_tasks_user ON tasks(user_uuid);
CREATE INDEX idx_tasks_user_scheduled ON tasks(user_uuid, scheduled_date) WHERE scheduled_date IS NOT NULL;
CREATE INDEX idx_tasks_user_active ON tasks(user_uuid, active_kind) WHERE active_kind IS NOT NULL;
CREATE INDEX idx_tasks_folder ON tasks(backlog_folder_id) WHERE backlog_folder_id IS NOT NULL;

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
```

### 5.5 `task_external_links`
1:1 → tasks · N:1 → calendar_integrations · 구글 캘린더 이벤트 매핑 · ETag로 변경 감지

```sql
CREATE TABLE task_external_links (
  task_uuid          UUID PRIMARY KEY REFERENCES tasks(uuid) ON DELETE CASCADE,
  integration_uuid   UUID NOT NULL REFERENCES calendar_integrations(uuid) ON DELETE CASCADE,
  external_event_id  TEXT NOT NULL,
  external_etag      TEXT,
  last_synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (integration_uuid, external_event_id)
);
CREATE INDEX idx_task_external_links_integration ON task_external_links(integration_uuid);
```

### 5.6 `routines`
N:1 → users · `repeat_kind`에 따라 다른 필드 검증 (`day_of_week` → `repeat_weekdays` 1~7 배열 / `week`,`day` → `repeat_interval` 양의 정수)

```sql
CREATE DOMAIN routine_repeat_kind AS TEXT
  CHECK (VALUE IN ('day_of_week', 'week', 'day'));

CREATE TABLE routines (
  uuid              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid         UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  title             TEXT NOT NULL CHECK (length(title) > 0 AND length(title) <= 200),
  repeat_kind       routine_repeat_kind NOT NULL,
  repeat_weekdays   SMALLINT[],
  repeat_interval   INTEGER,
  anchor_date       DATE NOT NULL,
  start_time        TIME NOT NULL,
  duration_sec      INTEGER NOT NULL CHECK (duration_sec > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT repeat_data_consistency CHECK (
    (repeat_kind = 'day_of_week'
      AND repeat_weekdays IS NOT NULL
      AND array_length(repeat_weekdays, 1) BETWEEN 1 AND 7
      AND repeat_interval IS NULL)
    OR
    (repeat_kind IN ('week', 'day')
      AND repeat_interval IS NOT NULL
      AND repeat_interval > 0
      AND repeat_weekdays IS NULL)
  ),
  CONSTRAINT repeat_weekdays_valid CHECK (
    repeat_weekdays IS NULL
    OR repeat_weekdays <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]
  )
);
CREATE INDEX idx_routines_user ON routines(user_uuid);
```

### 5.7 `routine_done_dates`
N:1 → routines · 복합 PK `(routine_uuid, done_date)`로 같은 날 중복 완료 방지

```sql
CREATE TABLE routine_done_dates (
  routine_uuid UUID NOT NULL REFERENCES routines(uuid) ON DELETE CASCADE,
  done_date    DATE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (routine_uuid, done_date)
);
CREATE INDEX idx_routine_done_dates_routine ON routine_done_dates(routine_uuid);
```

### 5.8 `subscriptions`
N:1 → users · partial unique로 동시 활성 1개만 허용(`status IN ('trialing','active','past_due')`) · 영수증/환불 추적용 `external_transaction_id`

```sql
CREATE DOMAIN subscription_status AS TEXT
  CHECK (VALUE IN ('trialing', 'active', 'past_due', 'canceled', 'expired'));
CREATE DOMAIN subscription_platform AS TEXT
  CHECK (VALUE IN ('ios', 'android', 'web'));

CREATE TABLE subscriptions (
  uuid                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid               UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  status                  subscription_status NOT NULL,
  platform                subscription_platform NOT NULL,
  trial_start_at          TIMESTAMPTZ,
  trial_end_at            TIMESTAMPTZ,
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  external_product_id     TEXT,
  external_transaction_id TEXT,
  canceled_at             TIMESTAMPTZ,
  cancel_reason           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trial_dates CHECK (
    (trial_start_at IS NULL AND trial_end_at IS NULL) OR
    (trial_start_at IS NOT NULL AND trial_end_at IS NOT NULL
     AND trial_end_at > trial_start_at)
  )
);
CREATE UNIQUE INDEX idx_subscriptions_user_active
  ON subscriptions(user_uuid)
  WHERE status IN ('trialing', 'active', 'past_due');
CREATE INDEX idx_subscriptions_user ON subscriptions(user_uuid);
CREATE INDEX idx_subscriptions_trial_end ON subscriptions(trial_end_at)
  WHERE status = 'trialing';
```

### 5.9 `subscription_events`
append-only 이력 · N:1 → subscriptions, users · provider raw payload는 JSONB

```sql
CREATE DOMAIN subscription_event_kind AS TEXT
  CHECK (VALUE IN ('trial_started', 'trial_converted', 'renewed',
                   'canceled', 'refunded', 'expired', 'reactivated'));

CREATE TABLE subscription_events (
  uuid              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_uuid UUID NOT NULL REFERENCES subscriptions(uuid) ON DELETE CASCADE,
  user_uuid         UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  kind              subscription_event_kind NOT NULL,
  occurred_at       TIMESTAMPTZ NOT NULL,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sub_events_subscription ON subscription_events(subscription_uuid);
CREATE INDEX idx_sub_events_user_kind ON subscription_events(user_uuid, kind);
```

### 5.10 `terms` / `terms_agreements`
약관 버전 + 동의 이력 · append-only · 현재 상태는 `DISTINCT ON (kind) ... ORDER BY agreed_at DESC` · IP/UA는 분쟁 시 증거(정보통신망법)

```sql
CREATE DOMAIN terms_kind AS TEXT
  CHECK (VALUE IN ('service', 'privacy', 'marketing', 'age_14'));

CREATE TABLE terms (
  uuid          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          terms_kind NOT NULL,
  version       TEXT NOT NULL,
  is_required   BOOLEAN NOT NULL,
  content       TEXT,
  effective_at  TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, version)
);

CREATE TABLE terms_agreements (
  uuid          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid     UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  terms_uuid    UUID NOT NULL REFERENCES terms(uuid),
  agreed        BOOLEAN NOT NULL,
  agreed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address    INET,
  user_agent    TEXT
);
CREATE INDEX idx_terms_agreements_user ON terms_agreements(user_uuid);
CREATE INDEX idx_terms_agreements_terms ON terms_agreements(terms_uuid);
```

### 5.11 `calendar_integrations`
N:1 → users · OAuth access/refresh token은 **반드시 암호화해서 저장** (`_encrypted` suffix) · `sync_token`은 Google API incremental sync용

```sql
CREATE DOMAIN calendar_provider AS TEXT
  CHECK (VALUE IN ('google'));

CREATE TABLE calendar_integrations (
  uuid                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid                UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  provider                 calendar_provider NOT NULL,
  provider_account_id      TEXT NOT NULL,
  provider_email           TEXT NOT NULL,
  access_token_encrypted   TEXT NOT NULL,
  refresh_token_encrypted  TEXT NOT NULL,
  token_expires_at         TIMESTAMPTZ NOT NULL,
  sync_token               TEXT,
  last_synced_at           TIMESTAMPTZ,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_uuid, provider, provider_account_id)
);
CREATE INDEX idx_calendar_integrations_user ON calendar_integrations(user_uuid);
```

### 5.12 `devices`
N:1 → users · `push_token` 전역 unique · APNs / FCM token

```sql
CREATE TABLE devices (
  uuid            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid       UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  push_token      TEXT NOT NULL,
  device_name     TEXT,
  device_model    TEXT,
  app_version     TEXT,
  os_version      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (push_token)
);
CREATE INDEX idx_devices_user_active ON devices(user_uuid) WHERE is_active = TRUE;
```

### 5.13 `canvases`
N:1 → users · `(user_uuid, date)` unique — 한 유저는 날짜당 canvas 하나

```sql
CREATE TABLE canvases (
  uuid          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid     UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  date          DATE NOT NULL,
  storage_key   TEXT NOT NULL,
  version       TEXT NOT NULL DEFAULT 'v1.init',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_uuid, date)
);
CREATE INDEX idx_canvases_user_updated ON canvases(user_uuid, updated_at DESC);
CREATE INDEX idx_canvases_user_date ON canvases(user_uuid, date);
```

### 5.14 `focus_sessions`
N:1 → users · task XOR routine (정확히 하나) · 동시 진행 1개 partial unique (`ended_at IS NULL`)

```sql
CREATE DOMAIN focus_session_kind AS TEXT
  CHECK (VALUE IN ('focus', 'break'));

CREATE TABLE focus_sessions (
  uuid          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid     UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  kind          focus_session_kind NOT NULL,
  task_uuid     UUID REFERENCES tasks(uuid) ON DELETE SET NULL,
  routine_uuid  UUID REFERENCES routines(uuid) ON DELETE SET NULL,
  started_at    TIMESTAMPTZ NOT NULL,
  ended_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT focus_target_xor CHECK (
    (task_uuid IS NOT NULL AND routine_uuid IS NULL) OR
    (task_uuid IS NULL AND routine_uuid IS NOT NULL)
  ),
  CONSTRAINT focus_time_order CHECK (
    ended_at IS NULL OR ended_at >= started_at
  )
);
CREATE UNIQUE INDEX idx_focus_sessions_user_active
  ON focus_sessions(user_uuid)
  WHERE ended_at IS NULL;
CREATE INDEX idx_focus_sessions_user_started ON focus_sessions(user_uuid, started_at DESC);
CREATE INDEX idx_focus_sessions_task ON focus_sessions(task_uuid) WHERE task_uuid IS NOT NULL;
CREATE INDEX idx_focus_sessions_routine ON focus_sessions(routine_uuid) WHERE routine_uuid IS NOT NULL;
```

### 5.15 `task_canvas_sources`
1:1 → tasks (PK) · N:1 → canvases (nullable, SET NULL) · OCR 이미지 R2 key 기반 출처 추적 · canvas 삭제 시 SET NULL, task는 유지

```sql
CREATE TABLE task_canvas_sources (
  task_uuid    UUID PRIMARY KEY REFERENCES tasks(uuid) ON DELETE CASCADE,
  canvas_uuid  UUID REFERENCES canvases(uuid) ON DELETE SET NULL,  -- nullable
  source_key   TEXT NOT NULL UNIQUE,   -- R2 OCR 이미지 key (idempotency key)
  ocr_text     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_task_canvas_sources_canvas ON task_canvas_sources(canvas_uuid) WHERE canvas_uuid IS NOT NULL;
```

---

## 6. 글로벌 예외 필터 (참고)

[`src/common/filters/all-exceptions.filter.ts`](src/common/filters/all-exceptions.filter.ts) — 변경 금지. 핵심 동작:

```ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    // 1. HttpException이면 statusCode/message/error 추출
    // 2. 그 외는 500 + "Internal server error" 마스킹
    // 3. AppException이면 body.errorCode = exception.errorCode 추가
    // 4. statusCode >= 500 → logger.error(stack), 그 외 → logger.warn
    // 5. httpAdapter.reply(ctx.getResponse(), body, statusCode)
  }
}
```

응답 body 형태:
```ts
{
  statusCode: number,
  message: string | string[],
  error: string,
  errorCode?: string,    // AppException일 때만
  timestamp: string,     // ISO 8601
  path: string,
}
```

main.ts의 `attachGlobalErrorResponses`가 모든 Swagger operation에 400/401/500을 자동 첨부하므로 컨트롤러 데코레이터 작성 시 중복 선언 금지.

---

## 7. 테스트 — 핵심

| 종류 | 패턴 | DB | 명령어 |
|---|---|---|---|
| Unit | `*.spec.ts` | Prisma mock | `pnpm test:unit` |
| Integration | `*.integration-spec.ts` | 실제 Postgres (Testcontainers) | `pnpm test:integration` |

최소 커버리지(새 도메인): public 메서드별 happy + 주요 에러 (Unit), 추가된 CHECK/partial unique/trigger 각 1개 이상 (Integration).

템플릿·패턴·인프라(`createTestPrisma`, `truncateAll`, AppException 검증) → [`nestjs-conventions/SKILL.md` §5](./.claude/skills/nestjs-conventions/SKILL.md)

---

## 8. PR 전 체크리스트

[`nestjs-conventions/SKILL.md` §6](./.claude/skills/nestjs-conventions/SKILL.md)로 일원화. PR 템플릿(`.github/pull_request_template.md`)에 자동 표시됨.
