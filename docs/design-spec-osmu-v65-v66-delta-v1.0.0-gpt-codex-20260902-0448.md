---
line: osmu-v67
version: 1.0.0
status: design-candidate
created: 2026-09-02 04:48 KST
model: gpt-codex/gpt-5.6-sol
agent: product-designer
skills: [design-html, design-review]
prototype: docs/prototype/osmu-v67-edit-publish-hub-gpt-codex-20260902-0448.html
---

# OSMU v65·v66 통합 증분 디자인 명세

## 결론

v65 편집실과 v66 발행실의 내용 계약을 v64 승인 셸 하나에 통합했다. 이 문서는 v64 전체 제품을 다시 정의하지 않는다. 두 방의 증분, 여섯 상태, 1024·390 변형, 구현 대조 기준만 고정한다.

Design Score: B+ · 88/100. 24개 클린 프레임의 픽셀 검수와 자동 감사를 완료했다.

## STAMP

- line: osmu-v67
- created: 2026-09-02 04:48 KST
- model: gpt-codex/gpt-5.6-sol
- agent: product-designer
- skills: design-html, design-review
- 고민 한 줄: 독립 시안 둘의 좋은 내용을 살리되 서로 다른 셸을 정본으로 착각하게 만들지 않는 것이 이번 수렴의 핵심이다.

## 1. 진실원과 계승 범위

| 우선순위 | 입력 | 이번 적용 |
|---:|---|---|
| 1 | `docs/prototype/openclaw-auto-4room-v64.html` | 공통 셸, 토큰, GNB, 224·56 탐색, 상시 담당, 1024·390 반응형 |
| 2 | `DESIGN.md` v36 | 색, 서체, 간격, radius, 44px, 금지 패턴 |
| 3 | v65 편집실 프로토타입과 WIREFRAMES | 전체 글 편집, 카드 직접 편집, 네 형식, 자동 저장, 단일 다음 행동 |
| 4 | v66 발행실 프로토타입과 WIREFRAMES | 읽기 전용 계정, 플랫폼별 필드, 집중 필터, 검토·즉시·예약 행동 |
| 5 | 플랫폼 필드 규격 2026-09-01 | 하드 제한, 권고, 미확인 수치 구분 |

v65의 176px 탐색과 248px helper, v66의 160px 탐색과 248px action은 계승하지 않는다. v64 셸과 충돌하는 독립 시안용 값이기 때문이다. 내용은 v67 본문과 공통 담당 열로 옮겼다.

## 2. 공통 셸 계약

| 속성 | 1024 | 390 |
|---|---|---|
| GNB | 조직·작업물·크레딧·알림·계정 1층, 네 단계 2층 | 같은 두 층. 보조 정보만 축약 |
| 탐색 | 56px 자동 접힘. 224px 원형 계약 유지 | 숨김 |
| 작업영역 | 본문 7, 담당 3. 담당 최소 240px | 본문 뒤 담당 152px peek |
| 스크롤 | 본문과 담당 내부 | 본문과 담당 각각 내부 |
| 버튼 | 최소 44×44 | 최소 44×44 |
| 카드 radius | 12px | 12px |
| control radius | 8px | 8px |

주축과 순서는 HTML과 개발 구현 양쪽에 명시한다.

- 공통 앱: `column`. GNB 1층, GNB 2층, 작업영역 순서다.
- 1024 작업영역: `row`. 본문 다음 담당이다.
- 390 작업영역: `column`. 본문 다음 담당이다.
- 편집실: 1024 `row` 목차와 편집 대상. 390 `column` 목차와 편집 대상이다.
- 발행실: 1024 카드 2열. 390 카드 1열이다. 행동은 모바일에서 카드보다 먼저 보인다.

## 3. 상태 계약

| 상태 | 편집실 | 발행실 | 활성 주 행동 |
|---|---|---|---:|
| normal | 실제 편집 대상과 자동 저장 | 일곱 플랫폼, 실제 필드, 읽기 전용 계정 | 1 |
| empty | 작업물 없음과 생성실 이동 | 연결 계정 없음과 연결 이동 | 1 |
| loading | 편집 골격 | 계정·필드 골격 | 0 |
| error | 마지막 저장본 보존과 재시도 | 게시물 보존과 연결 재확인 | 1 |
| disabled | 원인, 잠긴 행동, 해제 조건 | 원인, 잠긴 행동, 해제 조건 | 0 |
| overflow | 긴 목차와 긴 본문 내부 스크롤 | 긴 본문과 34개 태그, 제한 경고 | 1 |

`disabled`는 `empty`와 합치지 않는다. 비활성 상태는 사용자가 이미 작업을 가졌지만 외부 조건 때문에 다음 행동을 할 수 없는 상황을 설명한다.

## 4. 편집실 화면 명세

### 목적

결과물 자체를 고친다. 콘텐츠 형식은 편집실이 소유하고 플랫폼과 채널별 문구는 발행실이 소유한다.

### 필수 구성

| screen_id | C1 기능 계약 | C2 표현 계약 | 프로토타입 selector | 구현 대조 selector | 허용 오차 |
|---|---|---|---|---|---|
| edit-normal | 글 전체 자유 편집, 자동 저장, 발행실 이동 | 목차 176px와 편집 대상, 본문 7:담당 3 | `[data-room="edit"][data-state="normal"]` | StudioRooms edit branch | 간격 ±2px, 열 폭 ±8px |
| edit-card | 카드 안 텍스트 직접 편집, 위치 선택 | 4:5 캔버스, 상단·중앙·하단 | `[data-kind="card"]` | EditPreview card | 캔버스 비율 0.01 |
| edit-video | 장면 대사와 자막 | 9:16 결과와 장면 목록 | `[data-kind="video"]` | EditPreview video | 조작면 44px 이상 |
| edit-audio | 나레이션 대사. 음악 파일 미제공 고지 | 가능한 범위와 대체 작업 | `[data-kind="audio"]` | EditPreview audio | 문구 의미 동일 |

### 금지

- 편집실에 플랫폼 선택, 채널별 캡션, 첫 댓글, 발행 시각을 두지 않는다.
- 단위 없는 `보통`, 대상 없는 `크기`, 내부 형식명 `card`를 사용자 문구로 쓰지 않는다.
- 자동 저장 실패를 성공 색으로 보여 주지 않는다.

## 5. 발행실 화면 명세

### 목적

연결 계정은 읽기 전용으로 확인하고 게시물에 실제로 들어갈 필드만 채널별로 고친다.

### 필수 구성

| screen_id | C1 기능 계약 | C2 표현 계약 | 프로토타입 selector | 구현 대조 selector | 허용 오차 |
|---|---|---|---|---|---|
| publish-normal | 플랫폼 집중 필터, 플랫폼별 필드, 4개 발행 행동 | 카드 2열, 읽기 전용 계정 머리 | `[data-room="publish"][data-state="normal"]` | PlatformPreview + studio action | 간격 ±2px, 열 폭 ±8px |
| publish-account | 계정 교체만 가능, 표시 이름 편집 0 | 아바타, 표시 이름, 사용자명, 읽기 전용 안내 | `.account` | account header | 순서 정확 일치 |
| publish-limit | 하드 제한, 권고, 미확인 분리 | danger, warning, `규격 확인 필요` | `.counter,.unknown` | channel text limit | 색과 문구 의미 일치 |
| publish-action | 임시 저장, 검토 요청, 즉시 발행, 예약 | 390 2×2, 1024 한 줄 wrapping | `.action-row` | Studio actions | 순서 정확 일치 |

### 금지

- 표시 이름과 사용자명을 입력으로 만들지 않는다.
- Facebook 본문 63,206, TikTok 해시태그 수처럼 공식 확인되지 않은 수치를 만들지 않는다.
- `승인 인박스로 보내기`, `운영자 API`를 사용자 문구로 쓰지 않는다.
- 첫 댓글 미지원 채널에 활성 입력을 만들지 않는다.

## 6. 클린 프레임 매니페스트

공통 접두는 `docs/design/clean-frames/osmu-v67-`이고 공통 접미는 `-gpt-codex-20260902-0448.png`다. 각 PNG에는 같은 이름의 `.png.stamp.md`가 있다.

| 방 | 폭 | 상태 | 파일 중간값 |
|---|---:|---|---|
| edit | 1024 | normal, empty, loading, error, disabled, overflow | `edit-<state>-1024` |
| edit | 390 | normal, empty, loading, error, disabled, overflow | `edit-<state>-390` |
| publish | 1024 | normal, empty, loading, error, disabled, overflow | `publish-<state>-1024` |
| publish | 390 | normal, empty, loading, error, disabled, overflow | `publish-<state>-390` |

캡처 감사 파일은 `docs/design/clean-frames/osmu-v67-capture-audit-gpt-codex-20260902-0448.json`이다. 다음을 모두 0으로 요구한다.

- JavaScript와 console error
- 문서 가로 넘침
- 44px 미만 실제 조작면
- clean frame 안 검수 제어 표시

## 7. matched-pair 준비

이 명세는 design candidate를 고정한다. 구현 캡처가 아직 같은 selector, seed, viewport, state로 생성되지 않았으므로 matched pair 자체는 미완료다.

build 뒤 QA는 각 clean frame과 같은 이름에 `-actual`을 붙인 구현 프레임을 만든다. 최소 대조는 normal, error, disabled, overflow의 두 방 × 두 폭 16쌍이다. 기능 C1이 실패하면 픽셀 유사도와 무관하게 NG다. C2는 표의 오차와 직접 픽셀 검수로 판정한다.

## 8. 디자인 리뷰

### 1차 레드팀

까다로운 고객은 일곱 플랫폼 카드와 담당을 한 화면에 유지하면 390에서 결국 발행 행동이 아래로 밀려 상시 흐름이 아니라고 공격한다.

수정: 390에서는 본문과 담당을 독립 스크롤로 나누고 담당 152px peek를 화면에 유지한다. 발행 행동은 플랫폼 카드보다 먼저 둔다. 플랫폼 카드는 그 아래에서 한 열로 읽는다.

### 셀프심문

이 결론이 틀렸다면 가장 그럴듯한 이유는 v64의 셸을 모양만 흉내 내고 실제 상시성, 44px, 내부 스크롤 계약을 놓치는 것이다.

답: v67은 각 계약을 DOM과 CSS 수치로 노출하고 24개 프레임에서 `overflowX`, `targetUnder44`, `reviewControlsVisible`, console error를 자동 측정한다. 수치 통과 뒤에도 대표 프레임을 직접 열어 위계와 잘림을 별도로 본다.

## 9. 승인 조건

- v67 허브가 편집실·발행실과 여섯 상태를 한 URL에서 전환한다.
- 24개 clean frame과 24개 sidecar가 있다.
- 캡처 감사의 가로 넘침, 44px 미달, console error, 검수 도구 노출이 모두 0이다.
- `scripts/check-frame-purity.sh`와 디자인 토큰 검사가 통과한다.
- design-review 최종 점수가 B 이상이다.
- `pipeline-state.osmu.md`의 `design_canonical_candidate`가 이 버전을 핀한다.

RUBRIC_SCORE: clarity=5/5 action=5/5 linebreak=5/5 tone=5/5 slop=5/5 total=25/25
WEAKEST_LINE: `규격 확인 필요`는 숫자를 꾸미지 않는 정직한 문구지만 해결 시점을 스스로 말하지 못한다. 같은 카드의 미디어 줄에서 업로드 전 검사를 다음 행동으로 고정했다.

SKILLS_USED: design-html · v64 셸 계승과 단일 라우팅 허브 작성. design-review · clean frame 계획, 픽셀 검수, 반응형·상태·44px·overflow 감사.
SKILLS_SKIPPED: image generation. 새 제품 비트맵이 필요하지 않아 사용하지 않았다.

SOURCES: `docs/prototype/openclaw-auto-4room-v64.html`; `docs/prototype/osmu-editroom-v65-gpt-codex-20260901-0710.html`; `docs/prototype/osmu-publishfield-v66-gpt-codex-20260901-0813.html`; `DESIGN.md` v36; `docs/reference/플랫폼-발행-필드-규격-2026-09-01.md`; `/Users/sj/.claude/skills/design-html/SKILL.md`; `/Users/sj/.claude/skills/design-review/SKILL.md`; `/Users/sj/.claude/standards/design.md`; [Android canonical layouts](https://developer.android.com/develop/ui/compose/layouts/adaptive/canonical-layouts); [WCAG 2.2 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
MODEL: gpt-codex/gpt-5.6-sol
