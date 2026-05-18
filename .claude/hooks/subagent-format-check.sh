#!/usr/bin/env bash
# SubagentStop hook
# 검증/리뷰 에이전트의 마지막 출력이 handoff-protocol §3 포맷·Category enum을 지키는지 검사.
# 위반 시 exit 2 → main이 재시도 강제. 구현 에이전트(db-developer/feature-developer/test-writer)는
# §3 포맷을 강제받지 않으므로 skip.
set -uo pipefail

INPUT="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0

# subagent_type: requirements-reviewer | smoke-gate | test-reviewer | swagger-check | code-reviewer | requirements-verifier
SUBAGENT="$(printf '%s' "$INPUT" | jq -r '.subagent_type // .agent_name // empty')"

case "$SUBAGENT" in
  requirements-reviewer|smoke-gate|test-reviewer|swagger-check|code-reviewer|requirements-verifier)
    ;;
  *)
    # 구현 에이전트 또는 알 수 없는 에이전트는 검사 skip
    exit 0
    ;;
esac

# 에이전트의 마지막 응답 추출 (다양한 키 시도)
LAST_MSG="$(printf '%s' "$INPUT" | jq -r '.last_assistant_message // .response // .output // empty')"

# 추출 실패 시 통과(소프트 fail)
[ -n "$LAST_MSG" ] || exit 0

# 1) # Result accept|reject 라인 존재
if ! echo "$LAST_MSG" | grep -qE '^# Result'; then
  echo "포맷 위반($SUBAGENT): '# Result' 헤더 누락. handoff-protocol §3 포맷으로 재출력 요청." >&2
  exit 2
fi

RESULT_LINE="$(echo "$LAST_MSG" | grep -A1 '^# Result' | tail -1 | tr -d '[:space:]')"
case "$RESULT_LINE" in
  accept|reject) ;;
  *)
    echo "포맷 위반($SUBAGENT): Result 값이 'accept' 또는 'reject'가 아님 (got: '$RESULT_LINE')." >&2
    exit 2
    ;;
esac

# reject면 Category·Reason·Detail 검사
if [ "$RESULT_LINE" = "reject" ]; then
  if ! echo "$LAST_MSG" | grep -qE '^# Category'; then
    echo "포맷 위반($SUBAGENT): reject인데 '# Category' 누락." >&2
    exit 2
  fi
  CAT_LINE="$(echo "$LAST_MSG" | grep -A1 '^# Category' | tail -1 | tr -d '[:space:]')"
  case "$CAT_LINE" in
    SPEC_DEFECT|REQUIREMENT_MISMATCH|IMPL_BUG|DB_DEFECT|CODE_QUALITY) ;;
    *)
      echo "포맷 위반($SUBAGENT): Category enum 위반 (got: '$CAT_LINE'). 허용: SPEC_DEFECT|REQUIREMENT_MISMATCH|IMPL_BUG|DB_DEFECT|CODE_QUALITY" >&2
      exit 2
      ;;
  esac
  if ! echo "$LAST_MSG" | grep -qE '^# Reason'; then
    echo "포맷 위반($SUBAGENT): reject인데 '# Reason' 누락." >&2
    exit 2
  fi
  if ! echo "$LAST_MSG" | grep -qE '^# Detail'; then
    echo "포맷 위반($SUBAGENT): reject인데 '# Detail' 누락." >&2
    exit 2
  fi
fi

exit 0
