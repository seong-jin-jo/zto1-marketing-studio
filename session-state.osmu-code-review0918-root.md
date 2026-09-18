# OSMU 최근 24시간 코드 리뷰 루트 인계

## 무엇을 어디까지 했나

- 라인과 목적: `osmu-code-review0918-root`, 최근 24시간 코드 공격 리뷰의 컨트롤러 재검증과 출고.
- handoff basis: 사용자의 이번 코드리뷰 요청과 동결 범위 `5cd501b3..ddafa8ea`.
- 승인 입력으로 `pipeline-state.osmu.md`의 v68 디자인 허브, 사용자 지정 v63 프로토타입, `DESIGN.md` v37, 확정 요구 대장, 실제 사업 좌표 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`를 읽었다.
- 결과: MAJOR 7건, MINOR 1건, `REVIEW_VERDICT: BLOCK`이다. 제품 코드는 수정하지 않았다.
- 산출물: `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-18.md`.
- QA 기록: `docs/qa/qa-tracker.md` 최상단의 2026-09-18 18:15 KST 항목.
- 산출물과 QA 기록 커밋: `b248da6c`. 인계 정규화 커밋: `79fa12ae`.

## 남은 이슈·블로커

1. 공급자 성공 증거 없는 발행 복구가 `failed` 행을 `published`로 바꿀 수 있다.
2. 발행 행과 초안 ID가 결속되지 않아 같은 작업 공간의 다른 승인 큐를 닫을 수 있다.
3. 실패 단계만 복구하지 않고 게시 시각까지 복구 시각으로 덮는다.
4. 예약 발행 사용량 relay 실패가 독립 재처리되지 않아 돈이 새는 pending이 남을 수 있다.
5. 사용량 발생 시각이 없어 월경계 relay에서 과금 기간이 이동할 수 있다.
6. pending 51건 중 50건만 처리해도 낮은 합계를 정상 200으로 반환할 수 있다.
7. 성과실이 인증, 네트워크, 일반 서버 장애를 모두 사용량 반영 지연으로 오표시한다.
8. 토큰 제한시간 회귀 테스트가 실제 중단 결속이 아니라 소스 문자열만 검사한다.
- 현재 공유 localhost:3456은 여러 병렬 검증이 겹쳐 health가 10초 안에 응답하지 않았다. 독립 전체 Vitest는 한 테스트 timeout 뒤 약 5분에 종료 신호 143을 받아 현재 환경 재검증 증거로 쓰지 않는다.
- 같은 timeout 표적 테스트는 단독 실행에서 1/1 통과했다. 현재 HEAD에서 제품 코드 추가 변경은 없고 리뷰 뒤 커밋은 문서 전용이다.

## 다음에 칠 명령

다음 소유자는 code-builder와 qa-verifier다. MAJOR 7건을 수정한 뒤 격리된 서버에서 아래를 실행하고, health의 `build_commit`이 수정 커밋 후손인지 확인한다.

```bash
cd dashboard
npm run test
npx tsc --noEmit
set -a
source .env.local
set +a
export STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182
node scripts/verify-basic-flow-e2e.mjs
node scripts/verify-studio-v1-e2e.mjs
```

## 검증했나

- 근거 확인: 동결 리뷰 실행 증거는 Vitest 377파일과 2,428건, TypeScript, 기본 흐름 11/11, Studio v1 14/14, health HTTP 200과 DB 정상이다.
- 직접 테스트: `FMT-API-02` 표적 테스트 1/1 통과.
- 직접 관찰: 현재 공유 localhost health는 HTTP 000 timeout. 병렬 검증 경합 중이어서 제품 결함으로 단정하지 않았다.
- 미검증: 실제 SNS 공개 발행, 51건 적체 장애 주입, 월경계 복구, 운영 배포.
- 코드 변경: 0건.
