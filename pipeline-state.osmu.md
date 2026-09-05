## 2026-09-06 build 단계 실사용 QA 로 드러난 기획·구현 불일치

stage: build
status: in-progress (승인 아님)

**구현이 기획을 벗어난 자리를 찾았다.** PRD v8.2.1 은 고객이 저해상도 후보 3개를 받아
1개를 고해상도로 완성하는 것을 제품 핵심으로 규정하는데, 코드는 `me.isOperator === true`
일 때만 이미지·영상 생성을 연다. 고객에게는 "이미지 생성은 운영자 전용 기능입니다"가 뜬다.
그래서 카드뉴스와 영상이 고객 계정에서 아예 만들어지지 않는다. OD-001 로 등록했다.

**이번 구현에서 확정한 원칙을 ADR-007 로 박았다.** 조용한 실패 금지. 못 하면 이유를 말하고
빠져나갈 길을 준다. 여섯 곳에서 같은 모양으로 나온 결함을 고치며 세운 기준이다.

**QA 시나리오의 결함.** 지금까지 인수 기준을 승인된 기획서에서 가져오지 않고 회장이 그 자리에서
지적한 것으로 삼았다. 그래서 카드뉴스·영상·취소·리셋·학습 정보 완료·작업물 목록 축이 통째로
비어 있었고 회장 스모크에서 한 번에 드러났다. 다음 판의 첫 일은 네 방별 인수 기준을 기획
정본에서 뽑아 문서로 세우는 것이다.

## 2026-09-03 v68 design 승인 (컨트롤러 재검증, 회장 위임 범위)

stage: build
status: approved-for-build
approved_by: 컨트롤러(Claude). 회장 승인 아님.
근거: CLAUDE.md §5.5 "화면 배치·문구·흐름 순서는 회장 승인 항목이 아니다. 추천안으로 진행하고 결과를 보여라."
  회장 승인이 필요한 셋(돈·되돌리기 비싼 것·제품 정체성) 중 어디에도 해당하지 않는다.
  되돌리기 비싼 문(운영 배포)은 그대로 잠겨 있고 그것만 회장이 연다.

구조 결정: 성과실은 네 번째 전용 방으로 만든다. 홈 통합 안은 채택하지 않는다.
  이유: 시안 셸에 네 번째 방이 있는데 제품에서 누르면 홈으로 튕기는 지금 상태가 가장 나쁘다.
  단, 홈(`/`)의 기존 성과 요소는 지우지 않는다.

approved_artifacts:
- design_hub: `docs/prototype/osmu-v68-create-performance-hub-gpt-codex-20260903-0022.html`
- design_system: `DESIGN.md` v37
- clean_frames: `docs/design/clean-frames/osmu-v68-*` 24장
- capture_audit: `docs/design/clean-frames/osmu-v68-capture-audit-gpt-codex-20260903-0022.json`

컨트롤러 재검증 증거:
- clean frame 24장 전수 크기 검사: 1024x900 12장, 390x844 12장, 규격 이탈 0건 (직접 실행)
- 성과실 normal 1024 프레임을 직접 열어 육안 확인: 4단계 상단에서 04 성과실 활성, 채널 필터, 한 줄 판정, 지표 8개, 잘된 콘텐츠 3개, 다음 행동. 한국어만, 긴 대시 없음, 이모지 없음
- 낮은 반응 콘텐츠는 "직접 검토" 로 표기돼 사람 승낙 원칙(CLAUDE.md 저조 글 정리)과 어긋나지 않음
- `dashboard/src/**` 수정 0건 확인

미해소: `verify-agent-quality.sh product-designer` 가 WebSearch 0회로 벤치마크 부족 FAIL. 구현과 병행해 벤치마크 판을 따로 돌린다.

## 2026-09-03 v68 생성실·성과실 디자인 승인 후보

stage: design
status: awaiting-approval
parent_release: v67 qa approved. v68은 신규 디자인 후보이며 기존 승인 단계를 덮지 않는다.

design_canonical_candidate:
  version: v68
  design_system: `DESIGN.md` v37
  routing_hub: `docs/prototype/osmu-v68-create-performance-hub-gpt-codex-20260903-0022.html`
  wireframes: `docs/WIREFRAMES/osmu-v68-create-performance-gpt-codex-20260903-0022.md`
  user_flow: `docs/user-flow.md` v68 최신 증분
  clean_frames: `docs/design/clean-frames/osmu-v68-{create|performance}-{normal|empty|loading|error|disabled|overflow}-{1024|390}-gpt-codex-20260903-0022.png`
  frame_stamps: same basename with `.png.stamp.txt`
  capture_audit: `docs/design/clean-frames/osmu-v68-capture-audit-gpt-codex-20260903-0022.json`
  capture_count: 24
  viewport_contract: [1024x900, 390x844]
  review_status: `B+ · 89/100`, `docs/qa/osmu-v68-design-review-gpt-codex-20260903-0022.md`
  approval_status: candidate-only

계승 계약:
- v67의 상단 4단계, 56px 축약 탐색, 1024 본문·담당 2열, 390 하단 담당, 여섯 상태를 유지한다.
- 생성실의 형식 선택, A/B/C 구조 초안, 학습 정보 반영, 공유 AI 승인 대기, 편집실 이동을 보존한다.
- 홈의 핵심·보조 성과 지표, 채널 필터, 잘된 콘텐츠, 제안, 답글 후보, 자동 반응, 낮은 반응 콘텐츠 직접 검토를 보존한다.
- 채널 미연결 상태에서 심사 전 임시 안내가 있어도 연결 버튼을 막지 않는다.

증거:
- Chrome 실렌더 24장. 1024×900 12장, 390×844 12장, 픽셀 크기 불일치 0장.
- 감사 JSON 기준 가로 넘침 0장, 콘솔 오류 0건, 44px 미만 조작 표적 0개, 검수 막대 노출 0장.
- `dashboard/src/**` 수정 0건. 제품 코드와 배포 변경 없음.

회수 필요:
- 성과실을 네 번째 전용 방으로 세울지 홈 통합을 정본으로 둘지 회장이 확정해야 한다. 추천은 전용 방이지만 확정 전 라우팅과 홈 역할을 바꾸지 않는다.

게이트:
- 이 블록은 design candidate 핀이다. `approved_artifacts`가 아니며 `/approve design` 전 제품 소스 구현 기준으로 승격하지 않는다.
- 머지와 배포를 하지 않는다.

## 2026-09-03 v67 QA 재개 (필수 승인 핀 누락)

stage: qa
status: in-progress
approved_stages: [plan, design, build]
reopened_by: Codex Stage Controller (2026-09-03 pipeline-pin-gate)
reopen_reason: v67 QA 승인에 stages.yaml 필수 증거인 qa-tracker, design-conformance-matrix, regression의 승인 핀이 없다. NG 또는 다른 버전 산출물을 대신 핀하지 않고 QA를 재검증한다.
previous_approval: 회장 (2026-09-03 채팅 "배포는 승인할게")
approved_head: `74e092be`
evidence:
- CI run `33583258595` conclusion success, HEAD `3fcc6af3`
- `npx tsc --noEmit` 오류 0
- `tests/components tests/publish tests/brand` 64파일 553건 통과, 실패 0
- `npm run build` 성공, `next start` 실서버 6경로 전부 200
- `docs/qa/qa-tracker.md` 최상단 v67 판정표

범위: `openclaw-dashboard-osmu` 서비스만 배포한다. 게이트웨이는 이 저장소 밖이며 범위가 아니다.

승인 로그:
- ⟲ REOPEN qa: v67 기능 해피·엣지, 디자인 정합, 회귀의 세 승인 산출물을 실제 검증하고 핀하기 전까지 QA와 배포 승인을 잠근다.

## 2026-09-02 v67 편집실·발행실 통합 디자인 승인 후보

stage: design
status: awaiting-approval
controller_handoff: `2026-09-02 06:36 KST, Codex → Claude pane openclaw-auto:0.0`

design_canonical_candidate:
  version: v67
  design_system: `DESIGN.md` v36
  routing_hub: `docs/prototype/osmu-v67-edit-publish-hub-gpt-codex-20260902-0448.html`
  delta_spec: `docs/design-spec-osmu-v65-v66-delta-v1.0.0-gpt-codex-20260902-0448.md`
  clean_frames: `docs/design/clean-frames/osmu-v67-{edit|publish}-{normal|empty|loading|error|disabled|overflow}-{1024|390}-gpt-codex-20260902-0448.png`
  frame_stamps: same basename with `.png.stamp.md`
  capture_audit: `docs/design/clean-frames/osmu-v67-capture-audit-gpt-codex-20260902-0448.json`
  seed: `osmu-v67-static-seed-01`
  review_status: `B+ · 88/100`, `docs/qa/osmu-v67-design-review-gpt-codex-20260902-0448.md`
  approval_status: candidate-only

계승 계약:
- 승인 정본 v64의 상단 2층 GNB, 224·56 탐색, 1024 본문 7:담당 3과 담당 최소 240px, 390 본문 다음 담당을 유지한다.
- v65 편집 내용과 v66 발행 필드 내용을 같은 셸 한 파일에 통합한다.
- normal, empty, loading, error, disabled, overflow 여섯 상태를 두 방과 두 폭에서 각각 렌더한다.

게이트:
- 이 블록은 design canonical 후보 핀이다. approved_artifacts가 아니며 `/approve design` 전 제품 소스 구현 기준으로 승격하지 않는다.
- matched-pair actual frame은 build 뒤 같은 seed, state, viewport로 별도 생성한다.

## 2026-09-02 디자인 재개: v65·v66 증분 승인 대기 (Codex 메인 컨트롤러)

stage: design
status: changes-requested
reopen_reason: v65 편집실은 디자인 승인 기록 없이 build가 먼저 진행됐고, v66 발행실은 디자인 산출물만 있고 구현·승인이 없다. v64 승인 정본을 유지한 채 두 증분을 묶어 디자인 게이트를 정상화한다.

review_result: Design Score C, BLOCK. v65·v66이 v64 공유 셸을 상속하지 않았고, design-review·clean frame·delta design-spec·design_canonical·matched-pair 증거가 없다. `/approve design` 요청을 철회하고 v67 단일 허브 리테이크 중이다.

candidate_artifacts:
- design_hub: `docs/prototype/openclaw-auto-4room-v64.html` (기존 승인 전체 제품 정본)
- design_system: `DESIGN.md` v35, commit `68062525`
- editroom_design: `docs/prototype/osmu-editroom-v65-gpt-codex-20260901-0710.html` + `docs/WIREFRAMES/osmu-editroom-v65-gpt-codex-20260901-0710.md`, commit `66ad58dd`
- editroom_build_evidence: commits `e81caf6e`, `ddfb15d1`
- publishfield_design: `docs/prototype/osmu-publishfield-v66-gpt-codex-20260901-0813.html` + `docs/WIREFRAMES/osmu-publishfield-v66-gpt-codex-20260901-0813.md`
- publishfield_rules: `docs/reference/플랫폼-발행-필드-규격-2026-09-01.md`, commit `68062525`
- requirements: `wiki/거버넌스/요청.md` 2026-08-30 회장 2차 실사용 피드백
- audit: `docs/qa/회장-세션발화-전건-대조표-2026-08-31.md`

게이트:
- `/approve design` 전에 v66 소스 구현 금지.
- v65 기존 구현은 삭제·재작성하지 않고 리뷰·QA 대상으로 보존.
- 승인 후 build 소유자는 v66 미구현만 추가하고, code-reviewer·qa-verifier가 v65 회귀와 통합 경로를 병렬 검증.

## 2026-09-01 01:15 승인 산출물 핀 (Claude, osmu 라인)

stage: build. 편집실·발행실 화면 판을 다시 발주하기 위해 승인 산출물을 핀한다.

approved_artifacts:
- design_hub: `docs/prototype/openclaw-auto-4room-v64.html`
- design_system: `DESIGN.md` (정본 v64)
- requirements: `wiki/거버넌스/요청.md` 2026-08-30 회장 2차 실사용 피드백
- audit: `docs/qa/회장-세션발화-전건-대조표-2026-08-31.md`

핀 근거: v60부터 v64까지 후보가 있고 `DESIGN.md` 정본이 v64다. 최신이자 정본이라 v64를 택했다.
직전 발주(`osmu-editroom0901`)가 이 핀이 없어 착수하지 못하고 종료했다. 그 차단을 여는 조치다.

게이트(유지):
- 컨트롤러가 운영에서 로그인부터 발행까지 직접 밟기 전까지 회장께 "써 보시라" 금지.

## 2026-08-30 22:35 진행상태 갱신 (Claude, osmu 라인)

stage: qa 재개. ★"완료" 판정 전면 재검토 중.

★★★ 제품 핵심 부재 확인: 콘텐츠 생성이 LLM 을 한 번도 부르지 않는다.
  service.ts buildCandidates() 가 A/B/C 를 문자열 템플릿으로 조립한다.
  derivation.ts 도 템플릿. 영상은 asset_url "pending:render" 고정.
  LLM 호출 grep 0건. 컨트롤러가 코드를 직접 읽어 확인했다.
  ⇒ 네 방 전체가 이 위에 얹혀 있다. **회장 판단 필요: 실제 LLM 연동 시점.**

★ 요청 266건 전항목 대조 완료(009ffcad):
  충족 128 · 부분 60 · 미충족 48 · 확인불가 30.
  ★2차 실사용 피드백 31건 중 충족 1건. 어제 지적은 사실상 미착수.

★ 계정 연결: 실패 사유를 버리던 것을 고쳐 배포(PR #39, 배포 33313508878 success).
  회장이 Threads 재연결 1회 시도하면 Meta 실사유가 로그에 남는다.
  앱 자격증명은 유효함을 Meta 직접 호출로 확인. 요청 형식도 공식 문서와 일치.

가동중 codex 두 판: osmu-gen0830(학습정보 8 + 생성실 11),
osmu-edit0830(편집실 8 + 발행실 4 + 왕복 띠 제거).

게이트:
- LLM 연동 전까지 "콘텐츠 생성이 된다" 주장 금지.
- 컨트롤러가 배포 환경에서 로그인부터 발행까지 직접 밟기 전까지
  회장께 "써 보시라" 금지. 이번 사고의 재발 방지 조건이다.

## 2026-08-30 20:40 진행상태 갱신 (Claude, osmu 라인)

stage: 운영 가동중. 회장 2차 실사용 대기.

★ VM 정리 완료: 컨테이너 12개 → 2개, 디스크 81% → 36%.
  정리 후 실측 /api/health {"ok":true,"db":"up","ms":9}, login 200.
★ 찌꺼기 재발 방지: 배포 워크플로 정리 단계(3dc8af80) + VM 주간 크론.
★ 회장 보고서 제출: docs/rendered/osmu-인프라와-1차개선-2026-08-30.html (d8698401).
★ R2 운영 설정 0개. 영상 원본 보관처 미정. 회장 판단 대기.

게이트: 30건 대조표 재실행 전까지 "회장 피드백 전부 해결" 주장 금지.
배포 주의: services 좁히기, expand-guard 불가.
