# OSMU code review 2026-09-16 handoff

## 무엇을 어디까지 했나

- 회장 요청 원문을 handoff basis로 사용했다.
- 최근 24시간 범위를 `cd2e04c650abf2a4ead4b855c5c887d0d82dfca7..7cc7f848e2238c1691fc7467cca4bf2bd89e1b2a`, 85개 커밋과 순변경 236개 파일로 고정했다.
- pipeline 최신 v68 승인 핀, 지정 v63 프로토타입, `DESIGN.md` v37, 확정 요구 대장, 사업 좌표와 전체 diff를 대조했다.
- `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-16.md`에 MAJOR 10건, MINOR 1건, `REVIEW_VERDICT: BLOCK`을 기록했다.
- `docs/qa/qa-tracker.md`와 `wiki/ops/session-state.md`에 검증 증거를 기록했다.
- 리뷰 및 증거 커밋은 `921710808b4f5987f9840ff9a5c16218a6d855b3`다. 제품 코드는 수정하지 않았다.
- 시안은 부품, 기능, 흐름, 상태의 코드 계약만 대조했다. 시안과 dev 화면의 픽셀 일치 또는 시각 통과 판정은 하지 않았다.

## 남은 이슈와 블로커

- 세 채널을 모두 `skipped`로 닫으면 공급자 발행 0건이어도 전체 글이 `published`가 된다.
- `publishing/result_unknown`과 명시적 공급자 실패가 자동 수렴하지 않아 큐가 영구 정지할 수 있다.
- 자막 작업 제한이 프로세스 메모리라 다중 서버에서 테넌트별, 전체 비용 상한이 배로 늘어난다.
- 접힌 데스크톱 사이드바에 `sticky`가 없어 긴 화면에서 네 방 상시 이동이 사라진다.
- 화면의 45초 발행 timeout이 결과 불명을 일반 실패로 바꾸고 재발행을 열어 중복 게시 위험이 있다.
- Docker build SHA가 런타임 health로 보존되지 않는다.
- E2E가 실행 서버 커밋을 선검증하지 않고 고정 고객 작업 공간의 데이터와 무료 몫을 소비한다.
- 정상 빈 배열을 전역 구조 오류로 세어 새 고객의 빈 이미지 목록이 배포 검증 실패가 된다.
- select 간격 두 곳이 `DESIGN.md` spacing token 대신 리터럴이다.
- localhost:3456 실행 서버는 `5bad0913`, 검토 대상은 `7cc7f848`이라 E2E 결과를 현재 코드에 귀속할 수 없다.
- 운영 배포, 외부 SNS 실발행, OpenClaw 표적 테스트는 미검증이다.

## 다음에 칠 명령

다음 소유자는 build 워커다. MAJOR 10건을 수정한 새 고정 커밋을 만든 뒤, 소유 컨트롤러가 아래 검증을 해당 커밋과 일치하는 서버에서 실행한다.

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

E2E는 첫 쓰기 전에 health의 `build_commit`과 대상 SHA가 같은지 확인하고 전용 QA 작업 공간을 사용해야 한다. 전체 회귀와 공격 시나리오가 통과하고 MAJOR 0일 때만 재리뷰 PASS 후보로 올린다.

## 검증했나

- localhost:3456 health: HTTP 200, DB up, `build_commit=5bad0913`. 대상 `7cc7f848`과 불일치해 귀속 NG다.
- dashboard `npm run test`: 366개 파일 중 365개 통과, 1개 실패. 2,344건 통과, 3건 제외, 전체 NG다.
- dashboard `npx tsc --noEmit`: `.next/dev/types` 문법 오류 5건, 종료 코드 2, NG다.
- 기본 흐름 E2E: 10/11, NG다.
- Studio v1 E2E: 14/14지만 구 서버라 현재 커밋 귀속 NG다.
- OpenClaw 표적 테스트: 종료되지 않아 중단, 미검증이다.
- 고정 커밋 diff 삭제 파일: 0건이다. Instagram 직접 생성 제거는 커밋 메시지에 사유가 기록돼 있다.
- 추가 UI diff의 새 긴 대시, 이모지, 영문 단추 라벨 위반: 0건이다.
- 제품 코드 수정: 0건이다.
