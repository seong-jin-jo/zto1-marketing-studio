# zto1-marketing-studio OSMU 코드 공격 리뷰 인계

## 무엇을 어디까지 했나

- 회장 요청 원문을 기준으로 최근 24시간 범위 `e65a1d1b1aecbc11ce589ecf9db4183bf4d4296e..22c27bdb303a11cdc8c831160a404ea1ea541bf6`의 커밋 70개와 파일 162개를 공격 리뷰했다.
- v63 프로토타입, 확정 요구 대장, `DESIGN.md`, pipeline 승인 핀, 사업 좌표와 diff를 대조했다.
- 판정은 MAJOR 28건, MINOR 5건, `REVIEW_VERDICT: BLOCK`이다.
- 제품 코드는 수정하지 않았다. 감사 문서와 QA 증거, 인계 기록만 커밋 `12ac0a7a`로 남겼다.
- 상세 보고서는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md`다.

## 남은 이슈·블로커

- 고객 토큰에서 전역 유료 생성 경로와 공급자 계정 정보가 노출된다.
- 예약 발행 임차 만료, 외부 성공 뒤 DB 기록 실패, 응답 단절이 중복 발행으로 이어질 수 있다.
- 캐러셀 객체 키 덮어쓰기, 공개 파일 호스트 반출, 자원과 재시도 상한 부재가 남아 있다.
- 유료 대표 이미지 소실, 승인안에서 폐기한 방향 단추 복원, 카드 재정렬과 이미지 불일치가 남아 있다.
- API 전수 검증기가 3xx 인증 리다이렉트도 정상으로 분류한다.
- 사용자 지정 v63, pipeline 핀 v68, `DESIGN.md`의 현행 표기 v64가 충돌한다.
- 운영 배포, 실제 외부 채널 발행, 시안 픽셀 대조는 미검증이다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio
git show --stat 12ac0a7a
sed -n '1,220p' docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md
cd dashboard
npm run test
npx tsc --noEmit
set -a; source .env.local; set +a; node scripts/verify-basic-flow-e2e.mjs
set -a; source .env.local; set +a; node scripts/verify-studio-v1-e2e.mjs
```

다음 소유자는 code-builder와 qa-verifier다. MAJOR 재현 시나리오를 실패하는 실행형 회귀 테스트로 먼저 고정하고, 고객 격리와 비용 원장, 발행 멱등과 복구, 자원 상한, 편집 자산 보존, 3xx 실패 분류 순으로 처리한다. 종료 증거는 MAJOR 28건의 재현 차단, 고객 토큰 격리, 중복 발행 복구, 두 E2E 재통과다.

## 검증했나

- localhost health HTTP 200과 DB up을 관찰했다.
- 지정 작업 공간 기본 흐름 E2E 11/11, Studio v1 E2E 14/14를 관찰했다.
- `npm run test`는 348파일, 2,277건 통과와 3건 제외다.
- `npx tsc --noEmit`은 종료 코드 0이다.
- 커밋 범위 삭제 파일은 0개이고 `git diff --check`는 통과했다.
- 다른 세션의 미커밋 변경이 있는 공유 작업 트리에서 검증했으므로 고정 커밋 범위 전체의 안전 증명으로 확대하지 않는다.
- `osmu-api-read-sweep-v9-gpt-codex.md`와 `osmu-four-room-basic-flow-v8-gpt-codex.md`는 qa-verifier 품질 검증 실패 상태다. 이번 리뷰는 해당 산출물을 PASS 근거로 출고하지 않는다.
