# OSMU code review 2026-09-15 R2 handoff

## 무엇을 어디까지 했나

- 회장 요청 원문을 handoff basis로 사용했다.
- 검토 범위는 `fe24d05180b99b1c39e30e915b8557bd8e03d0fe..f4b0f5a5188ef6343e22d9ed4cbebd79b05d0bcc`, 91개 커밋과 202개 파일로 고정했다. 공유 HEAD가 검토 중 이동했으므로 감사 줄 번호는 고정 끝 커밋을 기준으로 한다.
- v63 프로토타입, pipeline 승인 v68 디자인 허브, 확정 요구 대장, 사업 좌표, `DESIGN.md`, 거버넌스 결정을 읽고 코드와 대조했다.
- `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-15.md`에 MAJOR 17건, MINOR 1건, `REVIEW_VERDICT: BLOCK`을 기록했다.
- `docs/qa/qa-tracker.md`와 `wiki/ops/session-state.md`에 이번 증거를 최신순으로 기록했다.
- 제품 코드는 수정하지 않았다. 리뷰 문서와 QA 및 wiki 인계 커밋은 `79e3687d`다.
- 후속 QA 위임은 커밋 `724e5c6e`와 핸드오프 커밋 `39a6f469`로 완료됐다. 최신 localhost API 읽기 실사는 고유 경로 105개에 GET 105건과 HEAD 1건을 보냈고 정상 92건, 계약상 거절 14건, 예상 밖 4xx·5xx·redirect·timeout 0건이었다.
- 실행 중 위임 등록 `codex-qa-verifier-66973`는 완료 마커와 최종 보고를 회수한 뒤 해제된 것을 확인했다.

## 남은 이슈·블로커

- 접힌 사이드바에서 네 방 링크와 현재 방 강조가 사라지고 1024 기본 56px 및 펼침 겹침 계약을 지키지 않는다.
- 공유 Claude CLI 직렬화가 프로세스 로컬이라 다중 서버 경합과 재시작 유실이 가능하다.
- 성과 수집이 플랫폼 기본 계정 하나로 다른 account_id의 글도 조회하며, 불확실한 누락을 영구 제외할 수 있다.
- 고객 자막 ffmpeg의 전역 및 테넌트 동시성 상한이 없다.
- Instagram 발행용 공개 R2 객체에 만료, 삭제, 보관 장부가 없다.
- 이번 후속 API sweep은 동일 listener PID 64529와 실행 전후 동일 소스 해시를 기록해 실행 중 소스 변경은 배제했다. 다만 제품의 일반 sweep 도구가 서버 build identity를 강제하지 않는 코드 결함은 남아 있다.
- OpenClaw tsdown 표적 테스트 26건 중 5건이 실패하고, 기본 제한시간이 없으며 작은 cgroup에서 heap 상한이 실제 메모리를 넘는다.
- 공유 runner의 Docker prune이 비OSMU cache와 anonymous volume까지 지울 수 있다.
- Studio v1 E2E는 첫 실행 12/14 실패 후 재실행 14/14라 연속 안정 통과가 아니다.
- API 읽기 범위는 PASS지만 디자인 정합 NG, 코드 리뷰 BLOCK, 운영 배포와 외부 발행 미검증 때문에 제품 전체는 NG다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio
git log -8 --oneline
git status --short --untracked-files=no
cd dashboard
npm run test
npx tsc --noEmit
set -a && source ./.env.local && set +a
STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-basic-flow-e2e.mjs
STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-studio-v1-e2e.mjs
cd ../openclaw
pnpm exec vitest run test/scripts/tsdown-build.test.ts --config test/vitest/vitest.tooling.config.ts --maxWorkers=1
```

MAJOR 수정 뒤 같은 실제 요청과 고정 커밋 diff를 다시 공격해 MAJOR 0일 때만 PASS 후보로 올린다.

## 검증했나

- `GET http://localhost:3456/api/health`: HTTP 200, DB up.
- dashboard `npm run test`: 360파일, 2,317건 통과, 3건 제외, exit 0.
- dashboard `npx tsc --noEmit`: exit 0.
- 기본 흐름 E2E: 11/11 통과.
- Studio v1 E2E: 첫 실행 12/14 실패, 재실행 14/14. NG.
- OpenClaw tsdown 표적 테스트: 21건 통과, 5건 실패. NG.
- 후속 API 읽기 실사: GET 105건과 HEAD 1건, 정상 92건, 계약상 거절 14건, 예상 밖 오류 0건. API 읽기 범위 PASS.
- 후속 QA 전체 회귀: 360파일, 2,317건 통과, 3건 제외. TypeScript와 production build 184/184 통과.
- 후속 QA 기본 흐름 11/11, Studio v1 14/14, 네 방 화면 20/20 통과. 제품 전체는 디자인 정합과 코드 리뷰 때문에 NG.
- `git diff --check fe24d051..f4b0f5a5`: 위반 0건.
- 운영 배포, 외부 SNS 실제 발행, 외부 계정 성과 수집은 미검증.
- 제품 코드 수정: 0건.
