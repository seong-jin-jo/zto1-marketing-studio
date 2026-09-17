# OSMU 네 방 기본 흐름 QA v21 핸드오프

작성: 2026-09-17 10:18 KST

라인: osmu

작업: 네 방 기본 흐름 최종 회귀

현재 단계: canonical `pipeline-state.osmu.md`의 `current_stage: qa`

## 무엇을 어디까지 했나

- 회장 요청 원문을 handoff basis로 사용했다. tmux pane은 실행 서버와 동시 작업 확인에만 썼다.
- localhost:3456 실행본 `build_commit=2280089f`에서 생성실부터 성과실까지 실제 요청 11/11을 최초와 최종 두 번 통과했다.
- 네 방 단면 4/4, Studio v1 14/14를 통과했다.
- 390 라이트·다크, 768, 1024, 1440에서 네 방 20화면과 성과실에서 생성실 복귀 5/5를 관찰했다.
- 가로 넘침, 가린 탐색, 전체 화면 모달, 브라우저 401, 콘솔 오류는 0건이었다.
- Vitest 374파일·2,414건, TypeScript, 격리 production build 184/184, schema·seed·RLS, 주요 API curl, 디자인 lint를 통과했다.
- 이번 실행의 최신 QA 토큰 6/6 폐기와 활성 검증 토큰 0건을 확인했다.
- 제품 소스는 수정하지 않았다.
- 상세 보고서는 `docs/qa/osmu-four-room-basic-flow-v21-gpt-codex.md`, 원본은 `logs/diff/osmu-four-room-flow-20260917-v21/`이다.

## 남은 이슈·블로커

- 과제 기준은 v63이지만 canonical 승인 디자인 핀은 v68이다. 단일 디자인 정본이 확정되지 않았다.
- v63과 현재 라이트 화면 16개는 요소 순서, 열 수, 정렬·여백, 표시·숨김, 글꼴 단계, 버튼 위계가 불일치하거나 동일 콘텐츠 상태가 아니다.
- 운영 동적 URL의 실제 배포 버전과 외부 채널 실발행은 미검증이다.
- 따라서 기능 범위는 PASS지만 디자인 QA와 제품 전체 QA, 배포는 NG다.

## 다음에 칠 명령

컨트롤러와 product-designer가 v63 또는 v68 중 단일 승인 핀을 확정하고 같은 콘텐츠 상태의 16화면을 맞춘 뒤 실행한다.

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio/dashboard
set -a
source .env.local
set +a
FOUR_ROOM_OUTPUT_DIR=../logs/diff/osmu-four-room-flow-next/captures node scripts/verify-four-room-ui-e2e.mjs
node scripts/probe-four-room-flow.mjs
node scripts/verify-basic-flow-e2e.mjs
node scripts/verify-studio-v1-e2e.mjs
```

다음 소유자: 컨트롤러와 product-designer.

종료 증거: 단일 승인 핀, 동일 콘텐츠 상태 16화면 정합 행렬 전건 PASS, 운영 host의 배포 SHA 확인, 외부 채널 실발행 결과.

외부 회수 시점: product-designer가 정합 화면을 출고한 직후 기능과 디자인을 재검증하고, 운영 배포가 생긴 직후 배포 SHA와 실발행을 별도 회수한다.

## 검증했나

- 관찰됨: localhost health HTTP 200, DB up, 기본 흐름 11/11, 네 방 4/4, 네 폭 화면 20/20, 복귀 5/5, Studio v1 14/14.
- 테스트됨: Vitest 374파일·2,414건, TypeScript 종료 0, production build 184/184, seed·RLS, 디자인 lint 위반 0.
- 근거 확인: v63 프로토타입, 회장 확정 요구 대장, 사업 좌표, DESIGN, 화면 목록, 사용자 흐름, captures manifest.
- 미검증: 운영 배포 버전, 외부 채널 실발행, 단일 승인 디자인 핀 기준의 동일 상태 16화면 정합.
