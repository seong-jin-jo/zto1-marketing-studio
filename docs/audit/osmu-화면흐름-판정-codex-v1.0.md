<!--
STAMP
line: osmu
created_at: 2026-09-08 18:52 KST
model: gpt-codex/GPT-5 (exact build not exposed)
agent: prd-reviewer
skills: 없음
evidence: 회장 요청 정본, OSMU 결정·실수 원장, 사업계획 v1.4, PRD v8.2.1, 네 방 설계, 인수 기준, dashboard 구현, Buffer 공식 도움말
deliberation: 상태 코드나 과거 QA 자기신고를 완료 증거로 쓰지 않고, 신규 고객이 코드상 각 관문을 실제로 통과할 수 있는지만 판정했다.
-->

# OSMU 화면 흐름 코드 감사 v1.0

## PRD 리뷰: OSMU 로그인부터 첫 발행까지 v1.0

한 줄 판정: **반려, 12/25.** 기존 계정의 Threads 한 건은 통과했다는 기록이 있지만, 신규 고객은 구글 로그인만으로 첫 생성을 시작할 수 없고 생성 결과의 재표시와 다채널 성과 수집에도 코드상 단절이 남아 있다.

### 이게 뭘 하자는 건가

- One Thing: 통제권은 고객에게 남기면서 콘텐츠 생성, 편집, 발행, 성과 회수를 한 작업 흐름으로 닫는다.
- 핵심 판정: 현재 구현은 기존 승인 계정의 Threads 경로만 조건부 성립한다. 신규 고객과 다채널 폐루프는 성립하지 않는다.
- 성공지표: 신규 고객이 구글 로그인 뒤 별도 운영자 개입 없이 첫 초안을 만들고, 산출물을 눈으로 확인하고, 채널을 연결해 한 번만 발행하며, 실제 반응 또는 측정 불가 사유를 확인해야 한다.

### 회장 요청 대비

| 요청한 것 | 이 감사의 반영 | 판정 |
|---|---|---|
| 로그인부터 성과실까지 전제 조건과 실패 화면 | [전체 흐름 판정](#전체-흐름-판정)에 단계별로 대조 | 반영 |
| 생성 결과가 생성실과 편집실에 표시되는 경로 | [산출물 표시 경로](#산출물-표시-경로)에 생성, 저장, 복원, 만료까지 추적 | 반영 |
| 카드뉴스 이미지가 영상의 필수 선행 조건인지 | F-04에서 기준 커밋의 강제 조건과 감사 중 생긴 미커밋 수정까지 분리 | 반영 |
| 사업계획과 페르소나 적합성 | [사람과 사업 관점](#사람과-사업-관점)에 시간, 기술공포, 통제권 기준으로 판정 | 반영 |
| 모든 발견에 파일, 재현, 관찰, 문서 근거 | F-01부터 F-13까지 네 항목 고정 형식으로 기록 | 반영 |

### 회장이 지금 결정할 것

- 없음. 신규 고객은 채널 연결 전 콘텐츠를 만들고, 고객이 이미지와 영상을 직접 만들며, 조용한 실패를 금지한다는 결정이 이미 확정돼 있다. 필요한 것은 새 결정이 아니라 기존 결정에 맞춘 수정과 신규 계정 실사용 검증이다.

### 리스크·빈틈 상위 3개

1. 신규 고객의 작업 공간은 활성 상태로 만들어지지만 공유 인공지능 사용 승인은 비어 있다. 자체 API 키도 없으면 첫 생성부터 막힌다.
2. 생성 결과의 화면용 주소는 12시간 뒤 만료되는데 초안과 브라우저 저장소는 그 주소를 그대로 복원한다. 이미지와 영상 태그에는 실패 처리도 없다.
3. 성과실은 여러 플랫폼을 보여주지만 새 수치 수집은 Threads만 지원한다.

### 전달 가능성 + 더 나은 방법

- 전달: 내부 개발팀에는 그대로 전달 가능하다. 클라이언트 전달은 조건부다. 내부 파일 경로, 승인 정책, 배포 환경 조건을 제거한 별도 요약본이 필요하다.
- 인간 이해가능성: OK. 각 결함에 사용자가 실제로 보는 문구와 다음 행동을 함께 적었다.
- 더 나은 방법 1: 첫 로그인 후 성과 화면이 아니라 생성실의 3단계 선택형 안내로 보내고, 채널 연결은 발행 직전에 요구한다. 이는 새 제안이 아니라 사업계획과 네 방 설계의 확정 흐름을 복구하는 것이다.
- 더 나은 방법 2: 초안에는 만료되는 화면 주소가 아니라 미디어 식별자를 저장하고, 화면을 열 때마다 새 주소를 발급한다. 이미지와 영상 로드 실패 시에는 재발급과 다시 만들기 경로를 보여준다.

## 감사 범위와 증거 등급

- 기준 코드: 저장소 커밋 `b7a32391`과 직접 호출하는 구성요소·라이브러리·API 경로. 감사 중 2026-09-08 19:00 KST에 다른 세션이 `dashboard/src/app/studio/page.tsx`와 `dashboard/tests/studio/video-standalone.contract.test.ts`에 미커밋 수정을 추가해 F-04에 별도로 반영했다. 이 감사는 해당 파일을 수정하지 않았다.
- 요청 정본: `docs/requests/inbox/chairman-2026-09.md:2023-2039`에서 확인했다.
- 관찰됨: 이 문서 작성 과정에서 읽은 코드와 문서의 정적 동작.
- 근거 확인: `docs/qa/osmu-인수기준-v1.0.md:35-48`에 기존 실계정 Threads 전 구간 통과 기록이 있다.
- 미검증: 현재 운영 배포가 커밋 `b7a32391`과 같은지, 신규 고객 계정으로 구글 로그인부터 첫 발행까지 실제 통과하는지, Threads 외 채널이 현재 운영 자격증명으로 발행되는지는 직접 실행하지 않았다. 따라서 이 감사는 배포 완료 판정이 아니라 코드 기준 반려 판정이다.

## 전체 흐름 판정

| 단계 | 코드상 전제 조건 | 전제가 없을 때 사용자가 보는 것 | 판정 |
|---|---|---|---|
| 로그인 | Supabase 설정, Google OAuth 왕복, `/api/me`가 고객과 작업 공간을 확인해야 함 | 콜백 오류는 사람 말로 표시한다. `/api/me` 확인 실패 시 로그인 화면에 재시도 문구가 남는다 | 조건부 통과 |
| 작업 공간 | 첫 로그인 때 사용자 소유 작업 공간이 활성 상태로 생성되고 사이드바가 이를 활성화해야 함 | 작업 공간 조회 실패 시 사이드바에 `워크스페이스 연결 확인 중`, 재시도 제공 | 조건부 통과 |
| 첫 진입 | 홈 요약 조회가 성공해야 하며 사용자가 생성실로 들어가야 함 | 기본 주소는 성과 화면이다. 홈 요약 조회 실패도 `불러오는 중...`으로 고정된다 | 반려 |
| 생성실 | 작업 공간, 종류, 목적, 대상, 주제, 소재 권리 확인, 인공지능 사용 권한 필요 | 필수 입력은 단계별로 막는다. 공유 인공지능 미승인 시 이유는 보이지만 승인 요청 또는 설정 이동 단추는 없다 | 반려 |
| 편집실 | 선택한 후보 또는 저장된 편집 문장 필요. 이미지·영상 표시에는 유효한 화면 주소 필요 | 문장이 없으면 생성실 이동 안내가 보인다. 미디어 주소가 만료되거나 로드 실패하면 별도 오류 없이 빈 배경만 남는다 | 반려 |
| 발행실 | 본문, 저장 가능한 초안, 계정 조회 완료, 연결된 계정, 채널 선택, 채널별 필수값 필요 | 본문 없음과 끊긴 계정은 안내한다. 계정 조회가 끝나지 않거나 연결 계정이 0이면 주 발행 단추가 비활성화된다 | 조건부 반려 |
| 성과실 | 홈 요약과 발행 목록 조회 성공. 새 수치 수집은 Threads 계정 필요 | 발행물이 없으면 안내가 있다. 홈 요약 실패는 무한 로딩, Threads 외 채널은 새 수치 수집 경로가 없다 | 반려 |

## 산출물 표시 경로

### 정상 경로

1. 사용자가 생성실에서 후보를 고르면 `chooseCandidate`가 플랫폼별 본문과 편집 문장을 메모리에 넣는다. 근거: `dashboard/src/app/studio/page.tsx:1206-1220`.
2. 카드뉴스 대표 이미지 요청이 성공하면 `/api/higgsfield/image`가 외부 결과를 작업 공간별 디렉터리에 내려받고, 서명된 `/api/media/<token>` 주소와 서버 내부 경로를 반환한다. 근거: `dashboard/src/app/api/higgsfield/image/route.ts:45-66`.
3. 화면은 반환값을 `img` 상태에 보관하고, 생성실에는 `img.file`, 편집실에는 `img.file` 또는 `img.url`을 전달한다. 근거: `dashboard/src/app/studio/page.tsx:643-670`, `dashboard/src/app/studio/page.tsx:1545-1573`.
4. 생성실은 `img`와 `video` 태그로 방금 만든 결과를 그리고, 편집실은 `EditPreview`에 같은 주소를 넘긴다. 근거: `dashboard/src/components/studio/StudioRooms.tsx:751-763`, `dashboard/src/components/studio/StudioRooms.tsx:1139-1151`, `dashboard/src/components/studio/EditPreview.tsx:185-206`.
5. 브라우저 자동 저장과 서버 초안 저장은 `img`, `vid`, `editLines`를 그대로 보관하고 복원한다. 근거: `dashboard/src/app/studio/page.tsx:510-555`, `dashboard/src/app/studio/page.tsx:804-833`, `dashboard/src/app/api/studio/drafts/route.ts:58-82`, `dashboard/src/app/api/studio/drafts/route.ts:114-130`.

### 끊기는 지점 요약

| 지점 | 직접 원인 | 결과 |
|---|---|---|
| 생성 전 | 신규 작업 공간의 공유 인공지능 사용 승인이 비어 있음 | 후보와 본문 생성 불가 |
| 생성 응답 | 서명 비밀 3종이 모두 없거나 너무 짧음 | 인증 머리말이 필요한 예비 주소를 이미지 태그가 열지 못함 |
| 12시간 뒤 복원 | 화면 주소 만료, 재발급 없음 | 파일은 남아도 생성실과 편집실에서 보이지 않음 |
| 미디어 태그 로드 실패 | `onError` 처리 없음 | 빈 배경, 원인과 복구 경로 없음 |
| 과거 초안 복원 | `editLines`가 없고 영상 대본도 없음 | 편집실이 빈 상태로 열림 |
| 브라우저 저장 손상 | JSON 해석 오류를 조용히 무시 | 현재 작업이 빈 상태로 초기화된 것처럼 보임 |
| 승인 인박스·캘린더에서 되돌아옴 | 웹 주소를 서버 내부 `localPath`로 저장 | 그 이미지를 바탕으로 영상 생성 시 서버가 거부 |

## 상세 발견

### F-01. 신규 고객은 구글 로그인만으로 첫 생성을 할 수 없다

우선순위: **BLOCKER**. 조용한 실패는 아니지만 제품 약속을 막는 숨은 운영자 관문이다.

- 파일·줄: `dashboard/src/lib/tenant-auth.ts:103-131`, `dashboard/src/lib/anthropic.ts:484-515`, `dashboard/src/lib/studio/generation/llm.ts:367-404`, `dashboard/src/lib/studio/generation/service.ts:292-319`, `dashboard/src/components/studio/StudioRooms.tsx:402-418`.
- 재현 조건: 처음 구글 로그인한 고객에게 자체 Anthropic API 키가 없고 `shared_cli_approved_at`도 비어 있는 상태에서 생성실 후보 만들기를 누른다.
- 사용자가 보는 것: `공유 AI 사용 승인이 없어 생성을 시작하지 못했습니다`. 하지만 운영자에게 승인을 요청하거나 자체 키 설정으로 이동하는 단추는 없다.
- 문서 근거: 회장 요청 `docs/requests/inbox/chairman-2026-09.md:2023-2028`은 회원이 OAuth 로그인 뒤 발행하는 구조를 요구한다. D-014 `wiki/거버넌스/결정.md:43-48`은 고객이 이미지와 영상을 직접 만든다고 확정했다. 대표 페르소나는 도구 학습 시간이 없는 1인 사업자다(`docs/사업계획-osmu-v1.0.md:102-106`).

판정: **이탈**. 계정 활성화와 생성 권한을 분리한 내부 정책이 첫 가치 경험을 운영자 승인 또는 고객의 개발자용 API 키에 의존시킨다.

### F-02. 첫 진입과 시작 안내가 생성보다 채널 연결을 앞세운다

우선순위: **HIGH**.

- 파일·줄: `dashboard/src/lib/auth.ts:64-86`, `dashboard/src/app/login/page.tsx:83-115`, `dashboard/src/app/page.tsx:84-139`, `dashboard/src/store/ui-store.ts:59-72`, `dashboard/src/components/shared/GettingStartedStrip.tsx:14-20`, `dashboard/src/components/shared/GettingStartedStrip.tsx:44-70`.
- 재현 조건: 신규 고객이 구글 로그인을 끝내고 별도 돌아갈 주소 없이 입장한다. 또는 홈의 `작업실로 가기`를 누른다.
- 사용자가 보는 것: 로그인 뒤 성과 화면이 먼저 열린다. 시작 안내는 `다음 할 일: 첫 콘텐츠 만들기`라고 쓰면서, 연결 채널이 0개이면 단추는 `채널 연결하기`로 바뀐다. 일반 `/studio` 진입은 기본값이 발행실이다.
- 문서 근거: 사업계획은 첫 사용자가 채널 연결 없이 만들고 실제 연결은 발행할 때 받는다고 두 차례 확정한다(`docs/사업계획-osmu-v1.0.md:686`, `docs/사업계획-osmu-v1.0.md:820-838`). 네 방 설계는 가입 직후 생성실이 열린다고 정한다(`docs/design-docs/osmu-4room-구조질문-선택지-v1.0.0-opus-20260829.md:70-90`).

판정: **이탈**. 안내 문장, 단추, 실제 도착 화면이 서로 다른 순서를 가리킨다.

### F-03. 생성 결과의 화면 주소가 12시간 뒤 만료되고 복원 때 갱신되지 않는다

우선순위: **HIGH**. 회장이 말한 `생성물이 안 보임`, `편집실도 비어 보임`을 재현할 수 있는 확정 코드 경로다.

- 파일·줄: `dashboard/src/lib/media-token.ts:20-32`, `dashboard/src/lib/media-token.ts:73-91`, `dashboard/src/app/api/media/[token]/route.ts:66-75`, `dashboard/src/app/studio/page.tsx:510-555`, `dashboard/src/app/studio/page.tsx:1068-1091`, `dashboard/src/app/api/studio/drafts/route.ts:58-82`, `dashboard/src/components/studio/StudioRooms.tsx:751-763`, `dashboard/src/components/studio/EditPreview.tsx:185-206`.
- 재현 조건: 이미지 또는 영상을 만든 뒤 초안이나 브라우저 자동 저장에서 12시간이 지난 작업을 다시 연다.
- 사용자가 보는 것: 생성실의 `방금 만든 것` 또는 편집실 미리보기에서 이미지·영상 요청이 404로 실패한다. 화면에는 주소 만료, 다시 불러오기, 다시 만들기 안내가 없다.
- 문서 근거: 네 방 설계는 편집실이 마지막 보던 작업물을, 발행실이 마지막 확정 작업물을 연다고 정한다(`docs/design-docs/osmu-4room-구조질문-선택지-v1.0.0-opus-20260829.md:362-373`). ADR-007은 실패 사유와 빠져나갈 길을 요구한다(`wiki/거버넌스/결정.md:80-90`).

판정: **누락**. 파일 영속화는 돼도 화면 주소 수명과 복원 수명이 일치하지 않는다.

### F-04. 기준 커밋의 카드뉴스 선행 클릭은 현재 미커밋 수정에서 제거됐다

우선순위: **수정 방향 적합, 실행 미검증**.

- 파일·줄: 기준 커밋 `b7a32391`의 `dashboard/src/app/studio/page.tsx:767-800`, 현재 작업 트리의 `dashboard/src/app/studio/page.tsx:770-819`, `dashboard/src/app/api/higgsfield/video/route.ts:29-34`, `dashboard/src/app/api/studio/estimate/route.ts:24-46`.
- 재현 조건: 기준 커밋에서는 카드뉴스 대표 이미지 없이 `숏폼 영상 만들기`를 누른다. 현재 미커밋 수정에서는 같은 조건으로 누른다.
- 사용자가 보는 것: 기준 커밋은 `먼저 카드뉴스 대표 이미지를 만들어 주세요`라고 거부한다. 현재 미커밋 수정은 영상 한 편이 이미지 1회와 영상 1회를 호출한다는 비용을 먼저 보여주고, 승인 뒤 9:16 바탕 이미지를 자동 생성한 다음 영상 생성을 이어간다.
- 문서 근거: 네 방 설계는 영상을 독립적인 주 갈래로 고르고, 선택 뒤 카드뉴스나 글을 파생하는 흐름을 정한다(`docs/design-docs/osmu-4room-구조질문-선택지-v1.0.0-opus-20260829.md:137-153`). 사업계획도 처음에 글·영상 갈래를 받는다고 정한다(`docs/사업계획-osmu-v1.0.md:686`).

판정: **기준 커밋은 이탈, 현재 작업 트리는 설계 정렬 방향**. 영상 생성기의 내부 시작 이미지 의존은 남지만 카드뉴스 제작을 고객의 별도 선행 과업으로 강제하지 않는다. 다만 변경은 미커밋이고 계약 테스트도 이 감사에서 실행하지 않았으며 운영 배포 반영도 미확인이다.

### F-05. 승인 인박스나 캘린더에서 가져온 이미지는 영상 생성의 서버 경로가 될 수 없다

우선순위: **HIGH**.

- 파일·줄: `dashboard/src/app/studio/page.tsx:1125-1189`, 특히 `dashboard/src/app/studio/page.tsx:1165`, `dashboard/src/app/studio/page.tsx:793-799`, `dashboard/src/app/api/higgsfield/video/route.ts:29-34`.
- 재현 조건: 연결된 서버 초안 없이 승인 인박스 또는 캘린더의 작업물을 발행실로 가져온다. 그 작업의 `imageUrl`을 가진 상태에서 생성실로 이동해 영상 생성을 시도한다.
- 사용자가 보는 것: 이미지는 있는 것처럼 복원되지만 서버는 웹 주소를 로컬 파일 경로로 검사해 `valid localPath required`로 거부한다.
- 문서 근거: 네 방 설계는 작업물을 방 사이에서 보존하고 이어서 작업하는 구조를 요구한다(`docs/design-docs/osmu-4room-구조질문-선택지-v1.0.0-opus-20260829.md:338-373`).

판정: **누락**. 웹 주소와 서버 내부 파일 경로가 같은 필드에 들어간다.

### F-06. 과거 초안은 본문이 있어도 편집실이 빈 상태가 될 수 있다

우선순위: **MEDIUM**.

- 파일·줄: `dashboard/src/app/api/studio/drafts/route.ts:58-82`, `dashboard/src/app/studio/page.tsx:1068-1091`, `dashboard/src/app/studio/page.tsx:1554-1573`, `dashboard/src/components/studio/StudioRooms.tsx:1050-1054`, `dashboard/src/components/studio/StudioRooms.tsx:1183-1186`.
- 재현 조건: 레거시 초안에 Threads·Instagram 본문은 있지만 `editLines`와 `shorts` 대본이 없다. 이 초안을 불러와 편집실로 간다.
- 사용자가 보는 것: 본문이 저장돼 있어도 편집실은 `아직 편집할 작업물이 없습니다`라고 표시한다.
- 문서 근거: 사업계획에서 편집실은 생성실에서 만든 것을 고치는 곳이다(`docs/사업계획-osmu-v1.0.md:140-149`). 네 방 설계는 편집실이 마지막 작업물을 열어야 한다고 정한다(`docs/design-docs/osmu-4room-구조질문-선택지-v1.0.0-opus-20260829.md:362-370`).

판정: **누락**. 레거시 본문을 현재 편집 문장으로 변환하는 복원 규칙이 영상 대본에만 치우쳐 있다.

### F-07. 브라우저 자동 저장이 손상되면 현재 작업을 말없이 버린 것처럼 보인다

우선순위: **MEDIUM**, ADR-007 직접 위반.

- 파일·줄: `dashboard/src/app/studio/page.tsx:510-543`.
- 재현 조건: 작업 공간별 `localStorage` 값이 잘린 JSON이거나 예전 형식 때문에 해석되지 않는다.
- 사용자가 보는 것: 오류나 서버 초안 복구 안내 없이 주제, 본문, 이미지, 영상 상태가 빈 값으로 남는다.
- 문서 근거: ADR-007은 예외를 삼키지 말고 실패 이유를 표시하며 탈출 경로를 주라고 정한다(`wiki/거버넌스/결정.md:80-90`). 네 방 설계는 작업물을 지우지 않는다고 명시한다(`docs/design-docs/osmu-4room-구조질문-선택지-v1.0.0-opus-20260829.md:362-375`).

판정: **누락**. 서버 초안이 살아 있어도 사용자는 자동 복구 안내를 받지 못한다.

### F-08. 발행 계정 조회에는 시간 제한과 재시도 동작이 없다

우선순위: **MEDIUM**, 조건부 조용한 정지.

- 파일·줄: `dashboard/src/app/studio/page.tsx:433-495`, `dashboard/src/app/studio/page.tsx:1677`, `dashboard/src/app/studio/page.tsx:1797`, `dashboard/src/app/studio/page.tsx:1857-1868`.
- 재현 조건: 채널 계정 조회 요청 하나가 응답도 오류도 내지 않고 계속 대기한다.
- 사용자가 보는 것: `연결된 채널을 확인하고 있습니다`가 계속 남고 두 개의 주 발행 단추가 비활성화된다. 다시 조회하는 단추와 시간 초과 안내는 없다.
- 문서 근거: ADR-007은 주 동작을 조용히 비활성화하지 말고 막힌 이유와 조치를 주라고 정한다(`wiki/거버넌스/결정.md:80-90`). PRD의 연결 복구 수용 기준도 영향을 받은 화면에서 원인과 해결 행동을 요구한다(`docs/prd-openclaw-service-v8.2.1-gpt-codex.md:509`, `docs/prd-openclaw-service-v8.2.1-gpt-codex.md:583`).

판정: **누락**. 실패 응답은 표시하지만 무응답 상태를 종결하는 경계가 없다.

### F-09. 성과실의 새 수치 수집은 Threads만 지원한다

우선순위: **HIGH**.

- 파일·줄: `dashboard/src/app/api/metrics/route.ts:57-68`, `dashboard/src/app/api/metrics/route.ts:74-151`, `dashboard/src/components/home/PerformanceRoom.tsx:456-472`, `dashboard/src/components/home/PerformanceRoom.tsx:714-760`.
- 재현 조건: X, Instagram, Facebook, LinkedIn, Shorts, Reels 또는 TikTok에만 발행한 뒤 `성과 다시 수집하기`를 누른다. Threads 계정이 없으면 즉시 실패하고, Threads가 있어도 다른 채널 수치는 갱신하지 않는다.
- 사용자가 보는 것: 성과실에는 여러 플랫폼 필터와 게시물 행이 있지만 새 수치 수집은 Threads 연결 오류를 내거나 Threads 글만 갱신한다. 다른 채널이 왜 미수집인지 채널별 설명은 없다.
- 문서 근거: 사업계획은 외부 채널 반응을 성과실로 돌리고 다음 제안에 반영하는 폐루프를 요구한다(`docs/사업계획-osmu-v1.0.md:420-452`, `docs/사업계획-osmu-v1.0.md:837-842`). 네 방 설계는 성과실에서 같은 콘텐츠의 일곱 채널 결과를 비교한다고 정한다(`docs/design-docs/osmu-4room-구조질문-선택지-v1.0.0-opus-20260829.md:242-259`).

판정: **누락**. 발행 범위와 측정 범위가 일치하지 않는다.

### F-10. 성과 수집이 막혀도 시작 안내는 성과 확인을 완료로 기록한다

우선순위: **MEDIUM**.

- 파일·줄: `dashboard/src/app/api/metrics/route.ts:13-20`, `dashboard/src/app/api/metrics/route.ts:132-150`, `dashboard/src/app/api/onboarding/route.ts:79-91`.
- 재현 조건: Threads 발행물이 있지만 계정 불일치나 인사이트 권한 부족 때문에 갱신 0건으로 끝난다.
- 사용자가 보는 것: 성과실은 오류 문구를 보여주지만 다음 시작 안내 조회부터 `성과 확인` 단계는 완료로 취급한다.
- 문서 근거: 사업계획은 미수집 성과를 성공으로 표시하지 않는다고 명시한다(`docs/사업계획-osmu-v1.0.md:112-120`). ADR-007은 기다리면 되는 상태와 조치가 필요한 상태를 구분하라고 정한다(`wiki/거버넌스/결정.md:89-90`).

판정: **이탈**. 화면 관람과 성과 회수 성공을 같은 완료 신호로 쓴다.

### F-11. 홈과 성과 조회 실패가 무한 로딩으로 보일 수 있다

우선순위: **HIGH**, 조용한 실패.

- 파일·줄: `dashboard/src/hooks/useOverview.ts:6-8`, `dashboard/src/app/page.tsx:20-51`, `dashboard/src/app/page.tsx:35-40`, `dashboard/src/app/page.tsx:104-120`, `dashboard/src/lib/api.ts:104-115`.
- 재현 조건: 로그인 뒤 `/api/overview`가 500을 반환한다. 또는 `/api/metrics`가 500을 반환한다.
- 사용자가 보는 것: 홈 요약 실패는 `불러오는 중...`에서 벗어나지 않는다. 성과 목록 실패는 명시적 오류 없이 `metricsLoaded`가 거짓으로 남고 빈 상태 또는 예시 데이터로 읽힌다.
- 문서 근거: ADR-007의 실패 사유와 복구 행동 요구(`wiki/거버넌스/결정.md:80-90`). 과거 실수 원장은 상태 코드만 확인하고 전체 흐름을 밟지 않은 완료 판정을 금지한다(`wiki/거버넌스/실수.md:637-650`).

판정: **누락**. 데이터, 로딩, 오류 상태가 분리되지 않았다.

### F-12. 방별 기본 상태가 확정 설계와 다르다

우선순위: **MEDIUM**.

- 파일·줄: `dashboard/src/store/ui-store.ts:59-72`, `dashboard/src/lib/studio/room-routing.ts:25-33`, `dashboard/src/app/studio/page.tsx:422-431`, `dashboard/src/app/studio/page.tsx:510-555`.
- 재현 조건: 사용자가 방 쿼리 없이 `/studio`를 연다. 또는 한 작업물을 만든 뒤 생성실, 편집실, 발행실 사이를 이동한다.
- 사용자가 보는 것: 최초 기본 방은 발행실이다. 방을 바꿔도 하나의 현재 작업 상태를 계속 공유하므로 생성실은 항상 새 종이로 시작하지 않고, 편집실과 발행실도 각 방의 마지막 작업물을 독립적으로 복원하지 않는다.
- 문서 근거: 확정 설계는 생성실은 항상 새로 시작, 편집실은 마지막으로 보던 작업물, 발행실은 마지막으로 확정한 작업물을 기본으로 정한다(`docs/design-docs/osmu-4room-구조질문-선택지-v1.0.0-opus-20260829.md:362-373`).

판정: **이탈**. 방은 분리됐지만 상태 모델은 여전히 단일 현재 작업이다.

### F-13. 미디어 서명 비밀이 없으면 생성 성공 뒤 화면 표시가 실패한다

우선순위: **MEDIUM**, 배포 설정 조건부.

- 파일·줄: `dashboard/src/lib/media-token.ts:40-55`, `dashboard/src/app/api/higgsfield/image/route.ts:22-25`, `dashboard/src/app/api/higgsfield/video/route.ts:24-27`, `dashboard/src/lib/storage.ts:57-60`, `dashboard/src/app/api/higgsfield/asset/[file]/route.ts:15-29`, `dashboard/src/lib/api.ts:72-77`.
- 재현 조건: `MEDIA_SIGNING_SECRET`, `DASHBOARD_AUTH_TOKEN`, `OSMU_SECRET_KEY`가 모두 없거나 16자보다 짧고, 요청 호스트도 고객 작업 공간에 연결되지 않은 공용 도메인에서 이미지나 영상을 만든다.
- 사용자가 보는 것: 생성 API는 성공하지만 예비 자산 주소는 Bearer 인증 또는 작업 공간에 연결된 호스트가 필요하다. 일반 이미지·영상 태그는 브라우저 저장소의 Bearer 머리말을 붙이지 않으므로 자산 요청은 404가 되고 결과가 비어 보인다.
- 문서 근거: D-014는 고객 직접 생성을 확정했다(`wiki/거버넌스/결정.md:43-48`). ADR-007은 성공처럼 보이는 무반응을 금지한다(`wiki/거버넌스/결정.md:63-90`).

판정: **조건부 누락**. 현재 운영 환경의 실제 비밀 설정은 미확인이다. 다만 설정 누락을 생성 전 차단하지 않아 코드상 재발 가능하다.

## 카드뉴스 이미지와 영상 관계 최종 판정

**엔진 내부 의존은 있다. 현재 작업 트리에서는 고객의 카드뉴스 선행 클릭 의존을 제거했다.**

- 기준 커밋: `generateShortVideo`가 `img`가 없으면 즉시 종료했다. 이는 설계와 맞지 않는다.
- 현재 작업 트리: `img`가 없으면 `needsBaseImage`로 분기해 9:16 바탕 이미지를 자동 생성하고 영상을 이어서 만든다(`dashboard/src/app/studio/page.tsx:770-819`).
- 서버 강제: 영상 API는 `localPath`가 없거나 서버에 실제 파일이 없으면 400을 반환한다(`dashboard/src/app/api/higgsfield/video/route.ts:29-34`).
- 비용 안내: 영상 견적은 이미지 1회와 영상 1회를 합쳐 계산한다(`dashboard/src/app/api/studio/estimate/route.ts:24-46`).
- 설계: 영상은 독립적인 주 갈래이며 후보를 영상 기준으로 고른 뒤 카드뉴스와 글을 파생할 수 있다(`docs/design-docs/osmu-4room-구조질문-선택지-v1.0.0-opus-20260829.md:137-153`).
- 결론: 기준 커밋은 반려다. 현재 미커밋 수정은 올바른 방향이지만, 새 고객 실사용으로 바탕 이미지와 영상이 연속 생성되고 비용 안내와 실제 사용량이 일치하는지 확인하기 전에는 완료가 아니다.

## 사람과 사업 관점

### 인간 이해가능성

화면 문구는 전반적으로 과거보다 명확해졌다. 본문 없음, 채널 재연결, 부분 발행 실패에는 이유와 다음 행동이 있다. 그러나 신규 고객의 첫 화면 순서와 내부 승인 정책은 비전문가가 스스로 해결할 수 없다. 특히 `공유 AI 사용 승인`, `자체 Anthropic 키`, `valid localPath`는 박수진 페르소나가 이해하거나 해결해야 할 제품 언어가 아니다.

### 흐름상 누락

1. 신규 고객에게 즉시 적용되는 생성 권한 또는 화면 안 승인 요청 경로.
2. 화면용 미디어 주소 재발급과 로드 실패 복구.
3. 영상 주 갈래의 자동 시작 프레임 수정분을 커밋·배포하기 전에 실제 계정으로 연속 생성하고, 견적과 사용량 두 호출이 일치하는지 확인.
4. 저장 형식이 달라도 본문을 편집 상태로 변환하는 마이그레이션.
5. 채널 계정 조회 시간 제한과 재시도.
6. 발행 지원 채널과 동일한 범위의 성과 수집 또는 명시적 `측정 미지원` 상태.

### 타깃 적합성

**현재는 부적합하다.** 대표 고객은 월요일 45분 안에 다음 주 콘텐츠를 승인하려는 1인 사업자다(`docs/사업계획-osmu-v1.0.md:102-106`). 현재 흐름은 첫 진입에서 성과실, 채널 연결, 여섯 질문, 내부 인공지능 승인으로 고객이 제품 내부 사정을 해석해야 한다. 기준 커밋의 카드뉴스 선행 클릭은 미커밋 수정에서 해소 방향이 보이지만, 나머지 숨은 관문은 남아 있다.

통제권이라는 강점은 남아 있다. 권리 확인, 비용 승인, 발행 전 계정 선택, 부분 실패 표시는 페르소나와 맞는다. 다만 통제권은 사용자가 이해 가능한 선택이어야 한다. 운영자 승인, 만료 주소, 서버 경로는 통제가 아니라 내부 구현 누출이다.

## 벤치마크 대조

Buffer 공식 도움말은 작성 화면을 먼저 열고, 시험 기능에서는 채널 없이 전체 글을 쓴 뒤 마지막에 채널을 추가할 수 있다고 설명한다. 또한 미완성 게시물은 본문과 첨부 미디어를 포함해 다시 이어서 할 수 있다고 명시한다.

- 참고: https://support.buffer.com/article/642-scheduling-posts
- 참고: https://support.buffer.com/en-us/articles/scheduling-posts-4Qdld7giAZ
- 차용할 것: 채널 선택을 발행 직전까지 미루는 작성 흐름, 미완성 작업 복원 시 본문과 미디어를 함께 복구하는 계약.
- 다르게 할 것: OSMU는 단순 작성기가 아니라 생성과 학습이 핵심이므로 첫 화면은 빈 작성기가 아니라 선택형 생성 안내여야 한다. 또한 복원은 만료된 주소를 되붙이는 것이 아니라 새 화면 주소를 발급해야 한다.

## 셀프심문과 반대 관점

### 이 결론이 틀렸다면 가장 그럴듯한 이유

과거 QA에는 실제 계정으로 생성, 편집, Threads 발행, 성과실 진입까지 통과했다는 기록이 있다(`docs/qa/osmu-인수기준-v1.0.md:33-48`, `docs/qa/osmu-인수기준-v1.0.md:180-184`). 따라서 기존 승인 계정의 짧은 단일 세션만 보면 `된다`고 판단할 수 있다.

그 반박은 신규 고객, 12시간 뒤 복원, Threads 외 성과를 덮지 못한다. 같은 QA 문서의 `즉 남은 것은 코드 문제가 아니다`라는 문장은 신규 계정의 별도 생성 승인과 위 코드 결함을 검사하지 않았으므로 일반화할 수 없다.

### 회의적인 고객의 공격

`구글로 로그인하면 된다더니 왜 운영자 승인을 기다리라고 합니까. 어제 만든 그림이 오늘 안 보이는데 왜 다시 만들 비용을 내야 합니까. 여러 채널에 올렸는데 왜 Threads 성과만 모입니까.`

현재 화면은 이 공격에 답하지 못한다. 그러므로 Threads 단건 통과 기록을 제품 전체 통과로 확대하면 안 된다.

## 우선 수정 순서와 재검증 기준

1. P0: 신규 고객 생성 권한 정책을 회장 확정 흐름에 맞추고, 새 구글 계정으로 첫 후보와 본문 생성까지 직접 관찰한다.
2. P0: 초안에는 미디어 식별자를 저장하고 열 때마다 새 주소를 발급한다. 12시간을 강제로 지난 조건에서도 생성실과 편집실 표시를 확인한다.
3. P0: 감사 중 생긴 영상용 바탕 이미지 자동 생성 수정분을 신규 계정으로 직접 실행하고, 비용과 산출물 표시까지 확인한 뒤 반영한다.
4. P1: 로그인 뒤 생성실 진입과 `채널 연결은 발행 때` 순서를 통일한다.
5. P1: 계정 조회 시간 제한, 재시도, 주 발행 단추의 이유 표시를 추가한다.
6. P1: Threads 외 채널은 실제 성과를 수집하거나 `측정 미지원`과 이유를 채널별로 표시한다.
7. P1: 신규 계정, 과거 초안, 손상된 브라우저 저장, 승인 인박스 복귀를 고정 회귀 시나리오로 만든다.

완료 기준은 API 200이 아니다. 새 구글 계정으로 로그인, 생성 결과 육안 확인, 편집실 재표시, 채널 OAuth 연결, 실제 게시물 주소 확인, 성과 또는 측정 불가 사유 확인을 한 흐름으로 직접 관찰해야 한다. 이 기준은 `wiki/거버넌스/실수.md:637-650`, `wiki/거버넌스/실수.md:802-817`과 같다.

RUBRIC_SCORE: 완결=2/5 정밀=3/5 벤치=2/5 추적=2/5 전문=3/5 total=12/25
WEAKEST_LINE: "즉 남은 것은 코드 문제가 아니다." (`docs/qa/osmu-인수기준-v1.0.md:76`)

SKILLS_USED: 없음
SKILLS_SKIPPED: review, 이 과업은 코드 변경의 착륙 전 검토가 아니라 완성 PRD와 실제 화면 흐름의 사후 감사라 적용 범위가 다름

KNOWLEDGE_QUERY: BRAIN `wiki/business/index.md`에서 OSMU 사업 지식 진입점을 확인하고 `wiki/business/pmf/idea-zero-one-marketing-studio.md`의 1인 사업자, 하나의 원본에서 제작·발행·성과로 이어지는 가치 가설을 조회했다. 외부에서는 Buffer의 작성, 채널 선택, 미완성 작업 복원 흐름을 검색했다.
HITS_USED: `wiki/business/pmf/idea-zero-one-marketing-studio.md`, 현재 사업계획의 1인 사업자·폐루프 정의와 일치해 타깃 적합성 기준에 사용. Buffer 공식 도움말 2건, 채널을 마지막에 추가할 수 있는 작성 흐름과 본문·미디어 복원 계약 비교에 사용.
HITS_REJECTED: `wiki/cto/제품현황/status-openclaw-auto.md`, 2026-08-28 기준으로 현재 2026-09-08 코드와 QA보다 오래돼 구현 완료 판정에는 사용하지 않음. Canva Content Planner 자료, 예약 흐름은 참고 가능하지만 신규 생성부터 발행까지의 직접 비교가 Buffer보다 약해 본문 근거에서 제외.
CONFLICTS: BRAIN과 사업계획은 생성, 발행, 성과 폐루프를 약속하지만 현재 코드는 신규 고객 생성 승인, 미디어 복원, 다채널 성과에서 이를 닫지 못한다. Buffer 벤치마크와 회장 정본은 채널 연결 시점에서 충돌하지 않는다. 둘 다 작성 중 또는 발행 직전에 채널을 더하는 경로를 허용한다.

PRESENTATION_CHECK: 내부 태그 잔재 없음 확인, 제목 위계·표·줄바꿈 정적 검수 완료, 운영 화면 실측은 미검증으로 명시함
SOURCES/MODEL: gpt-codex/GPT-5 (exact build not exposed) | `docs/requests/inbox/chairman-2026-09.md:2023-2039`; `wiki/거버넌스/결정.md`; `wiki/거버넌스/실수.md`; `docs/사업계획-osmu-v1.0.md`; `docs/plan/one-thing.md`; `docs/plan/persona.md`; `docs/plan/bm.md`; `docs/plan/risks.md`; `docs/prd-openclaw-service-v8.2.1-gpt-codex.md`; `docs/design-docs/osmu-4room-구조질문-선택지-v1.0.0-opus-20260829.md`; `docs/qa/osmu-인수기준-v1.0.md`; `session-state.osmu.md`; `docs/구현현황.md`; `dashboard/src/app/login/page.tsx`; `dashboard/src/app/page.tsx`; `dashboard/src/app/studio/page.tsx`; `dashboard/src/app/api/studio/v1/generations/route.ts`; `dashboard/src/app/api/studio/drafts/route.ts`; `dashboard/src/app/api/studio/estimate/route.ts`; `dashboard/src/app/api/higgsfield/image/route.ts`; `dashboard/src/app/api/higgsfield/video/route.ts`; `dashboard/src/app/api/higgsfield/asset/[file]/route.ts`; `dashboard/src/app/api/media/[token]/route.ts`; `dashboard/src/app/api/publish/route.ts`; `dashboard/src/app/api/metrics/route.ts`; `dashboard/src/app/api/onboarding/route.ts`; `dashboard/src/components/shared/GettingStartedStrip.tsx`; `dashboard/src/components/shared/OnboardingWizard.tsx`; `dashboard/src/components/studio/StudioRooms.tsx`; `dashboard/src/components/studio/EditPreview.tsx`; `dashboard/src/components/home/PerformanceRoom.tsx`; `dashboard/src/lib/auth.ts`; `dashboard/src/lib/api.ts`; `dashboard/src/lib/tenant-auth.ts`; `dashboard/src/lib/anthropic.ts`; `dashboard/src/lib/media-token.ts`; `dashboard/src/lib/storage.ts`; `dashboard/src/lib/studio/room-routing.ts`; `dashboard/src/lib/studio/generation/client.ts`; `dashboard/src/lib/studio/generation/llm.ts`; `dashboard/src/lib/studio/generation/service.ts`; `dashboard/src/store/ui-store.ts`; `dashboard/tests/studio/video-standalone.contract.test.ts`; `/Users/sj/.claude/standards/doc-review.md`; `/Users/sj/.claude/standards/planning.md`; `/Users/sj/.claude/standards/benchmarks.md`; `/Users/sj/.claude/standards/artifact-stamp.md`; `/Users/sj/Documents/SJ_BRAIN_wiki/wiki/business/index.md`; `/Users/sj/Documents/SJ_BRAIN_wiki/wiki/business/pmf/idea-zero-one-marketing-studio.md`; https://support.buffer.com/article/642-scheduling-posts; https://support.buffer.com/en-us/articles/scheduling-posts-4Qdld7giAZ
