---
description: worktree 제거 + code-workspace 항목 제거 + 활성이면 .active 삭제. 사용법 /wt-rm {branch}
argument-hint: <branch>
---

# /wt-rm — worktree 제거

당신은 main 오케스트레이터다. 사용자가 입력한 `{branch}`의 worktree를 안전하게 제거한다.

## 인자
- `$1` = branch
- 누락 시 사용자에 질문 + `git worktree list` 출력해 선택 안내.

## 1. 사전 점검

```bash
BRANCH="$1"
WT_PATH="../fanesis-server-${BRANCH//\//-}"
ABS_WT="$(realpath "$WT_PATH" 2>/dev/null || echo "")"

# worktree 존재 확인
git worktree list --porcelain | grep -q "$ABS_WT" || { echo "worktree 없음: $WT_PATH" >&2; exit 1; }

# 미커밋 변경 확인 (안전)
if [ -n "$ABS_WT" ] && [ -d "$ABS_WT" ]; then
  CHANGES="$(git -C "$ABS_WT" status --porcelain)"
  if [ -n "$CHANGES" ]; then
    echo "미커밋 변경 존재. 제거 진행 전 사용자 확인 필요:" >&2
    echo "$CHANGES" >&2
    exit 1
  fi
fi
```

미커밋 변경이 있으면 사용자에 보고 후 진행 여부 확인 (자동 진행 금지).

## 2. worktree 제거

```bash
git worktree remove "$ABS_WT"
```

실패 시 `--force` 자동 사용 금지. 사용자 확인.

## 3. code-workspace 항목 제거 (jq)

```bash
WS_FILE="$CLAUDE_PROJECT_DIR/fanesis-server.code-workspace"
command -v jq >/dev/null 2>&1 || { echo "jq 미설치, workspace 패치 skip." >&2; }

if command -v jq >/dev/null 2>&1 && [ -f "$WS_FILE" ]; then
  tmp="$(mktemp)"
  jq --arg p "$WT_PATH" '.folders |= map(select(.path != $p))' "$WS_FILE" > "$tmp" && mv "$tmp" "$WS_FILE"
  echo "[wt-rm] workspace에서 제거: $WT_PATH"
fi
```

## 4. 활성 worktree였다면 .active 삭제

```bash
ACTIVE_FILE="$CLAUDE_PROJECT_DIR/.claude/worktrees/.active"
if [ -f "$ACTIVE_FILE" ]; then
  CUR="$(cat "$ACTIVE_FILE")"
  if [ "$CUR" = "$ABS_WT" ]; then
    rm -f "$ACTIVE_FILE"
    echo "[wt-rm] 활성 worktree였음 → .active 삭제 (편집 경계 해제됨)"
  fi
fi
```

## 5. 사용자 보고

- 제거된 worktree 경로
- workspace 동기화 결과
- .active 변경 여부
- "브랜치 자체는 살아있음. 브랜치 삭제 원하면 `git branch -d {branch}` 별도 실행."
