## Summary
<!-- 2-4 bullet, "why" 중심. 무엇을 했는지보다 왜 필요했는지. -->
-

## Changes
<!-- 변경 카테고리별 그룹화 (예: feat / refactor / fix / chore) -->
-

## DB / Migration
<!-- DB 스키마/마이그 변경이 있으면 -->
- [ ] 새 마이그 파일: `prisma/migrations/...`
- [ ] CHECK / partial unique / trigger 추가 시 raw SQL로 작성됨
- [ ] rollback 영향 검토됨

## API / Swagger
<!-- 신규 엔드포인트가 있으면 -->
- [ ] `@ApiTags` / `@ApiBearerAuth` 적용
- [ ] 도메인 에러 `@ApiErrorResponse` 첨부
- [ ] DTO `@ApiProperty` 완비

## Test plan
- [ ] `pnpm typecheck`
- [ ] `pnpm lint:check`
- [ ] `pnpm format:check`
- [ ] `pnpm test:unit`
- [ ] (DB 변경 시) `pnpm test:integration`
- [ ] 수동 검증: <!-- 시나리오 -->

## Open / Manual verification
<!-- requirements-verifier가 검증 불가로 표시한 항목 (Google OAuth, APNs, IAP 등) -->
-

🤖 Generated with [Claude Code](https://claude.com/claude-code)
