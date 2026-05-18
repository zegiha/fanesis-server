#!/usr/bin/env bash
# Stop hook
# state.json의 current_step이 step 11에 도달하지 못한 상태에서 main이 종료 시도하면 차단.
# 다만 사용자가 명시적으로 중단(/clear, /exit 등)했거나 task_size=S에서 9·10 생략된 경우는 통과.
set -uo pipefail

STATE_FILE="${CLAUDE_PROJECT_DIR}/.claude/state.json"

# state.json 없으면 워크플로우 미시작 또는 시작 직전 → 통과
[ -f "$STATE_FILE" ] || exit 0

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

STATE="$(cat "$STATE_FILE")"
STEP="$(echo "$STATE" | jq -r '.current_step // empty')"
SIZE="$(echo "$STATE" | jq -r '.task_size // empty')"

# task_size 미설정 또는 current_step 미설정 → 워크플로우 시작 전 또는 일반 모드 → 통과
[ -n "$STEP" ] || exit 0
[ -n "$SIZE" ] || exit 0

# 종료 허용 단계: 11 (완료 보고) 또는 명시 escalated
case "$STEP" in
  11|escalated|user_interrupted)
    exit 0
    ;;
esac

# S 사이즈: 9·10 생략. step 4 끝나면 11로 가야 함. 4-2 이전에 종료는 차단.
if [ "$SIZE" = "S" ]; then
  case "$STEP" in
    4-2|4-3|hook|done) exit 0 ;;
  esac
fi

# 그 외 — 진행 중인 채로 종료 시도
REASON="진행 중인 워크플로우 종료 시도 (size=$SIZE, current_step=$STEP). step 11(완료 보고) 도달 또는 'escalated'/'user_interrupted'로 명시 후 종료. 강제 종료가 필요하면 사용자에게 보고."
echo "$REASON" >&2

# JSON 출력으로 stop 결정 반환 (decision: block)
if command -v jq >/dev/null 2>&1; then
  printf '{"decision":"block","reason":%s}' "$(printf '%s' "$REASON" | jq -Rs .)"
fi
exit 0
