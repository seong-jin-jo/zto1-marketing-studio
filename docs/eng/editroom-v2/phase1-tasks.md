# 편집실 v2 1차 준비 슬라이스, code-builder 작업 목록

> 결론: 아래 작업은 새 API·DB 없이 현재 기능을 정직하게 만들고 회귀를 막는 범위다. PRD 묶음1 완료를 뜻하지 않는다. Stage Controller가 기술설계를 승인한 뒤 한 작업씩 수직으로 구현한다.

## 바로가기

- [공통 완료 조건](#공통-완료-조건)
- [P1-01 현재 영상 기능의 진실 정렬](#p1-01-현재-영상-기능의-진실-정렬)
- [P1-02 카드 미리보기·PNG 정합 픽스처](#p1-02-카드-미리보기png-정합-픽스처)
- [P1-03 영상 편집·결과 파일 정합 통합검사](#p1-03-영상-편집결과-파일-정합-통합검사)
- [P1-04 세 폭 편집실 화면 검증](#p1-04-세-폭-편집실-화면-검증)
- [P1-05 계약 회귀 전수 실행과 증거 묶음](#p1-05-계약-회귀-전수-실행과-증거-묶음)
- [착수 금지 목록](#착수-금지-목록)

## 공통 완료 조건

모든 작업은 다음 조건을 함께 만족해야 끝난다.

1. 승인된 `gap-matrix.md`와 `design.md`를 읽고, 명시한 범위 밖 기능을 만들지 않는다.
2. 기존 카드, 카톡 대화, 영상, 글 편집 기능을 삭제하거나 숨기지 않는다.
3. 사용자에게 보이는 문구는 실제 결과 파일 반영 범위와 일치한다.
4. 테스트 주석에 PR 번호를 해시 기호와 붙여 쓰지 않는다. HTML video 태그 문자열을 검사 픽스처 밖 주석에 넣지 않는다.
5. 관련 테스트만 통과했다고 끝내지 않는다. 마지막에 `tests/integrity` 전체와 모든 `*.contract.test.*`를 실행한다.
6. 프론트 변경은 개발 서버를 제한시간 안에서 구동하고 1440·1024·390 핵심 화면을 직접 관찰한다.
7. 코드, 테스트, 화면 증거, wiki 구현현황, session-state를 같은 작업에서 갱신한다.

## P1-01 현재 영상 기능의 진실 정렬

### 목적

PR 104·105·107 이후에도 화면 문구와 계약 주석이 `컷·인트로·아웃트로는 결과 파일에 반영되지 않는다`고 말하는 불일치를 없앤다. 목소리 교체처럼 실제 미반영인 기능은 계속 분명히 밝힌다.

### 건드릴 파일

- `dashboard/src/components/studio/VideoEditor.tsx`
- `dashboard/src/lib/studio/video-edit-contract.ts`
- 필요할 때만 `dashboard/src/components/studio/IntroOutroPanel.tsx`
- 관련 테스트 파일
- `docs/구현현황.md`

### 수용 기준

- Given 컷·자막·훅·CTA·댓글 편집이 있는 영상, When 화면의 결과 반영 안내를 읽는다, Then 실제 `/api/video/subtitle` 반영 범위와 일치한다.
- Given 인트로·아웃트로 합성 완료, When 결과 안내를 읽는다, Then 합성 결과가 미리보기·발행 파일 후보로 쓰인다는 사실을 말한다.
- Given 목소리를 선택, When 결과 안내를 읽는다, Then `선택만 저장되고 음성은 아직 교체되지 않는다`가 유지된다.
- Given 만료된 배달 URL, When `VideoEditor`가 열린다, Then 재생 시도 전 재서명하고 성공 시 플레이어가 새 URL을 사용한다.
- Given 재서명 실패, Then 빈 플레이어가 아니라 원인과 다시 시도 행동이 보인다.
- 기존 카드·글 편집 화면 DOM 계약 변화 0건.

### 반드시 돌릴 표적 테스트

```text
dashboard/tests/studio/media-resign.contract.test.tsx
dashboard/tests/studio/video-subtitle.contract.test.ts
dashboard/tests/intro-outro-route.contract.test.ts
dashboard/tests/intro-outro-publish-filename.test.ts
dashboard/tests/studio/video-standalone.contract.test.ts
```

### 종료 증거

- 표적 테스트 통과 로그
- 만료 URL 성공·실패 두 상태 화면 캡처
- 실제 결과 mp4가 있는 픽스처에서 반영 안내와 결과가 모순되지 않는 확인 기록

## P1-02 카드 미리보기·PNG 정합 픽스처

### 목적

plain 카드와 카톡 대화 카드에서 `화면에 보인 내용`과 `업로드할 PNG`가 어긋나면 CI가 잡도록 한다. 자유 배치를 구현하지 않는다.

### 건드릴 파일

- `dashboard/src/lib/studio/card-deck.ts`
- `dashboard/src/lib/studio/card-templates/chat-bubble.ts`
- `dashboard/src/lib/studio/text-card-image.ts`
- `dashboard/src/components/studio/EditPreview.tsx`
- `dashboard/src/components/studio/BubbleEditor.tsx`
- 신규 테스트 픽스처와 테스트 파일
- `docs/구현현황.md`

### 고정 픽스처

- plain 4:5, 짧은 한글, 긴 한글, top·center·bottom
- plain 1:1, 긴 한글 줄바꿈
- 카톡 4:5, 표지 사진, 긴 말풍선, 굵은 세그먼트, CTA 사진
- 편집 전용 선택선·도구막대·여백이 결과 PNG에 섞이지 않는 사례

### 수용 기준

- Given 같은 카드 입력, When 편집 화면과 결과 PNG를 같은 1080 기준으로 비교, Then 글 경계 상자 차이 2px 이하, 줄바꿈 위치와 줄 수 동일.
- Given 표지 또는 CTA에 고른 사진, When 결과 PNG를 만든다, Then 그 사진이 배경에 실제 반영된다.
- Given 긴 한국어 문장, Then 화면과 PNG 모두 장 밖으로 잘리지 않는다.
- Given 빈 장이 섞인 덱, Then 뒤 장의 위치·순번이 밀리지 않는다.
- Given 편집 도구가 열린 화면, Then 결과 PNG에는 편집 전용 장식이 0개다.

### 반드시 돌릴 표적 테스트

```text
dashboard/tests/studio/cardnews-generate-edit-publish.contract.test.tsx
dashboard/tests/studio/edit-preview-media.contract.test.tsx
dashboard/tests/studio/text-card-placement.test.ts
dashboard/tests/integrity/edit-room-design-contract.test.ts
```

### 종료 증거

- 기준 이미지, 실제 이미지, 차이 이미지
- 각 픽스처의 글 경계·줄바꿈 수치 JSON
- plain과 카톡 대화 각각 1건 이상 실패를 의도적으로 만들어 검사가 붉어지는 기록

## P1-03 영상 편집·결과 파일 정합 통합검사

### 목적

현재 `videoEdit`가 표현하는 편집이 플레이어에서 보이는 것과 결과 mp4에서 같은지 검증한다. 새 기능과 새 API는 만들지 않는다.

### 건드릴 파일

- `dashboard/src/lib/studio/playback-edit-plan.ts`
- `dashboard/src/app/api/video/subtitle/route.ts`
- `dashboard/src/components/studio/VideoEditor.tsx`
- `dashboard/src/components/studio/IntroOutroPanel.tsx`
- `dashboard/src/lib/intro-outro-render.ts`
- 신규 통합 테스트와 고정 영상 픽스처
- `docs/구현현황.md`

### 수용 기준

- Given 30초 고정 영상과 컷 1개, When 결과를 만든다, Then 결과 길이가 컷 길이만큼 감소한다.
- Given 자막·훅·CTA·댓글 구간, When 각 구간 중간 프레임을 뽑는다, Then 기대 문구가 있고 구간 밖 프레임에는 없다.
- Given 원본에 오디오가 있음, Then 결과에도 오디오 스트림이 있다.
- Given 인트로·아웃트로 합성 뒤 본문 컷 렌더, Then 최종 발행 후보 파일이 두 편집을 모두 포함하거나, 현재 순서가 이를 보장하지 못하면 테스트가 실패하며 `⛔ 회수 필요`로 올린다.
- Given 원본 파일명이 바뀜, Then 과거 intro/outro 결과는 stale로 판정돼 발행 후보가 되지 않는다.
- Given 다른 작업 공간의 job ID, Then 404로 존재를 숨긴다.

### 반드시 돌릴 표적 테스트

```text
dashboard/tests/studio/playback-edit-plan.test.ts
dashboard/tests/studio/video-subtitle.contract.test.ts
dashboard/tests/intro-outro-render.integration.test.ts
dashboard/tests/intro-outro-route.contract.test.ts
dashboard/tests/intro-outro-tenant-concurrency.test.ts
dashboard/tests/intro-outro-render-slot.test.ts
```

### 종료 증거

- ffprobe 길이·오디오 스트림 수치
- 대표 프레임 이미지
- 동일 입력의 플레이어 캡처와 결과 프레임 차이 보고
- 인트로·아웃트로와 본문 편집의 합성 순서 판정

## P1-04 세 폭 편집실 화면 검증

### 목적

현재 편집실이 실제 브라우저에서 재생·편집 가능하고, v71에 없는 기능을 있는 것처럼 보이지 않는지 확인한다.

### 건드릴 파일

- `dashboard/scripts/verify-studio-v70-screen-conformance.mjs` 또는 같은 역할의 기존 검사기
- 필요한 경우에만 `dashboard/src/components/studio/*.tsx`와 스타일 파일
- 화면 검증 픽스처
- `docs/구현현황.md`

### 화면 조합

| 폭 | 필수 형식 | 필수 상태 |
|---:|---|---|
| 1440 | plain 카드, 카톡 대화, 영상, 글 | 편집 중, 저장 오류 |
| 1024 | plain 카드, 영상 | 편집 중, 로딩 |
| 390 | plain 카드, 카톡 대화, 영상, 글 | 편집 중, 빈 상태, 재생 URL 실패 |

### 수용 기준

- 가로 넘침 0.
- 주요 누름 영역 44px 이상.
- 영상 플레이어에 실제 화면이 보이고 재생 버튼으로 시간이 전진한다.
- 저장·충돌·재서명 실패가 사람 말로 보인다.
- 목소리처럼 결과 미반영 기능이 반영된 것처럼 보이는 문구 0개.
- v71 목표 기능의 비활성 껍데기 0개. 다음 묶음 기능은 숨긴다.
- 콘솔 오류 0.

### 반드시 돌릴 표적 테스트

```text
dashboard/tests/integrity/edit-room-design-contract.test.ts
dashboard/tests/integrity/app-touch-target-contract.test.ts
dashboard/tests/studio/edit-room-direct.contract.test.ts
dashboard/tests/studio/preview-alignment.contract.test.ts
```

### 종료 증거

- 1440·1024·390 캡처
- 각 화면의 `scrollWidth - clientWidth = 0`
- 재생 전후 `currentTime` 증가 수치
- 콘솔 오류 개수 0

## P1-05 계약 회귀 전수 실행과 증거 묶음

### 목적

지난 위임에서 누락돼 CI가 반복 실패한 계약 검사 전체를 로컬 최종 게이트로 만든다.

### 건드릴 파일

- 제품 코드는 원칙적으로 없음
- 필요하면 테스트 실행 스크립트 1개
- `wiki/ops/session-state.md`
- `docs/구현현황.md`

### 필수 명령 의미

다음 두 집합을 파일 목록으로 먼저 확정한 뒤 전부 실행한다.

```text
dashboard/tests/integrity/**
repository-wide **/*.contract.test.*
```

명령은 현재 package manager와 Vitest 규약에 맞게 구성한다. 대량 출력은 `/tmp/editroom-v2-*.log`로 보내고 끝부분과 실패 요약만 확인한다.

### 수용 기준

- integrity 파일 누락 0.
- contract 파일 누락 0.
- 전체 집합 실패 0.
- TypeScript 오류 0.
- UI 토큰 감사 실패 0.
- 제품 화면 smoke의 콘솔 오류 0.
- 전체 build와 일반 전체 테스트는 code-builder 역할 계약에 따라 최종 1회 수행하되, 호스트 부하를 먼저 확인하고 로그로만 남긴다. 컨트롤러가 다시 `무거운 전체 실행 금지`를 명시하면 원격 CI로 넘기고 미검증으로 보고한다.

### 종료 증거

- 실행한 integrity 파일 수와 contract 파일 수
- 각 집합 통과 수·실패 수
- TypeScript, UI 토큰, build 결과
- 실제 화면 smoke 결과

## 착수 금지 목록

다음은 회장 또는 메인 컨트롤러의 기술설계 합의 전 code-builder가 만들면 안 된다.

- 새 내보내기 API 경로
- 렌더 작업·장별 작업·내보낸 판 DB 테이블
- 공유 파일 큐나 외부 큐 도입
- 카드 자유 배치 요소 스키마
- 템플릿 변경 이력·복원 스키마
- 영상 5레인 공통 item 스키마
- 영상 표지 저장 계약
- 글 후보 저장 계약
- v71을 흉내 내는 비활성 버튼과 가짜 진행률

## 실행 순서

```text
P1-01 영상 진실 정렬
  → P1-02 카드 정합 픽스처
  → P1-03 영상 결과 정합
  → P1-04 세 폭 화면
  → P1-05 전수 계약 회귀
```

P1-02와 P1-03은 소스 충돌이 적지만, 같은 code-builder가 맡아 현재 main의 테스트 자원 사용을 직렬화한다. P1-05는 앞 작업이 모두 끝난 뒤 한 번만 실행한다.

## build stage 판정

- 이 목록 자체는 code-builder가 이해하고 착수할 수준으로 작성됐다.
- 그러나 현재 pipeline의 eng-design 단계는 승인 전이고 전체 산출물 lint도 통과하지 못한다.
- 따라서 컨트롤러가 `/approve`로 기술설계 게이트를 통과시키기 전에는 실제 코드 수정을 시작하지 않는다.

---

STAMP: 2026-10-03 21:04 KST | line: editroom-v2-inputs | model: gpt-5/codex | agent: tech-architect | skill: docs | 근거: gap matrix, design, 현재 테스트 인벤토리 | 고민: 당장 만들 수 있다는 이유로 다음 설계에서 버릴 임시 큐와 임시 스키마를 1차 범위에 넣지 않았다.

RUBRIC_SCORE: accuracy=5/5 traceability=5/5 completeness=4/5 usability=5/5 presentation=4/5 total=23/25
WEAKEST_LINE: 새 API·DB가 필요한 PRD 묶음1 본체는 작업 목록이 아니라 착수 금지와 회수 결정으로 남아 있다.
PRESENTATION_CHECK: 툴콜 태그 잔재 없음 / 작업별 수용 기준·파일·테스트 포함 / Markdown 표 1개 실제 렌더 확인 / em dash 0개

KNOWLEDGE_QUERY: 현재 `dashboard/tests/integrity`와 모든 `*.contract.test.*` 파일 전수 목록, 카드·영상 렌더 경로, PRD 묶음1 수용 기준, Remotion·Playwright 공식 테스트 방식 조회
HITS_USED: 현재 테스트 인벤토리를 필수 회귀 집합으로 사용. Playwright 시각·접근성 스냅숏을 화면·결과 정합 증거 방식에 사용
HITS_REJECTED: 제품현황 BRAIN의 과거 테스트 수치는 현재 파일 수와 달라 실행 분모로 사용하지 않음
CONFLICTS: PRD 묶음1은 영속 큐를 요구하지만 이번 과제는 새 API·DB를 합의 없이 확정하지 말라고 했다. 따라서 즉시 착수 가능한 준비 슬라이스와 묶음1 본체를 분리

SKILLS_USED: docs, code-builder 인계용 문서 구조와 수용 기준 정리에 사용. 연결 도구 부재로 저장소 Markdown에 적용
SKILLS_SKIPPED: diagram, 작업 목록은 순서 표기로 충분해 별도 다이어그램 파일을 만들지 않음. document-generate, 현재 Codex 세션에 해당 스킬이 없음
SOURCES/MODEL: gpt-5/codex | `docs/eng/editroom-v2/gap-matrix.md` | `docs/eng/editroom-v2/design.md` | `docs/plan/prd-osmu-editroom-v2-v1.3.0-draft.md` | 현재 dashboard 코드·테스트 | https://playwright.dev/docs/test-snapshots | https://playwright.dev/docs/aria-snapshots
