# OSMU 네 방 기본 흐름 v12 QA 핸드오프

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
