#!/usr/bin/env bash
# SessionStart: compact
# 자동 압축 후 state.json (+HANDOFF.md 경로)을 additionalContext로 재주입.
# /handoff 수동 메커니즘이 1차고 이건 백업 안전망.
set -uo pipefail

STATE_FILE="${CLAUDE_PROJECT_DIR}/.claude/state.json"

if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  # jq 없으면 raw 그대로
  CTX="진행 상태 복원 (state.json):
$(cat "$STATE_FILE")"
  echo "$CTX"
  exit 0
fi

STATE="$(cat "$STATE_FILE")"
HANDOFF_PATH="$(echo "$STATE" | jq -r '.handoff_path // empty')"
HANDOFF_EXISTS="없음"
[ -n "$HANDOFF_PATH" ] && [ -f "$HANDOFF_PATH" ] && HANDOFF_EXISTS="존재 ($HANDOFF_PATH)"

CTX="진행 상태 복원 (자동 압축 후 백업):
- state.json: $(echo "$STATE" | jq -c .)
- HANDOFF.md: $HANDOFF_EXISTS

main은 이 상태로 카운터·current_step을 복원하고, 필요 시 HANDOFF.md를 Read해서 이어 진행."

printf '%s' "$CTX" | jq -Rs '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: .}}'
exit 0
