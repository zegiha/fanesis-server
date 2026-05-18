---
description: 컨텍스트 압축 인수인계 — 현재 작업 상태를 HANDOFF.md로 정리해 다음 세션이 그 파일 하나로 이어받게 한다. 사용자 수동 호출 전용.
---

# /handoff — 인수인계 문서 생성

당신은 main 오케스트레이터다. 사용자가 `/context`를 보고 컨텍스트가 무거워졌다고 판단해 이 커맨드를 호출했다. 현재 상태를 HANDOFF.md로 정리하고 state.json을 최신화한다.

자동 트리거 금지. 사용자가 명시 호출했을 때만 동작.

## 위치 결정

```bash
ACTIVE_FILE="$CLAUDE_PROJECT_DIR/.claude/worktrees/.active"
if [ -f "$ACTIVE_FILE" ]; then
  ACTIVE="$(cat "$ACTIVE_FILE")"
  BRANCH="$(git -C "$ACTIVE" branch --show-current 2>/dev/null || echo unknown)"
  HANDOFF_DIR="$CLAUDE_PROJECT_DIR/.claude/worktrees/$BRANCH"
  mkdir -p "$HANDOFF_DIR"
  HANDOFF_PATH="$HANDOFF_DIR/HANDOFF.md"
else
  HANDOFF_PATH="$CLAUDE_PROJECT_DIR/.claude/HANDOFF.md"
fi
```

## HANDOFF.md 작성 구조

다음 섹션을 채워 작성:

```markdown
# {작업명} — Handoff
생성: {ISO8601}

## 목표 (Goal)
{사용자가 처음 요청한 것 한 줄}

## 진행 상태
### ✅ 완료된 작업
- {파일/단계 목록}

### What Worked
- {효과적이었던 접근}

### ❌ What Didn't Work
- {시도했으나 실패 — 이유 포함}

## 현재 문제 (있다면)
{지금 막힌 지점, 디버깅 단서}

## 다음 단계 (Next Steps)
다음 세션이 빈 컨텍스트로 시작해서 이 파일만 읽고 바로 실행할 수 있게:
1. {구체 명령/파일/액션}
2. ...

## 상태 스냅샷
state.json:
{...최신값 그대로...}
활성 worktree: {ACTIVE 또는 "없음"}
git 브랜치: {현재}
미커밋 변경: {요약}
```

## state.json 최신화

```bash
STATE_FILE="$CLAUDE_PROJECT_DIR/.claude/state.json"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
tmp="$(mktemp)"
jq --arg p "$HANDOFF_PATH" --arg t "$NOW" \
  '.handoff_path = $p | .updated_at = $t' \
  "$STATE_FILE" > "$tmp" && mv "$tmp" "$STATE_FILE"
```

## 사용자 보고

- 생성된 HANDOFF.md 경로
- state.json 갱신 확인
- 다음 단계 안내:
  ```
  1. /context 로 사용량 재확인
  2. /clear (또는 새 세션)
  3. 새 세션에서: @HANDOFF.md
  ```
