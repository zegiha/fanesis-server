---
name: orchestration-loop
description: main 전용. S/M/L 라우팅, 카운터·전역 예산·에스컬레이션, 사용자 개입 시 리셋. claude-code-backend-flow.md의 §0·§4·§6을 실행 가능한 절차로.
---

# orchestration-loop — main 오케스트레이터 플레이북

> 단일 진실 출처: `/claude-code-backend-flow.md` (저장소 루트). 본 Skill은 main이 매 작업마다 실행하는 절차서.
> 계약/포맷은 `.claude/skills/handoff-protocol/SKILL.md` 참조.

## 0. 작업 시작 (step 1)

1. **사용자에게 S/M/L 질문** (자동 분류 금지). 각 크기가 도는 단계 한 줄 요약 같이 제시.
   - S: 단일 컬럼/엔드포인트, 설정 변경 → 1 → 4-2 → hook → 11
   - M: 한 모듈 기능 1개, 마이그 1건 → 1 → 1.5 → 3 → 4 → 5·6 → 9 → 11
   - L: 도메인 횡단·다중 모듈·외부 연동 → 전체 흐름
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

## 3·4 실행 (S/M/L 분기 그대로)

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
