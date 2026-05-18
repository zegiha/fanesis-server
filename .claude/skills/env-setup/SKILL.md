---
name: env-setup
description: 기능 작업 시작 전 결정론적 환경 셋업. worktree 분기·workspace 패치·docker DB·prisma·jq/포트 충돌 점검.
---

# env-setup — main이 step 3에서 실행

## 1. 사전 점검 (없으면 중단 + 안내)

```bash
# jq 필수 (wt-guard.sh, sync, code-workspace 패치에 사용)
command -v jq >/dev/null 2>&1 || {
  echo "[env-setup] jq 미설치. 설치 후 재시도:" >&2
  echo "  Debian/Ubuntu/WSL: sudo apt-get install -y jq" >&2
  echo "  macOS:            brew install jq" >&2
  exit 1
}

# Docker 데몬 (Postgres 컨테이너 등)
docker info >/dev/null 2>&1 || {
  echo "[env-setup] Docker 데몬 미실행. integration 테스트와 DB 작업 시 필요." >&2
  exit 1
}

# pnpm
command -v pnpm >/dev/null 2>&1 || { echo "[env-setup] pnpm 미설치." >&2; exit 1; }
```

## 2. 의존성 동기화

```bash
pnpm install
pnpm dlx prisma generate
```

## 3. Worktree 분기 (필요 시)

`/wt-new {branch} {역할}` 호출 흐름:
1. `git worktree add ../fanesis-server-{branch} -b {branch}` (또는 기존 브랜치 사용)
2. `fanesis-server.code-workspace` JSON 패치 (jq): `folders` 배열에 `{name:"{역할}-{branch}", path:"../fanesis-server-{branch}"}` 추가 (중복 skip)
3. `.claude/worktrees/.active`에 새 worktree 절대경로 한 줄 기록 (이후 wt-guard.sh가 편집 경계 강제)

## 4. Worktree별 DB 격리 (병렬 작업 시 충돌 방지)

같은 Postgres 컨테이너·스키마 공유 금지. worktree마다:
- `.env`의 `DATABASE_URL`을 다른 포트 또는 다른 스키마로 분기
  - 예: main → `postgresql://...@localhost:5432/fanesis?schema=public`
  - 예: worktree A → `...?schema=wt_a` 또는 `...:5433/fanesis`
- 새 schema 사용 시 `pnpm dlx prisma migrate deploy`로 마이그 적용
- 같은 DB 인스턴스를 schema로 나눌지, 컨테이너 자체를 분리할지는 작업 규모로 판단

## 5. SessionStart context (자동)
`.claude/hooks/session-start-context.sh`가 git 브랜치·docker DB 상태·prisma generate 신선도를 컨텍스트로 주입. env-setup은 그 위에서 사람이 결정하는 작업만.
