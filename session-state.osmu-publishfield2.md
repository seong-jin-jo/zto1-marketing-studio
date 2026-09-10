# OSMU publishfield2 핸드오프

업데이트: 2026-09-01 08:13 KST
브랜치: `work/publishfield2`
작업 성격: 발행실 플랫폼 필드 디자인 증분. 제품 코드 수정 없음

## 무엇을 어디까지 했나

- ADR-004, ADR-006, 거버넌스 실수와 요청, v64 승인 프로토타입, DESIGN.md, QA 대조표, 실제 `PlatformPreview.tsx`와 `studio/page.tsx`를 읽었다.
- 플랫폼 공식 문서를 조사해 `docs/reference/플랫폼-발행-필드-규격-2026-09-01.md`를 작성했다.
- DESIGN.md를 v35로 갱신했다.
- `docs/prototype/osmu-publishfield-v66-gpt-codex-20260901-0813.html` 작동 프로토타입을 만들었다.
- `docs/WIREFRAMES/osmu-publishfield-v66-gpt-codex-20260901-0813.md`와 `docs/user-flow.md` v66 증분을 작성했다.
- 표시 이름과 사용자명은 읽기 전용 연결 계정 정보로 확정했다. 게시물 편집 필드에서 제거했다.
- 사용자 용어는 `검토 요청하기`, `검토 대기`, `플랫폼 연결 준비 중`으로 정의했다.
- 디자인 커밋 `68062525`, 공용 핸드오프 커밋 `130f7af2`, push 차단 기록 커밋 `0fb37d4a`를 만들었다.

## 남은 이슈와 블로커

- `git push origin work/publishfield2`는 실행 정책이 승인 필요 명령으로 차단했다. 현재 세션은 승인 요청이 금지되어 원격 브랜치가 없다.
- 실제 제품 코드에는 표시 이름 편집, 표시 이름 일괄 통일, 임의 플랫폼 제한이 남아 있다. 디자인 역할 범위 때문에 수정하지 않았다.
- 디자인 게이트 승인 전 build 단계로 진입하면 안 된다.
- `.codex/logs/harness.jsonl`의 기존 변경은 사용자 또는 하네스 소유다. 커밋하지 않는다.

## 다음에 칠 명령

push 권한이 있는 컨트롤러가 다음을 실행한다.

```text
git push origin work/publishfield2
git ls-remote --heads origin work/publishfield2
```

원격이 `0fb37d4a` 이후 이 핸드오프 커밋까지 가리키는 것을 확인한다. 그 다음 부모 컨트롤러가 DESIGN.md v35와 v66 프로토타입을 디자인 게이트에서 검토한다. 승인되면 code-builder에게 v35, v66, 플랫폼 규격 문서를 버전핀으로 주입한다.

## 검증했나

- Chromium 실렌더: 1024와 390, 기본·빈 상태·불러오는 중·오류·긴 내용 총 10조합.
- 결과: 문서·앱·본문 가로 넘침 0, 콘솔 오류 0.
- 상호작용: 기본 상태 카드 7개, 표시 이름 편집기 0개, 읽기 전용 계정 머리 7개, Threads 501자 초과 경고, X 해시태그 2개 권고, TikTok 집중 필터 확인.
- `cd dashboard && npx tsc --noEmit`: 오류 0.
- `cd dashboard && npx vitest run tests/publish tests/api`: 68파일, 523건 통과, 조건부 2건 제외, 실패 0.
- 규격 문서 공식 URL 20개 HTTP 200. X 해시태그 도움말은 자동 curl 403이었으나 웹 검색 도구로 본문과 2개 이하 권고를 직접 확인했다.
- `gh pr merge` 미실행. Meta 개발자 콘솔 미조작.
