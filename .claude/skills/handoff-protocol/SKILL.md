---
name: handoff-protocol
description: HANDOFF.md 스키마와 검증/리뷰 에이전트 반환 포맷·Category·라우팅 단일 진실 계약.
---

# Handoff Protocol — 단일 계약 (이 파일이 유일한 출처)

## HANDOFF.md
- 위치: `.claude/worktrees/{branch}/HANDOFF.md` (worktree 없으면 `.claude/HANDOFF.md`)
- 각 에이전트는 자기 섹션을 **append**. 기존 섹션 덮어쓰지 말 것.
- 섹션 헤더: `## [{agent-name}] {ISO8601}` + 본문(변경 파일·핵심 결정·잔여 이슈).

## 검증/리뷰 에이전트 반환 포맷 (필수, 그대로)
```
# Result
accept | reject
---
# Category
SPEC_DEFECT | REQUIREMENT_MISMATCH | IMPL_BUG | DB_DEFECT | CODE_QUALITY
# Reason
<한 줄 요약>
# Detail
<file:line + 무엇 + 왜>
# Suggested Fix
<선택>
```
`accept`면 Category는 생략 가능. `reject`면 Category 필수.

## Category → 라우팅 (main 결정론적)
| Category | 복귀 위치 | 카운터 |
|---|---|---|
| SPEC_DEFECT | step 1 (re-plan) | step1_reentry++ |
| REQUIREMENT_MISMATCH | step 1 재검토 후 4-2 | step1_reentry++ |
| IMPL_BUG | 4-2 feature-developer | retry.feat++ |
| DB_DEFECT | 4-1 db-developer | retry.db++ |
| CODE_QUALITY | 4-2 feature-developer | retry.feat++ |

모든 reject는 `global_reject++`.

## 카운터 한도 (`.claude/state.json`)
- `retry.feat ≥ 3` → 사람 에스컬레이션
- `retry.db ≥ 3` → 사람 에스컬레이션
- `global_reject ≥ 6` → 사람 에스컬레이션
- `step1_reentry ≥ 2` → 사람 에스컬레이션 (plan 자체 흔들림)
- `plan_clarify_round ≥ 3` → 사람 에스컬레이션 (요구사항 불명확)

## 사용자 개입 시
사용자가 방향 전환·중단 지시 → 진행 중 단계 즉시 중지. `state.json`의 `retry`·`global_reject`·`step1_reentry`·`plan_clarify_round` 전부 0 리셋, `current_step`을 새 plan step 1로.
