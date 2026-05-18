---
description: 현재 브랜치에서 PR 생성. 변경 분석 + 제목/본문 자동 작성 + gh pr create. 사용자에게 PR URL 반환.
---

# /pr — Pull Request 생성

당신은 main 오케스트레이터다. 현재 브랜치 변경분을 분석해서 PR을 만든다.

## 사전 점검

1. `gh auth status`로 인증 확인. 미인증이면 사용자에게 `gh auth login` 안내 후 중단.
2. 현재 브랜치가 main/master인지 확인. 맞다면 "main 직접 PR은 불가, 새 브랜치 생성 필요" 사용자에 보고하고 중단.
3. base 브랜치 결정: 기본 `main`. 다르면 사용자에 확인.

## 변경 분석 (병렬 실행)

```bash
git status                                    # 미커밋 변경 확인
git diff origin/main...HEAD                   # base와 diff (전체)
git log origin/main..HEAD --oneline           # 커밋 히스토리
git rev-parse --abbrev-ref --symbolic-full-name @{u}  # upstream 추적 여부
```

미커밋 변경이 있으면 사용자에 보고하고 commit 여부 확인 (자동 commit 금지).

## upstream 푸시

upstream 미설정이면 `git push -u origin {branch}`. 이미 있으면 `git push`.
실패하면 사용자에 보고 (force push 자동 금지).

## PR 본문 작성

- 제목: 70자 이하. feat:/fix:/chore: 등 conventional commit 스타일.
- 본문: 아래 템플릿 + 변경 요약. .github/pull_request_template.md가 있으면 그 양식 따름.

```markdown
## Summary
- {bullet 2-4개, "why" 중심}

## Changes
- {변경 카테고리별 그룹화}

## Test plan
- [ ] {수동 검증 항목}
- [ ] pnpm typecheck
- [ ] pnpm lint:check
- [ ] pnpm test:unit
- [ ] (DB 변경 시) pnpm test:integration

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## 생성

```bash
gh pr create --draft --title "..." --body "$(cat <<'EOF'
...
EOF
)"
```

기본 draft. 사용자가 ready 명시하면 `--draft` 제거.

## 반환

PR URL을 사용자에게 보고. 더불어 다음 권장 액션 1줄:
- "리뷰 준비되면 `gh pr ready {URL}` 또는 `/ultrareview`"
