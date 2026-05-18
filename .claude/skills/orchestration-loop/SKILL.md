---
name: orchestration-loop
description: main 전용. S/M/L 라우팅, 카운터·전역 예산·에스컬레이션, 사용자 개입 시 리셋. claude-code-backend-flow.md의 §0·§4·§6을 실행 가능한 절차로.
---

# orchestration-loop — main 오케스트레이터 플레이북

> 단일 진실 출처: `/claude-code-backend-flow.md` (저장소 루트). 본 Skill은 main이 매 작업마다 실행하는 절차서.
> 계약/포맷은 `.claude/skills/handoff-protocol/SKILL.md` 참조.

## 0. 작업 시작 (step 1)

1. **사용자에게 S/M/L 질문** (자동 분류 금지). 각 크기가 도는 단계 한 줄 요약 같이 제시.
   - S: 단일 컬럼/엔드포인트, 설정 변경 → 1 → **3** → 4-2 → hook → 11
   - M: 한 모듈 기능 1개, 마이그 1건 → 1 → 1.5 → 3 → 4 → 5·6 → 9 → 11
   - L: 도메인 횡단·다중 모듈·외부 연동 → 전체 흐름
   - **step 3(env-setup, worktree 분기)은 모든 사이즈 공통.** 사용자가 "worktree 필요 없음"을 명시하면 그 작업에 한해 분기 부분만 생략(§0-8 사용자 우선).
2. 사용자가 모르겠다면 main이 1줄 근거로 제안 후 확인.
3. 확정값을 `.claude/state.json`의 `task_size`에 기록.
4. 동시에 `needs_migration` 판단 → state.json에 기록 (4-1 호출 게이트).

## 1.5 Plan 완성도 게이트

- `requirements-reviewer` 호출 → plan 검증
- `accept` → step 3 진행
- `reject` → 갭을 두 종류로 분류:
  - **USER_DECISION**: main이 사용자에게 한 번에 구조화 질문(각 항목에 기본 제안값 포함) → 답 반영 → 재호출
  - **DESIGN_GAP**: main이 보완 후 재호출
- `plan_clarify_round++` (state.json), ≥ 3 → 사람 에스컬레이션
- 사용자가 "이대로 진행" 명시 → 즉시 통과, 미해결 갭은 plan에 `OPEN:` 주석

## 3·4 실행 (S/M/L 분기)

### Step 3 — env-setup (모든 사이즈 공통, 자동)

S 작업이라도 main은 다음을 자동 수행:

1. **사전 점검**: jq / docker / pnpm 존재 확인 — 실패 시 사용자에 설치 안내 후 중단
2. **branch 이름 제안**: 작업 제목 기반 슬러그 자동 생성
   - 예: "users에 nickname 컬럼 추가" → `feat/user-nickname`
   - 예: "OAuth refresh token 갱신 로직 수정" → `fix/oauth-refresh`
   - prefix: 신규 기능 `feat/`, 버그 수정 `fix/`, 리팩토링 `refactor/`, 설정 `chore/`
3. **사용자에 1회 확인**: "이 이름으로 worktree 만들까요? `feat/user-nickname` / 역할 `dev`. 다른 이름 원하면 입력. worktree 필요 없으면 'no'."
4. 답 처리:
   - 동의/이름 변경 → `/wt-new {branch} {role}` 실행 → workspace 패치 + `.active` 기록 → wt-guard 활성화
   - "no" → 분기 생략(§0-8 사용자 우선). main에서 직접 작업 진행
5. `pnpm install` + `pnpm dlx prisma generate` (캐시면 거의 즉시)
6. state.json: `current_step = "4-1"` 또는 `"4-2"`(needs_migration에 따라)

### Step 4 — 기능 제작

```
[4-1 GATE] state.needs_migration == true  → db-developer 호출
[4-2]      feature-developer 호출 (swagger 데코레이터 포함)
[4-3]      M·L만: smoke-gate 호출
[PostToolUse hook]  type/lint/prettier — 에이전트 호출 없음
```

각 단계 종료 후 main은 state.json을 갱신(`current_step`, 카운터, `updated_at`).

## reject 처리 (결정론적)

1. SubagentStop 훅이 §3 포맷 강제. main은 Category만 읽으면 됨.
2. Category → 라우팅 표(handoff-protocol)대로 복귀 단계로.
3. 카운터 증가 + state.json 저장.
4. 한도 초과 → 사람 에스컬레이션 (누적 reject 로그 첨부).

## 9·10 병렬 실행 (M·L만)

```
parallel:
  code-reviewer (보안·엣지·회귀)
  requirements-verifier (plan 대비 동작)
```
둘 다 accept → step 11. 하나라도 reject → Category 매핑대로 복귀.

## 사용자 개입 (최우선)

사용자가 방향 전환·중단을 명시한 즉시:
1. 진행 중 서브에이전트 호출 멈춤.
2. state.json: `retry`, `global_reject`, `step1_reentry`, `plan_clarify_round` → 모두 0.
3. `current_step` → 새 plan의 step 1.
4. 새 작업으로 step 0(S/M/L 질문)부터 다시.

## state.json 갱신 책임자
**main만** 쓴다. 서브에이전트는 읽지도 쓰지도 않음 (격리 컨텍스트). 매 reject 직후, step 전환 직후, 사용자 개입 시 덮어쓰기.

## handoff (수동, §1.7)
사용자가 `/context` 보고 무겁다고 판단 → `/handoff` → HANDOFF.md 생성 → `/clear` → 새 세션은 `@HANDOFF.md`만 로드. main은 자동 트리거 금지. 압축 필요 시 권유 알림만.
