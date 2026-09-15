# OSMU 네 방 기본 흐름 QA 핸드오프

## 2026-09-15 22:55 KST · v14 현재 핸드오프

### 무엇을 어디까지 했나

- 회장 요청 원문을 handoff basis로 사용했다. canonical main repo는 `/Users/sj/sj_code_master/zto1-marketing-studio`이며 `pipeline-state.osmu.md`는 착수 때 이미 `current_stage: qa`였다.
- 지정 작업 공간에서 localhost 기본 흐름을 최초와 최종 각 11/11, Studio v1을 최초와 최종 각 14/14, 네 방 단면을 최초와 최종 각 4/4 통과했다.
- 390 라이트와 다크, 768, 1024, 1440 라이트에서 생성실부터 성과실까지 실제 클릭했다. 최초와 수정 후 화면 각 20/20, 성과실에서 생성실 복귀 각 5/5다. 가로 넘침, 전체 화면 모달, 탐색 가림, 브라우저 401, 콘솔 오류는 0건이다.
- 최초 1024 성과실에서 핵심 지표 네 값이 한 자리씩 세로로 줄바꿈되는 결함을 직접 발견했다. 전용 성과실의 4열 전환만 `xl`로 늦춰 1024는 2열, 1440은 4열로 고쳤다. 포함형 성과실의 기존 `lg` 4열은 보존했다. 전용과 포함형 계약 회귀 2건을 추가했다.
- 전체 Vitest 362파일과 2,321건, 조건부 3건 제외, TypeScript 최종 종료 0, production build 184/184, schema와 seed 및 RLS, health HTTP 200과 DB up, 디자인 lint 위반 0을 확인했다.

### 실패 이력과 현재 블로커

- TypeScript 첫 실행과 재실행은 손상된 `.next/dev/types/routes.d.ts` 때문에 종료 2였다. `next typegen`으로 생성물을 복구한 뒤 동일 `npx tsc --noEmit`이 종료 0이다. 제품 소스 결함으로 세지 않았다.
- 첫 격리 build는 `node_modules` 심볼릭 링크가 Turbopack 파일시스템 루트 밖을 가리켜 종료 1이었다. `node_modules` hardlink 복제 격리 디렉터리에서 최종 build가 종료 0, 184/184다. 기존 localhost 서버는 건드리지 않았다.
- 과제 지정 v63과 canonical pipeline 최신 승인 v68 핀이 충돌한다. `docs/design/README.md`는 실제 경로를 지목하지 않고, `screen-inventory.md`의 인증 STUDIO 미검증 표기와 captures manifest가 충돌한다. 타 세션이 디자인 문서를 수정 중이어서 임의 수정하지 않고 디자인 QA NG로 남겼다.
- listener PID 15479는 21시 30분 시작, 현재 HEAD는 `099a7370...`이나 health 응답에 build SHA, commit, version이 없다. localhost 기능은 관찰했지만 현재 HEAD 실행본 귀속은 NG다.
- 운영 배포와 외부 계정 실발행은 미검증이다. 기능 범위 PASS를 제품 전체 QA 또는 배포 PASS로 확대하지 않는다.

### 다음에 할 일

1. 단일 승인 디자인 핀을 확정하고 README, 화면 인벤토리, captures manifest를 같은 정본으로 맞춘 뒤 8개 배치 속성 정합 행렬을 재검증한다.
2. health 또는 빌드 메타데이터에 commit 귀속을 제공하는 실행본에서 같은 localhost 기본 흐름과 네 폭 클릭을 재실행한다.
3. 운영 출고 판단은 운영 host 응답과 외부 채널 실발행 증거를 확보한 뒤 별도 게이트에서 한다.

### 증거 위치

- 수정 전 PNG: `logs/diff/osmu-four-room-flow-20260915-v14/captures/`
- 수정 후 PNG: `logs/diff/osmu-four-room-flow-20260915-v14/captures-fixed/`
- 명령별 출력과 종료 코드: `logs/diff/osmu-four-room-flow-20260915-v14/commands/`
- 상세 판정과 요청 승계: `docs/qa/qa-tracker.md`의 v14 항목

---


## 무엇을 어디까지 했나

- 회장 요청 원문을 handoff basis로 사용했다. canonical main repo는 `/Users/sj/sj_code_master/zto1-marketing-studio`이며 `pipeline-state.osmu.md`는 착수 때 이미 `current_stage: qa`였다.
- 지정 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`에서 localhost 기본 흐름 11/11, Studio v1 14/14, 네 방 단면 4/4를 통과했다.
- 390 라이트와 다크, 768, 1024, 1440 라이트에서 방 화면 20/20과 성과실에서 생성실 복귀 5/5를 관찰했다. 가로 넘침, 전체 화면 모달, 탐색 가림, 브라우저 401, 콘솔 오류는 모두 0건이다.
- 첫 전체 회귀의 3개 실패 중 큐 잠금 재시도 부족과 오류 문구 불안정을 고쳐 `800c970a`로 커밋했다. 제한 동시성 구현을 예전 문자열로 판정하던 정적 계약 테스트도 현재 작업트리에서 수정했다.
- 수정 후 Vitest 360파일과 2,317건 통과, 조건부 3건 제외, TypeScript 종료 0, production build 184/184, schema와 seed 및 RLS 적용, health HTTP 200과 DB up, 디자인 lint 위반 0을 확인했다.
- QA 보고서와 원장은 `b0a574ae`로 커밋했다. 정본 보고서는 `docs/qa/osmu-four-room-basic-flow-v12-gpt-codex.md`, 화면 원본은 `logs/diff/osmu-four-room-flow-20260915-0635/captures/`다.

## 남은 이슈·블로커

- `dashboard/tests/analytics/success-only-wiring.contract.test.ts` 수정은 아직 작업트리에 있다. 같은 `dashboard/tests` 경로의 타 세션 미추적 파일 `dashboard/tests/db/local-ci-db-migrations.regression-1.test.ts` 때문에 `commit-untracked-guard`가 커밋을 차단했다. 타 세션 파일을 임의 포함하거나 옮겨 우회하지 않았다.
- v63 기준 PNG와 현재 16개 화면 조합은 주축, 요소 순서, 열 수, 정렬과 여백, 표시와 숨김, 글꼴 단계, 버튼 위계가 모두 다르다.
- 과제 기준 v63과 canonical pipeline 승인 `design_hub` v68이 충돌한다.
- 운영 배포와 외부 계정 실발행은 미검증이다. `verify-agent-quality.sh`는 배포 환경 접촉 증거 0건으로 FAIL했다.

## 다음에 칠 명령

1. 컨트롤러가 `dashboard/tests/db/local-ci-db-migrations.regression-1.test.ts`의 소유 세션과 커밋 여부를 확인한다.
2. 해당 미추적 파일이 소유 커밋으로 정리된 뒤 `git add dashboard/tests/analytics/success-only-wiring.contract.test.ts && git commit -m "test(qa): FLOW-REGRESSION-V12 - follow bounded publish concurrency"`를 실행한다.
3. 깨끗한 체크아웃에서 `cd dashboard && npm run test && npx tsc --noEmit && npm run build`를 다시 실행한다.
4. 컨트롤러와 product-designer가 v63 또는 v68 중 단일 승인 핀을 확정하고 16개 화면의 8개 배치 속성을 맞춘 뒤 `verify-four-room-ui-e2e.mjs`와 디자인 정합 매트릭스를 재실행한다.
5. 종료 증거는 정적 계약 커밋 SHA, 깨끗한 체크아웃 전체 회귀, 단일 승인 핀, 16개 화면 디자인 PASS, 운영 host 응답이다.

## 검증했나

- 관찰됨: localhost health HTTP 200과 DB up, 기본 흐름 11/11, Studio v1 14/14, 네 방 4/4, 방 화면 20/20, 성과실에서 생성실 복귀 5/5, 활성 `qa-four-room-*` 토큰 0건.
- 테스트됨: 표적 3파일 43건, 전체 Vitest 2,317건, TypeScript, production build 184/184, seed, 디자인 lint.
- 근거 확인: v63 원본 PNG와 현재 캡처의 16개 화면 구조 불일치, v63과 v68 승인 핀 충돌, 두 커밋 `800c970a`, `b0a574ae` 내용.
- 미검증: 깨끗한 체크아웃 전체 회귀, 운영 배포 버전, 외부 계정 실발행과 운영 성과 회수.
