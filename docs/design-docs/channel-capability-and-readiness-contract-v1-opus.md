<!--
STAMP | channel-capability-and-readiness-contract | 생성 2026-08-13 | model: claude-opus-4-8 | agent: main(오케스트레이션, 회장 결정 인코딩)
근거: 회장 2026-08-13 결정 2건 + Codex 감사(docs/qa/osmu-r01-r14-crosscheck-2026-08-13-v1-gpt-codex.md) + 실제 코드(dashboard/src/lib/constants.ts, components/channel/*)
고민: 회장 규칙("기본 통일, 특별한 것만 추가/불가한 것만 제거, 일관되게")을 코드가 임의 재창조 없이 따를 수 있게 capability 계약으로 명문화. 미구현≠불가 구분이 핵심.
-->

# 채널 Capability + 심사상태(readiness) 정본 계약 v1

> 이 문서는 회장 2026-08-13 결정 2건을 코드가 따를 수 있게 명문화한 **정본**이다.
> Codex(code-builder)는 이 계약대로 구현하고, 기존 구현(dashboard/src)을 진실원으로 재사용한다(재창조·삭제 금지).

## 회장 결정 원문
1. (R-05) 채널 미개통 상태를 화면에 구분 표기: "미연결"(고객이 아직 연결) vs "오픈 준비중"(운영자가 아직 그 채널 앱/심사 미완). "진행."
2. (R-09) "기본적으로 통일하고 플랫폼별로 특별하게 추가해야하거나 불가한거만 없애는거지 일관적으로해."

---

## A. 채널 탭 통일 계약 (R-09)

**원칙: 모든 채널이 같은 기본 탭 세트를 가진다. 플랫폼별로 (a)특별 탭만 추가, (b)그 플랫폼이 진짜 불가능한 탭만 제거. 단순 미구현은 제거하지 말고 "연동 예정" 비활성으로 유지한다.**

### 기본 탭 세트 (전 채널 공통, 이 순서로)
`Queue · Analytics · Growth · Popular · Settings`

### capability 모델 (플랫폼별 예외만 선언)
각 플랫폼 탭 = 기본 세트 ± 아래 예외. 나머지는 전부 기본 세트 그대로.

| 플랫폼 | 특별 추가 | 불가하여 제거 | 미구현→"연동 예정" 비활성(표시는 유지) |
|---|---|---|---|
| Threads | (없음) | (없음) | (없음 — Growth/Popular 실구현됨) |
| X / Facebook / Bluesky / LinkedIn / 기타 텍스트 | (없음) | (없음) | Growth·Popular (insights 미연동) |
| Instagram | **Editor**(카드뉴스 편집기) | (없음) | Growth·Popular |
| YouTube / TikTok (영상) | (없음) | (없음. 단 Queue는 "영상 잡" 의미) | Growth·Popular |
| Messaging(Telegram/Discord/Slack) | (없음) | Growth·Popular·Analytics·Queue **불가**(핸드오프 전용, 발행 큐 없음) | (해당 없음) |

**핵심 규칙**: "불가"(구조적으로 그 플랫폼에 성립 안 함, 예: 메시징엔 발행 큐 개념 없음)만 탭에서 제거한다. "미구현"(가능하나 아직 연동 안 됨, 예: X의 Growth)은 **탭을 유지하되 비활성 + "연동 예정" 라벨**로 표시해 일관성을 지킨다.

### 구현 지침
- capability 정본을 한 곳(예: `dashboard/src/lib/channel-capabilities.ts`)에 SSOT로 정의: 플랫폼→{tabs, disabledTabs(연동예정), specialTabs}.
- Sidebar·Settings·Studio·채널 탭이 이 SSOT를 **공유**한다(현재 상수가 화면별로 흩어진 것을 통합 — Codex 감사 R-09 지적).
- 비활성 탭 클릭 시 "연동 예정입니다" 안내. 탭 자체는 보임(일관성).

---

## B. 심사상태(readiness) 계약 (R-05)

현재 `/api/connect/readiness`는 `{available, reason}`만 반환(Codex 감사 확인). 아래 상태 enum으로 확장한다.

### 상태 enum
| 상태 | 의미 | 화면 표시 | CTA |
|---|---|---|---|
| `connected` | 고객이 연결 완료 | 초록 "연결됨" | 관리/해제 |
| `not_connected` | 우리 앱은 준비됐고 고객이 아직 연결 안 함 | 기본 "미연결" | **연결 버튼(활성)** |
| `opening_soon` | 운영자가 아직 그 채널 앱/심사 미완(고객이 연결하고 싶어도 불가) | 회색 "오픈 준비중" | 없음(대기), "준비되면 알림" 선택 |
| `publish_pending` | 연결은 됐으나 외부 심사 미완. **발행 자체를 막지는 않는다** — provider별로 결과가 제한된다: YouTube는 videos.insert가 강제로 비공개(private)로 게시되고, TikTok은 본인만 보기(SELF_ONLY)로 게시된다. 그 외 provider는 확인된 제약이 없어 "발행 범위가 제한될 수 있다"고만 안내한다(2026-09-21 PR #66 교차 리뷰 정정 — 이전에는 "발행 준비중"이 발행이 막힌 것처럼 읽혔다) | 노랑 "연결됨 · 심사 전" | 상태 안내 |
| `error` | credential 저장소 장애 등 | 빨강 "확인 필요" | 재시도 |

**핵심**: `not_connected`(고객 액션 필요)와 `opening_soon`(운영자/심사 대기)을 반드시 분리. 지금은 이 둘이 "관리자 문의"로 뭉뚱그려짐.

### 판정 소스
- `opening_soon` = 그 플랫폼의 중앙 앱 credential(`oauth-app-credentials`)이 미설정 또는 심사 미완.
- `not_connected` = 앱 credential은 있으나 이 tenant의 `channel_accounts`에 연결 없음.
- `publish_pending` = 연결됨 + 외부 심사 미완 플래그.

---

## 완료 기준
- capability SSOT 신설, 4개 화면(Sidebar/Settings/Studio/채널탭)이 공유, 비활성 탭 "연동 예정" 표시.
- readiness API가 상태 enum 반환, 고객 화면이 미연결/오픈준비중을 구분 표시.
- 기존 기능(Threads Growth/Popular 실동작, Instagram Editor, 발행 8채널) 보존.
- tsc 0 + 관련 vitest 통과 + design-lint 0. 라이브(OAuth/발행)는 회장 로그인 후 검증.

SOURCES: docs/requests/2026-08-08_2026-08-10-chairman-requests.md(R-05·R-09) · docs/qa/osmu-r01-r14-crosscheck-2026-08-13-v1-gpt-codex.md · dashboard/src/lib/constants.ts · dashboard/src/components/channel/{ChannelPage,InstagramPage,MessagingPage}.tsx
MODEL: claude-opus-4-8 (회장 결정 인코딩)
