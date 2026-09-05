# OSMU R2 저장 계층 핸드오프

갱신: 2026-09-01 03:48 KST  
트랙: `osmu-r2store0901`  
브랜치: `feat/design-system-and-missing-features`

## 무엇을 어디까지 했나

- `dashboard/src/lib/media-store.ts`에 `put`, `get`, `delete`, `exists` 저장 계층을 구현했다.
- R2 환경변수 네 개가 모두 있으면 비공개 R2의 `tenants/<tenant_id>/images/<파일명>` 키를 쓴다.
- R2 설정이 모두 없으면 기존 로컬 볼륨을 유지한다. 일부 설정이나 연결 장애는 로컬 성공으로 위장하지 않는다.
- 업로드, HMAC 서명 배달, 삭제 라우트를 저장 계층으로 전환했다.
- R2 객체 404에만 기존 로컬 파일을 조회해 과거 예약 발행 URL을 보존한다.
- `dashboard/scripts/migrate-local-images-to-r2.mjs`를 추가했다. 운영 실행은 하지 않았다.
- 환경변수 이름과 배포 workflow, 설정 화면, 아키텍처, 구현현황을 갱신했다.
- 구현 커밋 `fd33b653`, `01e0f1bd`는 원격에 반영됐다.
- 타입 보정과 검증 기록 커밋 `b8bd3922`는 로컬에만 있다.

## 남은 이슈·블로커

- `git push origin feat/design-system-and-missing-features`는 실행 정책이 승인을 요구했지만 현재 세션은 승인 요청이 금지돼 실행되지 않았다.
- 전체 Vitest는 R2가 아닌 Studio `검토 요청하기` 버튼 계약 2건 때문에 실패한다.
- 운영 R2 자격증명 주입, 실제 앱 경유 업로드·배달, 로컬 파일 이전은 미실행·미검증이다.
- 공유 작업트리의 `.codex/logs/harness.jsonl`, `docs/requests/inbox/chairman-2026-08.md`, `docs/requests/inbox/chairman-2026-09.md`, `session-state.osmu-editroom0901.md`는 다른 세션 소유이므로 건드리지 않는다.

## 다음에 칠 명령

1. 외부 쓰기 승인이 가능한 세션에서 `git push origin feat/design-system-and-missing-features`
2. `git ls-remote origin refs/heads/feat/design-system-and-missing-features`로 원격이 로컬 최신 커밋을 가리키는지 확인
3. Studio 계약 실패 2건 해소 뒤 `cd dashboard && npx vitest run`
4. QA 승인 뒤에만 운영 자격증명 주입과 `node scripts/migrate-local-images-to-r2.mjs --dry-run` 검토

## 검증했나

- 깨끗한 `npm ci` 설치에서 `npx tsc --noEmit`: 종료 코드 0
- `npx vitest run tests/lib/media-store.test.ts tests/api/images-r2-upload.test.ts`: 2파일 10건 통과
- 실제 PostgreSQL 스키마와 RLS를 붙인 전체 Vitest: 211파일 중 210파일 통과, 1,569건 중 1,566건 통과, 조건부 1건 제외, Studio 2건 실패
- `npm run build`: 종료 코드 0, 정적 페이지 177/177
- `bash ~/.claude/harness/bin/design-lint.sh dashboard/src`: 위반 0
- 외부 HMAC URL 호환: `IMG-R2-03`에서 R2 404 뒤 기존 로컬 원본 HTTP 200 확인
- 운영 R2 실제 경로: 미검증

SKILLS_USED: 없음 / SKILLS_SKIPPED: qa는 다음 단계의 브라우저 E2E 소유라 사용하지 않았다.

SOURCES: `wiki/거버넌스/결정.md` ADR-006·ADR-004 | `wiki/거버넌스/실수.md` 2026-09-01 기록 | `wiki/5-hubs/hub-eng/architecture/system-architecture.md` | Cloudflare R2 공식 문서

MODEL: gpt-codex/gpt-5.6-sol / code-builder
