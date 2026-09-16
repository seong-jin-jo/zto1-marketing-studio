# OSMU API 읽기 경로 전수 실사 v15 핸드오프

STAMP: 2026-09-16 18:08 KST | line: osmu-api-sweep091617-codex | model: gpt-codex/gpt-5

## 무엇을 어디까지 했나

- canonical `pipeline-state.osmu.md`가 이미 `current_stage: qa`임을 확인했다.
- 읽기 Route Handler 105개에 GET 105회와 HEAD 1회를 실제 요청했다.
- 최초 HTTP 200 오류 은폐 4건과 빈 배열 오판 1건을 수정했다.
- 정상 88건, 계약상 거절 18건, 예상 밖 응답 0건, HTTP 500 0건을 최신 실행본에서 관찰했다.
- 코드와 회귀는 `c7304dc0`, `cecbe6da`, `3d393fb8`에, QA 보고와 원본 증거는 `523aaa4a`에 커밋했다.
- 상세 보고는 `docs/qa/osmu-api-read-sweep-v15-gpt-codex.md`, 기계 원본은 `logs/diff/osmu-api-read-sweep-20260916-v15/api-read-sweep-final.json`이다.

## 남은 이슈·블로커

- API 읽기 범위는 PASS다.
- 과제 지정 v63과 canonical 승인 디자인 v68의 핀이 충돌하고 기존 디자인 정합 NG가 남아 있어 제품 전체 QA는 NG다.
- 운영 동적 URL, 실제 외부 공급자 자격증명 성공, 실제 채널 발행은 미검증이다.
- 공유 작업트리에 다른 세션의 대량 문서·archive 변경이 남아 있다. 되돌리거나 이번 커밋에 섞지 않았다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio
jq '{route_count,request_count,counts,evidence_stable,build_commit_matches}' logs/diff/osmu-api-read-sweep-20260916-v15/api-read-sweep-final.json
git show --stat --oneline 523aaa4a
```

다음 소유자는 컨트롤러다. 디자인 정본 핀 충돌을 먼저 해소하고 기존 디자인 정합 NG와 운영 외부 연동을 별도 검증한다. 종료 증거는 단일 승인 디자인 핀, 갱신된 정합 행렬, 운영 또는 스테이징 외부 연동 관찰이다.

## 검증했나

- `npm run test`: 371파일, 2,385건 PASS, 조건부 3건 제외.
- `npx tsc --noEmit`: PASS.
- `npm run build`: 격리 사본에서 184/184 PASS.
- 기본 흐름 E2E: 11/11 PASS.
- Studio v1 E2E: 14/14 PASS.
- schema, seed, RLS와 `/api/health`: PASS.
- 디자인 lint: 토큰 위반 0.
- 390px 로그인: HTTP 200, 콘솔 오류 0.
- mobile typecheck와 Maestro: 해당 제품 없음.
