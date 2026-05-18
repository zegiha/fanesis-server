---
description: git worktree 분기 + code-workspace JSON 패치 + .active 기록. 사용법 /wt-new {branch} {역할}
argument-hint: <branch> <role>
---

# /wt-new — 새 worktree 분기

당신은 main 오케스트레이터다. 사용자가 입력한 `{branch}`와 `{역할}`로 새 worktree를 만들고 활성화한다.

## 인자

- `$1` = branch (예: `feat/oauth`)
- `$2` = 역할 (예: `dev`, `review`)
- 둘 다 누락 시 사용자에 질문.

## 1. 사전 점검

```bash
# jq 필수 (workspace JSON 패치)
command -v jq >/dev/null 2>&1 || { echo "jq 미설치. 'sudo apt-get install -y jq' 후 재시도." >&2; exit 1; }

# 기존 worktree 충돌 확인
git worktree list --porcelain | grep -q "$1" && { echo "이미 worktree로 등록된 브랜치." >&2; exit 1; }
```

## 2. worktree 생성

```bash
# branch가 이미 존재하면 -b 없이, 신규면 -b로 생성
BRANCH="$1"
ROLE="$2"
WT_PATH="../fanesis-server-${BRANCH//\//-}"   # 슬래시는 dash로 (디렉터리명 안전)

if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  git worktree add "$WT_PATH" "$BRANCH"
else
  git worktree add "$WT_PATH" -b "$BRANCH"
fi
```

## 3. code-workspace JSON 패치 (jq)

```bash
WS_FILE="$CLAUDE_PROJECT_DIR/fanesis-server.code-workspace"
NAME="${ROLE}-${BRANCH}"

# 중복 체크 → 없으면 추가
EXISTS="$(jq --arg p "$WT_PATH" '[.folders[]?.path] | any(. == $p)' "$WS_FILE")"
if [ "$EXISTS" = "false" ]; then
  tmp="$(mktemp)"
  jq --arg p "$WT_PATH" --arg n "$NAME" '.folders += [{"name": $n, "path": $p}]' "$WS_FILE" > "$tmp" && mv "$tmp" "$WS_FILE"
  echo "[wt-new] workspace에 추가: $NAME ($WT_PATH)"
fi
```

## 4. .active 기록 (편집 경계 활성화)

```bash
ABS_WT="$(realpath "$WT_PATH")"
echo "$ABS_WT" > "$CLAUDE_PROJECT_DIR/.claude/worktrees/.active"
echo "[wt-new] .active 설정: $ABS_WT"
```

## 5. 사용자 보고

- 생성된 worktree 절대경로
- workspace에 추가된 folder name
- "이후 모든 편집은 이 worktree 안으로 한정. 해제하려면 /wt-main."
- "다른 worktree 외부 편집이 필요하면 `.claude/worktrees/.allowlist`에 prefix 한 줄 추가."

## 실패 처리

각 단계 실패 시 즉시 사용자에 보고. 자동 롤백 금지 (사용자 확인 후 수동 처리).
