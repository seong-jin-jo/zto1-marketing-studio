---
line: osmu-v67
created: 2026-09-02 04:48 KST
model: gpt-codex/gpt-5.6-sol
agent: product-designer
skill: design-review
artifact: docs/prototype/osmu-v67-edit-publish-hub-gpt-codex-20260902-0448.html
---

# OSMU v67 디자인 리뷰

## 한 줄 판정

Design Score: **B+ · 88/100**. 디자인 게이트 후보로 제출 가능하다. 구현 matched pair는 build 이후 별도 검증해야 한다.

## STAMP

- line: osmu-v67
- created: 2026-09-02 04:48 KST
- model: gpt-codex/gpt-5.6-sol
- agent: product-designer
- skills: design-review, design-html
- 근거: v64 승인 셸, v65 편집 내용, v66 발행 필드, 24개 clean frame, capture audit
- 고민 한 줄: 점수를 올린 것은 장식 추가가 아니라 서로 다른 셸을 하나로 만들고 모바일에서 담당과 행동을 첫 화면에 되돌린 결정이다.

## 검토 범위

- 분류: App UI
- 방: 편집실, 발행실
- 뷰포트: 1024×900, 390×844
- 상태: normal, empty, loading, error, disabled, overflow
- 총 clean frame: 24장
- 대표 픽셀 직접 열람: 편집 normal·error·overflow, 발행 normal·disabled·overflow, 두 폭 모두

## 채점

| 항목 | 가중치 | 점수 | 근거 |
|---|---:|---:|---|
| 요구 충실도와 정보 구조 | 20 | 19 | v65 형식 소유, v66 플랫폼 소유, v64 셸을 분리하지 않음 |
| 시각 위계와 밀도 | 20 | 17 | 한 화면 한 제목, 1024 본문 7:담당 3, 모바일 행동 우선. 발행 카드 장문은 내부 스크롤 필요 |
| 일관성과 디자인 시스템 | 15 | 14 | 공통 토큰, radius 8·12, 44px, GNB와 담당 동일 |
| 반응형과 넘침 | 15 | 14 | 24장 가로 넘침 0. 390은 본문과 152px 담당 peek를 독립 스크롤 |
| 상태와 상호작용 | 15 | 13 | 여섯 상태 분리, disabled 원인 표시. 실제 저장·발행 결과는 정적 프로토타입 범위 밖 |
| 접근성과 읽기 | 10 | 8 | 44px, focus-visible, label, reduced motion. 정식 스크린리더 E2E는 미실행 |
| 출고 증거 | 5 | 3 | clean frame, sidecar, 감사 JSON 있음. 구현 actual matched pair는 아직 없음 |
| 합계 | 100 | **88** | **B+** |

## 자동 감사 결과

`docs/design/clean-frames/osmu-v67-capture-audit-gpt-codex-20260902-0448.json` 기준:

- 프레임 24장
- `document.readyState=complete` 아닌 프레임 0
- console error 0
- 가로 넘침 0
- 44px 미만 실제 조작면 0
- clean frame 안 검수 제어 노출 0
- 프레임 밖으로 넘는 GNB·workarea rect 0

## 픽셀 리뷰에서 잡은 결함과 수정

### 1. 발행 선택 표식이 44px 파란 정사각형으로 과도함

초기 시각 표식 자체가 44px이라 카드 제목보다 강했다. 실제 조작면은 44px을 유지하고 보이는 체크만 20px로 낮췄다. 최종 프레임에서 제목, 계정, 본문 순서가 먼저 읽힌다.

### 2. 390 발행실에서 담당과 발행 행동이 첫 화면에 없음

초기 모바일은 일곱 카드가 문서 높이를 늘려 담당이 맨 아래로 밀렸다. v64의 상시 담당 계약을 위반했다.

수정 후 본문과 담당을 별도 내부 스크롤로 나누고 152px 담당 peek를 유지한다. 발행 행동 네 개를 플랫폼 카드보다 먼저 배치했다. normal frame 첫 화면에서 제목, 플랫폼 필터, 발행 행동, 담당의 마지막 말과 입력을 함께 본다.

### 3. 자동 캡처가 폰트 완료 전 `ready=loading`을 기록함

180ms 고정 대기라 원격 Pretendard가 끝나기 전에 찍힌 프레임이 있었다. `document.fonts.ready`를 await한 뒤 촬영하도록 바꿨다. 최종 감사에서 24장 모두 complete다.

### 4. clean frame purity 검사에서 주석의 금지어를 잡음

제품 밖 STAMP 주석이었지만 승인 조건이 검사 통과이므로 금지어 없는 문장으로 고쳤다. 최종 purity 검사 기준으로 제품 화면 메타 누출 0이다.

## 레드팀

까다로운 고객: "모바일에서 담당을 상시 노출하면 정작 플랫폼 필드가 안 보이고, 플랫폼 필드를 먼저 보여 주면 발행 행동이 사라진다. 둘 다 가진다는 말은 결국 화면을 쪼갠 것뿐이다."

응답과 수정: 첫 화면은 결정과 맥락을 맡는다. 제목, 플랫폼 범위, 네 발행 행동, 담당의 마지막 말과 입력을 보여 준다. 개별 플랫폼 필드는 같은 본문 스크롤에서 바로 이어진다. 이 순서는 행동을 숨기지 않으면서 세부 필드를 제거하지 않는다. 1024에서는 두 카드와 담당을 동시에 보여 세부 비교도 보존한다.

## 셀프심문

이 판정이 틀렸다면 가장 그럴듯한 이유는 clean frame이 실제 앱이 아니라 정적 허브라 구현의 긴 데이터, 브라우저 입력 동작, 저장 실패를 충분히 재현하지 못하는 것이다.

수정: 점수의 출고 증거를 5점 중 3점으로 제한하고 matched pair를 완료로 선언하지 않는다. build 뒤 actual frame 16쌍과 C1 기능 계약을 검증해야 design canonical이 구현 기준으로 닫힌다.

## 남은 gap

- actual implementation matched pair 없음. build 후 최소 16쌍 필요.
- 실제 스크린리더 탐색, 키보드 전체 왕복, 저장·발행 API 결과는 QA 소유다.
- 1440·768은 v64 셸 정본이 이미 갖고 있으나 이번 v65·v66 delta clean frame 범위는 부모 과제대로 1024·390이다.

## 최종 판정

v67 디자인 산출물 자체는 B+다. `/approve design` 후보로 올릴 수 있다. 구현 일치와 운영 동작은 미검증이며 이 점수로 대신하지 않는다.

SKILLS_USED: design-review · 24장 렌더 감사, App UI 채점, 픽셀 레드팀, 수정 후 재검수. design-html · 셸 계승, semantic HTML, 반응형, clean mode.
SKILLS_SKIPPED: outside-voice 추가 Codex reviewer. 현재 실행 주체가 Codex이고 같은 모델을 다시 호출해 독립성을 가장하지 않았다. 부모 컨트롤러가 별도 독립 검수를 수행한다.

SOURCES: `docs/prototype/openclaw-auto-4room-v64.html`; `docs/prototype/osmu-editroom-v65-gpt-codex-20260901-0710.html`; `docs/prototype/osmu-publishfield-v66-gpt-codex-20260901-0813.html`; `DESIGN.md` v36; `docs/design-spec-osmu-v65-v66-delta-v1.0.0-gpt-codex-20260902-0448.md`; `/Users/sj/.claude/skills/design-review/SKILL.md`; `/Users/sj/.claude/skills/design-html/SKILL.md`; `/Users/sj/.claude/standards/design.md`; [Android canonical layouts](https://developer.android.com/develop/ui/compose/layouts/adaptive/canonical-layouts); [WCAG 2.2 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
MODEL: gpt-codex/gpt-5.6-sol
