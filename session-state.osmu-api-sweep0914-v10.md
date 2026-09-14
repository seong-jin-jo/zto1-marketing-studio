# OSMU API 읽기 경로 전수 재실사 v10 인계

업데이트: 2026-09-14 18:00 KST
라인: osmu
작업 목적: 최신 공유 소스 기준 API 읽기 경로 전수 재실사 v10
handoff basis: 회장 요청 원문과 qa-verifier 위임 결과

## 무엇을 어디까지 했나

- canonical repo는 `/Users/sj/sj_code_master/zto1-marketing-studio`다.
- `pipeline-state.osmu.md`는 착수 때 이미 `current_stage: qa`여서 단계와 승인 상태를 바꾸지 않았다.
- `dashboard/src/app/api/**/route.ts`의 읽기 경로를 파일 시스템 재귀로 전수 열거했다. 고유 경로 105개에서 GET 105건과 HEAD 1건, 총 106건을 `localhost:3456`에 실제 요청했다.
- 권위 실행 결과는 정상 92건, 계약상 거절 14건이다. HTTP 500, redirect, timeout, 예상 밖 거절은 0건이다.
- 제품 Route Handler 고장이 발견되지 않아 제품 코드는 수정하지 않았다. 기존 검사기가 HEAD를 실행하지 않고 3xx를 정상으로 셀 수 있었으며 import chain 변경을 놓치는 좁은 해시를 쓰던 결함을 수정했다.
- 권위 실행 전후 listener PID는 `33531`, 전체 `dashboard/src/**/*`와 `dashboard/scripts/**/*` 합성 SHA-256은 `a7cea815adcf5a80359662c4c8a382b53b1c2c3bf3d7e3458ee270268b2e3e7f`로 동일하다.
- 권위 원본은 `logs/diff/osmu-api-read-sweep-20260914-v10-authoritative.json`, 보고서는 `docs/qa/osmu-api-read-sweep-v10-gpt-codex.md`다.
- 작업 커밋은 `a6924427`, `3be8459b`, `eb1dafb6`, `0aaa0f8f`, `dffca6a8`, `33e5c988`, `2dfbca49`다.

## 남은 이슈·블로커

- API 읽기 localhost 범위에는 남은 재현 결함이 없다.
- 상위 `verify-agent-quality.sh`는 운영 배포 환경 접촉 증거가 없어서 종료 코드 2로 보고서를 반려했다. 명시된 localhost 범위만 PASS이며 제품 전체 QA와 배포는 NG다.
- 과제가 지정한 v63 프로토타입과 pipeline의 v68 승인 핀이 충돌하고 기존 3폭 디자인 정합이 NG다. 이번 턴에는 디자인 일치 또는 통과를 판정하지 않았다.
- 운영 배포, 실제 외부 채널 발행과 성과 수집은 미검증이다.
- 공유 작업트리에 타 세션의 대규모 미커밋 변경이 남아 있다. 이 작업의 코드, 회귀 테스트, 보고서와 권위 JSON은 커밋되어 깨끗하고 공유 문서의 타 세션 변경은 건드리지 않았다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio/dashboard
set -a
source ./.env.local
set +a
API_SWEEP_WORKSPACE_ID=cd1d0a40-540d-4524-9b49-bf2445d82182 API_SWEEP_TOTAL_TIMEOUT_MS=900000 API_SWEEP_OUTPUT=../logs/diff/osmu-api-read-sweep-next.json node scripts/verify-api-read-sweep.mjs
```

제품 전체 QA를 다시 열기 전에는 컨트롤러와 product-designer가 승인 디자인 핀을 단일화하고 3폭 정합을 먼저 통과시킨다. 그 뒤 운영 버전에서 같은 106건을 재검증한다.

## 검증했나

- API 전수 실호출: 관찰됨. 106건 전건 응답, 정상 92건, 계약상 거절 14건, 실패 0건.
- 증거 안정성: 관찰됨. listener PID와 전체 src·scripts 해시 전후 동일.
- 전체 회귀: 테스트됨. Vitest 350파일과 2,289건 통과, 조건부 제외 3건.
- TypeScript와 production build: 테스트됨. 종료 코드 0, 정적 페이지 184/184.
- seed와 health: 관찰됨. seed PASS, localhost health HTTP 200.
- 기본 흐름과 Studio v1 E2E: 관찰됨. 11/11과 14/14 PASS.
- 디자인 lint: 테스트됨. 위반 0.
- 컨트롤러 독립 재검증: 테스트됨. 검사기 회귀 4건, TypeScript, health HTTP 200 PASS.
- 디자인 픽셀 일치: NG 유지. 이번 턴 신규 matched pair 대조 없음.
- 운영 배포와 외부 채널 실발행: 미검증.
