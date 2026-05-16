#!/usr/bin/env bash
# Claude Code PostToolUse hook: git worktree add 명령 후
# fanesis.code-workspace의 folders 배열에 새 worktree를 자동 반영.
set -euo pipefail

input=$(cat)
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty')

case "$tool_name" in
  EnterWorktree)
    ;;
  Bash)
    cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
    [[ "$cmd" == *"git worktree"* ]] || exit 0
    ;;
  *)
    exit 0
    ;;
esac

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR"

ws_file=$(find "$PROJECT_DIR" -maxdepth 2 -name "*.code-workspace" -not -path "*/node_modules/*" 2>/dev/null | head -1)

if [[ -z "$ws_file" ]]; then
  echo "[sync-worktree] .code-workspace 파일 없음, 건너뜀" >&2
  exit 0
fi

if [[ ! -s "$ws_file" ]] || ! jq -e . "$ws_file" >/dev/null 2>&1; then
  printf '{"folders":[]}\n' > "$ws_file"
fi

if ! jq -e '.folders' "$ws_file" >/dev/null 2>&1; then
  tmp=$(mktemp)
  jq '. + {folders: (.folders // [])}' "$ws_file" > "$tmp" && mv "$tmp" "$ws_file"
fi

main_wt=$(git rev-parse --show-toplevel)
ws_dir=$(cd "$(dirname "$ws_file")" && pwd)

worktrees=()
while IFS= read -r line; do
  worktrees+=("$line")
done < <(git worktree list --porcelain | awk '/^worktree /{print $2}')

added=0
for wt in "${worktrees[@]}"; do
  [[ "$wt" == "$main_wt" ]] && continue

  rel=$(python3 -c "import os.path,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))" "$wt" "$ws_dir")
  # 너무 멀리 떨어졌으면 절대경로 사용
  if [[ "$rel" == ../../../* ]]; then
    rel="$wt"
  fi

  exists=$(jq --arg r "$rel" --arg a "$wt" \
    '[.folders[]?.path] | any(. == $r or . == $a)' "$ws_file")
  if [[ "$exists" == "true" ]]; then
    continue
  fi

  name=$(git -C "$wt" branch --show-current 2>/dev/null || true)
  [[ -z "$name" ]] && name=$(basename "$wt")

  tmp=$(mktemp)
  jq --arg p "$rel" --arg n "$name" \
    '.folders += [{"name": $n, "path": $p}]' \
    "$ws_file" > "$tmp" && mv "$tmp" "$ws_file"

  echo "[sync-worktree] 추가: $name ($rel)" >&2
  added=$((added+1))
done

[[ $added -gt 0 ]] && echo "[sync-worktree] $added개 worktree 반영" >&2
exit 0
