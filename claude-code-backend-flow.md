# Claude Code 백엔드 개발 워크플로우 (개정판)

> 전제: 모든 위임은 **main이 허브**로 순차/병렬 호출한다.
> 서브에이전트는 서브에이전트를 스폰할 수 없으므로, 에이전트 간 직접 핸드오프는 없다.

---

## 0. 토큰·시간 절감 원칙 (설계 전반에 적용)

1. **결정론적 작업은 에이전트로 만들지 않는다.**
   type / lint / prettier / format → 서브에이전트 단계 삭제, **PostToolUse hook**으로 처리.
2. **깊은 검증은 한 번만, 병렬로.**
   풀 코드리뷰·요구사항검증은 후반(9·10)에 1회. 두 에이전트는 독립적 read 작업이므로 **동시 실행**.
   4단계 내부에는 풀 리뷰를 두지 않고 **경량 스모크 게이트**만 둔다.
3. **컨텍스트는 전달을 표준화한다.**
   `.claude/worktrees/{branch}/HANDOFF.md` 단일 파일에 각 에이전트가 구조화 블록을 append.
   main은 매 호출 시 **HANDOFF.md 경로 + 직전 단계 델타**만 프롬프트에 담는다. 히스토리 통째 재포장 금지.
4. **모델 티어 라우팅.**
   - 탐색·스모크·스웨거 점검 → **Haiku/Sonnet** (read-only 도구만)
   - 구현 (DB / 기능) → **Sonnet**
   - 요구사항 분석·아키텍처 판단(main의 plan) → **Opus**
   - **품질 결정 게이트 (요구사항 리뷰어 · 테스트 리뷰어 · 코드 리뷰어 · 요구사항 검증) → Opus**
     프로젝트 퀄리티를 좌우하는 게이트라 비용보다 판단 정확도를 우선한다.
5. **도구·MCP 최소화.**
   read-only 에이전트는 Write/Edit 미부여. MCP 서버는 그 에이전트가 실제 쓰는 것만(1개당 10~20K 토큰).
6. **비싼 단계는 게이트로 막는다.**
   DB 기능 개발자는 plan의 `needs_migration` 필드가 true일 때만 호출 (기본 스폰 금지, §4).
7. **순환 예산을 건다.**
   단계별 재시도 ≤ 3, 전역 reject ≤ 6, step1 재진입 ≤ 2. 초과 시 사람에게 에스컬레이션.
8. **사람의 판단이 항상 우선한다.**
   플로우 도중 사용자가 방향 전환을 지시하면("이거 말고 X로", "중단" 등) 진행 중 단계를 즉시
   멈추고 그 지시를 최상위로 따른다. 이때 main은 `.claude/state.json`(§8.2)의 카운터를
   **전부 0으로 리셋**하고 새 plan으로 step 1부터 재시작한다. 사용자 개입은 어떤 카운터·예산보다 우선.

---

## 0.5 작업 크기 분기 (S/M/L) — 파이프라인 진입 전 필수 결정

> 모든 작업을 11단계 Deep Dive로 처리하면 1인 프로젝트에서 ROI가 음수가 된다.
> **step 1에서 main이 사용자에게 S/M/L을 직접 질문한다** (자동 분류 아님). 크기에 따라 파이프라인 일부만 돈다.

| 크기 | 기준(예시) | 도는 단계 |
|---|---|---|
| **S** | 단일 컬럼/엔드포인트 추가, 설정 변경, 사소한 수정 | 1 → **3** → 4-2 → PostToolUse hook → 11. (1.5·리뷰어·9·10 생략) |
| **M** | 한 모듈 내 기능 1개, 마이그레이션 1건 | 1 → 1.5 → 3 → 4 → 5·6 → 9 → 11. (요구사항 검증·테스트 리뷰어는 선택) |
| **L** | 도메인 횡단, 다중 모듈, 외부 연동 신규 | 전체 흐름(§6) 그대로 |

> **step 3(env-setup, worktree 분기 포함)은 S/M/L 모든 사이즈 공통.** 격리·workspace 자동 등록·main 오염 방지를 일관성 있게 보장하기 위해, 작은 변경이라도 worktree에서 한다. 사용자가 "worktree 필요 없음"을 명시한 경우에만 그 작업에 한해 생략(§0-8 사용자 우선).

**질문 방식 (step 1):**
- main은 작업을 받으면 **먼저 사용자에게 크기를 묻는다**: "이 작업 S / M / L 중 어느 쪽으로 진행할까요?"
  (각 크기가 도는 단계를 한 줄로 같이 제시)
- 사용자가 모르겠다고 하면, main이 작업 내용 기준으로 **크기를 제안 + 근거 1줄**을 주고 확인받는다
  (예: "스키마 변경 + 2개 모듈 → L 제안. 동의?")
- 확정값은 plan의 `task_size` 필드에 기록. 사용자가 명시 변경 전까지 그 작업 내내 고정
- 분류 필드: plan에 `task_size: "S"|"M"|"L"` + `needs_migration: bool` → 게이트 결정론적
- S/M에서 생략된 게이트는 "비용 절감"이지 "품질 포기"가 아님 — reject 로그가 S/M에서도 결함을
  반복적으로 보이면 해당 크기의 도는 단계를 확장한다(실측 기반)

---

## 1. Custom slash commands

- **`/pr`** — PR 생성 요청
- **`/wt-new {branch}`** — worktree 분기
  - git worktree 생성은 내장 메커니즘 사용
  - **`fanesis-server.code-workspace` JSON 패치**(정규식 아님, JSON 파싱): `path` = 새 worktree 경로, `name` = `{역할}-{branch_name}`
  - **활성 worktree 절대경로를 `.claude/worktrees/.active`에 기록** (한 줄)
  - 이후 worktree 경계 강제는 프롬프트 규칙이 아니라 **PreToolUse hook으로 결정론적 차단** (§8.1)
- **`/wt-rm {branch}`** — `.claude/worktrees/`에서 해당 worktree 제거 + code-workspace 해당 항목 제거 + 그 worktree가 활성이면 **`.active` 삭제**
- **`/wt-main`** — main 작업 명시 허용. `.active` 삭제 → 경계 차단 해제 (사용자 명시적 호출 전엔 자동 해제 금지)
- **`/handoff`** — 컨텍스트 압축용 인수인계 문서 생성. 현재 작업 상태를 `HANDOFF.md`로 정리해, **빈 컨텍스트의 다음 세션이 그 파일 하나만 읽고 작업을 이어받을 수 있게** 한다 (§1.7).

---

## 1.6 Plan 완성도 게이트 (step 1.5 상세)

> 목적: plan이 부실하면 코드를 한 줄도 짜기 전에 **사용자에게 되묻는 루프**를 강제.
> 검증 주체는 **이미 있는 `요구사항 리뷰어` 서브에이전트를 재사용** (새 에이전트 추가 없음).

**절차**

1. main이 초안 plan 작성 (S/M/L·needs_migration 포함)
2. `요구사항 리뷰어`(Opus) 호출 → plan을 검증, 결과를 §3 포맷으로 반환
   - `accept` → step 3 진행
   - `reject` → 갭 목록을 다음 두 종류로 분류해 반환:

| 갭 종류 | 예 | 처리 |
|---|---|---|
| **USER_DECISION** | 비즈니스 규칙·우선순위·외부 연동 범위·엣지 정책 등 사용자만 결정 가능 | **main이 사용자에게 그 질문들을 직접 물음** → 답을 plan에 반영 |
| **DESIGN_GAP** | 스키마 정규화·트랜잭션 경계 등 내부 설계 결정 | main이 보완 (필요 시 plan에 근거 명시) |

3. 보완된 plan으로 **2번 재호출** → `accept` 날 때까지 반복
4. `accept` 전에는 step 3(환경 설정) 진입 금지 — 코드 작업 시작 불가

**되묻기 루프 종료 조건 (무한 질문 방지)**

- `plan_clarify_round` 카운터(state.json, §8.2). USER_DECISION 질문 라운드마다 ++
- ≥ 3 라운드인데도 reject → 사람 에스컬레이션 (요구사항 자체가 불명확)
- 사용자가 **"이대로 진행"을 명시**하면 즉시 통과 (사용자 우선, §0-8) —
  단 이때 미해결 갭을 plan에 `OPEN:` 주석으로 남겨 9·10 검증이 인지하도록 함

**사용자에게 묻는 방식**

- 한 번에 답할 수 있게 **갭을 모아 구조화 질문 목록으로 1회 제시** (질문 핑퐁 최소화)
- 각 질문에 main의 기본 제안값을 함께 → 사용자가 "전부 제안대로"로 빠르게 닫을 수 있게
- S 작업도 이 게이트는 적용하되, 갭이 없으면 리뷰어가 즉시 accept하므로 비용 거의 0

---

## 1.7 Handoff (컨텍스트 압축 인수인계) — `/handoff` 상세

> 근거: ykdojo Tip #8(선제적 압축). 컨텍스트가 길어지면 성능이 저하되므로(컨텍스트 드리프트),
> 무거워지기 전에 **HANDOFF.md를 만들고 `/clear`로 새 세션을 시작**해 상태를 보존한다.
> 우리 워크플로우의 §0-3 HANDOFF.md(서브에이전트 델타 전달)와 **같은 파일을 공유**하되,
> `/handoff`는 그 파일을 *세션 인수인계용 전체 스냅샷*으로 한 번 정리하는 동작이다.
>
> **확정 정책:** 자동 압축은 **켠 채로 둔다**(`/config`로 끄지 않음). `/handoff`는
> **자동 트리거하지 않고** 사용자가 `/context`를 보며 판단해 수동 호출한다.
> 자동 압축은 사용자가 `/handoff`를 누르기 전에 컨텍스트가 차버린 경우의 OS급 안전판이고,
> 그때 손실은 §8.2 compact 훅이 `state.json` 재주입으로 메운다.

**언제 트리거하나 (수동, 사용자 판단)**

- main·hook이 자동으로 실행하지 않는다 — 사용자가 `/context`를 보고 직접 호출
- 권장 신호: 대화가 무거울 때(50k 토큰 부근), step 경계 직전(특히 4→5, 9·10 reject로
  4 복귀 등 긴 루프 중간), 또는 드리프트가 느껴질 때
- main은 압축이 필요해 보이면 **사용자에게 `/handoff`를 권하는 알림만** 하고 직접 실행하지 않음

**`/handoff`가 생성하는 HANDOFF.md 구조**

```
# {작업명} — Handoff
## 목표 (Goal)
## 진행 상태
### 완료된 작업 (✅ What's Been Done)
### 성공한 것 (What Worked)
### 실패한 것 (❌ What Didn't Work) — 이유 포함
## 현재 문제 (Current Problem)
## 다음 단계 (Next Steps) — 순서대로, 다음 세션이 바로 실행 가능하게
## 상태 스냅샷
- task_size / needs_migration / current_step / 카운터  ← .claude/state.json(§8.2)에서 그대로 복사
- 활성 worktree 경로 (.active)
```

**압축 워크플로우**

```
1. /context 로 사용량 확인
2. /handoff → HANDOFF.md 생성 (+ main이 state.json 최신화)
3. /clear (또는 새 세션)
4. @HANDOFF.md 한 파일만 로드 → 이어서 작업
```

---

## 2. Sub agents (모델·도구 명시)

| 에이전트 | 모델 | 도구 | 비고 |
|---|---|---|---|
| 요구사항 리뷰어 | **Opus** | read | 스펙의 엣지케이스·누락 검출, 1패스로 전체 갭 반환. 품질 게이트 |
| DB 기능 개발자 | Sonnet | read/edit/write/bash | prisma migrate, redis 등. 게이트로만 호출 |
| 기능 개발자 | Sonnet | read/edit/write/bash | 비즈니스 로직 + **@nestjs/swagger 데코레이터/DTO 포함** |
| 스모크 게이트 | Haiku | read/bash | 빌드/타입 통과 + 핵심 happy-path만. 깊은 리뷰 금지 |
| 테스트 작성자 | Sonnet | read/edit/write/bash | |
| 테스트 리뷰어 | **Opus** | read | 작성자와 분리된 컨텍스트(기본 격리). 품질 게이트 |
| 스웨거 점검 | Haiku | read | OpenAPI 스펙 일관성만 점검 (데코레이터 작성은 기능 개발자가 함) |
| 코드 리뷰어 | **Opus** | read | 보안·엣지케이스·회귀 (요구사항 충족 여부 아님). 품질 게이트 |
| 요구사항 검증 | **Opus** | read/bash | plan 대비 동작 검증 (google oauth 등 검증 불가 항목 제외). 품질 게이트 |

> 품질 결정 게이트 = **요구사항 리뷰어 · 테스트 리뷰어 · 코드 리뷰어 · 요구사항 검증** 모두 Opus.

> type/lint/prettier 에이전트는 **제거**됨 → hook으로 대체 (아래 §5).

---

## 3. 공통 반환 포맷 & 리젝 사유 enum

모든 검증/리뷰 에이전트는 다음 형식으로만 반환한다.

```
# Result
accept | reject
---
# Category
SPEC_DEFECT | REQUIREMENT_MISMATCH | IMPL_BUG | DB_DEFECT | CODE_QUALITY
# Reason
<한 줄 요약>
# Detail
<무엇이 / 어디서(file:line) / 왜>
# Suggested Fix
<선택>
```

**Category → 분기 매핑 (결정론적, main의 감 판단 제거)**

| Category | 의미 | 되돌아갈 위치 |
|---|---|---|
| `SPEC_DEFECT` | 요구사항/plan 자체가 틀리거나 모호 | **step 1 (re-plan)** |
| `REQUIREMENT_MISMATCH` | 구현이 합의된 plan을 미충족 | step 1 재검토 후 4-2 |
| `IMPL_BUG` | 로직/런타임/엣지 버그, plan은 정상 | **4-2 (기능 개발자)** |
| `DB_DEFECT` | 스키마/마이그레이션/인덱스 문제 | **4-1 (DB 개발자)** |
| `CODE_QUALITY` | 동작하나 유지보수/보안/성능 결함 | **4-2 (기능 개발자)** |

---

## 4. 기능 제작 단계

```
state (외부 저장: .claude/state.json — §8.2):
  task_size      = "S" | "M" | "L"   (plan에서 결정, §0.5)
  needs_migration = bool             (plan에서 결정)
  retry = { db: 0, feat: 0, smoke: 0 }
  global_reject = 0
  step1_reentry = 0
  → main은 매 reject 직후 이 객체를 .claude/state.json에 기록(외부화)한다.

4-1. [GATE] plan.needs_migration == true ?
     ├─ true   → DB 기능 개발자 호출
     │            입력: HANDOFF.md 경로 + plan 요약
     └─ false  → skip
     (main의 추측이 아니라 plan 필드로 결정 — 결정론적)

4-2. 기능 개발자 호출
     입력: HANDOFF.md 경로 + plan 요약 + (4-1 결과 델타)
     출력: 변경 파일 + HANDOFF.md append (@nestjs/swagger 데코레이터 포함)

4-3. 스모크 게이트 (Haiku, read+bash)
     검사: 빌드/타입 통과 + 핵심 happy-path 동작
     (깊은 리뷰·보안·요구사항 충족 검사는 여기서 하지 않음 → 9·10에서 1회만)

     accept → step 5 진행
     reject → Category로 분기:
        IMPL_BUG / CODE_QUALITY      → 4-2,  retry.feat++
        DB_DEFECT                    → 4-1,  retry.db++
        SPEC_DEFECT                  → step 1, step1_reentry++
        REQUIREMENT_MISMATCH         → step 1, step1_reentry++
     모든 reject 시 global_reject++ → main이 state.json 갱신

[순환 제어 — 매 reject 후 평가]
  retry.feat ≥ 3  → 사람 에스컬레이션 (누적 reason 로그 첨부)
  retry.db   ≥ 3  → 사람 에스컬레이션
  global_reject ≥ 6 → 사람 에스컬레이션
  step1_reentry ≥ 2 → 사람 에스컬레이션 (plan 자체가 흔들림)

[사용자 개입 시 — §0-8]
  사용자가 방향 전환·중단 지시 → 진행 중 단계 즉시 중지,
  state.json의 모든 카운터 0 리셋, 새 plan으로 step 1 재시작.
```

---

## 5. type / lint / prettier — Hook (에이전트 아님)

- **PostToolUse hook** (Edit/Write 대상): 변경 파일에 대해 formatter + linter 실행
- 통과 못 하면 hook이 결과를 main에 반환 → main이 동일 기능 개발자에게 수정 위임
  (기능 우선, 그다음 type/lint/prettier 무결성)
- 별도 에이전트 호출 비용 0. 결정론적이라 검증 신뢰도도 더 높음.

---

## 6. 전체 흐름

```
1.  main: 사용자 요구사항 청취
       → 사용자에게 S/M/L 질문 (§0.5). 모르면 main이 제안 후 확인.
       → 초안 plan 작성 + task_size / needs_migration 필드 기록
1.5 [Plan 완성도 게이트]  ← step 3 진입 전 hard gate (§1.6)
       요구사항 리뷰어가 plan 검증 → 갭/모호/미결정 항목 구조화 반환
       · 사용자만 답할 수 있는 갭  → main이 사용자에게 그 질문들을 직접 물음
                                     → 답을 plan에 반영 → 리뷰어 재검증 (통과까지 반복)
       · 내부 설계 결정 갭         → main이 보완 후 리뷰어 재검증
       통과 전 step 3 진행 금지. 사용자가 "이대로 진행" 명시 시 통과(§0-8)
3.  main: 개발 환경 설정 (env-setup skill) — **S/M/L 모두 통과** (worktree 분기·workspace 패치는 모든 작업의 기본값)
       (worktree 분기 + code-workspace 반영, docker DB 확인,
        dependency 설치, prisma generate,
        **worktree별 DB 포트·스키마 분리** — 병렬 시 마이그레이션 충돌 방지)
       S는 1.5(plan 게이트)를 생략하고 곧장 3 → 4-2 → hook → 11로 진행.
       사용자가 "worktree 필요 없음"을 명시한 경우에만 분기 부분만 생략(§0-8).
4.  기능 제작  ……………………… (§4 상세)
       - 4-1 [GATE] plan.needs_migration == true 일 때만 DB 개발자
       - 4-2 기능 개발자 (스웨거 데코레이터 포함)
       - 4-3 스모크 게이트 (Haiku)
       - PostToolUse hook: type/lint/prettier (§5)
5.  테스트 작성자
6.  테스트 리뷰어
       reject → 사유와 함께 step 5 재시도 (카운터 적용)
7.  스웨거 점검 (Haiku) — 코드 확정 후, OpenAPI 일관성만
8.  (삭제: type/lint/prettier는 §5 hook으로 이동)
9·10. ⟨병렬 실행⟩  ← 깊은 검증은 여기서 단 1회
       ┌─ 9.  코드 리뷰어 (Opus): 보안·엣지·회귀
       └─ 10. 요구사항 검증 (Opus): plan 대비 동작
       두 에이전트는 독립 read 작업 → 동시 호출
       reject → Category 매핑(§3)에 따라 해당 위치로 복귀
                (복귀 단계 카운터 적용, 한도 초과 시 에스컬레이션)
       9·10은 매 호출 새 컨텍스트(기본 격리) — 별도 처리 불필요
11. main: 사용자에게 완료 보고
```

---

## 7. 필요 Skill 목록

> Skill = main 컨텍스트에서 도는 재사용 플레이북. 격리 작업은 서브에이전트, 항상 적용되는
> 프로젝트 규약은 CLAUDE.md, 반복 절차/계약은 Skill로 나눈다.

| Skill | 용도 | 비고 |
|---|---|---|
| `env-setup` | 3번 단계 결정론적 절차: worktree 분기 + code-workspace 패치 + docker DB 확인 + dependency 설치 + `prisma generate` + **worktree별 DB 포트/스키마 분리** | main이 매 기능마다 동일 실행. 병렬 worktree 시 같은 포트·스키마 공유 금지(마이그레이션 충돌) |
| `handoff-protocol` | `HANDOFF.md` 스키마·append 규칙 + §3 반환 포맷 + Category enum + 라우팅 표 | **단일 파일 = 단일 진실 출처** |
| `orchestration-loop` | main의 순환 제어 플레이북: 카운터·전역 예산·에스컬레이션 + **사용자 개입 시 카운터 리셋·재시작(§0-8)** | main 전용 |
| `nestjs-conventions` | DTO/@nestjs/swagger 데코레이터 규약, prisma 패턴, 모듈 구조 | 항상 적용이면 CLAUDE.md, 선택 로드면 Skill |

> **handoff-protocol 단일 진실 출처 보장:**
> 서브에이전트는 빈 컨텍스트로 시작해 Skill이 자동 주입되지 않는다. 그렇다고 계약 전문을
> 각 에이전트 .md에 복붙하면 N개 파일 동기화가 생겨 단일 출처가 깨진다. 따라서:
> - 계약은 `.claude/skills/handoff-protocol/SKILL.md` **파일 1개에만** 둔다
> - 각 에이전트 .md 시스템 프롬프트에는 본문 복제 대신 **"첫 액션: `Read .claude/skills/handoff-protocol/SKILL.md`"** 지시만 둔다
> - SKILL.md는 **≤500 토큰**으로 압축 유지 → 읽기 비용 최소화, 변경은 1파일 수정으로 끝

---

## 8. 필요 Hook 목록

| Event | Matcher | Handler | 용도 | 연결 단계 |
|---|---|---|---|---|
| `PostToolUse` | `Write\|Edit\|MultiEdit` | command | prettier `--write` + eslint `--fix` + `tsc --noEmit` | §5 (type/lint/prettier) |
| `PreToolUse` | `Edit\|Write\|MultiEdit` | command (exit 2) | **활성 worktree 밖 편집 결정론적 차단** — 스크립트 §8.1 | §1 worktree 경계 강제 |
| `PreToolUse` | `Bash` | command (exit 2) | 파괴적 명령 차단 (`rm -rf`, `DROP TABLE`, `prisma migrate reset` 등) | 안전판 |
| `SubagentStop` | (해당 에이전트) | command/prompt | 반환이 §3 포맷·Category enum을 지키는지 검증, 위반 시 재시도 강제 | 모든 검증/리뷰 에이전트 |
| `SessionStart` | `startup` | command | git 브랜치·docker DB 상태·`prisma generate` 신선도를 컨텍스트로 주입 | §3 환경 |
| `SessionStart` | `compact` | command | **압축 후 HANDOFF.md + 재시도 카운터 상태 재주입** (장기 루프 필수) | §4 순환 상태 보존 |
| `Stop` | — | command/prompt (exit 2) | 9·10 전부 accept 전엔 main이 "완료 보고"로 종료 못 하게 차단 | 11번 게이트 |

---

## 8.1 worktree 경계 차단 (hook 결정론적 강제)

**판정 규칙**
1. `.claude/worktrees/.active` 없으면 → 일반 모드, 통과(exit 0)
2. 있으면 `ACTIVE` = 그 안의 절대경로(활성 worktree 루트)
3. 편집 대상이 **화이트리스트 경로**면 → 통과(exit 0)
4. 그 외에 `ACTIVE` 하위가 아니면 → **차단(exit 2)**
5. `.active`는 `/wt-new`가 기록, `/wt-rm`(활성 제거 시)·`/wt-main`만 삭제 → 자동 해제 없음

화이트리스트(.active 있어도 통과): `~/.claude/`, 프로젝트 `.claude/`, `~/.config/`,
그리고 `.claude/worktrees/.allowlist`(한 줄당 절대경로 prefix)에 명시한 외부 경로.
→ worktree 밖 설정·도구 파일 빠른 편집이 매번 막히는 UX 함정 제거.

스크립트 구현: `.claude/hooks/wt-guard.sh` (이 저장소에 동봉)
설정: `.claude/settings.json`의 PreToolUse `Edit|Write|MultiEdit` 매처에 와이어링.

- exit 2의 stderr가 Claude에 에러로 전달되어 main이 사유를 인지하고 멈춤
- `jq` 의존 → `env-setup`/`SessionStart`에서 존재 보장
- 신규 파일 생성도 상위 디렉터리 기준으로 경계 판정
- 서브에이전트가 `isolation: worktree`로 별도 worktree에 쓰는 경우는 그 경로가 `ACTIVE` 밖이라 충돌 → 병렬 격리 작업과 이 가드는 **동시 사용 금지**, 둘 중 하나만 운영

---

## 8.2 카운터 보존 (저장 위치·갱신 책임)

`SessionStart:compact` 재주입이 작동하려면 압축 전에 상태가 어딘가 외부화돼 있어야 한다.

> 1차 압축 메커니즘은 §1.7의 수동 `/handoff`다. 자동 압축은 ON으로 확정돼 있으므로
> 이 §8.2 훅은 **사용자가 `/handoff` 전에 자동 압축이 먼저 터진 경우의 백업 안전망**으로
> 상시 동작한다 — `/handoff`를 놓쳐도 카운터·진행 위치는 복원된다.

- **저장 위치:** `.claude/state.json` (worktree별 분리 시 worktree 루트 기준)
- **갱신 책임자:** **main** — 매 reject 직후, step 전환 직후, 사용자 개입 시 이 파일을 덮어쓴다
  (서브에이전트는 이 파일을 쓰지 않음. 격리 컨텍스트라 상태 소유는 오케스트레이터인 main)
- **재주입:** `SessionStart`(matcher `compact`) hook이 `state.json` + `HANDOFF.md` 경로를
  `additionalContext`로 출력 → 압축 후 main이 카운터·진행 위치를 잃지 않음

`state.json` 스키마:

```json
{
  "task_size": "M",
  "needs_migration": false,
  "current_step": "4-2",
  "plan_clarify_round": 0,
  "retry": { "db": 0, "feat": 1, "smoke": 0 },
  "global_reject": 1,
  "step1_reentry": 0,
  "handoff_path": ".claude/worktrees/feat-x/HANDOFF.md",
  "updated_at": "2026-05-18T00:00:00Z"
}
```

> 사용자 개입(§0-8) 시 main은 `state.json`의 `retry`·`global_reject`·`step1_reentry`를
> 전부 0으로 덮어쓰고 `current_step`을 새 plan의 step 1로 리셋한다.

---

## 요약

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| 풀 검증 에이전트 호출 | 최대 4회 | 2회, **병렬** (9·10만) |
| type/lint/prettier | 에이전트 1단계 | hook (호출 0회) |
| 리젝 분기 판단 | main의 휴리스틱 | Category enum 결정론적 |
| 무한 루프 위험 | 없음(미정의) | 카운터 + 전역 예산으로 차단 |
| 컨텍스트 전달 | 매 호출 히스토리 재포장 | HANDOFF.md 경로 + 델타 |
| 모델 사용 | 미지정 | Haiku/Sonnet/Opus 티어 라우팅 |
