# OSMU 최근 24시간 코드 공격 리뷰 핸드오프

## 무엇을 어디까지 했나

- 회장 요청 원문을 handoff basis로 삼아 최근 24시간 범위를 `7e39d0a7ddee8a9d7344cb08f56dea8baaf94419..4f59a75912c6163670a28a2d87fad6817f32a4a8`로 고정했다. 커밋 74개, 파일 180개, 추가 13,529줄, 삭제 451줄이다.
- 사용자 지정 v63 프로토타입, 요청 대장, `DESIGN.md`, pipeline 승인 핀, OSMU 사업 좌표와 전체 diff를 대조했다.
- 제품 코드는 수정하지 않았다. 판정은 MAJOR 27건, MINOR 3건, `REVIEW_VERDICT: BLOCK`이다.
- 상세 보고서는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md`, QA 증거는 `docs/qa/qa-tracker.md`에 기록했다.
- 보고서, QA 증거, 공용 인계 기록 커밋은 `c6cab3db7295`다.
- 이번 리뷰는 코드와 구조 계약만 판정했다. 시안과 dev 렌더의 픽셀 일치 또는 디자인 QA PASS는 선언하지 않았고, v63, v64, v68 충돌 때문에 디자인 전체 정합은 미검증으로 남겼다.

## 남은 이슈·블로커

- 고객 토큰으로 전역 Higgsfield 계정의 `email`, `plan`, `credits`, `raw`가 HTTP 200으로 실제 노출된다.
- 전역 유료 생성 경로와 전역 최신 이미지 선택이 테넌트와 사용량 원장에 결속되지 않았다.
- 예약 발행 lease 만료, 공급자 성공 뒤 DB 기록 실패, 응답 단절이 중복 발행으로 이어질 수 있다.
- 캐러셀 동일 객체 키 덮어쓰기, 공개 제3자 파일 호스트 반출, 자막과 성과 수집의 무제한 외부 작업이 남아 있다.
- 부분 실패를 HTTP 200 또는 `ok:true`로 세는 경로와 재시작 뒤 복구되지 않는 큐 상태가 남아 있다.
- 편집 목차의 폐기된 방향 단추가 복원됐고, 카드 재정렬 시 이미지가 따라가지 않으며, 유료 대표 이미지가 단색 글자 카드로 교체된다.
- 사용자 지정 v63, pipeline 최신 승인 핀 v68, `DESIGN.md` 현행 전체 정본 v64가 충돌한다.
- 운영 배포, 실제 외부 채널 발행, 시안과 dev의 픽셀 대조는 미검증이다. pipeline 상태는 바꾸지 않았다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio
sed -n '1,220p' docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md
git show --stat c6cab3db7295
cd dashboard
npm run test
npx tsc --noEmit
set -a; source .env.local; set +a; node scripts/verify-basic-flow-e2e.mjs
set -a; source .env.local; set +a; node scripts/verify-studio-v1-e2e.mjs
```

다음 소유자는 code-builder와 qa-verifier다. 고객 허용 목록과 전역 핸들러 격리, 발행 멱등과 복구 상태 영속화, 자원 및 재시도 상한, 편집 자산 보존 순으로 고친 뒤 각 재현 시나리오를 회귀 픽스처로 고정해야 한다. 이후 고객 토큰 공격과 두 E2E를 다시 실측한다.

## 검증했나

- `npm run test`: 종료 코드 0. 347파일, 2,275건 통과, 3건 제외.
- `npx tsc --noEmit`: 종료 코드 0.
- localhost health: HTTP 200, DB up.
- 지정 작업 공간 기본 흐름: 11/11 통과.
- 지정 작업 공간 Studio v1: 14/14 통과.
- 임시 고객 토큰의 `/api/higgsfield/status`: HTTP 200과 `email`, `plan`, `credits`, `raw` 키 노출 관찰. 값은 출력하지 않았고 토큰 삭제 뒤 잔여 0건을 확인했다.
- 커밋 범위 내 삭제 파일은 0개이고 `git diff --check`는 통과했다.
- 공유 작업 트리의 다른 세션 변경은 되돌리거나 커밋하지 않았다.
- 코드 변경, 디자인 QA PASS, 실제 외부 발행, 운영 배포는 하지 않았다.
