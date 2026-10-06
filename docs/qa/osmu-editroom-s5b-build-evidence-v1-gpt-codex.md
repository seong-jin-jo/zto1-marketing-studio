# 편집실 S5b 카톡 v3 고급 도구와 덧붙임 요소, build 증거

STAMP: 2026-10-07 02:42 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: S5b build plan, v71 prototype, 교차 리뷰 R2, localhost Chromium, Remotion `renderStill`, Vitest | 고민: 운영 플래그가 켜진 상태에서 모바일 배치와 기본 편집 복귀가 실제 사용자 경로에서 끝까지 성립하도록 닫았다.

기반 포맷: `docs/build-log.md`의 편집실 v2 수직 슬라이스 검증 기록.

## 결론

S5b-AC1~3과 교차 리뷰 R2 A·B·MINOR는 로컬 build 단계에서 통과했다. 플래그를 켠 실제 Next 개발 서버에서 v2 카톡 덱을 v3 고급 편집기로 열고 표지 사진을 바꾼 뒤 저장·발행실 이동·재진입·기본 말풍선 편집기 복귀까지 실행했다. 1440·600·390의 미리보기 가시 영역과 오른쪽 패널 최소 폭을 수치로 단언했고 캡처를 재생성했다.

## 수용 기준

| 기준 | 판정 | 직접 증거 |
|---|---|---|
| S5b-AC1 | ✅ 관찰됨 | 데이터 9장 덱에서 v2 말풍선·화자·표지/마지막 사진을 보존한 채 v3 workbench 진입. 화자 서로 바꾸기와 undo, 말투 후보 3개, 고급 편집 상태 보존을 실제 Chromium에서 확인 |
| S5b-AC2 | ✅ 관찰됨 | 글·스티커·로고를 같은 장에 추가하고 브라우저 scene과 Remotion still에 같은 내용·층 순서로 렌더. 프로필 아바타도 양쪽 PNG에 표시 |
| S5b-AC3 | ✅ 관찰됨 | 저장 7회, 재열기, 발행실 이동, 기본 편집 복귀 완료. 덧붙임 요소와 표지·본문·마지막 사진 보존. 원형에서 분리된 `el_<옛 id>` projection은 제거 |
| S5b-R2-A | ✅ 관찰됨 | 미리보기 가시 폭 1440=342px, 600=568px, 390=358px. 오른쪽 패널 폭 320px, 518px, 308px. 세 폭 모두 가로 넘침 0 |
| S5b-R2-B | ✅ 관찰됨 | 바꾼 표지 사진을 v2 projection에 반영하고 기본 말풍선 편집기로 복귀. 서버 fixture의 v3 덱 정리와 사진 URL 보존 확인 |
| S5b-R2-MINOR | ✅ 테스트됨 | 사진 빼기, CardSlideScene 넘침 실측, 명시적 분할, 원형 회피 배치, 복제 고아 projection 제거 계약 통과 |

## 실행 조건과 결과

| 검증 | 실행 조건 | 결과 |
|---|---|---|
| CI 타입 검사 | `npm run typecheck:ci` | 종료 코드 0 |
| integrity | `npx vitest run tests/integrity` | 33파일, 104건 PASS |
| contract | `npx vitest run contract` | 107파일, 621건 PASS |
| 변경 import 영향 | `npx vitest related --run <R2 변경 TypeScript 5파일>` | 38파일 PASS, 1파일 환경 skip. 343건 PASS, 8건 환경 skip |
| 생산 build | `~/.claude/harness/bin/heavy-slot.sh npm run build` | Next.js 16.2.2 production build PASS, 188개 static page 생성. 기존 NFT trace 경고 1묶음 |
| 실제 drafts route 통합 | `npx vitest run tests/studio/card-deck-drafts-route.integration.test.ts` | 실제 `POST` route handler와 저장 adapter mock을 연결한 17건 PASS. 편집된 동기 v2/v3 본문을 200으로 수락 |
| 플래그 ON E2E | `CARD_DECK_V3_RENDER_ENABLED=1 NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED=1`, Next dev `http://localhost:3477`, `CHAT_S5_BASE_URL=http://localhost:3477 npm run e2e:chat-s5` | PASS, 카드 9장, 저장 7회, `/studio?room=publish` 이동 뒤 편집실 재진입과 기본 편집 복귀, 변경 표지 사진 보존, 콘솔 오류 0, 실패 요청 0. 1440·600·390 가시 영역 단언과 360~1440 가로 넘침 0. drafts API는 브라우저 픽스처가 가로채되 production 동기화·clear 조건을 적용 |
| Remotion overflow 경계 | 같은 E2E에서 실제 `renderStill` 실행 | `CARD_CHAT_OVERFLOW`로 긴 말풍선 거절 확인 |
| 모바일 인체공학 | 데이터 9장, 조작 대상 30개 fixture, 폭 360·390·412·600·700·780·820·900·1000 | 전 폭 본문 16px, 13px 미만 0, 44px 미만 0, 눌림 상태 100%, 가로 넘침 0 |
| 디자인 lint | `bash ~/.claude/harness/bin/design-lint.sh dashboard/src` | 검사 종료 0. 저장소 기존 인라인 style 3파일·hex 8파일 경고 유지, 이번 diff 신규 리터럴 없음 |

## 실제 PNG

- [390px 고급 편집 전체 캡처](editroom-v2-s5/s5-chat-advanced-editor-390.png)
- [600px 고급 편집 전체 캡처](editroom-v2-s5/s5-chat-advanced-editor-600.png)
- [1440px 고급 편집 전체 캡처](editroom-v2-s5/s5-chat-advanced-editor-1440.png)
- [브라우저 캔버스, 프로필 아바타](editroom-v2-s5/s5b-chat-profile-browser-canvas.png)
- [브라우저 공용 장 scene, 덧붙임 요소](editroom-v2-s5/s5b-chat-overlay-browser-scene.png)
- [Remotion PNG, 프로필 아바타와 덧붙임 요소](editroom-v2-s5/s5b-chat-overlay-profile-remotion.png)
- [E2E 원문 결과](editroom-v2-s5/s5-chat-result.json)
- [9폭 모바일 실측 원문](osmu-editroom-s5b-build-evidence-20261007/mobile-ergonomics.jsonl)

대표 PNG를 원본 해상도로 육안 대조했다. 주황색 프로필 아바타, 작성자 이름, 말풍선, 글·별 스티커·로고가 브라우저와 Remotion 결과에 실제로 보인다.

## 기존 구현 보존과 변경

- 유지: v2 `cardDeck`, 표지·마지막 사진, 말풍선 순서·화자·강조·리액션, v3 feature flag와 공용 저장·발행 경계.
- 추가: v3 안에서 화자·프로필·말풍선·말투를 조작하는 고급 도구, 글·사진·도형·스티커·로고 덧붙임, 사진 빼기, v3→v2 복귀, 고아 projection 정리, 아바타 asset resolver.
- 회귀 방어: 넘침 감지는 발행과 같은 CardSlideScene이 수행하되 분할 commit은 사용자 행동에서만 일어나 undo를 덮지 않는다. 편집기와 Remotion은 같은 asset을 해석한다.

## 남은 경계

- `docs/design/design-spec-editroom-v71.md`는 저장소에 없다. 구현 수치는 현행 디자인 토큰과 기존 v70 규격을 상속했으며, v71 프로토타입에서는 구조·행동만 읽었다.
- Storybook은 이 저장소에 설정되어 있지 않아 Storybook smoke는 미검증이다. 실제 Next 개발 서버와 Chromium E2E로 사용자 축을 검증했다.
- 원격 CI, QA 단계 승인, 운영 배포는 미검증이다. push하지 않았다.
- `pipeline-artifact-lint`는 상태 파일의 핀 실체·버전 정합을 통과했지만 기존 QA/design 산출물 위생 경고 28건을 유지한다.

## 벤치마크 반영

- Remotion 공식 `renderStill` 계약을 실제 발행 PNG 생성 경로로 사용했다: https://www.remotion.dev/docs/renderer/render-still
- Canva의 요소 기반 편집 개념을 참고했지만, 새 편집기를 들이지 않고 승인된 v71 구조와 기존 `CardCanvasEditor`·`CardSlideScene`을 확장했다: https://www.canva.com/create/comic-strips/

PRESENTATION_CHECK: 내부 태그 잔재 없음, PNG 3종 원본 해상도 렌더 확인함.

SKILLS_USED: review, 최종 diff와 회귀·증거 누락을 적대적으로 점검
SKILLS_SKIPPED: 없음
SOURCES/MODEL: gpt-6.1-sol/Codex | `docs/eng/editroom-v2/build-plan.md`, `docs/design/prototypes/osmu-editroom-v71-hub-claude-opus-20261001-2335.html`, `wiki/거버넌스/결정.md`, `wiki/거버넌스/실수.md`, Remotion·Canva 공식 웹
KNOWLEDGE_QUERY: BRAIN business/cto의 디자인-개발 정합·레버리지 지식과 Remotion still·Canva 요소 편집 사례를 조회했다.
HITS_USED: BRAIN 디자인-개발 정합 문서는 승인 산출물·실행물 비교 원칙에, Remotion 문서는 실제 PNG 렌더 증거 경로에 채택했다.
HITS_REJECTED: 범용 Canva 편집기 구조는 승인된 v71·기존 컴포넌트보다 우선하지 않아 개념 참고로만 사용했다.
CONFLICTS: 외부 사례보다 승인된 v71 프로토타입과 S5b build-plan을 우선했다. v71 수치 규격표 부재는 남은 경계로 공개했다.
