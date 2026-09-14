# OSMU 심사 전 소셜 연결 안내 핸드오프

## 무엇을 어디까지 했나

- 기반: `wiki/거버넌스/결정.md` ADR-004, `wiki/거버넌스/실수.md` 최신 기록,
  `wiki/5-hubs/hub-eng/architecture/system-architecture.md` OAuth 절과 현행 readiness 코드.
- 구현: `/api/connect/readiness`의 선택형 `guidance` 계약, Threads와 Instagram의 서로 다른 초대
  수락 링크, 연결 단추 활성 유지, 안내 단계 표시, 초대 미수락 오류의 한국어 변환과 링크 재노출.
- 심사 후 제거: `OAUTH_APP_REVIEW_APPROVED_PROVIDERS`에 승인 provider를 등록하면 서버가 심사 대기
  사유와 안내를 내려주지 않는다. 화면은 서버 안내만 렌더링한다.
- 문서: 아키텍처 OAuth 절, `docs/구현현황.md`, 환경변수 표를 갱신했다.
- 커밋: `ec092a89`, `45b75f7c`, `2435e3cd`.

## 남은 이슈·블로커

- `git push origin feat/design-system-and-missing-features`가 실행 정책의 승인 필요 판정으로 두 차례
  차단됐다. 현재 세션은 승인 요청이 금지돼 우회하지 않았다.
- 로컬 HEAD는 `2435e3cd`, 원격 HEAD는 `88407d09`로 관찰했다. 로컬 브랜치는 원격보다 4커밋 앞서 있다.
- 운영 배포, 실제 Threads와 Instagram 초대 수락, 실제 Meta OAuth 왕복은 미검증이다.
- 다른 세션 소유 변경인 `.codex/logs/harness.jsonl`, `docs/prototype/qa-flow/observations.json`,
  `docs/requests/inbox/chairman-2026-08.md`, QA 캡처 PNG는 건드리거나 stage하지 않았다.

## 다음에 칠 명령

푸시 권한이 있는 컨트롤러에서 실행한다.

```bash
git push origin feat/design-system-and-missing-features
git ls-remote --heads origin feat/design-system-and-missing-features
```

QA 단계에서는 다음 명령 뒤 실제 Meta OAuth 왕복을 직접 확인한다.

```bash
cd dashboard && npm run e2e
```

## 검증했나

- `npx tsc --noEmit`: 통과.
- 전체 `npx vitest run`: 208파일, 1,567건 통과. 실패 0.
- 집중 계약 테스트: 3파일, 40건 통과.
- `npm run build`: Next.js production build 통과, 정적 페이지 177개 생성.
- `bash ~/.claude/harness/bin/design-lint.sh dashboard/src`: 디자인 토큰 위반 0.
- Backend와 mobile: 수정하지 않아 해당 없음.
- 실제 OAuth 왕복과 운영 배포: 미검증.

STAMP | line: osmu-connectux0831 | 생성: 2026-08-31 23:55 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder | skill: 없음 | 고민: 심사 승인 상태를 서버 계약 한 곳에서 제거해 UI에 한시 안내가 남지 않게 했다.

SKILLS_USED: 없음. 설치된 스킬 중 이 build 구현에 직접 대응하는 스킬이 없다. / SKILLS_SKIPPED: qa는 다음 단계의 브라우저 E2E 소유라 사용하지 않았다.

SOURCES: `wiki/거버넌스/결정.md` ADR-004 | `wiki/거버넌스/실수.md` | `wiki/5-hubs/hub-eng/architecture/system-architecture.md` | W3C WCAG 2.4.4 Link Purpose

MODEL: gpt-codex/gpt-5.6-sol / code-builder
