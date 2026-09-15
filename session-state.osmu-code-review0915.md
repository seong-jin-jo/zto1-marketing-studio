# OSMU code review 2026-09-15 handoff

## 무엇을 어디까지 했나

- 회장 요청 원문을 handoff basis로 사용했다.
- 리뷰 범위는 `acb981ea484a113eaef87ef82f05d4edc43334bf..4692afe3d2030db299a02f18b79e6392e2ad114d`, 96개 커밋과 212개 파일로 고정했다.
- v63 프로토타입, 확정 요구 대장, 사업 좌표, pipeline state, DESIGN.md를 읽고 코드와 대조했다.
- `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-15.md`에 MAJOR 43건, MINOR 7건, `REVIEW_VERDICT: BLOCK`을 기록했다.
- `docs/qa/qa-tracker.md`와 `wiki/ops/session-state.md`에 증거를 남겼다.
- 제품 코드는 수정하지 않았다. 리뷰 문서 커밋은 `f6f33b00`, QA 기록은 `b125d7bb`, wiki 인계는 `ef215918`이다.
- 완료된 백그라운드 리뷰 등록 `codex-code-reviewer-34028`은 해제했다.

## 남은 이슈 및 블로커

- 고객 토큰으로 공유 Higgsfield 계정의 이메일, 요금제, 크레딧, 원문이 노출된다.
- 고객 자막 경로가 공용 영상 폴더를 테넌트 폴더보다 먼저 읽는다.
- 공유 생성 비용과 결과 저장이 작업 공간별로 분리되지 않은 경로가 있다.
- 예약 및 직접 발행의 lease, fencing, 외부 성공 뒤 내부 기록 실패가 중복 게시를 만들 수 있다.
- v63의 네 방 흐름, 목차 조작, 사족 금지, 컨테이너 반응형 계약 이탈이 있다.
- OpenClaw tsdown 표적 테스트 26건 중 5건이 실패한다.
- `codex-code-builder-95543`가 위 감사 지적 수정 작업을 다른 컨트롤러 소유로 실행 중이다. 이 세션은 해당 프로세스를 종료하거나 등록 해제하지 않는다.
- 운영 배포와 실제 외부 채널 발행은 미검증이다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio
bash /Users/sj/.claude/harness/bin/bg-agents.sh list
ps -p 95543 -o pid=,ppid=,etime=,state=,command=
git log -8 --oneline
git status --short --untracked-files=no
```

builder 완료 뒤 소유 컨트롤러가 결과와 커밋을 회수하고 다음을 실행한다.

```bash
bash /Users/sj/.claude/harness/bin/bg-agents.sh rm codex-code-builder-95543
cd dashboard
npm run test
npx tsc --noEmit
set -a && source ./.env.local && set +a
STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-basic-flow-e2e.mjs
STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-studio-v1-e2e.mjs
cd ../openclaw
pnpm exec vitest run test/scripts/tsdown-build.test.ts --config test/vitest/vitest.tooling.config.ts --maxWorkers=1
```

그 뒤 수정 전후 고정 커밋 범위를 새 코드리뷰로 다시 공격하고, MAJOR 0일 때만 PASS 후보로 올린다.

## 검증했나

- `GET http://localhost:3456/api/health`: HTTP 200, DB up.
- 임시 고객 토큰으로 이미지와 카드뉴스 빈 본문 요청: 각각 HTTP 400으로 핸들러 도달 확인.
- 임시 고객 토큰으로 Higgsfield 상태 요청: HTTP 200과 민감 키 노출 확인. 값은 저장하지 않음.
- 임시 고객 토큰 폐기: HTTP 200.
- dashboard `npm run test`: 353파일, 2,293건 통과, 3건 제외, exit 0.
- dashboard `npx tsc --noEmit`: exit 0.
- 기본 흐름 E2E: 11/11 통과.
- Studio v1 E2E: 14/14 통과.
- OpenClaw tsdown 표적 테스트: 21 통과, 5 실패, exit 1.
- 코드 수정: 0건.
