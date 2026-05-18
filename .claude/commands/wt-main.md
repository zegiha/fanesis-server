---
description: .active 삭제하여 worktree 편집 경계 해제. main 작업 명시 허용.
---

# /wt-main — 활성 worktree 경계 해제

당신은 main 오케스트레이터다. 사용자가 worktree 격리에서 벗어나 main(또는 임의 위치)에서 작업할 수 있도록 `.active` 파일을 삭제한다.

## 동작

```bash
ACTIVE_FILE="$CLAUDE_PROJECT_DIR/.claude/worktrees/.active"

if [ ! -f "$ACTIVE_FILE" ]; then
  echo "이미 일반 모드 (활성 worktree 없음)."
  exit 0
fi

CUR="$(cat "$ACTIVE_FILE")"
rm -f "$ACTIVE_FILE"
echo "[wt-main] 경계 해제. 이전 활성: $CUR"
echo "이제 모든 경로 편집 가능. 다시 worktree로 돌아가려면 /wt-new 또는 ACTIVE_FILE에 경로 기록."
```

## 주의

- `.active`는 **사용자가 명시 호출(/wt-main 또는 /wt-rm)할 때만** 삭제. 자동 해제 금지 — 이미 wt-guard.sh가 그렇게 설계됨.
- worktree 자체는 제거되지 않음. 디렉터리·브랜치·workspace 등록 그대로 유지.
