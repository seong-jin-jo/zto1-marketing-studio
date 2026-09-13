# OSMU 2026-09-14 코드 감사 지적 수정

## 2026-09-14 05:40 KST 완료

- 무엇을 어디까지 했나: `osmu-code-review-2026-09-14.md`의 OSMU-001부터 019까지 재현 경로를 모두 닫고 회귀 테스트를 남겼다. 격리·승인 불변성·큐 소유권·발행 복구·예약 lease·카드 덱 원자성·발행실 흐름·성과 수집 부분 실패·QA 전체 deadline을 심각도순으로 처리했다. 증거는 `docs/qa/qa-tracker.md`, 구현 상태는 `docs/구현현황.md`에 기록했고 문서 커밋은 `0141e821`이다.
- 남은 이슈·블로커: 운영 배포와 실제 외부 SNS 게시 호출은 비가역 외부 작업이라 수행하지 않았다. 공급자 결과 조회나 생성 컨테이너 삭제가 공식 계약으로 확인되지 않은 경우 자동 재발행·임의 삭제를 하지 않고 상태와 식별자를 보존해 실패 폐쇄한다. `npm run build`에는 기존 Turbopack NFT 전체 프로젝트 추적 경고가 남지만 빌드는 성공했다. 기존 QA 산출물 `osmu-four-room-basic-flow-v5-gpt-codex.md`의 배포 환경 접촉 증거 실패는 이번 수정 결과로 출고하지 않는다.
- 다음에 칠 명령: QA 단계에서 `cd dashboard && npm run test && npx tsc --noEmit && node scripts/verify-basic-flow-e2e.mjs && node scripts/verify-studio-v1-e2e.mjs`를 실행한다. 외부 계정 검증은 승인된 테스트 게시물과 공급자 조회·정리 계약이 마련된 뒤 별도 수행한다.
- 검증했나: 전체 Vitest 337파일, 2169건 통과, 3건 skip, 0건 실패. `npx tsc --noEmit`, `npm run build`, `design-lint.sh dashboard/src` 통과. 현재 코드로 localhost:3456을 제한 시간 동안 구동해 `/api/health`의 `healthOk=true`, `db=up`을 관찰했고 기본 흐름 E2E 11/11, Studio v1 E2E 14/14를 통과했다. API sweep 100ms 강제 예산 재현은 0.55초 안에 종료 코드 1과 미시도 75경로를 명시해 전체 deadline이 실제로 작동함을 확인했다. 이후 다른 세션이 발행실 인접 파일을 수정해, 최종 작업트리에서 겹치는 발행실·예약·Instagram 회귀 25건과 TypeScript를 재실행해 다시 통과했다. 검증 서버는 종료했다.

## 2026-09-14 05:22 KST 감사 19건 소스 수정 완료, 전체 검증 착수

- 무엇을 어디까지 했나: 감사 OSMU-001부터 019까지 소스 수정과 회귀 테스트를 모두 구현했다. 추가 커밋은 `b8673436`, `5032b483`, `e5221e89`, `92e0d02e`, `2c806d9d`, `2be47af9`, `6ce8016f`, `1b60a823`, `d2ce0e0e`다. 예약 lease와 카드뉴스 배열, 카드 덱 보상 삭제, 발행실 재합성 실패 차단과 실제 이미지 미리보기, 학습 상세 분리, 성과 수집 잠금·freshness·부분 실패·HTTP 상태, QA 전체 실행시간을 보강했다.
- 남은 이슈·블로커: 전건 전체 Vitest, TypeScript, localhost:3456 실제 요청, 기본 흐름 E2E 2종, design-lint를 실행해야 한다. 예약 발행은 공급자 결과 조회가 불가능한 상태에서 자동 재발행하지 않는 보수적 계약이며 완전 자동 조정은 별도 API 계약 결정이 필요하다. 인스타그램 공급자는 생성된 자식 컨테이너 삭제 API가 없어 식별자를 영속화하고 자동 게시를 막는 방식으로 복구 근거를 남겼다.
- 다음에 칠 명령: `npm run test`, `npx tsc --noEmit`, localhost health 및 실제 API 요청, `verify-basic-flow-e2e.mjs`, `verify-studio-v1-e2e.mjs`, `design-lint.sh dashboard/src` 순서로 검증한다. 이어 QA tracker와 구현현황을 다른 세션 변경과 분리해 갱신한다.
- 검증했나: 수정별 집중 시험은 모두 통과했다. 예약 14건, 카드 저장 13건, 발행실 4건, 성과 14건, Instagram·예약·발행 라우트 50건, QA deadline 3건, TypeScript 중간 검사가 통과했다. 전체 앱과 실서버 경로는 아직 미검증이다.

## 2026-09-14 04:55 KST 격리·승인·잠금 1차 수정

- 무엇을 어디까지 했나: 감사 19건 중 최상위 6개 축에서 경로 탈출 2건, 승인 payload 바꿔치기 1건, 큐 잠금 중첩 1건, 공급자 명시적 non-2xx 오분류 1건을 수정했다. 커밋은 `d0b8065f`, `8b509fe7`, `8f443cf3`, `707bb635`다.
- 남은 이슈·블로커: 발행 중 lease 복구 교착, analytics 이력 손실, 예약 processing 고아, 예약 캐러셀 단일화, Instagram 자식 컨테이너 부분 실패, 카드 덱 부분 저장, 편집 재합성 실패 이동, 실제 덱 미리보기, 학습 상세 상주, 성과 중복 수집·batch 부분 실패·Meta 오분류·HTTP 200, QA 전체 deadline이 남았다.
- 다음에 칠 명령: queue claim 복구와 analytics ENOENT 구분부터 수정하고, 이후 dashboard 예약·카드·성과 경로를 처리한다.
- 검증했나: 경로 격리 3건, 승인 payload 3건과 기존 4건, 잠금 경합 포함 31건, 공급자 실패 분류 2건이 각각 통과했다. 전체 Vitest, TypeScript, localhost와 기본 흐름 E2E는 아직 미검증이다.

## 2026-09-14 04:45 KST 착수

- 무엇을 어디까지 했나: 회장 요청 원문을 handoff basis로 확정했다. `CLAUDE.md`, 기존 `wiki/ops/session-state.md`, 상태 파일 규약, `dashboard/AGENTS.md`, `dashboard/README.md`와 감사 문서의 현재 내용을 확인했다. `qa` 스킬을 읽고 시작했으나 작업 트리 전체에 기존 변경 2,419건이 있어 전체 커밋 또는 stash는 하지 않는다. 감사 대상 소스 파일은 착수 시점에 수정되지 않은 상태다.
- 남은 이슈·블로커: 감사 MAJOR 지적을 심각도순으로 재분류하고 전건 수정·재현·회귀 테스트해야 한다. 기존 대량 변경과 `docs/qa/qa-tracker.md`, `docs/구현현황.md`, `wiki/ops/session-state.md`의 미커밋 내용은 다른 세션 소유이므로 덮어쓰거나 함께 커밋하지 않는다. 동일 과제의 code-builder 프로세스는 이 세션 자신이며 중복 작업이 아니다. 별도 code-reviewer는 감사 입력 작성 작업으로 실행 중이다.
- 다음에 칠 명령: `pipeline-state.osmu.md`, 핀된 프로토타입, 회장 요구 대장, 사업 좌표, 거버넌스 ADR, `docs/구현현황.md`, 감사 전문을 끝까지 읽는다. 이어 감사 대상 파일과 인접 테스트를 대조하고 최상위 격리·비용·기본 흐름 결함부터 수정한다. 커밋은 대상 파일만 명시적으로 stage한다.
- 검증했나: 아직 제품 코드를 수정하지 않았다. `git status --porcelain` 2,419건과 감사 대상 핵심 소스의 비중첩을 관찰했다. localhost, Vitest, TypeScript, 기본 흐름 E2E는 이번 수정본 기준 미검증이다.
