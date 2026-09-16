# OSMU code review 2026-09-17 handoff

## 무엇을 어디까지 했나

- 회장 요청 원문을 handoff basis로 사용했다. 최근 24시간 범위를 `7cc7f848e2238c1691fc7467cca4bf2bd89e1b2a..93d1da1a6eed1d82f78c95cd4899074b61b5ee8d`로 고정했다. 시간 창 커밋 43개, 순변경 81개 파일이다.
- `pipeline-state.osmu.md`의 v68 승인 핀, 지정 v63 프로토타입, `DESIGN.md` v37, 확정 요구 대장, 사업 좌표, 구현 현황과 diff를 대조했다.
- `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-17.md`에 MAJOR 6건, MINOR 0건, `REVIEW_VERDICT: BLOCK`을 기록했다.
- `docs/qa/qa-tracker.md`와 `wiki/ops/session-state.md`에 검증과 다음 소유자를 기록했다.
- 감사 문서와 증거 커밋은 `aba50fd8`이다. 제품 코드는 수정하지 않았다.

## 남은 이슈·블로커

- 일부 채널을 글자 한도 때문에 제외해도 남은 채널이 성공하면 초안이 `published`, 알림이 `발행 완료`가 된다.
- 사용자 토스트에 확정 금지 문구인 긴 대시가 남아 있다.
- YouTube resumable upload 세션을 영속화하지 않아 중단 뒤 공급자 상태 조회와 재개가 불가능하다.
- YouTube 외부 성공 뒤 DB 확정 실패를 로그만 남기고 `ok:true`로 반환한다.
- YouTube 자동 멱등 키가 태그와 파일 내용을 빼 서로 다른 발행 의도를 같은 요청으로 합친다.
- 발행 사용량 이벤트 기록 실패가 버려져 발행 수, 쿼터와 과금 장부가 누락될 수 있다.
- localhost 실행 `build_commit=5bdc1f85`와 검토 끝 `93d1da1`이 달라 최신 YouTube 변경의 실앱 귀속은 미검증이다.
- 운영 배포와 실제 외부 SNS 발행은 미검증이다.

## 다음에 칠 명령

다음 소유자는 code-builder다. 여섯 MAJOR를 수정한 고정 커밋을 만든 뒤 code-reviewer가 같은 범위를 다시 공격한다.

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio
git rev-parse HEAD
curl -fsS http://localhost:3456/api/health
cd dashboard
npm run test
npx tsc --noEmit
set -a && source ./.env.local && set +a
STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-basic-flow-e2e.mjs
STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-studio-v1-e2e.mjs
```

종료 증거는 MAJOR 0건, 전체 Vitest와 TypeScript 종료 코드 0, 현재 HEAD와 일치하는 localhost에서 두 E2E 통과, 부분 채널 제외 상태 저장과 YouTube 중단 및 DB 확정 실패 공격 시나리오 통과다. 실제 SNS 발행이나 운영 배포가 필요할 때만 회장에게 외부 회수한다.

## 검증했나

- `npm run test`: 372개 파일과 2,399건 통과, 3건 제외, 종료 코드 0.
- `npx tsc --noEmit`: 종료 코드 0.
- 기본 흐름 E2E: localhost 실제 요청 11/11 통과.
- Studio v1 E2E: localhost 실제 요청 14/14 통과.
- localhost health: HTTP 200, DB up, 실행 `5bdc1f85`, 검토 끝 `93d1da1`로 귀속 NG.
- 지정 작업 공간 `/api/usage`: HTTP 200, source `usage_events`, 모든 기간 발행 0, 일별 행 0.
- 순변경 삭제 파일: 0개. 새 시각 토큰 리터럴: 0건.
- 디자인 픽셀 대조, 운영 배포, 실제 외부 SNS 발행: 미검증.
