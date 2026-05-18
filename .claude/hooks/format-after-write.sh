#!/usr/bin/env bash
# PostToolUse: Write|Edit|MultiEdit
# 변경 파일에 prettier + eslint --fix 실행, 전체에 tsc --noEmit.
# 결정론적 형식/타입 게이트. type/lint/prettier 에이전트 대체.
set -uo pipefail

INPUT="$(cat)"

# jq 없으면 조용히 통과 (env-setup 책임)
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

TARGET="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')"

# 대상 파일이 .ts/.tsx만 처리
case "$TARGET" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# 파일이 실제 존재해야 (편집 직후라 보통 존재)
[ -f "$TARGET" ] || exit 0

cd "${CLAUDE_PROJECT_DIR}" || exit 0

# pnpm 없으면 조용히 통과
command -v pnpm >/dev/null 2>&1 || exit 0

FAILED=0
LOG=""

# 1) prettier --write (해당 파일만)
if pnpm exec prettier --write "$TARGET" >/dev/null 2>&1; then
  :
else
  LOG="${LOG}prettier 실패: $TARGET\n"
  FAILED=1
fi

# 2) eslint --fix (해당 파일만)
if pnpm exec eslint --fix "$TARGET" >/dev/null 2>&1; then
  :
else
  LOG="${LOG}eslint 실패: $TARGET\n"
  FAILED=1
fi

# 3) tsc --noEmit (프로젝트 전체 — TS는 파일 단위 검사가 의미 없음)
TSC_OUT="$(pnpm exec tsc --noEmit 2>&1)" || {
  LOG="${LOG}tsc 실패:\n${TSC_OUT}\n"
  FAILED=1
}

if [ $FAILED -ne 0 ]; then
  # exit 2: stderr를 Claude에 에러로 전달 → main이 사유 인지하고 재작업
  printf "format-after-write 게이트 실패:\n%b" "$LOG" >&2
  exit 2
fi

exit 0
