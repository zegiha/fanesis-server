#!/usr/bin/env bash
# PreToolUse: Edit|Write|MultiEdit
# 활성 worktree(.active) 밖 편집을 결정론적으로 차단. 화이트리스트로 ~/.claude, ~/.config,
# 프로젝트 .claude/, .allowlist 명시 경로는 통과.
set -euo pipefail

ACTIVE_FILE="${CLAUDE_PROJECT_DIR}/.claude/worktrees/.active"
ALLOWLIST_FILE="${CLAUDE_PROJECT_DIR}/.claude/worktrees/.allowlist"

# 활성 worktree 미지정 → 일반 모드(통과)
[ -f "$ACTIVE_FILE" ] || exit 0

# .active가 비어있으면 일반 모드
ACTIVE_RAW="$(cat "$ACTIVE_FILE" 2>/dev/null || true)"
[ -n "$ACTIVE_RAW" ] || exit 0
ACTIVE="$(realpath "$ACTIVE_RAW" 2>/dev/null || echo "$ACTIVE_RAW")"

INPUT="$(cat)"

# jq 없으면 안전 측 통과 (env-setup이 jq 부재를 잡아주는 게 1차 방어)
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

TARGET="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')"
[ -n "$TARGET" ] || exit 0  # 경로 없으면 판단 보류, 통과

# 미존재 파일(신규 생성) 대비: 존재하는 상위 디렉터리 기준 해석
DIR="$(dirname "$TARGET")"
while [ ! -e "$DIR" ] && [ "$DIR" != "/" ]; do DIR="$(dirname "$DIR")"; done
if [ "$DIR" = "/" ] && [ ! -e "$DIR" ]; then
  # 비정상 경로 — 판단 보류
  exit 0
fi
RESOLVED="$(realpath "$DIR" 2>/dev/null || echo "$DIR")/$(basename "$TARGET")"

# 화이트리스트: .active가 있어도 통과
WHITELIST=(
  "$HOME/.claude/"
  "$HOME/.config/"
  "${CLAUDE_PROJECT_DIR}/.claude/"
)
if [ -f "$ALLOWLIST_FILE" ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && WHITELIST+=("$line")
  done < "$ALLOWLIST_FILE"
fi
for w in "${WHITELIST[@]}"; do
  case "$RESOLVED" in "$w"*) exit 0 ;; esac
done

# 경계 판정
case "$RESOLVED" in
  "$ACTIVE"/*) exit 0 ;;
  "$ACTIVE") exit 0 ;;
  *)
    echo "차단: 활성 worktree($ACTIVE) 밖 편집 시도 → $RESOLVED. .allowlist 추가 또는 /wt-main 으로 해제." >&2
    exit 2
    ;;
esac
