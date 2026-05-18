---
name: nestjs-conventions
description: fanesis-server NestJS 규약 — 폴더 구조, 에러 처리, Swagger DTO, 테스트, 새 도메인 체크리스트. CLAUDE.md에서 옮긴 본문.
---

# nestjs-conventions

> CLAUDE.md는 슬림화돼 있다. 새 도메인/엔드포인트/에러를 만들 땐 이 Skill을 먼저 Read.
> DB 모델 정의(§5)와 글로벌 예외 필터 사양(§6)은 CLAUDE.md에 그대로 남아 있다.

## 1. 폴더 구조

```
src/
├── core/      # 인프라/공용: auth, prisma, cache(Redis), storage(R2), queue(BullMQ), config
├── domain/    # 핵심 데이터 모델: task, routine, folder, canvas, user
├── features/  # 도메인 조합/외부 트리거: ocr, focus, calendar-link, push-notification, payment
└── common/    # DTO 베이스, 필터, 인터셉터, 데코레이터, 예외
```

### 배치 규칙
- **core/**: 외부 시스템/인프라 연동. 도메인 비즈니스 로직 금지.
- **domain/**: 1개 테이블(또는 매우 응집된 N개)에 대응되는 CRUD/조회/검증. 다른 도메인 직접 의존 금지.
- **features/**: 여러 도메인 조합 또는 외부 트리거(스케줄러·웹훅·큐). 예: OCR(canvas → task), focus-session(task/routine 참조).
- **common/**: 어디서나 import 가능한 횡단 관심사. 도메인 의존 금지.

### Import 방향
```
features → domain → core
   ↘        ↘        ↙
       common (모든 곳에서 import 가능)
```
역방향 금지. `domain`에서 `features` import 금지.

### 표준 파일 구성 (`domain/<name>/`, `features/<name>/`)
```
<name>/
├── <name>.module.ts
├── <name>.controller.ts        # 엔드포인트가 있는 경우만
├── <name>.service.ts
├── <name>.exceptions.ts
├── dto/
│   ├── create-<name>.dto.ts
│   ├── update-<name>.dto.ts
│   └── response/
│       └── <name>-response.dto.ts
```

## 2. 에러 처리

### 절대 규칙
- 모든 도메인 에러는 `AppException`(src/common/exceptions/app.exception.ts)을 상속한 클래스로 던진다.
- `throw new HttpException(...)` / `throw new BadRequestException(...)` 직접 사용 금지. (ValidationPipe 자동 400 제외)
- 에러 코드 네이밍: `DOMAIN_REASON` 대문자 스네이크. 예: `TASK_NOT_FOUND`, `FOLDER_NAME_DUPLICATED`.

### 새 에러 추가 절차
1. `src/common/exceptions/error-codes.ts`에 코드 추가:
   ```ts
   export const ErrorCode = { TASK_NOT_FOUND: 'TASK_NOT_FOUND', ... } as const;
   ```
2. 도메인 폴더 `<domain>.exceptions.ts`에 클래스 정의:
   ```ts
   export class TaskNotFoundException extends AppException {
     constructor() { super(ErrorCode.TASK_NOT_FOUND, 'Task not found', HttpStatus.NOT_FOUND); }
   }
   ```
3. 컨트롤러 Swagger: `@ApiErrorResponse({ status: 404, errorCode: ErrorCode.TASK_NOT_FOUND })`

### AllExceptionsFilter 응답 (변경 금지, src/common/filters/all-exceptions.filter.ts)
```ts
{ statusCode, message, error, errorCode?, timestamp, path }
```
`AppException`만 `errorCode` 포함. 500은 메시지 마스킹.

## 3. Swagger

### 컨트롤러 클래스
- `@ApiTags('<domain>')`
- 인증 필요: `@ApiBearerAuth('access-token')` + `@UseGuards(JwtAuthGuard)`

### 각 엔드포인트
```ts
@Post()
@ApiOperation({ summary: '...', description: '...' })
@ApiCreatedResponse({ description: '...', type: TaskResponseDto })
@ApiErrorResponse({ status: 404, errorCode: ErrorCode.FOLDER_NOT_FOUND })
```

### 400/401/500 자동 첨부 — 중복 선언 금지
`main.ts`의 `attachGlobalErrorResponses`가 자동. 컨트롤러엔 도메인 고유 에러(404, 409, 403 등)만 `@ApiErrorResponse`.

### DTO `@ApiProperty` 규칙
- 필수: `description`(한국어), `example`
- UUID: `format: 'uuid'`
- 날짜: `format: 'date-time'`, 타입 `Date`
- 이메일: `format: 'email'`
- enum: `enum: XxxDto` (DTO enum으로 한 번 감싼다, Prisma enum 직접 노출 금지)
- nullable: `nullable: true, required: false` 둘 다
- 배열: `type: [Item]` 또는 `isArray: true`

### Response DTO 규칙
반드시 `static fromEntity(entity): Dto` 정적 메서드 제공. 참고: [user-response.dto.ts](../../../src/core/auth/dto/response/user-response.dto.ts)

## 4. Prisma 매핑 컨벤션

- 테이블: `@@map("snake_case")`
- 컬럼: `@map("snake_case")`
- UUID PK: `String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`
- TIMESTAMPTZ: `DateTime @db.Timestamptz(6)`
- DATE: `DateTime @db.Date`
- TIME: `DateTime @db.Time(6)`
- INET: `String @db.Inet`
- JSONB: `Json @db.JsonB`
- PostgreSQL DOMAIN(`accent_color_key` 등) → Prisma `enum` 블록
- CHECK constraint / 부분 unique 인덱스 / 트리거 / expression index → raw SQL migration (Prisma 스키마로 불가)
  ```bash
  pnpm dlx prisma migrate dev --create-only
  # 그리고 migration.sql 직접 편집
  ```

## 5. 테스트 (두 종류)

| 종류 | 패턴 | DB | 명령 | 검증 |
|---|---|---|---|---|
| Unit | `*.spec.ts` | Prisma mock | `pnpm test:unit` | 서비스 로직·검증·에러 분기 |
| Integration | `*.integration-spec.ts` | 실제 Postgres (Testcontainers) | `pnpm test:integration` | CHECK constraint·partial unique·trigger·JOIN |

### 최소 커버리지 (새 도메인)
- 각 service public 메서드: happy + 주요 에러 (Unit)
- 추가 DB 제약(CHECK/partial unique/trigger): 각 1개 이상 (Integration)

### Unit 템플릿
참고: [user.service.spec.ts](../../../src/domain/user/user.service.spec.ts) — Prisma는 `jest.fn()`으로 수동 mock.

### Integration 템플릿
참고: [user.service.integration-spec.ts](../../../src/domain/user/user.service.integration-spec.ts) — `createTestPrisma()` + `truncateAll(prisma)` (beforeEach).

### AppException 검증
```ts
await expect(service.foo()).rejects.toBeInstanceOf(TaskNotFoundException);
// errorCode까지:
try { await service.foo(); fail(); }
catch (e) { expect((e as AppException).errorCode).toBe(ErrorCode.TASK_NOT_FOUND); }
```

### DB 제약 위반
`rejects.toThrow()`로 단순 검증, 필요 시 `err.code === 'P2002'`.

## 6. 새 도메인/엔드포인트 체크리스트 (PR 전 필수)

- [ ] core/domain/features 알맞은 위치
- [ ] Module/Controller/Service/Exceptions/DTO 표준 구성
- [ ] AppException 상속 클래스로 에러 (HttpException 직접 throw 금지)
- [ ] error-codes.ts에 새 코드 등록
- [ ] @ApiTags + (인증) @ApiBearerAuth + @UseGuards
- [ ] @ApiOperation + 성공 응답 + 도메인 에러 @ApiErrorResponse (400/401/500 중복 금지)
- [ ] DTO @ApiProperty: description + example (UUID format, 날짜 format)
- [ ] Response DTO: static fromEntity
- [ ] Prisma @@map/@map 일관
- [ ] CHECK/partial unique/trigger는 raw SQL migration
- [ ] OAuth token·결제 외부 ID는 `_encrypted` 컬럼
- [ ] service public 메서드: unit 테스트(happy + 에러)
- [ ] 새 CHECK/partial unique/trigger: integration 테스트
