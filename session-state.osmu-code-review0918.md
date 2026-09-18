# OSMU 최근 24시간 코드 리뷰 인계

## 무엇을 어디까지 했나

- 라인: `osmu-code-review0918`
- handoff basis: 사용자의 최근 24시간 코드 공격 리뷰 요청.
- 확인한 pane: `openclaw-auto:0.0`, `osmu-dev-restored:0.0`. 공유 localhost와 동시 작업 확인에만 사용했고 다른 작업을 인계받지 않았다.
- 검토 범위: 최초 24시간 기준 2026-09-18 12:10 KST, 최종 `5cd501b3..ddafa8ea`, 60개 커밋, 196개 파일.
- 판정: MAJOR 7건, MINOR 1건, `REVIEW_VERDICT: BLOCK`.
- 감사 문서: `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-18.md`.
- QA 원장: `docs/qa/qa-tracker.md`의 `REVIEW-24H-20260918-20`부터 `29`.
- 리뷰 커밋: `b248da6c`.
- 제품 코드는 수정하지 않았다.

## 남은 이슈·블로커

1. `publish/reconcile`이 공급자 성공 증명과 기존 상태를 확인하지 않아 `failed` 발행 행도 `published`로 바꿀 수 있다.
2. 발행 행의 `draft_id`와 요청 `draftId`를 결속하지 않아 같은 작업 공간의 다른 큐를 게시 완료로 닫을 수 있다.
3. 복구 입력의 `stage`를 받지 않고 발행 행, 승인 큐, 사용량을 전부 다시 처리하며 실제 게시 시각도 복구 시각으로 덮는다.
4. 예약 발행의 사용량 relay 실패를 버리고 사용자 `/api/usage` 조회에만 재처리를 맡겨 유료 사용량이 기한 없이 pending으로 남을 수 있다.
5. 사용량 outbox가 발생 시각을 보존하지 않아 자정이나 월말 뒤 relay하면 다른 과금 기간으로 이동한다.
6. pending 사용량을 기본 50건만 처리하고 남은 수를 숨겨 51건 이상 적체에서 낮은 합계를 HTTP 200으로 반환한다.
7. 성과실이 401, 네트워크, 일반 5xx를 모두 사용량 반영 지연으로 오표시하고 마지막 값과 재시도 행동을 숨긴다.
8. 토큰 요청 제한시간 회귀 테스트는 소스 문자열만 확인해 실제 요청 결속이 깨져도 통과할 수 있다.

실제 SNS 공개 발행, 51건 적체 생성, 월경계 장애 주입, 운영 배포는 미검증이다.

## 다음에 칠 명령

다음 소유자는 code-builder다. MAJOR 7건을 수정한 뒤 공급자 성공 없는 복구 거절, 발행과 초안 결속, 단계별 복구, 독립 relay, 월경계 귀속, 51건 적체, 오류 상태 분류를 회귀 테스트로 고정해야 한다. 그 다음 최신 수정 소스에 귀속되는 localhost에서 두 E2E와 전체 테스트 및 TypeScript를 다시 통과시켜야 한다.

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

- 현재 작업 트리 `npm run test`: PASS. 377파일, 2,428건 통과, 3건 제외, 종료 코드 0.
- 현재 작업 트리 `npx tsc --noEmit`: PASS, 종료 코드 0.
- 제한 시간으로 기동한 localhost health: HTTP 200, DB 정상, 실행 커밋 `ddafa8ea`.
- 지정 작업 공간 기본 흐름 E2E: PASS, 11/11.
- 지정 작업 공간 Studio v1 E2E: PASS, 14/14.
- 변경 제품 UI 토큰 검사: 새 색상 리터럴 0건, 인라인 스타일 0건.
- 새 사용자 노출 문구의 긴 대시, 그림문자, 영문 단추 라벨: 0건.
- 커밋 범위 삭제 파일: 0개.
