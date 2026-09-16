# OSMU code review 2026-09-16 R2 handoff

## 무엇을 어디까지 했나

- 회장 요청 원문을 handoff basis로 사용했다. tmux `openclaw-auto:0.0`은 공유 서버와 동시 작업 확인에만 사용했다.
- 착수 시각 기준 최근 24시간 범위를 `c2008b1a580576a9b4ddff9822af5f695a0d0104..6a51aaf3a6179616bed04266e258cd35d712feec`로 고정했다. first-parent 31개 커밋, 시간 필터 전체 52개 커밋, 순변경 249개 파일이다.
- `pipeline-state.osmu.md`의 v68 승인 핀, 지정 v63 프로토타입, `DESIGN.md` v37, 확정 요구 대장, 사업 좌표와 diff를 대조했다.
- `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-16.md`에 MAJOR 11건, MINOR 1건, `REVIEW_VERDICT: BLOCK`을 기록했다.
- `docs/qa/qa-tracker.md`와 `wiki/ops/session-state.md`에 검증 증거를 기록했다.
- 리뷰와 증거 커밋은 `ab446c5da893c69ae4da305e8a84df7de1724f0f`다. 제품 코드는 수정하지 않았다.
- 시안은 부품, 기능, 흐름, 상태의 코드 계약만 대조했다. 시안과 dev 화면의 픽셀 일치 또는 디자인 QA 통과를 판정하지 않았다.
- 현재 등록된 실행 중 위임 2건은 다른 `mobile` 트랙이다. 이 코드리뷰 작업에서 생성하거나 회수할 위임은 없다.

## 남은 이슈와 블로커

- 세 채널을 모두 `skipped`로 닫으면 공급자 발행 0건이어도 전체 글이 `published`가 된다.
- `publishing/result_unknown`과 명시적 공급자 실패가 자동 수렴하지 않아 큐가 영구 정지할 수 있다.
- Threads와 Instagram의 R2 임시 객체 삭제 실패가 무기록으로 버려져 저장 비용이 누적될 수 있다.
- 자막 작업 제한이 프로세스 메모리라 다중 서버에서 테넌트별, 전체 비용 상한이 배로 늘어난다.
- 접힌 데스크톱 사이드바에 `sticky`가 없어 긴 화면에서 네 방 상시 이동이 사라진다.
- 화면의 45초 발행 timeout이 결과 불명을 일반 실패로 바꾸고 재발행을 열어 중복 게시 위험이 있다.
- Docker build SHA가 런타임 health로 보존되지 않는다.
- 정상 빈 배열을 전역 구조 오류로 세어 새 고객의 빈 이미지 목록이 배포 검증 실패가 된다.
- 커밋된 네 방 검증기와 같은 커밋의 계약 테스트가 서로 충돌해 깨끗한 HEAD가 실패한다.
- 현재 미커밋 고객 UI에 확정 금지 문구인 긴 대시가 1건 있다.
- select 간격 두 곳이 `DESIGN.md` spacing token 대신 리터럴이다.
- 전체 Vitest, 기본 흐름 E2E, Studio v1 E2E가 NG다. 운영 배포와 외부 SNS 실발행은 미검증이다.

## 다음에 칠 명령

다음 소유자는 build 워커다. MAJOR를 수정한 새 고정 커밋을 만든 뒤, 소유 컨트롤러가 해당 커밋과 일치하는 서버에서 아래 검증을 실행한다.

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio
git rev-parse HEAD
curl -fsS http://localhost:3456/api/health
cd dashboard
npm run test
npx tsc --noEmit
npx vitest run tests/integrity/four-room-performance-ready-timeout.regression-1.test.ts
set -a && source ./.env.local && set +a
STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-basic-flow-e2e.mjs
STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-studio-v1-e2e.mjs
```

종료 증거는 MAJOR 0건, 전체 Vitest와 TypeScript 종료 코드 0, 깨끗한 고정 커밋의 표적 계약 테스트 통과, 같은 SHA localhost에서 두 E2E 통과, 발행 상태 전이 공격 시나리오 통과다. 외부 회수 시점은 실제 SNS 실발행이나 운영 배포 승인이 필요한 때다.

## 검증했나

- localhost:3456 health: HTTP 200, DB up, `build_commit=6a51aaf3`, 검토 대상과 일치했다.
- dashboard `npm run test`: 369개 파일 중 7개 실패, 362개 통과다. 2,372건 중 8개 실패, 2,361개 통과, 3개 제외로 전체 NG다.
- dashboard `npx tsc --noEmit`: 종료 코드 0, PASS다.
- 깨끗한 HEAD 표적 계약 테스트: 1/1 실패, NG다.
- 기본 흐름 E2E: 첫 생성 요청이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`로 종료돼 NG다.
- Studio v1 E2E: 401, 400, 422 거절 계약은 통과했다. 정상 생성은 오류 envelope와 HTTP 200을 반환해 기대 201 대비 NG다.
- 고정 커밋 순변경의 삭제 파일: 0건이다. R190이 승인한 영상 목차 앞뒤 단추 제거는 요구 대장에 사유가 있다.
- 고정 커밋의 새 긴 대시, 이모지, 영문 단추 라벨 위반: 0건이다. 현재 미커밋 UI의 긴 대시 1건은 별도 MAJOR다.
- 디자인 픽셀 대조: 미검토다. 코드 계약 리뷰 범위이며 디자인 일치 또는 통과를 주장하지 않았다.
- 운영 배포와 외부 SNS 실발행: 미검증이다.
- 제품 코드 수정: 0건이다.
