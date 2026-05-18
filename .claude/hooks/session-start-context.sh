#!/usr/bin/env bash
# SessionStart: startup
# 세션 시작 시 환경 신선도(git 브랜치·docker DB·prisma generate)를 컨텍스트로 주입.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR}" 2>/dev/null || exit 0

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
ACTIVE_WT=""
[ -f .claude/worktrees/.active ] && ACTIVE_WT="$(cat .claude/worktrees/.active 2>/dev/null || true)"

DOCKER_STATUS="unknown"
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    DOCKER_STATUS="up"
  else
    DOCKER_STATUS="down"
  fi
fi

PRISMA_FRESH="unknown"
if [ -f prisma/schema.prisma ] && [ -d src/generated/prisma ]; then
  if [ prisma/schema.prisma -nt src/generated/prisma ]; then
    PRISMA_FRESH="stale (schema.prisma > generated)"
  else
    PRISMA_FRESH="ok"
  fi
fi

JQ_STATUS="missing"
command -v jq >/dev/null 2>&1 && JQ_STATUS="ok"

CTX="환경 점검:
- git 브랜치: ${BRANCH}
- 활성 worktree(.active): ${ACTIVE_WT:-없음(일반 모드)}
- docker 데몬: ${DOCKER_STATUS}
- prisma generate: ${PRISMA_FRESH}
- jq: ${JQ_STATUS}"

if command -v jq >/dev/null 2>&1; then
  printf '%s' "$CTX" | jq -Rs '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: .}}'
else
  # jq 없으면 stdout으로만 출력 (Claude에 그대로 전달)
  echo "$CTX"
fi

exit 0
