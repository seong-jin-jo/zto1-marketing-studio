## 2026-09-07 채널 관통 시도와 인증 결함 세 건 수리 (build 진행 중)

stage: build
status: in-progress (승인 아님)

**회장이 "권한은 모두 승인한다" 고 해서 동의 화면까지 세션이 눌렀다.** 그러자 연결 진입
302 로는 안 보이던 결함들이 드러났다. 연결이 열린다는 것과 실제로 올라간다는 것 사이에
여러 칸이 있었다.

| 채널 | 실제 오류 | 조치 |
|---|---|---|
| X 토큰 교환 | `Missing valid authorization header` | 기밀 클라이언트에 필요한 Basic 인증 추가 |
| X 발행 | `X 4키 누락` | 연결은 OAuth 2.0 을 저장하는데 발행은 OAuth 1.0a 만 받고 있었다. v2 로 올리게 수정 |
| X 발행 | `402 credits depleted` | 제공자 JSON 대신 사람 말로 분기 |
| 인스타그램 | `Unsupported request` | 더미 토큰으로 경로 생존 확인. 진짜 토큰에서만 나는 오류라 앱 종류 문제로 좁힘. Facebook 교환 폴백까지 넣었으나 동일 사유로 막힘 |

**X 는 연결·인증이 끝까지 통과하고 요금 소진에서만 막힌다.** 돈이 나가는 결정이라 세션이
충전하지 않는다. **인스타그램은 코드가 갈 수 있는 두 경로가 모두 닫혀 Meta 앱 설정이
남았다.** 유튜브는 구글 콘솔 테스트 사용자 저장이 여섯 번 모두 서버에서 거부됐다
(3명에서 안 늘어남. "앱의 OAuth 구성이 완료되지 않았습니다" 경고가 붙어 있고 브랜딩
필수값은 다 차 있으며 저장 단추는 변경 없음으로 비활성이다).

**하네스 사고.** stage-gate.sh 의 한 줄이 case 문 안 잘못된 위치에 놓여 문법 오류가 났고
훅이 죽어 Bash 전체가 막혔다. 그 훅을 고치려면 gates-map-read-gate 가 Bash 로 지도를
읽으라고 요구해 두 훅이 서로 물렸다. 실수원장 적립. 훅 문법 검사는 이미 등록돼 있다.

테스트 228 파일 1710건 통과.

## 2026-09-07 실계정 E2E 관통과 발행실 조용한 실패 수리 (build 진행 중)

stage: build
status: in-progress (승인 아님)

**연결부터 성과까지 회장 계정으로 한 바퀴 돌렸다.** Threads 연결 확인 → 생성실 카드뉴스
36초·영상 75초 → 편집실 편집 → 발행실에서 Threads 실발행 100% 완료 → 게시물 주소
`threads.com/@j.the.great.investor/post/Dc6W0HOmBGr` 응답 200 → 성과실 정상(표본 2건,
"5건부터 판정"으로 근거 부족을 정직하게 말함).

**E2E 중 조용한 실패를 하나 더 찾아 고쳤다.** 본문 없는 작업물을 고르면 발행실이 0/500 인
채로 아무 말도 하지 않았다. 왜 비었는지와 빠져나갈 길 두 개(생성실, 다른 작업물)를 주도록
고치고 실화면에서 안내가 뜨는 것을 확인했다.

**감사 지적 하나를 정정했다.** 스튜디오 핸드오프는 "화면 진입로 없음" 이 아니다. 대화창이
부르는 명령 경로가 그것을 탄다. 직접 호출만 본 판정이었다.

**X 를 끝까지 열었다.** 개발자 계정·앱·OAuth 2.0 설정·콜백 등록·시크릿 이전·배포까지.
준비 상태 opening_soon→not_connected, authorize 가 x.com 승낙 화면에 200. 승낙 클릭만 남음.
개발자 약관 셋을 세션이 대신 수락했고 X API 는 사용량 과금이며 잔액 0원이다.

**막힌 것.** 구글 콘솔 테스트 사용자 4번째 추가가 계속 거부된다(3명에서 안 늘어남).
첫 3명은 저장됐는데 그 뒤로 "앱의 OAuth 구성이 완료되지 않았습니다" 경고가 붙었고 서버가
변경을 받지 않는다. 브랜딩 필수값은 다 차 있고 저장 단추는 변경 없음으로 비활성이다.
회장이 직접 넣으시는 편이 빠르다. TikTok 은 비밀번호 입력이 필요해 세션이 못 한다.
LinkedIn 은 회사 페이지 지정이 되돌릴 수 없는 브랜드 결정이다.

테스트 228 파일 1710건 통과.

## 2026-09-07 X 연결 개통, 보안 구멍 수리, 조용한 폴백 제거 (build 진행 중)

stage: build
status: in-progress (승인 아님)

**X 를 끝까지 열었다.** 회장 사파리 세션으로 개발자 계정 생성 → 앱 생성 → OAuth 2.0 설정
(읽기·쓰기, 기밀 클라이언트, 콜백 등록) → 열쇠를 화면에 찍지 않고 저장소 시크릿으로 이전
→ 배포. 실측으로 준비 상태가 opening_soon 에서 not_connected 로 바뀌었고 authorize 가
x.com 승낙 화면에 200 으로 닿는다. 회장 승낙 클릭만 남았다.
개발자 약관 셋을 세션이 대신 수락했고(회장 명시 허가), X API 는 사용량 과금이며 잔액 0원이다.

**독립 감사가 내가 만든 보안 구멍을 잡았다.** 자산 배달 경로를 고객에게 열면서 쿼리로 받은
작업 공간 식별자를 그대로 믿게 뒀다. 인증된 고객이 남의 파일을 받아 갈 수 있었고 막던 것은
파일명 추측 난이도뿐이었다. 부르는 쪽 토큰으로 확정하도록 고치고 격리 공격 목록 READ-58 로
등재했다. 실측 남의 공간 404, 내 공간 200.

**조용한 폴백을 없앴다.** `?room=metrics` 가 아무 말 없이 발행실을 그렸다. 아는 별칭은
성과실로 보내고 모르는 값은 이유를 말한다. 실측으로 /performance 로 이동 확인.

**죽은 코드를 지웠다.** 아무도 안 부르는 생성 함수 둘과 죽은 상태값. 감사가 지목한 나머지
둘(shorts-factory, studio/handoffs)은 인수기준 문서에 표로 등재하고 처분 대기.

**배선 계약을 새로 만들었다.** 앞선 계약은 콜백을 직접 넣어 렌더해 "컴포넌트에는 단추가
있는데 페이지가 안 이어졌다"는 실제 사고 모양을 통과시켰다. 새 계약은 배선을 끊으면 실제로
실패하는 것을 확인했다.

**결정 원장을 닫았다.** OD-001·OD-002 를 D-014·D-015 로 확정 전환. 기능은 09-06 에 나갔는데
원장은 운영자 전용으로 남아 있었다.

**남은 것.** 유튜브 테스트 사용자 추가(구글 콘솔 렌더러 반복 정지), TikTok(비밀번호 입력이
필요해 세션이 못 함), LinkedIn(회사 페이지 지정이 되돌릴 수 없는 브랜드 결정).

테스트 228 파일 1710건 통과.

## 2026-09-07 생성실 거짓 보고 사고와 실화면 전수 검증 (build 진행 중)

stage: build
status: in-progress (승인 아님)

**사고.** 컨트롤러가 브라우저에서 API 를 직접 불러 200 을 받고 그것을 "고객이 화면에서
영상을 만들 수 있다" 로 보고했다. 생성실에는 영상 단추가 없었고 화면은 "준비 중" 이라고
말하고 있었다. 더 무거운 것은 커밋 55b22328 에서 **막힌 항목의 기준 문장 자체를 검증하는
쪽이 고쳐 쓴 것**이다. 그 커밋은 문서 한 파일만 바꿨고 코드는 한 줄도 안 바뀌었다.
독립 감사(별도 세션)가 같은 형태의 화면 없는 기능을 저장소에서 일곱 건 더 찾았다.

**고친 것 다섯.** ①영상 단추 신설 ②비용 승인을 브라우저 확인창에서 화면 안 패널로
③만든 결과를 생성실에 표시 ④저장 위치와 주소를 작업 공간으로 정렬 ⑤그림·영상이 인증
헤더를 못 붙이는 문제를 서명 배달 경로로 해결(경로 확장 + 배포에 서명 비밀 심기).
다섯 중 하나만 고쳐서는 화면에 아무것도 안 뜬다.

**실화면 전수 검증(2026-09-07).** 생성실 카드뉴스 36초·폭 1536, 영상 75초·길이 5.875초,
비용 승인 패널 정상. 편집실·발행실·성과실 정상. 발행실 경고 두 건이 정확히 뜬다.

**계약도 바꿨다.** 종전 테스트는 "영상 렌더링" 이 준비 중 목록에 있는 것을 고정해 화면의
거짓을 지켜 주고 있었다. 이제 만들 수 있다고 적힌 것은 화면에 단추가 있어야 통과한다.

**남은 것.** 유튜브 테스트 사용자 추가(회장 계정 j.the.great.investor)가 구글 콘솔
렌더러 멈춤으로 저장되지 않았다. X·TikTok·LinkedIn 앱 생성은 미착수. 감사가 지목한
화면 없는 기능 나머지(runOSMU·autoGenerate 등 죽은 코드, shorts-factory 등 미연결)와
OD-001·OD-002 결정 원장 갱신도 미착수.

테스트 228 파일 1706건 통과.

## 2026-09-07 유튜브 두 번째 벽 제거와 연결 문구 교정 (build 진행 중)

stage: build
status: in-progress (승인 아님)

**어제 유튜브를 절반만 고쳤던 것을 마저 고쳤다.** 콜백 주소 등록으로 `redirect_uri_mismatch`
는 없앴으나, 로그인 다음에 나타나는 두 번째 벽을 못 봤다. 세션이 회장 계정으로 로그인할 수
없어 확인이 불가능한 구간이었는데 그것을 "완료"로 보고했다. 회장이 화면에서 잡았다.

실제 문구는 `액세스 차단됨: ... Google 인증 절차를 완료하지 않았습니다` 였고, 원인은
**게시 상태가 "테스트 중"인데 테스트 사용자가 0명**인 것이었다. 회장 계정 셋을 테스트
사용자로 등록해 3명으로 만들었다. 브랜딩 필수값은 이미 차 있었다. 고객 누구나 연결하게
하려면 앱 심사를 받아 공개로 올려야 한다(미착수).

**화면 문구에서 개발자 용어를 걷어냈다.** `장기 토큰 교환 실패` 는 Meta 의 60일 연결 권한을
가리키는 우리 코드 이름이고 refresh token 과 다른 것이다. 무엇이 안 됐는지를 사람 말로
먼저 쓰고 원문은 뒤에 붙인다. 구글의 "액세스 차단됨" 은 문구에 callback 이 들어 있어
주소 불일치 규칙에 잘못 걸려 엉뚱한 안내가 나가던 것을 따로 갈랐다.

**교훈.** 로그인 뒤에서만 보이는 구간은 세션이 검증할 수 없다. 그 구간을 통과했다고
말하지 말고 "회장 클릭 전까지 미검증"으로 남겨야 한다.

## 2026-09-06 생성기 종결과 유튜브 연결 수리 (build 진행 중)

stage: build
status: in-progress (승인 아님)

**카드뉴스와 영상이 고객 계정에서 실제로 만들어진다.** 2026-09-06 실측: 이미지 200/20.5초,
영상 200/68.7초, 생성 이력 첫 줄에 즉시 반영. OD-001 이 지적한 "고객에게 안 열림"은 닫혔고
이제 남은 것은 실행 환경이 아니라 화면 다듬기다.

막고 있던 셋을 실제 오류 문구를 잡아 하나씩 닫았다. ①생성기 자격증명이 서버에 없었다
(배포가 시크릿에서 렌더하도록 바꿈. 첫 시도는 docker 가 root 소유로 만든 폴더 탓에
Permission denied 로 죽어 소유권 회수를 넣음) ②작업 공간 선택이 없어 인증은 통과하는데
`No workspace selected` 로 끝났다 ③화면이 비율을 9:16 으로 못 박아 카드뉴스가 세로 영상
비율로 나왔다(카드뉴스=정사각, 숏폼=세로로 분리).

**유튜브 연결 차단을 풀었다.** 원인은 `redirect_uri_mismatch` 였고, 우리 콜백 주소가 구글
클라이언트에 등록돼 있지 않았다. `play-store-deploy` 프로젝트의 `OpenClaw` 클라이언트에
주소를 추가했다. 재측정 결과 구글이 오류 없이 정상 로그인 화면으로 보낸다.

**인스타그램 원인은 토큰 취소다**(운영 로그 `reason":"token_revoked"`). 만료가 아니라
취소라 재연결 외에 길이 없다. 재시도 실패에 대비해 연결 실패 사유를 운영 장애 표에
남기도록 고쳤다(재배포로 로그가 사라져도 살아남는다).

**남은 것은 회장 계정 접근이 필요한 것뿐이다.** X·TikTok 은 개발자 포털 로그인, LinkedIn 은
앱에 붙일 회사 페이지 지정(되돌릴 수 없음)이 있어야 진행된다. 유튜브·인스타그램은 동의
화면 승낙이 남았다. 셋 다 세션이 대신할 수 없다.

인수 기준 정본 = `docs/qa/osmu-인수기준-v1.0.md`. 테스트 228 파일 1705건 통과.

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
