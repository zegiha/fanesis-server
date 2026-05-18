#!/usr/bin/env bash
# PreToolUse: Bash
# 파괴적·되돌릴 수 없는 명령 차단. 안전판.
set -uo pipefail

INPUT="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0

CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[ -n "$CMD" ] || exit 0

# 차단 패턴 (확장 정규식)
# 1) rm -rf / 또는 홈 디렉터리 통째
# 2) DROP TABLE / DROP DATABASE / TRUNCATE (raw SQL psql 등)
# 3) prisma migrate reset (DB 통째 재생성)
# 4) git push --force(-f) main/master / git reset --hard / git clean -fd / branch -D
# 5) 디스크/파티션 (mkfs, dd of=/dev/...)
# 6) chmod -R 0/777 /  (시스템 루트 권한 변경)

block() {
  echo "차단: 파괴적 명령 감지 → $1" >&2
  echo "  사유: $2" >&2
  echo "  진행이 필요하면 사용자에게 명시적 승인 요청." >&2
  exit 2
}

# rm -rf 위험 경로
if echo "$CMD" | grep -qE '(^|[[:space:]])rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)[[:space:]]+(/|~|\$HOME|/home|/usr|/etc|/var)([[:space:]]|$|/)'; then
  block "$CMD" "rm -rf 시스템/홈 경로"
fi
# rm -rf . 또는 ./ 또는 * — 현재 디렉터리 통째
if echo "$CMD" | grep -qE '(^|[[:space:]])rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)[[:space:]]+(\.|\./|\*)([[:space:]]|$)'; then
  block "$CMD" "rm -rf 현재 디렉터리 통째"
fi

# DROP TABLE / DROP DATABASE / TRUNCATE
if echo "$CMD" | grep -qiE '\b(DROP[[:space:]]+(TABLE|DATABASE|SCHEMA)|TRUNCATE[[:space:]]+TABLE)\b'; then
  block "$CMD" "raw SQL DROP/TRUNCATE — 마이그레이션으로 처리"
fi

# prisma migrate reset
if echo "$CMD" | grep -qE 'prisma[[:space:]]+migrate[[:space:]]+reset'; then
  block "$CMD" "prisma migrate reset 은 DB 전체 데이터 손실"
fi

# git push --force / -f to main/master
if echo "$CMD" | grep -qE 'git[[:space:]]+push.*(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$))'; then
  if echo "$CMD" | grep -qE '(main|master)([[:space:]]|$)'; then
    block "$CMD" "main/master 강제 푸시"
  fi
fi

# git reset --hard
if echo "$CMD" | grep -qE 'git[[:space:]]+reset[[:space:]]+--hard'; then
  block "$CMD" "git reset --hard — 작업 손실 위험"
fi

# git clean -fd
if echo "$CMD" | grep -qE 'git[[:space:]]+clean.*-[a-zA-Z]*f'; then
  block "$CMD" "git clean -f — 추적 안 된 파일 영구 삭제"
fi

# git branch -D
if echo "$CMD" | grep -qE 'git[[:space:]]+branch[[:space:]]+-D'; then
  block "$CMD" "git branch -D — 미머지 브랜치 강제 삭제"
fi

# mkfs, dd of=/dev/
if echo "$CMD" | grep -qE '(mkfs\.|dd[[:space:]]+.*of=/dev/)'; then
  block "$CMD" "디스크/파티션 변경"
fi

exit 0
