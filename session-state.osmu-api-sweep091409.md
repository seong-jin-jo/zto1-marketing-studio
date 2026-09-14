# OSMU API 읽기 경로 전수 재실사 인계

업데이트: 2026-09-14 10:07 KST
라인: osmu
작업 목적: 2026-09-14 최신 소스 기준 API 읽기 경로 전수 재실사
handoff basis: 회장 요청 원문과 tmux `osmu-sweep091409:0.1`, 위임 `codex-qa-verifier-94825`

## 무엇을 어디까지 했나

- canonical repo는 `/Users/sj/sj_code_master/zto1-marketing-studio`다.
- `pipeline-state.osmu.md`는 착수 시 이미 `current_stage: qa`여서 단계와 승인 상태를 바꾸지 않았다.
- `qa` 스킬을 시작하고 공유 작업트리의 기존 대규모 변경을 확인했다.
- 백그라운드 등록 `codex-qa-verifier-94825`는 별도 워커가 아니라 현재 QA 워커 자신임을 PID 94825, tmux pane `osmu-sweep091409:0.1`, `/tmp/osmu-sweep091409.log`에서 확인했다. 중복 실행이나 대기는 하지 않는다.
- 최초 실호출에서 `/api/studio/v1/derivations/<없는 UUID>`가 39초 뒤 HTTP 500이었다. 같은 호출 48회 동시 재현은 모두 404였고, 애플리케이션 처리 30.3초가 Postgres 드라이버 기본 연결 제한시간 30초와 일치했다.
- 생성 읽기 저장소의 연결 오류가 일반 500으로 새는 구조를 고쳤다. `CONNECT_TIMEOUT` 등 연결 오류는 재시도 가능한 `GENERATION_DB_UNAVAILABLE` 503으로 분류하고, 파생 작업과 생성 작업 읽기에서 DB 오류 변환을 보장한다. 회귀 테스트 3건을 추가해 커밋 `25330905`로 남겼다.
- 위 검증 뒤 다른 세션이 `/api/metrics`와 관련 소스를 수정하고 커밋 `e0c66d14`로 마쳤다. 그 뒤 최신 소스로 전체 Vitest 345파일과 2,254건, TypeScript, production build 184/184, 멱등 schema/seed/RLS, production health 200, 기본 흐름 11/11, Studio v1 14/14, 디자인 lint 위반 0을 다시 확인했다.
- 고정 HEAD `e0c66d14`와 전체 `dashboard/src` 합성 SHA-256 `5f276662869c8aef8126c48e0d3969afa810d10971bb763e2c9b58fabd942f5b`가 전후 동일한 최종 실행을 채택했다. GET 105개, 정상 92개, 의도된 거절 13개, 500과 요청 실패 0개다. 원본은 `logs/diff/osmu-api-read-sweep-20260914-091409-final.json`이다.
- 최종 실행 직전 콜드 병렬 실행에서 `/api/connect/threads/callback`이 Next 오류 HTML로 HTTP 500이었다. 전용 서버에서 단독 5회 모두 HTTP 200과 기대 문구를 반환했고, 경로 예열 뒤 최종 전수도 200이어서 제품 Route Handler 결함이 아닌 개발 서버 최초 컴파일 측정 오류로 분리했다. 실패 원본도 `logs/diff/osmu-api-read-sweep-20260914-091409-final-commit.json`으로 보존했다.
- v7 원본과 최종 원본의 경로, 상태, 분류는 차이 0건이다. 2026-08-28 당시 실제 95개에서 추가된 GET 10개를 대조했다.
- 상세 보고서 `docs/qa/osmu-api-read-sweep-v8-gpt-codex.md`, `docs/qa/qa-tracker.md`, `docs/구현현황.md`를 최신 증거로 갱신했다.

## 남은 이슈·블로커

- API 읽기 범위에는 남은 재현 결함이 없다.
- 승인 시안과 실제 화면의 기존 디자인 불일치, production Supabase JWT, 운영자 캘린더, 원격 배포, 외부 채널 실발행은 NG 또는 미검증이다. 제품 전체 QA와 배포는 승인하지 않는다.
- 공유 작업트리에 다른 세션의 수정, 삭제, 이동이 다수 있다. 이번 커밋에는 우리 보고서, 원시 증거, tracker와 구현현황의 우리 상단 항목, 이 handoff만 포함한다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio
git show --stat --oneline 25330905
git show --stat --oneline HEAD
```

## 검증했나

- QA 단계: canonical `pipeline-state.osmu.md`에서 `current_stage: qa` 확인.
- 현재 위임 동일성: PID, tmux pane, 실행 원문과 로그로 확인.
- 최초 고장 관찰과 수정 뒤 최종 API 실호출: 관찰됨. 105개 중 정상 92개, 의도된 거절 13개, 500과 요청 실패 0개.
- 수정 회귀: 테스트됨. 신규 3건 PASS.
- 최신 성과 소스 변경 뒤 전체 회귀: 테스트됨. 345파일, 2,254건 PASS, 3건 조건부 제외.
- TypeScript와 production build: 테스트됨. 종료 코드 0, 184/184.
- seed, production health, 기본 흐름, Studio v1, 디자인 lint: 관찰 또는 테스트됨. 각각 PASS.
- 운영 배포와 외부 채널 실발행: 미검증.
