# OSMU API 읽기 경로 전수 재실사 인계

업데이트: 2026-09-14 14:12 KST
라인: osmu
작업 목적: 2026-09-14 13시 최신 소스 기준 API 읽기 경로 전수 재실사
handoff basis: 회장 요청 원문과 현재 tmux `osmu-sweep091413:0.1`

## 무엇을 어디까지 했나

- canonical repo는 `/Users/sj/sj_code_master/zto1-marketing-studio`다.
- `pipeline-state.osmu.md`는 착수 시 이미 `current_stage: qa`여서 단계와 승인 상태를 바꾸지 않았다.
- `qa` 스킬, 프로젝트 헌법, QA·개발·디자인 표준, 직전 v8 인계를 읽었다.
- 현재 GET export 분모는 105개다. 소스 합성 SHA-256은 `b37dedf0bf4623843063fd7022fc1c0a5aaba47e5adaba96afc5480f680a4f3a`다. `rg`로 계산한 중간 104개는 gitignore의 `tenants/` 패턴 때문에 추적 파일을 놓친 것으로 폐기했다.
- 기존 localhost 개발 서버에서 동시성 4 전수 실사가 요청 실패 4개와 전체 시간 초과 35개로 멈췄다. 같은 빌드의 production 동시성 4와 새 개발 서버 순차 실행은 105개 전부 응답했다.
- 검사기 기본 동시성을 1로 고치고 회귀 테스트를 추가했다. 커밋은 `d5a612cc`다.
- 최종 기본값 전수 실사는 정상 92, 계약상 거절 13, HTTP 500과 요청 실패 0이다. v8과 경로, 상태, 분류 변화 0건이다.
- 전체 Vitest 348파일과 2,276건, TypeScript, production build 184/184, seed, 기본 흐름 11/11, Studio v1 14/14, health 200과 DB up, 디자인 lint를 관찰했다.
- 상세 보고서 `docs/qa/osmu-api-read-sweep-v9-gpt-codex.md`, 원본 `logs/diff/osmu-api-read-sweep-20260914-1313-*.json`, tracker와 구현현황을 갱신했다.
- 증거 문서와 원본 커밋은 `1844b471`이다.
- 종료 게이트 보완으로 v63 발행실 1440 PNG와 dev 발행실 1440 PNG를 각각 원본으로 직접 열어 공통 셸, 요소 순서, 본문 구조, 행동 위계의 불일치를 확인했다. 1440 디자인은 NG이고 다른 폭은 이번 턴 미검증이다.

## 남은 이슈·블로커

- 제품 전체 QA는 디자인 정합 NG, v63과 v68 핀 충돌, canonical 테스트 계획과 ONE_THING 부재, 운영 배포와 외부 채널 실발행 미검증, 같은 날 공격 리뷰 BLOCK 해소 뒤 다시 열어야 한다.
- 이 API 읽기 실사 범위의 추가 작업은 없다.

## 다음에 칠 명령

- API 읽기 범위를 다시 확인할 때는 `cd dashboard && set -a && source ./.env.local && set +a && API_SWEEP_WORKSPACE_ID=cd1d0a40-540d-4524-9b49-bf2445d82182 API_SWEEP_OUTPUT=../logs/diff/osmu-api-read-sweep-next.json node scripts/verify-api-read-sweep.mjs`를 실행한다.
- 제품 전체 QA는 컨트롤러가 단일 디자인 핀과 공격 리뷰 BLOCK 해소를 확인한 뒤 별도 QA 과제로 시작한다.

## 검증했나

- QA 단계: canonical `pipeline-state.osmu.md`에서 `current_stage: qa` 확인.
- localhost health: 관찰됨. HTTP 200, DB up.
- API 전수 호출: 관찰됨. 최종 105/105, 정상 92, 계약상 거절 13, 실패 0.
- 필수 회귀: 테스트됨. Vitest, TypeScript, build, seed, 기본 흐름, Studio v1, 디자인 lint 통과.
- 운영 배포와 외부 채널 실발행: 미검증.
