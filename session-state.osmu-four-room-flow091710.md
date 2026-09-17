# OSMU 네 방 기본 흐름 QA v21 핸드오프

작성: 2026-09-17 10:24 KST

라인: osmu-four-room-flow091710

## 무엇을 어디까지 했나

- 회장 요청 원문을 primary handoff basis로 사용했다. canonical `pipeline-state.osmu.md`는 착수 때 이미 `current_stage: qa`였다.
- 실행 중 위임 `codex-qa-v`는 이 작업을 실행하는 현재 Codex wrapper임을 PID, 과제 원문, tmux `osmu-flowcheck091710:0.0`과 `/tmp/osmu-flowcheck091710.log`로 확인했다.
- 실행본 `build_commit=2280089f`에서 기본 흐름 최초와 최종 11/11, 네 방 최종 4/4, Studio v1 14/14를 관찰했다.
- 390 라이트·다크, 768, 1024, 1440에서 네 방 20화면과 성과실에서 생성실 복귀 5/5를 관찰했다.
- Vitest 374파일·2,414건, TypeScript, 격리 production build 184/184, schema·seed·RLS, 주요 API curl, 디자인 lint를 통과했다.
- v63 성과실 원본과 dev 성과실 원본을 각각 읽고 좌우 대조 이미지로 고정했다. 제품 코드는 수정하지 않았다.
- QA 보고서와 원본 증거는 커밋 `c847b616`에 있다.

## 남은 이슈·블로커

- 과제 기준 v63과 canonical 승인 디자인 핀 v68이 충돌한다.
- v63과 현재 라이트 화면 16개는 배치 속성이 불일치하거나 동일 콘텐츠 상태가 아니다.
- 운영 동적 URL의 배포 SHA와 외부 채널 실발행은 미검증이다.
- `verify-agent-quality.sh`는 stage 또는 운영 호스트 접촉 증거 0건으로 FAIL했다. localhost 기능 범위만 출고할 수 있다.

## 다음에 칠 명령

단일 승인 디자인 핀과 동일 콘텐츠 상태 화면이 확정되면 다음을 실행한다.

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

다음 소유자: 컨트롤러, product-designer, qa-verifier.

종료 증거: 단일 승인 핀, 동일 콘텐츠 상태 16화면 정합 전건 PASS, 운영 build SHA, 외부 채널 실발행 주소.

## 검증했나

- 관찰됨: localhost health HTTP 200, DB up, 기본 흐름 11/11, 네 방 4/4, 네 폭 화면 20/20, 복귀 5/5, Studio v1 14/14.
- 테스트됨: Vitest 374파일·2,414건, TypeScript 종료 0, production build 184/184, seed·RLS, 디자인 lint 위반 0.
- 근거 확인: v63 원본 PNG와 dev 원본 PNG를 각각 읽고 좌우 합성 대조함.
- 미검증: 운영 배포 버전, 외부 채널 실발행, 단일 승인 디자인 핀 기준의 동일 상태 16화면 정합.
