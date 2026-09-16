# 2026-09-16 네 방 기본 흐름 재검증 인계

## v17 · 2026-09-16 18:59 KST

### 무엇을 어디까지 했나

- 회장 요청 원문을 handoff basis로 사용했다. canonical `pipeline-state.osmu.md`는 착수 때 이미 `current_stage: qa`, `status: in-progress (승인 아님)`이었다.
- 실제 3,044바이트 생성 프롬프트의 Claude CLI OAuth refresh 실패를 재현했다. 감독이 macOS 로그인 키체인 세션의 `SECURITYSESSIONID`를 복구하고 앱의 비밀값 제외 최소 자식 환경에 전달하도록 고쳤다. 제품 커밋은 `327500b0`, 타입 계약 보수는 `e7b8dc0d`다.
- 성과실 직접 이동이 AuthGate의 늦은 client navigation과 겹쳐 `ERR_ABORTED`가 난 탐침 결함을 발견했다. 목표 주소 확인 후 해당 오류에만 한 번 재시도하고 계약 테스트로 고정했다. 커밋은 `71495ef5`다.
- 최종 통제 localhost에서 기본 흐름 11/11, 네 방 단면 4/4, 390 라이트와 다크 및 768, 1024, 1440의 화면 20/20, 성과실에서 생성실 복귀 5/5, Studio v1 14/14를 관찰했다.
- QA 보고서, 요청번호 승계, 구현현황과 상태 기록은 `cf4a85cf`, 배포 검증 갭 표기는 `b395eaec`로 커밋했다. 정본 보고서는 `docs/qa/osmu-four-room-basic-flow-v17-gpt-codex.md`다.

### 남은 이슈·블로커

- 과제 지정 v63과 canonical pipeline 승인 v68 핀이 충돌한다. 현재 16개 화면은 v63의 요소 순서, 열 수, 정렬과 여백, 표시와 숨김, 글꼴 단계, 버튼 위계와 불일치하거나 동일 상태 캡처가 아니다.
- 운영 동적 URL의 실제 배포 버전과 외부 계정 실발행은 미검증이다. `verify-agent-quality.sh`도 배포 환경 접촉 증거 0건으로 FAIL했다.
- 통제 dev 서버는 검증 뒤 종료했다. health가 보고한 제품 build는 `e7b8dc0d`이며 후속 커밋은 검증기, 테스트와 문서만 바꿔 제품 런타임 소스는 동일하다.

### 다음에 칠 명령

단일 승인 디자인 핀이 확정된 뒤 다음을 실행한다.

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio/dashboard
set -a && source .env.local && set +a
FOUR_ROOM_OUTPUT_DIR="../logs/diff/osmu-four-room-flow-<next>/captures" node scripts/verify-four-room-ui-e2e.mjs
node scripts/probe-four-room-flow.mjs
```

운영 출고 판단은 승인된 운영 host에서 같은 흐름과 외부 채널 실발행을 관찰한 뒤 별도 배포 게이트에서 한다.

### 검증했나

- 관찰됨: localhost health HTTP 200과 DB up, 기본 흐름 11/11, Studio v1 14/14, 네 방 단면 4/4, 화면 20/20, 복귀 5/5, 가로 넘침과 전체 화면 모달과 401과 콘솔 오류 0건.
- 테스트됨: 전체 Vitest 371파일과 2,387건 통과, 조건부 3건 제외, TypeScript 종료 0, production build 184/184, schema와 seed 및 RLS, 디자인 lint 위반 0.
- 근거 확인: `docs/qa/osmu-four-room-basic-flow-v17-gpt-codex.md`, `docs/qa/qa-tracker.md`, `logs/diff/osmu-four-room-flow-20260916-v17/`.
- 미검증: 단일 승인 핀 기준 디자인 정합, 운영 배포 버전, 외부 채널 실발행.

---

## 무엇을 어디까지 했나

- canonical `pipeline-state.osmu.md`는 착수 시 이미 `current_stage: qa`였다.
- 실행 커밋 `4a44136d9c24c1ab5e863a60862f2308d199e7cc`와 health `build_commit`이 같은 통제 localhost 서버에서 기본 흐름 11/11, 네 방 단면 4/4, 390 라이트와 다크, 768, 1024, 1440 화면 20/20, 복귀 5/5, Studio v1 14/14를 통과했다.
- 원본은 `logs/diff/osmu-four-room-flow-20260916-v15/captures-final/`, 보고서는 `docs/qa/osmu-four-room-basic-flow-v15-gpt-codex.md`다.
- 정확한 `npx tsc --noEmit`, schema와 seed 및 RLS, 디자인 lint는 종료 0이다.

## 남은 이슈와 블로커

- 최종 `npm run test`에서 발행 경계 2건이 5초 timeout으로 실패했고 남은 실행은 종료 전에 중단됐다. 최신 전체 회귀 PASS가 아니다.
- Next 16.2.2의 `.next/dev/types/routes.d.ts`가 통제 서버에서도 잘린다. 손상본은 `/tmp/osmu-next-dev-types-broken-v15-20260916-0310`에 보존했다.
- 과제 지정 v63과 canonical 승인 v68 디자인 핀이 충돌하며 현재 화면은 v63 정합 NG다.
- 첫 실패 실행에서 서버가 내려가 임시 고객 토큰 폐기 응답을 받지 못한 1건은 운영 점검이 필요하다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio/dashboard
npx vitest run tests/publish/publish-route.branch.test.ts tests/publish/video-publish-reels.route.test.ts
npm run test
```

두 표적과 전체가 종료 0일 때만 `FLOW-FULL-REGRESSION-V15`를 PASS로 바꾼다.

## 검증했나

- 관찰됨: health HTTP 200과 DB up, 실행 커밋 귀속, 네 live suite, 20개 화면 원본, 대표 4폭 육안 확인.
- 테스트됨: TypeScript 종료 0, seed와 RLS 종료 0, 디자인 lint 위반 0, 착수 전체 회귀 366파일과 2,345건 통과.
- NG: 최종 전체 회귀 timeout 2건, v63 디자인 정합, 운영 배포와 외부 채널 실발행.
