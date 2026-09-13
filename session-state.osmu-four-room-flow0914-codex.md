# OSMU 네 방 기본 흐름 재검증 핸드오프

업데이트: 2026-09-14 06:50 KST
라인: osmu
작업 목적: 네 방 기본 흐름과 4개 viewport 전체 회귀 재검증
handoff basis: 회장 요청 원문, canonical `pipeline-state.osmu.md`, 현재 공유 작업트리 상태

## 무엇을 어디까지 했나

- canonical main repo의 `pipeline-state.osmu.md`가 착수 때 이미 `current_stage: qa`여서 단계와 승인 상태는 바꾸지 않았다.
- 지정 작업 공간에서 seed를 적용하고 localhost 기본 API 11/11, 네 방 렌더 4/4, Studio v1 14/14를 관찰했다.
- 390 라이트와 다크, 768, 1024, 1440 라이트에서 생성실부터 성과실까지 20개 화면을 실제 클릭했고 성과실에서 생성실 복귀 5/5를 확인했다. 가로 넘침, 가린 모달, 탐색 차단, 다음 행동 누락, 브라우저 401, 콘솔 오류는 모두 0건이다.
- 전체 Vitest 340파일과 2,197건, TypeScript, production build 184/184, 디자인 lint를 통과했다. 조건부 테스트 3건은 제외됐다.
- 기본 Turbopack 개발 서버가 `/login/page`에서 `Next.js package not found` 치명 오류를 반복한 ISSUE-011을 재현했다. Next.js 16.2.2 설치는 정상이고 production과 Webpack 개발 서버는 같은 소스로 통과했다.
- 기본 개발 명령을 `next dev --webpack`으로 바꾸고 회귀 테스트 2건을 추가했다. 수정 커밋은 `99686354`다.
- QA 보고서, 요청번호 추적, 구현현황과 공유 session state를 갱신했다. 문서 커밋은 `646ea1b1`, 상세 보고서는 `docs/qa/osmu-four-room-basic-flow-v6-gpt-codex.md`다.
- 검증 서버는 모두 종료했고 localhost:3456에 무인 프로세스를 남기지 않았다.

## 남은 이슈·블로커

- v63 시안과 dev 화면을 원본 이미지로 다시 직접 열어 대조했다. 1440 생성실은 v63의 좌측 제작 순서, 후보 3열, 학습 패널, 우측 담당 구조가 dev의 아이콘 레일, 상단 단계, 입력 중심 본문과 다르다.
- 390 성과실은 v63의 성과 카드 우선 구조와 하단 담당 패널이 dev의 단계 안내와 담당 패널 우선 세로 구조로 바뀌어 있다. 16개 화면 전체의 8개 배치 축은 NG다.
- 과제가 지정한 v63과 canonical pipeline 최신 승인 `design_hub` v68이 충돌한다. 워커가 임의로 정본을 선택하지 않았다.
- 실제 운영 배포, 외부 채널 실발행, 운영 성과 회수는 미검증이다.
- `verify-agent-quality.sh`는 배포 환경 접촉 증거 0건으로 로컬 QA를 반려했다. 네 방 localhost 기능만 PASS이며 제품 전체 QA와 배포는 NG다.
- 공유 작업트리의 다른 수정은 보존했고 두 커밋에 포함하지 않았다.

## 다음에 칠 명령

먼저 컨트롤러와 product-designer가 v63과 v68 중 디자인 정본을 하나로 확정하고 네 방 레이아웃을 맞춘다. 그 뒤 QA 소유자가 아래를 순서대로 실행한다.

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio/dashboard
set -a; . ./.env.local; set +a
bash scripts/apply-schema.sh --seed
npm run test
npx tsc --noEmit
npm run build
npm run dev -- --port 3456
node scripts/verify-basic-flow-e2e.mjs
node scripts/verify-studio-v1-e2e.mjs
node scripts/probe-four-room-flow.mjs
FOUR_ROOM_OUTPUT_DIR=../logs/diff/osmu-four-room-flow-next/captures node scripts/verify-four-room-ui-e2e.mjs
```

개발 서버는 캡처 뒤 반드시 종료한다. 종료 증거는 8축 디자인 정합 PASS, localhost 전 기능 회귀 PASS, 운영 버전 동일 흐름 실측이다.

## 검증했나

| 항목 | 결과 |
|---|---|
| canonical QA 단계 | 근거 확인, 이미 `qa` |
| seed와 health | PASS, HTTP 200과 DB up |
| 백엔드 기본 흐름 | PASS, 11/11 |
| 네 방 렌더 | PASS, 4/4 |
| 4개 viewport 실제 이동 | PASS, 20/20과 복귀 5/5 |
| Studio v1 | PASS, 14/14 |
| 전체 테스트 | PASS, 340파일과 2,197건. 조건부 3건 제외 |
| TypeScript | PASS, 종료 코드 0 |
| web build | PASS, 184/184. 기존 NFT 경고 1건 |
| 디자인 lint | PASS, 위반 0건 |
| 기본 개발 명령 | PASS, Webpack 기동과 health 200, 네 방 4/4 |
| 디자인 시안과 dev 원본 대조 | NG, 1440 생성실과 390 성과실을 직접 재열람. 16개 조합 매트릭스 NG |
| 상위 QA 품질 게이트 | FAIL, 배포 환경 접촉 증거 0건 |
| qa-tracker와 구현현황 | 커밋 `646ea1b1`에 기록 |
