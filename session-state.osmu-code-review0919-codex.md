# OSMU 최근 24시간 코드 리뷰 인계

## 무엇을 어디까지 했나

- 라인과 목적: `osmu-code-review0919-codex`, 최근 24시간 커밋 전체의 공격적 코드 리뷰.
- handoff basis: 사용자의 이번 명시 과제. tmux `osmu-regress091904:0.0`은 현재 리뷰 세션이었고, 다른 pane은 localhost 소유권과 중복 작업 확인에만 사용했다.
- 검토 범위: 2026-09-19 03:55 KST 기준 `87779ba0191570bcdbd22418eb69bd049f3561c2..3207b25603f6b58cbbd706e616236d4432190937`, 18개 커밋, 59개 파일.
- 승인 입력: `pipeline-state.osmu.md`의 v68 디자인 허브, 사용자 지정 v63 프로토타입, `DESIGN.md`, 확정 요구 대장의 정본 `wiki/거버넌스/요청.md`, 실제 사업 좌표 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`를 읽었다. PRD 승인 핀은 없어 해당 축은 미검토로 명시했다.
- 결과: MAJOR 2건, MINOR 2건, `REVIEW_VERDICT: BLOCK`이다. 제품 코드는 수정하지 않았다.
- 산출물: `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-19.md`.
- QA 기록: `docs/qa/qa-tracker.md`의 2026-09-19 04:43 KST 블록.
- 리뷰 산출물과 QA 기록 커밋: `a7fe901f33ffbd895f8f29849a3b32c11fa79e31`.

## 남은 이슈·블로커

1. `dashboard/scripts/verify-api-read-sweep.mjs`는 시작 소스 내용이 검토 HEAD와 같은지 확인하지 않아 dirty 시작 소스를 해당 커밋의 실행 증거로 셀 수 있다.
2. 같은 검증기는 실행 시작과 종료만 비교한다. 검사 중 route가 변경되고 원복되면 혼합 소스 결과를 안정된 실행으로 셀 수 있다.
3. 제한시간 회귀 테스트와 inventory 안정성 테스트는 문자열과 helper만 검사해 실제 요청 및 스크립트 배선을 보장하지 못한다.
4. localhost:3456의 실행 커밋은 `d0bc4f7b291e8d4556f406a79e5b5eb077865d3a`였다. 검토 HEAD와 달라 API sweep은 실제 route 호출 전에 차단됐다.
5. 기본 흐름과 Studio v1 E2E는 `STUDIO_LLM_PROVIDER_UNAVAILABLE`로 정상 생성이 실패했다. 운영 배포, 실제 SNS 발행, 두 작업 공간 동시 공격은 미검증이다.

## 다음에 칠 명령

다음 소유자는 code-builder다. 위 MAJOR와 MINOR를 수정한 뒤 불변 실행본을 기동하고 다음을 실행한다.

```bash
cd dashboard
npm run test
npx tsc --noEmit
set -a
source .env.local
set +a
export STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182
node scripts/verify-api-read-sweep.mjs
node scripts/verify-basic-flow-e2e.mjs
node scripts/verify-studio-v1-e2e.mjs
```

추가 장애 주입은 API sweep 실행 중 감시 대상 route를 바꿨다가 원복하고, 검증기가 반드시 종료 코드 1을 내는지 확인한다. dirty 시작 파일에서도 검토 HEAD 증거로 통과하면 안 된다.

## 검증했나

- 테스트됨: `npm run test` 378개 파일, 2,431건 통과, 3건 제외, 종료 코드 0.
- 테스트됨: `npx tsc --noEmit` 종료 코드 0.
- 관찰됨: localhost health HTTP 200, DB 정상, 실행 커밋 `d0bc4f7b`.
- 관찰됨: API sweep은 실행본 불일치로 종료 코드 1.
- 관찰됨: 기본 흐름과 Studio v1 E2E는 공급자 오류로 종료 코드 1. Studio v1의 401, 400, 422 거절 계약은 통과했다.
- 근거 확인: 리뷰 문서의 모든 지적은 `파일:줄`, 재현 시나리오, 수정 방향을 포함한다.
- 미검증: 실제 SNS 공개 발행, 운영 배포, 두 작업 공간 동시 격리 공격.
- 코드 변경: 0건.
