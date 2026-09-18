# OSMU 네 방 기본 흐름 QA v26 핸드오프

updated_at: 2026-09-19 07:27 KST
handoff_basis: 사용자의 네 방 기본 흐름 재검증 과제
canonical_repo: `/Users/sj/sj_code_master/zto1-marketing-studio`
pipeline_line: `osmu`
current_stage: `qa`
status: `in-progress`, 승인 아님

## 무엇을 어디까지 했나

- HEAD `e7eea1fa82bb5f67d6a76e8297bd5bfb75a74905`의 격리 실행본을 localhost:3456에 띄워 health HTTP 200, DB up, 88ms와 같은 build commit을 관찰했다.
- 네 방 단면 4/4, 390 라이트와 다크 및 768, 1024, 1440의 20화면, 성과실에서 생성실 복귀 5/5를 실제 클릭했다. 가로 넘침, 가린 모달, 탐색 가림, 401, 콘솔 오류는 0건이다.
- 기본 흐름은 첫 후보 생성에서 HTTP 429와 `STUDIO_LLM_PROVIDER_RATE_LIMITED`로 중단됐다. Studio v1은 401, 400, 422 거절 3건을 통과한 뒤 정상 생성이 같은 HTTP 429로 중단됐다.
- 전체 회귀에서 낡은 API 전수검사 계약 기대값과 병렬 부하에 취약한 fixture 제한시간을 고쳤다. 전체 Vitest 378파일과 2,434건, post-commit 표적 5건, 격리 TypeScript, webpack build 185/185, seed, RLS와 디자인 lint가 통과했다.
- v63 생성실과 성과실 PNG, v26 dev 생성실과 성과실 PNG를 원본 해상도로 각각 다시 열었다. 생성실은 후보 선택 중심과 주제 입력 중심으로, 성과실은 실제 30일 결론 중심과 표본 부족 및 예시 데이터 중심으로 달라 디자인 정합 NG를 유지했다.
- QA 보고서와 원장, 구현현황, canonical pipeline state, 회귀 테스트를 커밋 `c80e3aca`에 기록했다.

## 남은 이슈·블로커

- 공유 AI 제공자 7일 사용량이 100%다. 실측 초기화 시점은 2026-09-19 18:59 KST다.
- 과제 지정 v63과 canonical pipeline의 v68 승인 핀이 충돌한다. 단일 기준이 확정될 때까지 디자인 QA를 PASS로 전환할 수 없다.
- 운영 배포 버전과 외부 SNS 실발행은 이번 localhost 과제 범위에서 미검증이다.
- `verify-agent-quality.sh`는 운영 배포 환경 접촉 증거 0건을 이유로 FAIL했다. 로컬 기능 증거를 운영 증거로 확대하지 않는다.

## 다음에 칠 명령

소유자: OSMU QA 컨트롤러. 회수 시점: 2026-09-19 18:59 KST 공급자 초기화 뒤.

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio/dashboard
node scripts/verify-basic-flow-e2e.mjs
node scripts/verify-studio-v1-e2e.mjs
```

종료 증거는 기본 흐름 11/11과 Studio v1 14/14, 두 명령 종료 코드 0이다. 이후 컨트롤러와 product-designer가 v63 또는 v68 중 단일 승인 핀을 정하고 같은 콘텐츠 상태의 16개 화면을 다시 대조한다.

## 검증했나

- 관찰됨: 현재 실행본 health HTTP 200과 DB up, 네 방 4/4, 화면 20/20, 복귀 5/5, 생성 HTTP 429.
- 테스트됨: Vitest 2,434건, post-commit 표적 5건, 격리 `npx tsc --noEmit`, webpack build 185/185, seed, RLS, 디자인 lint.
- 육안 확인: v63과 dev의 생성실 및 성과실 1440 원본 PNG 두 쌍.
- 근거 확인: `docs/qa/osmu-four-room-basic-flow-v26-gpt-codex.md`, `logs/diff/osmu-four-room-flow-20260919-v26/`, 커밋 `c80e3aca`.
- 미검증: 공급자 초기화 뒤 실제 생성, 단일 승인 핀 기준 디자인 정합, 운영 배포 버전, 외부 채널 실발행.
