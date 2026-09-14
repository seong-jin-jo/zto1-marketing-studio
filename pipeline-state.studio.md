-
## ⚠️ 코드 쓰기에 대한 판정 (2026-08-27, 컨트롤러)

**아래 `build: pending` 을 이유로 소스 작성을 멈추지 마라.** 이 파일을 읽은 codex 워커가 두 라운드 연속
"build 미승인"으로 자기차단해 회장 지시 3회에도 studio 코드가 **0줄**이었다.

`~/.claude/CLAUDE.md` §2 원문: **"unlocks: source-write. ⛔폐지됨(2026-07-22, 회장 결정 '코드 생성·수정·bash는 승인 없이').
stage-gate.sh RULE1 의 차단 코드가 제거되어 이 선언은 아무것도 열지 않는다. 소스 쓰기는 단계와 무관하게 항상 허용된다."**

- **항상 허용**: 소스·테스트·스크립트 작성과 수정, 로컬 실행
- **회장 합의 필요(§6.3.5)**: 새 DB 테이블·컬럼 신설, 마이그레이션, 기존 API 계약 변경, 아키텍처 결정
- 아래 stages 표의 status 는 **산출물 승인 이력**이지 코드 작성 허가가 아니다.

--
# pipeline-state.studio.md — Stage Controller 런타임 상태 (라인: studio)
# 이 repo의 다른 라인 = pipeline-state.osmu.md (마케팅 에이전트 제품, design 진행 중)
# 진실원은 이 파일. 세션 핸드오프 서사는 session-state.studio.md 에.
project: openclaw-auto-studio
line: studio
repo: /Users/sj/sj_code_master/openclaw-auto
pipeline_version: 1
current_stage: eng-design   # 회장 확정 2026-08-18: studio-service는 헤드리스라 기획 이후 기술설계 진행 중. 정식 파이프라인.
approved_stages: []
approved_artifacts:
  prd:            { version: 1.2.1, path: studio/docs/prd-studio-service-v1.2.1-gpt-codex.md }
  boundary_wiki:  { version: 2026-08-15, path: wiki/architecture/two-service-boundary.md }
  requests_ledger:{ version: 2026-08-18, path: docs/requests/회장-확정-요구사항-대장.md }
  user_flow:      { version: 2026-08-18, path: docs/user-flow.md, 비고: openclaw 라인 design 산출물이나 studio 설계의 입력 }
stage_artifacts:
  eng-design:
    options:      { path: studio/docs/eng-design-studio-service-v0.1-선택지.md, status: 티키타카 입력물 }
    fdd:          { path: studio/docs/fdd-studio-생성-v3.0.md, status: 산출완료-재작업필요, 비고: "R85·R86 이전 전제인 층계 계약 v2.1 기반" }
    api_contract: { path: studio/docs/api-contract-studio-생성-v2.0.md, status: 산출완료-재작업필요, 비고: "R85·R86 이전 전제인 층계 계약 v2.1 기반" }
    erd:          { path: studio/docs/erd-studio-생성-v2.0.md, status: 산출완료-재작업필요, 비고: "R85·R86 이전 전제인 층계 계약 v2.1 기반" }
    test_plan:    { path: studio/docs/test-plan-studio-생성-v2.0.md, status: 산출완료-재작업필요, 비고: "R85·R86 이전 전제. 실행 결과 0건. 현재 NO-GO" }
stages:
  plan:       { status: approved, artifacts_ok: true }   # 회장 확정 2026-08-18 (PRD v1.2.1 기준)
  design:     { status: pending, artifacts_ok: false }
  eng-design: { status: in-progress, artifacts_ok: false } # options-and-tradeoffs 산출 완료, 회장 티키타카 대기
  build:      { status: pending, artifacts_ok: false }
  qa:         { status: pending, artifacts_ok: false }
  ship:       { status: pending, artifacts_ok: false }
override: false
---

# studio 라인 — 제작 엔진 모듈

## 이 라인이 무엇인가

openclaw-auto는 발행 플랫폼이다. `studio/`는 그 위에 얹는 **제작 엔진**이다.
경계 기준은 "창작 결정이냐 채널 적응이냐". 상세는 `studio/docs/인수인계-스튜디오-제품논의-2026-08-15.md`.

`pipeline-state.osmu.md`(마케팅 에이전트 제품)와 **별개 라인**으로 굴린다. 이유는 osmu 라인이 이미 design 단계에 PRD v7.3.5로 들어가 있어, 취향 학습이라는 새 기능을 그 안에 밀어 넣으면 그쪽 게이트가 깨지기 때문이다.

⚠️ **두 라인이 같은 소스를 동시에 빌드하지 않는다.** build 이후는 직렬(하네스 §1 모노레포 규칙).

## 왜 plan 단계인가

제품 방향의 근본 결정 3건이 회장 미결정 상태다. 이게 정해지기 전에 design으로 못 넘어간다.

| # | 결정할 것 | 하면 | 안 하면 | 세션 추천 |
|---|---|---|---|---|
| 1 | 스튜디오를 openclaw-auto 안 모듈로 둘 것인가, 별도 서비스로 뗄 것인가, 새 모노레포로 옮길 것인가 | 모듈이면 지금 배치 그대로 진행 | 별도 서비스면 API 계약부터 설계해야 하고 인프라가 2벌이 된다 | **모듈**(A). 스튜디오가 아직 스크립트·문서 뭉치라 서비스 계약을 추측으로 짜게 된다 |
| 2 | 취향 학습을 마케팅 에이전트 PRD v7.3.5 개정으로 넣을 것인가, 별도 제품으로 뺄 것인가 | 개정이면 osmu 라인 design 단계가 재오픈된다 | 별도면 두 제품이 UI를 따로 갖게 되어 통합 화면이 깨진다 | **개정**. 취향 학습 없는 발행 자동화는 시장에 흔하고, 그게 v4.0의 차별점이어야 한다 |
| 3 | 유저가 자기 API 키를 넣게 할 것인가, 우리 키로 돌리고 사용량을 과금할 것인가 | 우리 키면 원가 리스크를 우리가 지고 충전식이 필요하다 | 유저 키면 온보딩에서 이탈하고 소재 공급자 마이그레이션이 막힌다 | **우리 키 + 충전식** |

## plan 단계 산출물 요건

- [x] 경쟁 지형 조사 (해외 13종 + 국내 시그마인) → `studio/docs/경쟁-벤치마킹-2026-08-14.md`
- [x] 제작 방법 실측 근거 → `studio/standards/` 4종, `studio/experiments/` 실험보고서 9건
- [x] 제품 논의 인계 → `studio/docs/인수인계-스튜디오-제품논의-2026-08-15.md`
- [ ] 국내 경쟁사 재조사 (시그마인 외 누락분. 위임 시 "국내 서비스 필수" 명시)
- [ ] 회장 미결정 3건 확정
- [ ] 포지셔닝 확정 ("원클릭" 금지, 비교 대상 재설정)
- [ ] One Thing 정의
- [ ] plan-critic 비평 통과

## 승인 로그

(없음)

## Blocked

- **회장 미결정 3건** (위 표). 이게 plan 통과의 전제.
- **힉스필드 결제 상태**: `free plan, 0 credits`. 소재 생성이 막혀 있어 파일럿 마무리가 대기 중.
- **음성 최종 선택**: 회장 청취 대기. 비교본 `studio-assets/haejo-danta/generated/EC0147-voicebank-훅-2026-08-14-elevenlabs_minimax-40종.wav`

## Notes

- API 계약·DB 스키마는 회장 합의 전 작성 금지(하네스 §6.3.5). 인계 문서의 DB 스키마 8테이블은 초안이다.
- `studio/`는 `extensions/`(채널 코드)를 import하지 않는다. 발행 쪽은 브랜드킷·금지선을 소유하지 않는다. 의존 방향이 경계를 지킨다.
- 에셋은 `studio-assets/`(gitignore, 690MB). repo에 넣지 않는다. 나중에 R2로.

<!--
STAMP
수정 시각: 2026-08-22 14:23 KST
모델: GPT-5 Codex
근거: studio/docs/fdd-studio-생성-v3.0.md, studio/docs/api-contract-studio-생성-v2.0.md, studio/docs/erd-studio-생성-v2.0.md, studio/docs/test-plan-studio-생성-v2.0.md의 실제 존재·상태 표기. current_stage와 승인 이력은 변경하지 않음.
-->
