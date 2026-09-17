# OSMU 최근 24시간 코드 리뷰 인계

## 무엇을 어디까지 했나

- 라인: `osmu-code-review0918`
- handoff basis: 사용자의 최근 24시간 코드 공격 리뷰 요청
- 확인한 pane: `openclaw-auto:0.0`. 공유 localhost와 동시 작업 확인에만 사용했고 다른 작업을 인계받지 않았다.
- 검토 범위: 2026-09-18 04:22 KST 기준 `c0661fb2..87779ba0`, 70개 커밋, 342개 파일
- 판정: MAJOR 4건, MINOR 0건, `REVIEW_VERDICT: BLOCK`
- 감사 문서: `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-18.md`
- QA 원장: `docs/qa/qa-tracker.md` 최상단 `REVIEW-24H-20260918-12`부터 `19`
- 커밋: `74ae7475` 감사와 QA 원장, `5f5b7de0` 공용 인계 기록
- 제품 코드는 수정하지 않았다.

## 남은 이슈·블로커

1. `publish/reconcile`이 외부 성공 증명과 기존 상태를 확인하지 않아 `failed` 발행 행도 `published`로 바꿀 수 있다.
2. 복구 입력의 `stage`를 무시하고 발행 행, 승인 큐, 사용량을 전부 다시 처리하며 실제 게시 시각도 복구 시각으로 덮는다.
3. 사용량 outbox가 발생 시각을 보존하지 않아 자정이나 월말 뒤 relay하면 다른 과금 기간으로 이동한다.
4. pending 사용량을 기본 50건만 처리하고 남은 수를 숨겨 51건 이상 적체에서 낮은 합계를 HTTP 200으로 반환한다.

실행본 응답에 빌드 커밋이 없어 localhost의 정확한 커밋 귀속은 미검증이다. 실제 SNS 공개 발행,
51건 적체 생성, 월경계 장애 주입, 운영 배포도 미검증이다.

## 다음에 칠 명령

```bash
sed -n '1,180p' docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-18.md
cd dashboard
npm run test
npx tsc --noEmit
set -a && source .env.local && set +a
node scripts/verify-basic-flow-e2e.mjs
node scripts/verify-studio-v1-e2e.mjs
```

다음 소유자는 code-builder다. MAJOR 4건을 수정한 뒤 외부 성공 증명 거절, 단계별 복구, 월경계
귀속, 51건 적체를 회귀 테스트로 고정하고 최신 수정 소스에 귀속되는 localhost에서 두 E2E를
다시 통과시켜야 한다.

## 검증했나

- `npm run test`: PASS, 376파일, 2,427건 통과, 3건 제외
- 작업 트리 `npx tsc --noEmit`: NG, 실행 중 개발 서버가 만든 `.next/dev/types/routes.d.ts:291` 구문 오류
- 같은 HEAD의 깨끗한 사본 `npx tsc --noEmit`: PASS, 종료 코드 0
- localhost health: HTTP 200, DB 정상, 빌드 커밋 귀속은 미검증
- 지정 작업 공간 `/api/usage`: HTTP 200, relay 처리 0, 실패 0, 임시 고객 토큰 폐기 완료
- 기본 흐름 E2E: PASS, 11/11
- Studio v1 E2E: PASS, 14/14
- 변경 제품 UI 토큰 검사: 새 색상 리터럴 0건, 인라인 스타일 0건
- 커밋 범위 삭제 파일: 0개
- `git diff --check`: PASS
