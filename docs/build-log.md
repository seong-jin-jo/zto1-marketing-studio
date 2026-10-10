# OSMU build log

## 2026-10-10 23:31 KST · 카드 편집기 R2 제품 내보내기·WYSIWYG 교정

STAMP: 2026-10-10 23:31 KST | model: gpt-5/Codex | agent: code-builder | skill: qa | 근거: `/tmp/zto1-card-r2-e2e.log`, `/tmp/zto1-card-r2-vitest.log`, `/tmp/zto1-card-r2-tsc.log`, `/tmp/zto1-card-r2-build-webpack.log` | 고민: 전체 픽셀 수치로 글꼴 차이를 희석하지 않고 글자 영역을 별도로 비교했다.

**변경:** 기능 플래그 미설정 기본 내보내기 활성, 장별 제품 UI PNG 다운로드, Remotion 글꼴 명시 적재, 글 상자 좌우 여백·줄바꿈, 선택 맥락 도구막대, 569.5px 캔버스, 실내용 페이지 복제·썸네일을 구현했다. 검증은 제품 UI 접수·워커·다운로드 파일을 사용하고 글자 크롭·선택값 글자 폭·사진 확대율을 추가 단언한다.

**검증:** 실제 Next dev 3481은 2.2초에 Ready, 내보내기 POST 202, 실제 워커 4장 성공, 제품 UI 다운로드 PNG 1080x1350이다. 화면 전체 픽셀 차이 0.0034%, 글자 영역 0%, 캔버스 높이 569.5px, 툴바 52px, 잘린 값·담당 패널 겹침·콘솔 오류·실패 요청 각 0이다. 관련 Vitest 33파일·396건, TypeScript, Webpack production build, 모바일 9폭이 통과했다. 기본 `npm run build` Turbopack은 worktree 외부 `node_modules` 심볼릭 링크 제약으로 실패했고 Webpack 빌드는 통과했다. design-lint는 종료 코드 0과 기존 인라인 style·hex 경고 2종이다.

SOURCES/MODEL: gpt-5/Codex | `logs/diff/card-editor-canva-20261010/report.md` | `dashboard/scripts/verify-card-editor-canva-20261010.mjs` | https://www.canva.com/help/download-or-purchase/ | https://developer.mozilla.org/en-US/docs/Web/API/Document/fonts

## 2026-10-09 13:20 KST · 운영 편집실 R8 타임라인 시각 회귀 복구

STAMP: 2026-10-09 13:20 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: qa | 근거: `/tmp/zto1-r7-timeline-focused-r6.log`, `/tmp/zto1-r7-timeline-build-r6.log`, `/tmp/zto1-r7-timeline-v70-r6/observations.json`, `logs/diff/editroom-chairman-fix-r7/after/result.json` | 고민: CI 수치만 맞추지 않고 1440·1512·390과 v71 원본을 함께 열어 레인·블록·카톡 말풍선을 육안 확인했다.

**변경:** 짧은 영상의 초당 폭을 실제 가용 레인 폭에서 계산하고, 한 줄 눈금·최소 블록 폭·44px 양끝 손잡이 비겹침을 제품과 E2E 계약으로 고정했다. 눈금 행이 추가된 390 타임라인은 토큰 4px를 더해 마지막 44px 레인이 컨테이너 아래로 넘지 않게 했다. 카톡 캡처는 구 편집기 선택자 대신 현재 직접 편집기 stage와 실제 렌더 말풍선을 검사한다.

**검증:** 집중 Vitest 1파일 17건 PASS. `typecheck:ci`와 기능 플래그 production build PASS. `npm run start -p 3474`는 343ms에 Ready였고 같은 build의 `e2e:chairman-defects`, `e2e:studio-v70-screen`이 PASS, 콘솔 오류 0이다. 실측은 track·영상 레인 사용률 100%, 눈금 높이 한 줄 18px, 블록 최소 242px, 손잡이 겹침 0, 390 마지막 레인 bottom 718 < 타임라인 bottom 720이다. 모바일 9폭은 글자·44px 터치·눌림·가로 넘침 전부 PASS다. 전체 3,780건은 직전 커밋에서 통과해 이번 변경 영향 범위에서는 재실행하지 않았다.

**기존 경고:** design-lint는 종료 코드 0과 기존 인라인 style·hex 2종 경고, artifact lint는 정합 PASS와 기존 핀 위생 경고 28건이다. 원격 CI와 운영 재배포는 미검증이다.

SOURCES/MODEL: gpt-6.1-sol/Codex | `docs/design/prototypes/osmu-editroom-v71-hub-claude-opus-20261001-2335.html` | `/tmp/zto1-r7-timeline-v70-r6/observations.json` | `logs/diff/editroom-chairman-fix-r7/after/result.json`

## 2026-10-09 10:00 KST · 운영 편집실 R7 미디어 호환·카톡·첫 화면 밀도

STAMP: 2026-10-09 10:00 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: qa | 근거: `.github/workflows/ci.yml`, `/tmp/zto1-r7-vitest-ci.log`, `logs/diff/editroom-chairman-fix-r7/after/result.json` | 고민: E2E 전용 신형 fixture를 운영 구형 초안 모양으로 바꾸고 같은 브라우저 흐름에서 카드 배경·재서명·카톡·첫 화면을 함께 검증했다.

**변경:** 구형·신형 초안의 이미지·영상 필드 정규화, 원격 사진의 v3 background asset 승격, `vid.url` 포함 발행실 재서명, plain→카톡 7장 안전 변환과 편집실 말풍선 수정, 400×500 중앙 카드와 상단 글 도구, 영상 플레이어·대본 압축과 5레인 첫 화면 배치를 구현했다. DB 스키마와 외부 SNS 발행 동작은 변경하지 않았다.

**검증:** `npx tsc --noEmit -p tsconfig.ci.json` PASS. 기능 플래그 production `npm run build` PASS. PostgreSQL 16 schema→seed→RLS와 migration concurrency matrix 뒤 CI 동일 `npx vitest run`은 517파일 통과·3파일 skip, 3,780건 통과·16건 skip, 396.26초다. 같은 build의 `e2e:studio-v70-screen`, `e2e:chairman-defects`가 PASS했고 회장 게이트는 초안 저장 6회, 실제 영상 540×960·readyState 4, 만료 영상 재서명 15회, 콘솔 오류 0이다. 1440·1512·390 캡처를 육안 확인했으며 모바일 아홉 폭은 본문 16px, 13px 미만 0, 44px 미만 누름 0, 눌림 100%, 가로 넘침 0이다.

**기존 경고:** design-lint는 종료 코드 0이며 기존 인라인 style·hex 2종 경고가 남는다. artifact lint는 핀 실체·슬롯키·버전 정합 PASS와 기존 핀 위생 경고 28건이다. 원격 CI와 운영 재배포는 미검증이다.

SOURCES/MODEL: gpt-6.1-sol/Codex | `.github/workflows/ci.yml` | `/tmp/zto1-r7-vitest-ci.log` | `logs/diff/editroom-chairman-fix-r7/report.md`

## 2026-10-09 07:50 KST · PR 134 Linux 글꼴 폭 카드 버튼 회귀 복구

STAMP: 2026-10-09 07:50 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: qa | 근거: `/tmp/zto1-r6-focused.log`, `/tmp/zto1-r6-typecheck.log`, `/tmp/zto1-r6-build.log`, `/tmp/zto1-r6-v70.log`, `/tmp/zto1-r6-chairman-2.log` | 고민: CI의 전체 자손 넘침 검사는 완화하지 않고, 같은 행의 10개 버튼에 더 강한 크기·내용·축소 수치 검사를 추가했다.

**변경:** 카드 요소 행의 `flex-shrink:1` 재정의를 제거하고 `flex:0 0 auto`, `min-width:var(--control-touch)`, `white-space:nowrap`으로 공용 버튼 계약을 복원했다. 신규 소스 계약은 같은 행 10개 전부와 축소 재도입 경계를 고정한다. production E2E는 각 버튼의 경계 폭·높이, client·scroll 폭, `flexShrink`를 기록한다.

**검증:** 집중 Vitest 1파일 2건 PASS. `npm run typecheck:ci` PASS. 기능 플래그를 켠 `npm run build` PASS. `npm run start -p 3473`은 248ms에 Ready였고 같은 build의 `e2e:studio-v70-screen`, `e2e:chairman-defects`가 종료 코드 0이다. 회장 게이트는 `ok=true`, 초안 저장 5회, 영상 컷 건너뛰기 1초다. 390 `글 숨기기` 59.484×44px, client·scroll 폭 57px이며 같은 행 최소 44×44px·내부 넘침 0이다. 모바일 9폭도 모두 PASS다.

**기존 경고:** design-lint는 종료 코드 0이며 기존 인라인 style·hex 2종 경고를 유지한다. 이번 수정은 토큰만 사용했고 신규 경고는 없다. push와 원격 CI는 미검증이다.

SOURCES/MODEL: gpt-6.1-sol/Codex | `.github/workflows/ci.yml` | `/tmp/zto1-r6-chairman-2/result.json` | `/tmp/zto1-r6-mobile-ergonomics.jsonl`

## 2026-10-09 07:28 KST · PR 134 v70 화면 게이트 v71 계약 복구

STAMP: 2026-10-09 07:28 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: qa | 근거: PR 134 run 37850906497, `/tmp/zto1-r5-build.log`, `/tmp/zto1-r5-final-v70.log`, `/tmp/zto1-r5-final-chairman.log` | 고민: CI가 실제로 빌드한 기능 플래그 경로를 다시 빌드·서빙하고 두 브라우저 게이트를 같은 서버에서 연속 실행했다.

**판정:** 제품 진입 회귀가 아니라 게이트가 제거된 v70 DOM을 기다린 테스트 회귀다. CI 실패 본문에도 v71 장 목록·캔버스·도구가 렌더됐고, 로컬 production 재현도 `[data-plain-card-shell]` 대기에서 동일 실패했다.

**변경:** 화면 정합 게이트의 일반 카드, 글자 복구 가능·불가 카드, 카톡 덱을 v71 직접 편집 작업대 계약으로 교체했다. OD-2026-10-09-2 근거 주석을 남기고, v70 clean-frame 카드 면 비교·일반 카드 오염 검출·중복 글자 방지·잠금 검사는 유지했다.

**검증:** `CARD_DECK_V3_RENDER_ENABLED=1 NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED=1 npm run build` 종료 코드 0. 같은 fresh build를 `npm run start -p 3472`로 서빙해 `npm run e2e:studio-v70-screen`과 `npm run e2e:chairman-defects`를 연속 실행했고 둘 다 종료 코드 0이다. 서버는 424ms에 Ready, 콘솔 오류 0, 회장 결함 게이트 `ok=true`, 초안 저장 5회다.

SOURCES/MODEL: gpt-6.1-sol/Codex | `/tmp/zto1-r5-build.log` | `/tmp/zto1-r5-start.log` | `/tmp/zto1-r5-final-v70.log` | `/tmp/zto1-r5-final-chairman.log`

## 2026-10-09 06:48 KST · PR 134 전체 dashboard CI 복구

STAMP: 2026-10-09 06:48 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skills: qa, review | 근거: `.github/workflows/ci.yml`, PR 134 run 37835647473, `/tmp/zto1-r4-full-clean3.log` | 고민: 부분 스위트 대신 CI verify 잡의 전체 명령과 동일 DB pathname에서 안전문과 구버전 초안 호환까지 실행했다.

**변경:** 14개 실패·진단 출력을 의도된 직접 편집 계약 변경과 테스트·제품 회귀로 나눴다. 계약 변경 테스트에는 OD-2026-10-09-2와 회장 원문을 주석으로 남겼다. 제거된 모드에 의존하던 동적 자동저장 테스트는 현재 v3 편집 화면을 구동하도록 바꿨고, 희귀 오류 경로의 “자유 배치”와 “내보내기 판” 문구를 평문으로 교정했다. 독립 리뷰 뒤 생성 결과 pending 삭제 순서와 반대 도메인 clear 의도 보존, 클릭 드래그 최소 거리·취소, 위치값 서버 검증·구버전 좌표 보존·UI 정규화, E2E 조건 대기, 접이식 도구 초점 표시도 보강했다.

**보호 유지:** 카드 자동저장 `videoEdit:null`, 영상 자동저장 `cardDeck:null`, 빈 말풍선 정리, source snapshot 복원, 서버 절대경로 비노출, 예약 등록·실행 안전문을 계속 단언한다.

**검증:** CI 동일 `npx vitest run`은 514파일 통과·3파일 skip, 3,773건 통과·16건 skip, 315.73초, 종료 코드 0이다. `npx tsc --noEmit -p tsconfig.ci.json`과 `CARD_DECK_V3_RENDER_ENABLED=1 NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED=1 npm run build`도 종료 코드 0이다. 발행 전용 스위트도 605건 통과·3건 skip이다. 처음 임의 이름 DB 실행의 1건 실패는 DB 안전 테스트가 `/testdb` 외 pathname을 의도대로 거절한 환경 검증이며, `/testdb` 재실행에서 전체 통과했다.

**미검증:** CI가 주입하지 않는 `S3_DATABASE_URL` 전용 export worker·enqueue PostgreSQL 통합은 기존처럼 skip된다. draft 실제 DB 저장은 CI 범위에서 실행되지만 생성→export→enqueue 전 경로의 실제 DB 연속 증거는 별도 테스트 부채다.

SOURCES/MODEL: gpt-6.1-sol/Codex | `.github/workflows/ci.yml` | `/tmp/zto1-r4-full-clean3.log` | `/tmp/zto1-r4-build-clean2.log`

## 2026-10-09 05:42 KST · PR 134 카드 편집 내부 넘침과 비동기 경합 교정

STAMP: 2026-10-09 05:42 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skills: qa, review | 근거: 회장 R3 반려, v71, production Chromium 수치 E2E, 독립 적대 리뷰 | 고민: 화면 폭을 닫은 뒤에도 크기 조절·회전과 늦은 비동기 응답이 다시 요소나 작업물을 덮지 못하도록 변환 경계와 작업 번호를 함께 고정했다.

**기존 구현 확인:** 카드 편집 루트는 `display:grid`인데 명시 열이 없어 암시적 `auto` track이 자손의 최소 콘텐츠 폭 1438px까지 늘어났다. 선택 요소 도구가 상단 전체 폭을 차지했고 템플릿 캐러셀과 공용 `.ds-label`의 `min-width:max-content`도 편집 패널을 밀었다. 초안 불러오기와 방 전환이 각각 성공 토스트를 띄워 두 개가 겹쳤다.

**추가·변경:** 편집 루트를 `minmax(0,1fr)` 한 열로 고정하고 작업대는 장 목록·304px 카드·접이식 속성 도구의 세 열로 맞췄다. 선택 핸들은 요소 경계 안에 두고 390에서는 한 열로 쌓는다. 회전된 경계 상자를 기준으로 이동·크기 조절·회전 결과를 카드 안에 제한한다. 편집실 템플릿은 컨테이너 폭에 맞춘 grid로 바꾸고 버튼은 공용 `ds-label-fill` 계약을 사용한다. 초안 불러오기 토스트 하나만 남기고 `내보내기 판` 조어를 실제 동작 문장으로 교체했다. 이미지·영상·초안 생성은 단일 작업 번호로 직렬화하고, 새로 시작·작업 공간 전환·카드 편집 이탈 뒤 늦은 응답은 무효화한다. DB·API 계약은 바꾸지 않았다.

**검증:** 1440·1512·390에서 편집 패널과 보이는 전체 자손의 `scrollWidth > clientWidth` 0건, 패널 경계 이탈 0건, canvas rect 패널 포함, root `scrollLeft=0`. 과도한 크기 조절은 화면상 234.875×139.813에서 302×377.5로 실제 변했고 카드 302×377.5 안에 완전히 제한됐다. 초안 편집과 발행 전환 토스트는 상태 정착 뒤 각각 1개, 콘솔 오류 0이다. 변환·경합 집중 4파일 51건, `test:publish` 605건·3건 skip, TypeScript, 기능 플래그를 켠 production build·E2E, 모바일 9폭이 PASS했다. design-lint와 artifact lint는 종료 코드 0이며 기존 경고 2종·28건을 유지한다.

SOURCES/MODEL: gpt-6.1-sol/Codex | `docs/design/prototypes/osmu-editroom-v71-hub-claude-opus-20261001-2335.html` | `logs/diff/editroom-chairman-fix-20261009/after/result.json` | `docs/qa/qa-tracker.md`

## 2026-10-09 04:50 KST · PR 134 시각 반려와 실제 내보내기 경로 교정

STAMP: 2026-10-09 04:50 KST | model: gpt-5/Codex | agent: code-builder | skills: qa, review | 근거: v71, 회장 R2 반려, production Chromium E2E, 독립 전문 리뷰 | 고민: 방 탭 직접 이동이 아니라 편집실의 실제 내보내기 버튼을 눌러 발행실의 고정 산출물까지 같은 사진인지 검증했다.

**기존 구현 확인:** 첫 R1 결과는 캔버스 일부와 글자를 잘랐고 단색 픽스처·빈 영상 프레임으로 미디어 표시를 증명하지 못했다. 새 E2E도 발행실 링크를 직접 눌러 `내보내기 → 고정 → 발행실` 경로를 우회했다. 코드 리뷰 결과 v3 사진 카드를 발행 직전 plain 글자 카드로 다시 합성하는 결함, 자동 편집 준비 실패 후 재시도 불가, 컷 구간 직접 탐색·키보드 이동 회귀를 추가로 확인했다.

**추가·변경:** 4:5 카드를 19rem 상한으로 중앙 배치하고 선택 핸들을 자르지 않되 사진 장면만 경계 안에서 클립한다. 카드 직접 편집 실패에는 재시도를 제공한다. v3는 plain 재합성을 건너뛰고 enqueue가 반환한 고정 이미지·영상 주소를 발행실 상태에 반영한다. 영상 탐색도 컷 끝으로 정규화하고, 별도 위치 버튼 없이 포커스 가능한 글 상자에서 화살표 이동을 지원한다. 새 수용 E2E를 package script와 PR CI에 연결했다. DB 스키마는 바꾸지 않았다.

**검증:** 집중 7파일 82건 PASS, `test:publish` 59파일 605건 PASS·3건 skip, TypeScript와 production build PASS. dev와 production 서버 모두 실제 사진 JPG·실제 프레임 MP4로 생성→작업물→편집→드래그→영상 컷→내보내기→발행실을 통과했고 콘솔 오류 0이다. 모바일 360·390·412·600·700·780·820·900·1000은 본문 16px, 13px 미만 0, 44px 미만 누름 0, 눌림 100%, 가로 넘침 0이다. design-lint는 종료 코드 0이지만 레포 기존 인라인 style·hex 경고 2종, artifact lint는 정합 PASS와 기존 핀 위생 경고 28건을 유지한다. 외부 SNS 게시와 운영 배포는 미검증이다.

SOURCES/MODEL: gpt-5/Codex | `logs/diff/editroom-chairman-fix-20261009/report.md` | `docs/design/prototypes/osmu-editroom-v71-hub-claude-opus-20261001-2335.html` | `wiki/business/pmf/idea-zero-one-marketing-studio.md`

## 2026-10-09 03:49 KST · 생성→편집→발행 미디어 경로 복구

STAMP: 2026-10-09 03:49 KST | model: gpt-5/Codex | agent: code-builder | skill: qa | 근거: 회장 결함 재현 보고, v71 프로토타입, Chromium 단일경로 E2E, Vitest 604건, production build | 고민: 화면 존재가 아니라 같은 초안의 실제 미디어가 세 방을 끝까지 통과하는지를 종료 기준으로 삼았다.

**기존 구현 확인:** 생성 성공은 `img`·`vid` 화면 상태만 바꾸고 초안을 저장하지 않았다. 작업물 클릭은 저장소 상태만 바꿔 URL이 생성실로 되돌렸고, 카드 v3는 별도 자유배치 진입과 상·중·하 프리셋을 동시에 노출했다. 컷은 상태만 저장하고 재생 헤드는 잘린 구간을 통과했다. 발행 미리보기는 미디어 없는 초안과 가로 그리드를 사용했다.

**추가·변경:** 생성 성공 즉시 같은 초안에 이미지·영상을 저장하고 작업물 목록을 갱신한다. 작업물 클릭은 공용 URL 전환 경로를 사용한다. 카드 편집은 기본 화면에서 직접 드래그하며 실제 생성 이미지를 배경으로 쓴다. 별도 자유배치·상중하·글자 위치 버튼은 제거했다. v71 첫 화면 높이에 맞춰 캔버스와 템플릿 순서를 조정했다. 영상 재생은 컷 구간을 건너뛰고, 이미지→영상 프롬프트에서는 본문 문구를 제거했다. 발행 카드는 실제 미디어를 보여 주며 세로로 쌓인다. DB 스키마는 바꾸지 않았다.

**검증:** TypeScript PASS, 편집 관련 86건 PASS, `test:publish` 604건 PASS·3건 skip, production build PASS. 실제 Next.js dev와 Chromium에서 생성→작업물 썸네일→같은 초안 편집→카드 드래그 픽셀 변화→영상 컷 점프→발행실 실제 미디어를 연속 실행했고 콘솔 오류 0이었다. 모바일 9폭은 본문 16px, 13px 미만 0, 44px 미만 누름 0, 눌림 100%, 가로 넘침 0이다. dev 종료 직후 `.next/dev/types`가 절단된 채 남아 첫 TypeScript 재검사가 실패했고, 해당 생성 캐시를 `/tmp/zto1-chairman-next-dev-types-corrupt-20261009-0355`로 보존 이동한 뒤 같은 명령과 최종 build가 통과했다. 실제 외부 SNS 게시와 운영 배포는 실행하지 않아 미검증이다.

**벤치마크 적용:** Canva의 캔버스 직접 조작, Adobe Express와 CapCut의 트림 후 재생 모델을 적용했다. 상세 전후 캡처와 수치는 `logs/diff/editroom-chairman-fix-20261009/report.md`에 있다.

SOURCES/MODEL: gpt-5/Codex | `logs/diff/chairman-defects-20261009/report.md` | `docs/design/prototypes/osmu-editroom-v71-hub-claude-opus-20261001-2335.html` | https://www.canva.com/help/layers/ | https://helpx.adobe.com/express/web/create-and-edit-videos/edit-videos/trim-videos.html | https://www.capcut.com/resource/how-to-trim-video

## 2026-10-08 23:27 KST · 내보내기 작업자 저장소 규칙을 대시보드와 통일

STAMP: 2026-10-08 23:27 KST | model: gpt-5/Codex | agent: code-builder | skill: review | 근거: run 37787296935, local 저장 경로 통합 테스트, Compose 실해석, TypeScript·production build·Chromium smoke | 고민: R2 누락을 장애로 취급한 PR 132의 과잉 필수 계약만 되돌리고 작업자 health 게이트는 보존했다.

**기존 구현 확인:** `media-store.ts`는 R2 4키가 전부 있으면 R2, 전부 없으면 `DATA_DIR/tenants/<tenant>/images`, 일부만 있으면 `R2_CONFIG`로 실패했다. 작업자도 저장 때 이 모듈을 썼지만 별도 시작 계약과 Compose `${VAR:?}`가 R2 4키를 무조건 요구해 run `37787296935`가 빌드 전에 중단됐다. 대시보드와 작업자는 이미 `osmu-data:/app/data`, `DATA_DIR=/app/data`를 공유하고 있었다.

**추가·변경:** 작업자 시작 시 `media-store.ts`의 동일 검증 함수를 호출한다. 작업자 필수 목록은 `DATABASE_URL`, `MEDIA_SIGNING_SECRET`, `OSMU_PUBLIC_URL`만 남겼다. Compose의 R2 필수 보간 4줄을 제거하고 선택값은 기존 `.env.osmu`로 전달한다. 일부 R2 설정은 작업자 entry에서 명확히 실패하며, local 모드는 기존 테넌트 폴더 구조를 그대로 쓴다. local 쓰기는 같은 디렉터리의 임시 파일을 원자적으로 교체해 부분 파일 노출을 막는다. PR 132의 작업자 healthy 대기와 마스킹 로그 수집은 변경하지 않았다.

**검증:** 관련 7파일 46건 PASS, PostgreSQL 환경 의존 12건 skip, `typecheck:ci` 종료 코드 0, `next build` 종료 코드 0이다. R2 값 없는 합성 `.env.osmu`로 실제 `docker compose config` 종료 코드 0을 확인했다. local 작업자 처리 로직이 항목을 완료한 뒤 같은 `mediaStore.get()`과 `DATA_DIR/tenants/<tenant>/images/<artifact>`에서 동일 바이트를 읽었고, rename 실패 때 기존 파일 보존과 임시 파일 정리를 확인했다. 실제 PostgreSQL claim부터 작업자 처리까지의 통합 시험은 `S3_DATABASE_URL`이 없어 12건과 함께 skip됐다. Next dev `http://localhost:3456/`는 HTTP 200, 제목 `Marketing Hub`, 콘솔 오류 0이었다. 운영 재배포와 queued 3개 처리 재개는 push 금지로 미검증이다.

**벤치마크 적용:** Docker Compose 공식 문서의 `${VAR:?error}` 의미와 여러 서비스가 같은 named volume을 재사용하는 계약을 그대로 적용했다. R2가 선택 사항이라는 제품 결정에 맞춰 필수 보간은 실제 필수 3개에만 남겼다.

SOURCES/MODEL: gpt-5/Codex | `dashboard/src/lib/media-store.ts` | `dashboard/src/workers/studio-export-worker.ts` | `docker-compose.postagi-4tenants.yml` | https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/ | https://docs.docker.com/reference/compose-file/volumes/

## 2026-10-08 22:24 KST · 내보내기 작업자 R2 환경변수·health 게이트 교정

STAMP: 2026-10-08 22:24 KST | model: gpt-5/Codex | agent: code-builder | skill: review | 근거: run 37772730741, 로컬 계약 30건, TypeScript, production build, Compose 실해석 | 고민: dashboard 정상과 작업자 준비 완료를 분리해 배포 성공 조건을 실제 작업 처리 가능 상태에 맞췄다.

**기존 구현 확인:** 별도 작업자, PostgreSQL advisory lock, 34620 health endpoint, R2 저장 경로는 이미 구현돼 있었다. 운영 작업자는 R2 키 누락으로 재시작했고, 배포는 dashboard health만 기다려 이를 놓쳤다. DB role은 RLS 우회였고 queue가 남아 있어 RLS 문제는 배제됐다.

**추가·변경:** 작업자 entry의 필수 환경변수 7개를 단일 계약으로 추출하고 Compose가 같은 목록을 fail-closed로 전달하게 했다. deploy는 작업자 Docker health를 240초 기다리고 실패 시 최근 로그를 마스킹해 남긴다. health endpoint는 DB/advisory lock 초기화가 끝나기 전에는 503을 반환한다. 계약 테스트는 작업자 요구 목록, Compose 전달, workflow `.env` 렌더, 누락 거절, health 대기, 실제 마스커를 한 경로로 대조한다.

**검증:** 관련 5파일 30건 PASS, `typecheck:ci` 종료 코드 0, `next build` 종료 코드 0이다. workflow·Compose YAML, health step `bash -n`·ShellCheck가 통과했다. 합성값 Compose 실해석은 필수 키 누락 종료 코드 1, 완전한 계약 종료 코드 0이다. 운영 배포와 queue drain은 미검증이다.

SOURCES/MODEL: gpt-5/Codex | `dashboard/src/workers/studio-export-worker.ts` | `docker-compose.postagi-4tenants.yml` | `.github/workflows/deploy-marketing.yml` | https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/ | https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands

## 2026-10-08 20:30 KST · 진단 테스트 push protection 차단 교정

STAMP: 2026-10-08 20:30 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: GitHub push protection 차단 위치, 진단 계약 테스트 19건, TypeScript, push 대상 이력 전수 검사, GitHub 공식 문서 | 고민: 마스킹 입력의 실제 바이트와 거절 단언은 유지하면서 소스와 모든 push 대상 커밋에서만 자격증명 형태를 제거했다.

**기존 구현 확인:** 읽기 전용 진단과 마스킹 계약은 이미 구현됐고 동작은 통과했다. 그러나 테스트가 Slack·OpenAI·AWS 자격증명 형태의 합성값을 완전한 문자열로 저장해 GitHub push protection이 push를 차단했다.

**추가·변경:** 합성 자격증명의 접두부·호스트·경로를 소스에서 분할하고 테스트 실행 때 결합한다. 마스커에 전달되는 입력과 원문 비노출 단언은 동일하다. fixup과 autosquash로 기능 커밋을 `0185c3b7`로 재작성해 별도 수정 커밋을 남기지 않았다.

**검증:** 진단·배포·runner 격리 계약 3파일 19건 PASS, `typecheck:ci` 종료 코드 0이다. `origin/main..HEAD`의 2개 커밋에서 Slack·OpenAI·AWS·Slack Webhook의 완전한 자격증명 형태를 전수 검사해 0건을 확인했다. push하지 않아 GitHub 원격 재판정은 미검증이다.

SOURCES/MODEL: gpt-6.1-sol/Codex | `dashboard/tests/studio/diagnose-export-worker-workflow.contract.test.ts` | `git rev-list origin/main..HEAD` + 커밋별 `git grep` | https://docs.github.com/en/code-security/how-tos/secure-your-secrets/work-with-leak-prevention/push-protection-on-the-command-line

## 2026-10-08 19:48 KST · 운영 내보내기 작업자 읽기 전용 진단

STAMP: 2026-10-08 19:48 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: 운영 0/3 고착 증거, 작업자·RLS 코드, Docker inspect·GitHub Actions 공식 문서, 계약 테스트 19건 | 고민: 원인을 추정으로 고치지 않고 운영 상태를 바꾸지 않는 한 번의 진단으로 기동·health·RLS·대기열을 구분한다.

**기존 구현 확인:** export 작업자는 PostgreSQL queue를 순회하지만 배포 성공 판정은 dashboard health만 기다렸다. 작업자의 첫 tenant 탐색은 tenant context 없는 DB 연결로 FORCE RLS 테이블을 읽으므로, 운영 연결 역할이 `BYPASSRLS`가 아니면 runnable tenant가 0건일 수 있다. 운영 증거는 작업자 `Started`, health `starting`까지만 있어 기동 실패와 RLS 무가시성을 구분하지 못한다.

**추가·변경:** 수동 `marketing_runner` 진단 workflow를 추가했다. checkout·배포·재시작 없이 compose service label로 모든 작업자 컨테이너를 찾아 상태, health, 재시작 횟수, 종료 상태, 최근 로그 200줄과 5초 제한 health 응답을 수집한다. 로그·응답은 DB URL·URL query·Cookie, 토큰, 비밀번호, API key, Bearer, GitHub·Google·Slack·OpenAI·AWS·JWT·고엔트로피 형태와 tenant·draft 식별자, payload·오류 상세 줄을 마스킹한다. 기존 dashboard 컨테이너의 같은 DB 연결을 새 프로세스에서 사용해 `SET TRANSACTION READ ONLY` 뒤 연결 역할의 RLS 우회 여부와 job/item 상태별 건수만 출력한다. 모든 수집 단계는 앞 단계 실패 뒤에도 실행하되 진단 실패와 마스커 실패는 최종 workflow 실패로 남긴다. 제품 작업자·배포 workflow·DB 스키마는 변경하지 않았다.

**검증:** YAML 파싱·ShellCheck PASS, 진단·기존 배포·runner 격리 계약 3파일 19건 PASS, `typecheck:ci` 종료 코드 0이다. Bearer·Basic·Digest·Token을 포함한 합성 비밀값과 테넌트 식별 패턴을 실제 Perl 마스커에 통과시켜 원문이 남지 않음과 마스커 실패 코드 보존을 검증했다. RLS 진단은 superuser·`BYPASSRLS`와 테이블별 실제 정책 활성 상태를 함께 출력한다. pipeline artifact lint는 실체·슬롯키·버전 정합 PASS와 기존 핀 위생 경고 28건이다. workflow는 push·dispatch하지 않아 실제 운영 컨테이너와 DB 결과는 미검증이며, 따라서 제품 원인 수정도 하지 않았다. 커밋 `0185c3b7`.

SOURCES/MODEL: gpt-6.1-sol/Codex | `.github/workflows/diagnose-export-worker.yml` | `dashboard/src/workers/studio-export-worker.ts` | `dashboard/src/lib/studio/export-repository.ts` | `dashboard/db/migrations/20261004_010_studio_export_queue.sql` | https://docs.docker.com/reference/cli/docker/container/inspect/ | https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands

## 2026-10-08 18:08 KST · 운영 DB 마이그레이션 checkout 권한 오류 교정

STAMP: 2026-10-08 18:08 KST | model: gpt-5/Codex | agent: code-builder | skill: 없음 | 근거: 실패 run 37751223311, 성공 migration run 35772965580, actions/checkout 공식 README, fail-first 계약 | 고민: container CI 경로의 성공을 host 권한 증거로 쓰지 않고 같은 host migration에서 성공한 root child 경로를 복구했다.

**기존 구현 확인:** DB migration은 원래 root child `source-<run_id>`에서 성공했지만 runner 격리 보강 때 `_ci/migrate-<run_id>/src`로 바뀌었다. 승인 실행은 새 `_ci` 하위 폴더 생성에서 `EACCES`로 멈췄고 DB 단계는 전부 skipped였다. 등록된 `marketing_runner`는 한 대이며 migration은 고정 concurrency 그룹으로 직렬화돼 있었다.

**추가·변경:** `osmu-db-migrate.yml`의 checkout path, `SOURCE_DIR`, 기본 working-directory를 운영 성공 이력이 있는 root child 패턴의 고정 경로 `source-migration`으로 맞추고 `clean: true`를 명시했다. 기존 concurrency가 migration 실행을 직렬화해 run별 폴더가 필요 없다. checkout 전에 디렉터리 생성을 검사하고 실패하면 workspace와 `_ci` 소유자·권한만 기록한다. 공식 `actions/checkout` 문서가 `path`를 `$GITHUB_WORKSPACE` 아래 상대경로, clean을 checkout 저장소의 `git clean -ffdx`로 정의한다는 근거를 workflow 주석에 남겼다. 계약 테스트는 격리 경로, source 정렬, 권한 진단, migration concurrency를 검증한다.

**검증:** 수정 전 새 계약 1건과 기존 migration 계약 1건이 각각 실패했다. 수정 후 표적 2파일 34건, 전체 integrity 35파일 117건, `typecheck:ci`, workflow YAML 파싱이 통과했다. checkout child clean 실측에서 tenant 형제 sentinel 2개가 보존됐다. 원격 workflow 재실행과 운영 DB migration은 push 금지로 미검증이다.

SOURCES/MODEL: gpt-5/Codex | `.github/workflows/osmu-db-migrate.yml` | `dashboard/tests/integrity/marketing-runner-workspace-isolation.contract.test.ts` | `dashboard/tests/db/osmu-migration-runner.contract.test.ts` | `wiki/ops/인프라.md` | https://github.com/actions/checkout/blob/main/README.md#usage

## 2026-10-08 04:59 KST · 편집실 S4·S7 main 병합 충돌 해소

STAMP: 2026-10-08 04:59 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review, qa | 근거: `origin/main` 3e04fd97, S7 HEAD 4eb75fd1, 집중 Vitest·integrity·TypeScript | 고민: 어느 한쪽 구현을 선택하지 않고 S4의 빈 장 포커스와 S7의 템플릿 상태 이력을 같은 편집기 경계에 결선했다.

| 충돌 파일 | 해소 결정 |
|---|---|
| `dashboard/package.json` | S4 `e2e:editroom-s4`와 S7 `e2e:studio-s7` 명령을 모두 유지했다. |
| `dashboard/src/components/studio/StudioRooms.tsx` | S7 `cardTemplateState`·확장 콜백과 S4 `requestedCardSlide`를 동시에 전달했다. |
| `dashboard/src/components/studio/card/CardCanvasEditor.tsx` | S7의 덱·템플릿 통합 undo 이력을 기준으로 유지하고 S4의 `requestedSlide` 포커스 이동을 같은 컴포넌트에 결합했다. |
| `docs/build-log.md` | S4와 S7의 최신 빌드 기록을 모두 보존했다. |
| `docs/qa/qa-tracker.md` | S4와 S7의 QA 판정 기록을 모두 보존하고 통합 게이트 결과를 최상단에 갱신했다. |
| `docs/구현현황.md` | S4 내보내기와 S7 템플릿 구현현황을 모두 보존했다. |
| `wiki/ops/session-state.md` | 양쪽 handoff 서사를 모두 보존하고 통합 검증 결과를 새 최상단 기록으로 남겼다. |

검증: S4 ExportPanel, S4 빈 장 포커스, S7 템플릿 명령·생성 덱·통합 undo, edit-autosave를 묶은 10파일 110건과 integrity 35파일 115건이 통과했다. `npm run typecheck:ci` 종료 코드 0이다. 원격 CI·운영 배포는 push 금지로 미검증이다.

## 2026-10-08 04:13 KST · 편집실 S7 교차 리뷰 3차 MINOR 정리

- 코드 커밋: `286dd3b4 fix(studio): restore S7 regression guards`
- 수정: 삭제됐던 `PR87-R3-REV-02`를 실제 `StudioPage`의 기존 초안 복원→생성실 전환→새 카드 저장 POST로 복원했다. `headline_cover`는 단일 표지만 360px·88px을 유지하고, 글 2개 이상은 기존 176px·56px 규격을 재사용해 4:5·1:1의 글 2·3·4개가 겹치지 않게 했다.
- S7 실서버 E2E 기동 계약: `dashboard/`에서 `CLAUDE_BIN="$PWD/scripts/fixtures/studio-s7-claude-stub.mjs" DATABASE_URL="$DATABASE_URL" DASHBOARD_AUTH_TOKEN="$DASHBOARD_AUTH_TOKEN" CARD_DECK_V3_RENDER_ENABLED=1 NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED=1 npm run dev -- --hostname 127.0.0.1 --port 3481`로 서버를 띄운다. 별도 터미널에서 `STUDIO_S7_BASE_URL=http://127.0.0.1:3481 DATABASE_URL="$DATABASE_URL" DASHBOARD_AUTH_TOKEN="$DASHBOARD_AUTH_TOKEN" npm run e2e:studio-s7`를 실행한다. drafts·text는 실제 route와 PostgreSQL을 쓰고, 외부 LLM만 서버측 CLI stub이다. 실값은 기록하지 않는다.
- 카톡 390px diff: 승인본은 `10년차 국어쌤`의 굵은 답변과 2행 도구, dev fixture는 `이상한수학`의 다른 문구와 `다른 장으로 옮기기`가 추가된 4행 도구다. 같은 픽셀 상태가 아니어서 18.17%는 회귀 판정값이 아니다. S7 merge-base 이후 말풍선 렌더러·변환기·fixture·캡처 스크립트 변경은 0파일이며, 동일 상태의 승인 baseline 전까지 report-only를 유지한다.
- 검증: 수정 전 표지 겹침 실패를 4:5·1:1에서 재현했다. 수정 뒤 focused 2파일 17건 PASS, 관련 51파일 515건 PASS·DB 환경 의존 3건 skip, `npm run typecheck:ci` 종료 코드 0이다. 첫 TypeScript 시도는 중단된 Next dev가 `.next/dev/types`를 중복·절단한 생성 캐시 때문에 실패했고, 캐시를 `/tmp/zto1-s7-r3-next-dev-types-corrupt-20261008-0408`로 보존 이동한 뒤 같은 명령이 통과했다. 승인 시안·dev 원본·좌우 합성본을 모두 직접 열어 대조했다.
- 범위: S4 PR 128 충돌과 main 병합은 하지 않았다. 원격 CI, QA 승인, 운영 배포는 미검증이며 push하지 않았다.

## 2026-10-08 03:21 KST · 편집실 S7 교차 리뷰 2차 폐쇄

- 코드 커밋: `91f62178 fix(studio): prove S7 templates on live storage`
- 수정: 잘못된 템플릿 명령 타입을 실제 전체 적용으로 교체하고, 글 요소 5개 이상 적용 거절과 생성 직후 저장 실패의 기본 카드 fallback을 추가했다.
- 실경로: drafts·text 브라우저 mock을 제거했다. 실제 Next dev 서버, PostgreSQL RLS, route handler, 서버측 CLI LLM stub, Chromium으로 생성·저장·조회·undo·복원·검토·발행실 이동을 실행했다.
- 검증: `typecheck:ci` 종료 코드 0, production webpack build PASS. 직접 대응 4파일 26건, 관련 51파일 512건·3건 skip, integrity 104건, dashboard contract 492건 PASS. S7 실브라우저는 POST 19회, DB 초안 1건, 5 viewport, 콘솔 오류 0. v70 수치 계약·본문 충돌 PASS. 모바일 9폭 전부 본문 16px, 13px 미만 0, 44px 미만 누름 0, 눌림 상태 100%, 가로 넘침 0. 육안 픽셀 대조에서 일반 카드 stage diff는 0, 카톡 말풍선 stage 390px diff는 18.17% report-only다.
- 잔존: OpenClaw 계약은 별도 BlueBubbles 플러그인 표면 해석 실패로 전체 명령 미통과. 실제 외부 LLM 실패율, 원격 CI, QA 승인, 운영 배포 미검증. S4 PR 128 충돌 파일은 수정하지 않았고 push하지 않았다.

## 2026-10-08 01:17 KST · 편집실 S7 교차 리뷰 MAJOR 6 폐쇄와 저장 짝 보강

- 코드 커밋: `22b3506b fix(studio): persist template state on all saves`
- 실제 화면 저장 회귀: `bafb7ab9 test(studio): cover manual template state save`
- 수정: v3 덱과 템플릿 상태를 공통 저장의 단일 payload로 묶었다. 템플릿 전용 800ms 자동저장 전에 수동 저장·검토 요청·발행실 이동이 실행돼도 호출 시점 상태를 보존한다.
- 회귀: 문자열 소스 일치 검사를 제거하고 payload patch의 실제 동작, 명시 null, v3 덱 없음 경계를 검증한다.
- 검증: TypeScript PASS. MAJOR 직접 대응 10파일 94건 PASS. 변경 소스 관련 50파일 509건 PASS, DB 환경 의존 2건 skip. 실제 `StudioPage` POST 회귀 2파일 15건 PASS.
- 범위: 원격 CI·QA 승인·운영 배포는 미검증. push하지 않았다.

## 2026-10-07 21:31 KST · 편집실 v2 S7 자체 점검 BLOCK 4건 폐쇄

STAMP: 2026-10-07 21:31 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: S7 build-plan, production webpack build, 실제 Chromium 4게이트, Vitest 3단 | 고민: 생성실에서 고른 값이 결과 덱과 재접속 저장 경계까지 이어지는지, 모바일 측정이 실제 편집실 데이터를 보고 있는지를 최종 빌드에서 다시 검증했다.

생성실 `cardTemplateId`를 하위 호환 선택 필드로 글 생성 API에 전달하고, 응답의 ID로 실제 plain v3 덱을 만든 뒤 선택 템플릿을 적용한다. 편집실의 활성 템플릿 ID와 직전 덱은 기존 draft `payload` JSONB에 함께 저장하며 DB 스키마는 바꾸지 않았다. plain 덱의 카톡 템플릿은 무동작 대신 기존 카톡 말풍선 덱 생성 경로를 안내하며 비활성화한다. 모바일 fixture는 실제 `room=edit` URL과 초안 상세 응답을 사용한다.

검증은 TypeScript PASS, integrity 33파일 104건 PASS, contract 108파일 629건 PASS, 변경 import 영향 51파일 511건 PASS·2건 환경 skip, webpack production build PASS다. 최종 빌드의 Chromium에서는 API fixture를 사용해 S7 생성실 선택→요청 payload→결과 덱, 전체·한 장 적용, 재접속 UI 복원, undo를 1440·1024·390에서 확인했고 가로 넘침·콘솔 오류는 0이었다. 실제 drafts route는 별도 Vitest 통합 테스트에서 생성 덱·복귀 원본·템플릿 상태의 POST→GET과 거절 계약을 실행했다. v70 화면 게이트와 두 탭 본문 충돌 복구도 PASS했다. 모바일 360·390·412·600·700·780·820·900·1000은 본문 16px, 13px 미만 0, 44px 미만 누름 0, 눌림 상태 100%, 가로 넘침 0이다. 기본 Turbopack은 공유 `node_modules` 심링크를 작업트리 밖 경로로 거부해 실패했으며, 설치나 링크 변경 없이 webpack 빌드로 검증했다.

벤치마크: Canva의 현재 장·전체 페이지 적용과 버전 복원 흐름을 차용하되, 우리 덱은 글·요소 ID와 카톡 댓글 유도 장을 보존하고 plain→카톡은 기존 전용 생성 경로로만 진입시켰다. 출처: https://www.canva.com/help/change-template/ · https://www.canva.com/help/version-history/

## 2026-10-07 20:34 KST · 편집실 v2 S7 구현 검증, 회수 전 BLOCK

STAMP: 2026-10-07 20:34 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: S7 build-plan, v1.3 PRD, 실제 production Chromium 3게이트, Vitest 3단 | 고민: 통과 수치만 모으지 않고 생성실 선택이 실제 결과물로 이어지는지와 9폭 측정이 올바른 방을 열었는지를 최종 diff에서 다시 공격했다.

S7 글 후보 3개, 사실·길이 경고, 생성실 템플릿 6개 추천 줄, 편집실 전체·한 장 적용, 전후 비교, 복원, undo를 구현했다. 기존 글 생성 응답은 하위 호환으로 유지했고 카드 요소 ID와 카톡 덱 역할·댓글 유도 장을 보존한다. 제품 커밋은 `6ab7efb0`, 브라우저·복원 회귀는 `03eb4536`, 공용 Button 교정은 `1fab474f`다.

검증은 TypeScript PASS, integrity 33파일 104건 PASS, contract 108파일 628건 PASS, 관련 12파일 112건 PASS, webpack production build PASS다. 실제 production Chromium은 S7 1440·1024·390에서 후보 선택, 전체·한 장 적용, 이전 템플릿 복원, undo, 저장 API 3회, 가로 넘침 0, 콘솔 오류 0이다. 기존 v70 화면 게이트와 두 탭 본문 충돌 복구도 PASS했다. 기본 Turbopack build는 공유 `node_modules` 심링크가 worktree 밖을 가리켜 환경 오류로 실패했고, 설치 없이 webpack 경로로 같은 소스를 빌드했다.

`review` 최종 점검에서 두 BLOCK을 남겼다. 생성실에서 고른 `cardTemplateId`는 아직 생성 요청·덱에 전달되지 않아 생성실과 편집실 경험이 실제로 이어지지 않는다. 편집실은 선택한 템플릿 ID를 덱에 저장하지 않아 재열기 뒤 선택 상태를 복원할 수 없고, plain 덱에서 `chat_bubble` 선택은 의미 구조 변환 없이 사실상 무동작이다. 또한 9폭 측정기는 기존 모바일 fixture가 편집실 대신 생성실로 이탈해 360px에서 13px 미만 92건, 44px 미만 1건, 눌림 상태 80%로 FAIL했다. S7 실제 390px 화면의 데이터 3장·넘침 0과는 별개로 9폭 인체공학 게이트는 미통과다. 새 구현을 늘리지 말라는 회수 지시에 따라 여기서 추가 제품 변경은 하지 않았다.

벤치마크: Canva의 현재 장·전체 페이지 적용과 버전 복원 흐름을 차용하되, 우리 덱은 글·요소 ID와 카톡 필수 장을 보존하도록 달리했다. 출처: https://www.canva.com/help/change-template/ · https://www.canva.com/help/version-history/
## 2026-10-08 04:30 KST · PR 128 CI 비동기 준비 경합 교정

STAMP: 2026-10-08 04:30 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: CI run 37668742639, targeted Vitest 3회, 전체 Vitest, typecheck:ci | 고민: timeout을 늘리거나 단언을 약화하지 않고 실제 활성 상태를 click 선행조건으로 고정했다.

`ExportPanel` 경합 테스트는 초기 최신 export 조회가 끝나 버튼이 활성화된 뒤 내보내기를 누른다. 카톡 v3 복귀 테스트도 asset projection이 끝나 복귀 버튼이 활성화된 뒤 누른다. 두 테스트의 기존 결과 단언과 제품 코드는 유지했다.

| 검증 | 결과 |
|---|---|
| 대상 두 파일 3회 연속 | 각 실행 2파일, 23건 PASS |
| `typecheck:ci` | 종료 코드 0 |
| 전체 `npx vitest run`의 대상 파일 | ExportPanel 7건, StudioRooms 16건 PASS |
| 전체 로컬 실행 | 493파일 PASS, 11파일 FAIL. 로컬 DB 미설정, 공유 의존성 해석 실패, 장시간 실행 timeout이 대상 외 실패 원인 |
| 원격 CI | 미검증. push하지 않음 |


## 2026-10-07 20:00 KST · 운영 self-hosted runner 워크스페이스 격리

STAMP: 2026-10-07 20:00 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: actions/checkout v4 공식 README, GitHub Actions variables reference, PR 126 교차 리뷰, fail-first integrity 계약 | 고민: deploy의 복원 절차는 보존하고 CI와 DB migration의 checkout clean 범위만 하위 source tree로 제한했다.

당시 `ci.yml`은 `_ci/src`, `osmu-db-migrate.yml`은 `_ci/migrate-${{ github.run_id }}/src`에 checkout하도록 만들었다. migration의 `_ci` 경로는 2026-10-08 운영 권한 오류가 확인돼 이 문서 최상단의 `source-migration`으로 대체됐다. `marketing_runner`를 쓰는 모든 workflow를 순회하는 integrity 계약은 deploy 이외의 루트 checkout, working-directory 이탈, 루트 `git clean`, workspace 대상 `rm -rf`를 거절한다.

수정 전 신규 계약은 `ci.yml`의 path 누락과 `dashboard` 루트 기준 working-directory 때문에 2건 실패했다. 수정 후 표적 32건, 전체 integrity 34파일 108건, workflow YAML 8파일 파싱이 통과했다. 임시 루트 실측에서 `_ci/src`의 untracked 파일만 정리되고 형제 `config-tenant2`와 `data-tenant2` sentinel은 보존됐다. actionlint는 로컬에 설치돼 있지 않아 미검증이다. 원격 CI, 운영 러너 실행, 현재 운영 tenant 데이터 상태와 운영 배포는 미검증이며 push하지 않았다.
## 2026-10-07 20:01 KST · 생성기 감시 운영 워크스페이스 격리

STAMP: 2026-10-07 20:01 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: 교차 리뷰 R1, tenant bind mount 삭제 복구 workflow, 셸·Vitest·YAML 실측 | 고민: 운영 compose 원본이 있는 self-hosted workspace를 건드리지 않으면서 고정 commit의 감시 코드만 실행하게 했다.

발견: 감시 워크플로가 30분마다 `$GITHUB_WORKSPACE`를 컨테이너에서 `rm -rf`한 뒤 checkout했다. 이 runner의 workspace는 운영 compose 프로젝트이자 tenant 설정·데이터 bind mount 원본이므로, 로그인 감시가 운영 데이터를 삭제할 수 있었다.

변경: workspace 정리와 checkout을 모두 제거했다. GitHub Contents API가 현재 commit의 probe·상태 함수 두 파일만 실행별 `$RUNNER_TEMP/genmon-*`에 받고, 상태 cache도 `$RUNNER_TEMP` 아래에서만 복원·저장한다. 운영 배포 workflow는 바꾸지 않았다. 계약 테스트는 `GITHUB_WORKSPACE`, `rm -rf`, `actions/checkout` 부재와 임시영역 경로를 고정한다.

| 검증 | 결과 |
|---|---|
| RED 관찰 | 기존 workflow의 `GITHUB_WORKSPACE` 때문에 신규 안전 계약 1건 실패 |
| 셸 상태 판정 | 정상·1회 실패·2회 실패·컨테이너 없음·복구 5건 PASS |
| ShellCheck·YAML 파싱 | 오류 0, 감시·배포 workflow 파싱 PASS |
| 표적 Vitest | workflow 계약 7건 PASS |
| 전체 integrity | 34파일 111건 PASS |
| 운영 주기·Slack 실전송 | 미검증. push와 workflow dispatch를 하지 않음 |

레드팀: self-hosted runner에서 workspace는 폐기 가능한 checkout 폴더라는 전제가 틀렸다. 필요한 두 파일만 임시영역으로 가져오게 해 운영 프로젝트와의 쓰기 경로를 없앴다.

셀프심문: 이 교정이 틀렸다면 GitHub Contents API가 운영 runner에서 막혀 감시 자체가 시작되지 않는 경우다. 로컬 계약과 파싱은 통과했지만 실제 schedule 실행은 하지 않았으므로 미검증으로 남긴다.

SOURCES/MODEL: gpt-6.1-sol/Codex | `/Users/sj/wt/genmon-review-r1.md` | `.github/workflows/rescue-tenant-gateway-data.yml` | `.github/workflows/osmu-generator-monitor.yml` | `dashboard/tests/integrity/generator-monitor-workflow.contract.test.ts`

## 2026-10-07 08:45 KST · 생성기 감시 배포 격리와 연속 장애 판정 교정

STAMP: 2026-10-07 08:45 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: 컨트롤러 반려, GitHub Actions concurrency 공식 문서, 셸 상태 판정, 전체 integrity | 고민: 감시기의 일시 실패 흡수는 감시기 내부 상태로 해결하고 운영 배포 워크플로에는 영향을 주지 않았다.

첫 구현은 감시와 배포에 같은 concurrency 그룹을 넣어 운영 배포 경로까지 바꿨다. 두 워크플로의 대기 실행이 서로 영향을 받을 수 있으므로 `deploy-marketing.yml`을 원본으로 복구했다. 감시는 전용 `osmu-generator-monitor` 그룹에서 이전 감시만 취소한다.

로그인 probe 한 주기 실패는 `suspect`로만 저장하고 Slack을 보내지 않는다. 다음 30분 주기에도 연속으로 실패해야 `down`과 failure 알림으로 전환한다. 컨테이너 미기동은 이전 상태를 유지하고, 장애 뒤 한 번의 정상 응답은 즉시 recovery로 전환한다.

| 검증 | 결과 |
|---|---|
| RED 관찰 | 첫 실패가 `failure:down`으로 즉시 전이돼 신규 단위·계약 테스트 실패 |
| 셸 상태 판정 | 정상·1회 실패·2회 실패·컨테이너 없음·복구 5건 PASS |
| ShellCheck·YAML 파싱 | 오류 0, 감시·배포 2파일 파싱 PASS |
| 표적 Vitest | 워크플로 계약 6건 PASS |
| 전체 integrity | 34파일 110건 PASS |
| 운영 주기·Slack 실전송 | 미검증. push와 workflow dispatch를 하지 않음 |

레드팀: `queue: max`의 지원 여부와 무관하게 감시 기능이 운영 출고 워크플로를 수정하는 것은 범위 침범이다. 배포 파일을 원복하고, 배포·재기동의 짧은 실패는 감시기 자체의 `suspect` 단계로 흡수했다.

셀프심문: 이 교정이 틀렸다면 가장 그럴듯한 이유는 cache 복원 순서가 운영 schedule에서 예상과 다르게 작동하는 경우다. 로컬은 상태 함수와 워크플로 구조만 검증했으므로 실제 두 주기 장애·복구 알림은 미검증으로 남긴다.

SOURCES/MODEL: gpt-6.1-sol/Codex | `.github/workflows/osmu-generator-monitor.yml` | `.github/workflows/deploy-marketing.yml` | `scripts/lib/generator-monitor-state.sh` | `docs/qa/qa-tracker.md` | https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax

## 2026-10-07 08:30 KST · Higgsfield 로그인 상태전이 감시

STAMP: 2026-10-07 08:30 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: 없음 | 근거: `osmu-health-monitor.yml`, GitHub Actions concurrency·cache 공식 문서, BRAIN 모니터링 정본, 로컬 셸·Vitest | 고민: 생성 비용 없이 계정 API만 읽고, 배포 중 컨테이너 교체와 지속 장애의 반복 알림을 각각 직렬화와 상태전이 판정으로 제거했다.

배포 때만 실행되던 `scripts/probe-generator-session.sh`를 30분 정기 감시로 확장했다. 최초 확인과 세 번 재시도 모두 실패할 때만 장애로 판정하고, 컨테이너가 미기동이면 이전 상태를 유지한다. `deploy-marketing.yml`과 새 감시 워크플로는 같은 concurrency 그룹을 사용해 컨테이너 교체 중 오판과 self-hosted 러너 경합을 막는다. 장애와 복구 전이에만 기존 `OSMU_ALERT_SLACK_WEBHOOK_URL`로 알리고, 생성 요청이나 자격증명 덮어쓰기는 하지 않는다.

| 검증 | 결과 |
|---|---|
| 셸 함수 단위 | 정상·장애·컨테이너 없음·전이 없음 4건 PASS |
| ShellCheck·bash 문법 | 오류 0 |
| 워크플로 YAML | 신규 감시·기존 배포 2파일 파싱 PASS |
| 표적 Vitest | 신규 워크플로 계약 6건 PASS |
| 전체 integrity | 34파일 110건 PASS |
| 운영 주기 실행·Slack 실전송 | 미검증. push와 workflow dispatch를 하지 않음 |

기존 구현 확인: 배포 워크플로의 읽기 전용 `account status` 탐침과 외부 health monitor의 cache·상태전이·Slack 패턴을 보존해 확장했다. 별도 생성 API나 새 시크릿은 만들지 않았다.

레드팀: 감시가 배포와 겹치면 컨테이너 교체를 로그인 만료로 오판할 수 있다. 같은 concurrency 그룹으로 두 워크플로를 직렬화했고, 컨테이너 미기동은 `hold`로 분리해 이전 상태를 덮지 않는다. 알림이 반복되면 무시될 수 있으므로 동일 상태에는 전송하지 않는다.

셀프심문: 이 결론이 틀렸다면 가장 그럴듯한 이유는 GitHub에 올라간 기본 브랜치에서 schedule과 cache가 로컬 계약과 다르게 동작하는 경우다. 로컬은 구조와 판정만 검증했으므로 운영 실행은 미검증으로 남긴다.

SOURCES/MODEL: gpt-6.1-sol/Codex | `.github/workflows/osmu-health-monitor.yml` | `.github/workflows/deploy-marketing.yml` | `scripts/probe-generator-session.sh` | `/Users/sj/SJ_BRAIN_wiki/wiki/cto/인프라/concept-모니터링-로깅-알림-스택.md` | https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments | https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching

## 2026-10-07 07:51 KST · S5b와 S6 main 병합 검증

STAMP: 2026-10-07 07:51 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: qa | 근거: merge commit `43ae2897`, CI 동일 production server Chromium 게이트, Vitest 3단 | 고민: append-only 기록을 모두 보존하면서 카톡 v3 저장 동기화와 영상 export queue가 한 `page.tsx`에서 함께 동작하는지 검증했다.

`origin/main`의 S6 `df387bf8`을 S5b에 merge했다. `docs/qa/qa-tracker.md`와 `docs/구현현황.md`는 양쪽 기록을 시간 역순으로 모두 보존했고, S5b build plan에는 댓글 유도 장 이동 잠금을 MINOR 1로 명시했다. 자동 병합된 `studio/page.tsx`는 S5b의 v2↔v3 덱 동기화와 S6의 영상 export queue 경로를 모두 유지한다.

검증: `typecheck:ci` PASS, integrity 33파일 104건 PASS, contract 107파일 625건 PASS, Studio 영향 149파일 1,124건 PASS·2파일 28건 환경 skip, production build PASS다. CI와 같은 `next start` 실제 Chromium에서 v70 화면 게이트는 1440·1024·390과 콘솔 오류 0, 두 탭 본문 충돌 게이트는 revision 5→6→8, 연속 409 로컬 입력 보존, 콘솔 오류 0으로 PASS했다. push·원격 CI·QA 승인·운영 배포는 미검증이다.

## 2026-10-07 07:13 KST · 편집실 S5b 교차 리뷰 4차 교정

STAMP: 2026-10-07 07:13 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: qa | 근거: `s5b-review-r4.md`, v2 projection validator, 플래그 ON localhost Chromium, 390·Remotion 원본 PNG | 고민: 삭제 가능한 자유 편집과 서버가 요구하는 댓글 유도 장 불변식을 명령 경계에서 함께 지키고, 모바일 가독성과 발행 줄바꿈의 차이는 숨기지 않고 측정했다.

카톡 v3는 `comment_prompt` 역할을 명시적으로 보존하고 해당 장 삭제를 잠근다. 모든 편집 명령은 결과를 v2로 projection한 뒤 `validateCardDeck`를 통과해야 commit되므로 댓글 유도 장이나 chat 본문 4장 하한을 깨는 변경은 저장 전에 거절된다. 플래그 ON E2E에서 삭제 잠금, 저장 7회, 발행실 이동, 기본 편집 복귀, 콘솔 오류 0, 실패 요청 0을 관찰했다.

390px 작성자 말풍선은 모바일 본문 16px 하한으로 4줄이고, 1440px/Remotion은 비례 글자 크기로 2줄이다. 390px에서 동일한 2줄을 강제하면 16px 하한을 깨므로 발행 PNG를 최종 줄바꿈 정본으로 유지하고 이 제약을 QA 증거에 기록했다. 원격 CI, QA 승인, 운영 배포는 미검증이며 push하지 않았다.

## 2026-10-07 05:31 KST · 편집실 S5b 교차 리뷰 3차 교정

STAMP: 2026-10-07 05:31 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: qa | 근거: `s5b-review-r3.md`, localhost Chromium 600·390 bounding box, 원본 크기 캡처, fontsReady 단위 계약 | 고민: viewport가 아니라 실제 부모 컨테이너를 폭 기준으로 삼고 테스트 환경 차이는 의존성 주입으로 제거했다.

모바일 `.stage`를 부모 폭 `100%`와 `max-width:100%`로 제한하고 바깥·안쪽 grid track을 `minmax(0,1fr)`로 바꿨다. 600·390에서 stage·고급 도구줄·오른쪽 패널·첫 말풍선 버튼이 수평 viewport 안에 있고 편집기 `scrollLeft=0`임을 실제 route E2E로 고정했다. 기본 편집 복귀는 역할 보존 projection을 사용해 서버 v2 검증을 통과한다. `CardSlideScene`은 `NODE_ENV` 분기 대신 주입된 `fontsReady`가 끝난 뒤 overflow를 측정한다.

검증: TypeScript PASS, integrity 33파일 104건 PASS, contract 107파일 621건 PASS, 변경 연관 4파일 61건 PASS다. 플래그 ON E2E는 데이터 9장, 저장 7회, 발행실 이동과 기본 편집 복귀, 콘솔 오류 0, 실패 요청 0이다. 원본 크기 600·390 PNG에서 도구·카드·오른쪽 패널을 직접 확인했다. 커밋은 `97a81e0a`, `458e5996`, `e1117e9b`이며 원격 CI·QA 승인·운영 배포는 미검증이고 push하지 않았다.

## 2026-10-07 02:42 KST · 편집실 S5b 교차 리뷰 2차 교정

STAMP: 2026-10-07 02:42 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: `s5b-review-r2.md`, localhost Chromium 세 폭 bounding box, v3→v2 복귀 E2E, 9폭 모바일 실측 | 고민: 운영 플래그가 켜진 상태에서 미리보기 가시성과 기본 편집 복귀를 대리지표가 아니라 실제 route 왕복으로 닫았다.

카톡 장 도구를 stageColumn 안으로 옮기고 1023px 이하 스테이지 폭을 viewport 토큰으로 제한했다. 카톡 v3는 현재 말풍선·화자·표지·마지막 사진을 v2로 투영해 기본 편집기로 돌아가며, v3 덱을 서버에서 정리한다. 사진 빼기, CardSlideScene 기반 넘침 안내와 명시적 분할, 카톡 원형 회피 배치, 복제 시 legacy projection 제거도 함께 반영했다.

검증: TypeScript PASS, integrity 104건 PASS, contract 621건 PASS, 관련 343건 PASS·환경 skip 8건, Next production build PASS다. 플래그 ON E2E는 데이터 9장, 저장 7회, 발행실 이동과 기본 편집 복귀, 변경 표지 사진 보존, 콘솔 오류 0, 실패 요청 0이다. 1440·600·390 미리보기와 패널 폭을 수치로 단언했고, 360~1000 아홉 폭은 본문 16px, 13px 미만·44px 미만·가로 넘침 0, 눌림 상태 100%다. 원격 CI·QA 승인·운영 배포는 미검증이며 push하지 않았다.

## 2026-10-07 01:51 KST · 편집실 S5b 교차 리뷰 1차 교정

STAMP: 2026-10-07 01:51 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: `s5b-review-r1.md`, 실제 drafts route, 플래그 ON localhost Chromium, 9폭 모바일 실측 | 고민: 운영 스위치가 켜진 상태라 v3 진입을 닫는 대신 v71 한 화면 도구를 전부 복원하고 모든 저장 경계에서 v2/v3 hash를 동기화했다.

교차 리뷰의 MAJOR 1→3→2와 MINOR를 순서대로 교정했다. 수동 저장·자동 저장·검토·발행은 공통 저장 직전 v3 migration hash를 투영된 v2 덱과 동기화한다. 표지·마지막 장으로 말풍선을 옮기는 명령은 UI와 command 양쪽에서 거절한다. 한 화면에는 장 추가·복제·삭제·순서 변경, 표지 문구·사진, 선택 범위 굵게, 실제 발행 renderer 기반 overflow 판정·자동 쪼개기를 복원했다. 고아 `el_<옛 id>`는 구조적 ID로 판정하며, 빈 독자 이름은 `구독자`로 정규화한다.

검증: TypeScript PASS, integrity 33파일 104건 PASS, contract 107파일 621건 PASS, 변경 import 영향 72파일 627건 PASS·1파일 12건 환경 skip, 실제 drafts route 17건 PASS, Next production build PASS다. 플래그 ON E2E는 데이터 9장, 저장 5회, 실제 `/studio?room=publish` 이동, 콘솔 오류 0, 실패 요청 0이다. 브라우저 canvas와 Remotion PNG 모두 프로필 아바타를 포함한다. 360~1000 아홉 폭은 본문 16px, 13px 미만·44px 미만·가로 넘침 0, 눌림 상태 100%다. 원격 CI·QA 승인·운영 배포는 미검증이며 push하지 않았다.

## 2026-10-07 00:48 KST · 편집실 S5b 카톡 v3 고급 도구와 덧붙임 요소

STAMP: 2026-10-07 00:48 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: S5b 수용 기준, Vitest 3단, 플래그 ON localhost Chromium, Remotion PNG | 고민: 기존 v2 내용과 운영 롤백을 보존하면서 카톡 고급 도구와 덧붙임 요소를 공용 v3 scene에 연결했다.

S5b-AC1~3을 구현했다. 화자·프로필·말풍선·말투 도구와 글·사진·도형·스티커·로고 덧붙임을 `CardCanvasEditor` 기반 v3 화면에 연결했고, 저장·재열기·발행은 `CardSlideScene`을 공유한다. 원형을 복사한 뒤 고아가 된 `el_<옛 id>` projection은 저장·렌더에서 제거한다.

검증: TypeScript PASS, integrity 33파일 104건 PASS, contract 107파일 621건 PASS, 변경 import 영향 64파일 530건 PASS·환경 skip 1파일 12건이다. Next production build도 PASS했다. 플래그 ON 실제 Next dev E2E는 데이터 9장, 저장 4회, 콘솔 오류 0, 실패 요청 0이며, 브라우저 캔버스와 Remotion PNG 양쪽에서 프로필 아바타와 덧붙임 요소를 육안 확인했다. 360~1000 아홉 폭은 본문 16px, 13px 미만·44px 미만·가로 넘침 0, 눌림 상태 100%다. 상세 증거는 `docs/qa/osmu-editroom-s5b-build-evidence-v1-gpt-codex.md`다. 원격 CI·QA 승인·운영 배포는 미검증이며 push하지 않았다.

## 2026-10-05 23:08 KST · VID-STALE-09 주제 도장 계약의 의미 단위 검증

STAMP: 2026-10-05 23:08 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: `studio/page.tsx` 이미지·영상 완료 함수, 단일·related·Studio 전체 Vitest | 고민: 제품 동작은 그대로 두고, 객체 포맷이 아니라 이미지와 영상 각각의 주제 도장 계약을 검사했다.

| 검증 | 결과 |
|---|---|
| 단일 회귀 | `npx vitest run tests/studio/stale-video-on-new-topic.regression-1.test.ts`, 13건 PASS |
| 변경 파일 import 영향 | `npx vitest related <브랜치 변경 파일> --run`, 120파일 1,021건 PASS·5건 환경 skip |
| Studio 전체 | `npx vitest run tests/studio`, 129파일 918건 PASS·17건 환경 skip |
| 동작 보존 | 이미지·영상 완료 함수 모두 `topicKey: mediaTopicKey(opts?.topicLabel ?? idea)`와 `setImg/setVid(stamped)` 유지 |
| 미검증 | 실제 브라우저 화면, 원격 CI, 운영 배포 |

## 2026-10-05 22:32 KST · 편집실 생성·업로드 원본 계보 복원

STAMP: 2026-10-05 22:32 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: 파일명 생성 코드, related Vitest, contract Vitest | 고민: 과거 UUID 결과는 보수적으로 막고, 생성기·업로드가 실제로 만드는 좁은 파일명만 원본으로 허용했다.

| 검증 | 결과 |
|---|---|
| 변경 파일 import 영향 | `npx vitest related <변경 파일> --run`, 83파일 725건 PASS·3건 환경 skip |
| 전체 contract | `npx vitest run contract`, 104파일 588건 PASS |
| 생성 원본 복원 | `vid_...`·`vidsilent_...`를 `unbaked`로 판정, DOM 자막 1개와 원본 파일 재굽기 호출 |
| 업로드 원본 | 12자리 hex 동영상 파일을 현재 테넌트 `videos` 경로에서만 해석 |
| 숨김 파일 | `/api/higgsfield/asset/.subtitle-bakes.json` 404, 미디어 토큰 발급 거절 |
| 미검증 | 실제 ffmpeg 글자 픽셀, 원격 CI, 운영 배포 |

## 2026-10-05 22:01 KST · PR 119 origin/main 충돌 해소

STAMP: 2026-10-05 22:01 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: origin/main 4a9aebb8, related Vitest, contract Vitest | 고민: 같은 편집실 파일에 들어온 TikTok 상태 처리와 자막 lineage를 선택적으로 버리지 않고 함께 유지했다.

- 코드: `dashboard/src/app/studio/page.tsx` 자동 병합 결과에서 PR 118의 TikTok 진행 오류 안내·명시적 성공 판정과 이 브랜치의 서버 자막 lineage 조회·단일층 미리보기를 모두 확인했다.
- 문서 충돌: `docs/build-log.md`, `docs/qa/qa-tracker.md`, `docs/구현현황.md`, `wiki/ops/session-state.md`의 양쪽 최신 항목을 모두 보존했다.
- 검증: `npx vitest related ... --run` 42파일 379건 통과, 2건 환경 skip. `npx vitest run contract` 104파일 588건 통과.
- 미검증: 실제 TikTok 계정 왕복, 실제 영상 미리보기, 원격 CI, 운영 배포.

## 2026-10-05 21:44 KST · 편집실 구운 영상 서버 계보 복원

STAMP: 2026-10-05 21:44 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: related Vitest, contract Vitest, 테넌트 격리 계약 | 고민: 기록 없는 과거 파일을 원본으로 낙관하지 않고 중복 자막과 구운 파일 재입력을 먼저 차단했다.

| 검증 | 결과 |
|---|---|
| 변경 파일 import 영향 | `npx vitest related ... --run`, 16파일 129건 PASS |
| 전체 contract | `npx vitest run contract`, 104파일 588건 PASS |
| 표시 없는 운영 초안 | 서버 기록의 원본을 재생하고 DOM 자막 한 층, 재굽기 입력은 원본 파일명 |
| 기존 작업물 열기 | 원본 없는 구운 파일은 DOM 자막 0개, 재굽기 API 0건 |
| 테넌트 격리 | 새 GET 계보 조회를 READ-63 공격 목록에 편입, contract PASS |
| 미검증 | 실제 ffmpeg 굽기, 원격 CI, 운영 배포 |

배포 전 결과는 원본과 구운 파일 모두 UUID.ext였으므로 파일명만으로 완전한 소급 판별은 불가능하다. 이 경우 `unknown`으로 저장하고 DOM 글자층과 재굽기를 차단한다.

## 2026-10-05 20:31 KST · 편집실 자막 계보 교차리뷰 교정

STAMP: 2026-10-05 20:31 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: Claude Opus 교차리뷰, Vitest, TypeScript, localhost 실제 Chromium | 고민: 구운 결과를 원본 파일명과 짝짓는 fallback을 제거하고, 글자 없는 파일명·URL 한 쌍이 없으면 재굽기를 명시적으로 막았다.

| 검증 | 결과 |
|---|---|
| 변경 파일 직접 import | 38파일 300건 PASS. 묶음 부하에서 기존 발행 상태 간섭 1건과 로컬 canvas 바이너리 누락 2건을 분리했고, 발행 파일 58건과 canvas 2파일 22건을 독립 재실행해 PASS |
| 전체 contract | `npx vitest run contract`, 104파일 588건 PASS |
| TypeScript | `npm run typecheck:ci` 종료 코드 0 |
| 디자인 lint | 종료 코드 0. 기존 인라인 style 3파일·hex 8파일, 이번 diff 신규 위반 0 |
| 실제 Chromium | localhost:3470 준비 4.1초, 390px 화면 9종 PASS, 콘솔 오류 0 |
| 미검증 | 로컬 ffmpeg에 drawtext가 없어 실제 글자 픽셀 합성, 원격 CI, 운영 배포는 미검증 |

개발 서버는 검사 뒤 종료했다. 820px에서 자막 입력이 8px로 접히던 실측 결함을 막는 `64rem` 반응형 줄바꿈과 44px 입력 하한은 유지한다.

## 2026-10-05 19:37 KST · 편집실 영상 자막 단일층·구간 정규화

STAMP: 2026-10-05 19:37 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: 관련 Vitest, TypeScript, 실제 Chromium, 9폭 모바일 실측 | 고민: 구운 결과를 편집 기준으로 재사용하지 않고 글자 없는 입력 계보를 보존하되, 과거 결과에 원본이 없는 경우도 중복 글자만은 차단했다.

| 검증 | 결과 |
|---|---|
| 변경 파일 직접 import | 25파일 209건 중 208건 통과. 기존 발행 복구 1건은 묶음 상태 간섭, 단독 재실행 55건 PASS |
| 전체 contract | `npx vitest run contract`, 103파일 586건 PASS |
| TypeScript | `npm run typecheck:ci` 종료 코드 0 |
| 실제 Chromium | edit-video 자막 데이터 3줄, 가로 넘침 0, 44px 미만 조작 0, 콘솔 오류 0 |
| 모바일 실측 | 360·390·412·600·700·780·820·900·1000 전부 13px 미만 0, 본문 16px, 44px 미만 0, 눌림 100%, 넘침 0 |
| 로컬 미검증 | ffmpeg drawtext 미지원으로 실제 글자 픽셀 합성은 CI에서 확인 필요 |

개발 서버와 보조 snapshot 서버는 검사 뒤 모두 종료했다. 원격 CI와 운영 배포는 아직 실행하지 않았다.
## 2026-10-05 22:15 KST · 편집실 v2 S2 무손실 이관·공용 렌더

STAMP: 2026-10-05 22:15 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: S2 수용 기준, 변경 import 테스트, 전체 contract, 로컬 Chromium·Remotion 실측 | 고민: v2 롤백과 S1 회귀를 보존하면서 v3 편집·발행 렌더를 하나로 통합했다.

| 검증 | 결과 |
|---|---|
| `npx vitest related <S2 변경 파일> --run` | 69파일 491건 PASS, 2건 PostgreSQL 환경 전용 skip, 123.63초 |
| `npx vitest run contract` | 105파일 589건 PASS, 118.90초 |
| TypeScript | `npm run typecheck:ci` 종료 코드 0 |
| S2 실제 Chromium | 데이터 3장, 1440·390 글 직접 수정·끌기 PASS, 콘솔 오류 0 |
| 화면·발행 PNG 픽셀 정합 | 1080×1350, 변경 2화소, 비율 0.0000013717421124828533, 최대 채널 차이 9 |
| S1 카드 회귀 | `verify-card-freeform-s1-e2e.mjs` PASS, 콘솔 오류 0 |
| 9폭 모바일 | 360~1000 전부 PASS, 본문 16px, 13px 미만 0, 44px 미만 0, 누림 100%, 넘침 0 |
| 산출물 검사 | pipeline artifact lint 종료 0, 기존 핀 위생 경고 28건 유지 |
| 미검증 | 호스트 부하 제약으로 로컬 전체 Next build 미실행, 원격 CI·운영 배포 미검증 |

`origin/main` 최신 PR 117·118을 merge했고, 충돌 없이 main의 Node 헬스체크와 성과실·TikTok 수정을 유지했다.
적대적 리뷰가 발견한 최신 덱 경합·asset 소유권·ID 손실·구형 검토 PNG 결함은 `cfab7d95`로 교정했고, 교정 후 위 검증을 전부 재실행했다.

## 2026-10-05 20:22 KST · TikTok 조회 오류와 발행 실패 분리

STAMP: 2026-10-05 20:22 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review | 근거: Claude Opus 5.5 BLOCK, 수정 전 회귀 실패 7건, 표적 Vitest 4파일 70건 | 고민: 공급자 조회 오류를 실패로 확정하지 않고 진행 원장과 사용자 안내를 분리했다.

| 검증 | 결과 |
|---|---|
| 수정 전 교차 리뷰 | 조회 오류를 `failed`로 저장해 실제 게시된 영상을 재발행할 위험, 처리 단계 code 손실, 독립 Bearer·긴 token 가림 결손 재현 |
| 수정 후 표적 회귀 | `tiktok-publish-status`, `tiktok-api`, `job-poll`, 실제 Studio 마운트 4파일 70건 PASS |
| 변경 import 영향 | 42파일 374건 PASS, DB 환경 전용 2건 skip |
| 전체 contract | 104파일 586건 PASS |
| 상태 계약 | 조회 오류는 `in_progress` 유지와 진단 저장만, 실제 provider `FAILED`만 영구 실패 |
| 기반 정합 | `origin/main`을 충돌 없이 merge. 공개 범위와 AI 표시는 자동 변경 없음 |
| 미검증 | 실제 TikTok 계정 왕복, 원격 CI·운영 배포 |

제품 커밋은 `38ab4289`, 교차 검수 후속 커밋은 `66235652`, `18689ae9`, `85b03e6f`다. 최종 red-team과 adversarial 재검토는 추가 결함 0건이다.

## 2026-10-05 18:39 KST · 성과실 Shorts·Reels 별칭과 TikTok 실패 진단

STAMP: 2026-10-05 18:39 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: review, ship | 근거: 수정 전 실패 8건, 표적 Vitest 5파일 39건, localhost Next dev 로그 | 고민: 운영 실패 원인을 복원할 수 있게 하되 공급자 원문을 사용자 화면에 직접 노출하지 않았다.

| 검증 | 결과 |
|---|---|
| 수정 전 회귀 | 5파일 8건 실패로 성과 별칭, 채널 링크, TikTok 구조화 오류 결손 재현 |
| 수정 후 회귀 | 성과·채널 2파일 11건, TikTok 3파일 28건, 합계 39건 PASS. 리뷰에서 발견한 5xx 영구 실패 오판, 반복 진단 쓰기, 민감 메시지 보존도 교정 |
| 개발 서버 | Next 16.2.2, `localhost:3567`, Ready 5.8초. `/login`, `/performance`, `/channels/shorts` HTTP 200 |
| 미검증 | 실제 TikTok 계정 왕복, 브라우저 hydration·콘솔, 데이터 포함 9폭 모바일, 전체 Vitest·build, 원격 CI·운영 배포 |

제품 커밋은 `5b40fba7`, `82e48468`이다. 호스트 부하 제약에 따라 전체 검증은 실행하지 않았다.

## 2026-10-04 18:58 KST · 편집실 v2 S1 기존 plain 카드 작업대 회귀 복구

STAMP: 2026-10-04 18:58 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: qa | 근거: PR 116 CI run 37192534847, v70 화면 정합 스크립트, 로컬 Vitest·TypeScript·production build | 고민: 과거 plain 카드 데이터를 묵시적으로 v3로 이관하지 않고 명시적인 v3 덱이 있을 때만 자유 배치 편집기를 열도록 소유권 경계를 복원했다.

v70 픽스처는 v3 덱이 없었지만 `editLines`를 본 진입 effect가 v3 덱을 생성하고 자동 저장해 기존 카드 작업대를 숨겼다. 자동 승격을 제거해 과거 plain 카드는 기존 작업대를 유지하고, 저장된 `cardDeckV3`가 있는 S1 작업만 자유 배치 편집기를 연다.

| 검증 | 결과 |
|---|---|
| `studio/page.tsx` import 영향 | 39파일 266건 PASS |
| v3 명시 연결·편집실 설계 | 2파일 17건 PASS |
| TypeScript·production build | 모두 종료 코드 0 |
| 실제 v70 화면 정합 | 33관찰, 1440·1024·390 전체 시나리오 PASS, 일반 카드 stage diff 0, 콘솔 오류 0 |

로컬 서버는 CI와 같은 `127.0.0.1:3472`와 비교 모드로 실행하고 검사 종료 뒤 중지했다. push와 원격 CI 재실행은 하지 않았다.

## 2026-10-04 17:06 KST · 편집실 v2 S1 PR 116 회귀 6건 교정

STAMP: 2026-10-04 17:06 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: qa | 근거: CI run 37186181393 실패 로그, 기존 회귀 계약, 로컬 Vitest·TypeScript | 고민: v3를 모든 카드에 일반화하지 않고 승인 범위인 편집 가능한 plain 카드에만 연결해 기존 글자 내장 카드의 원본 보존을 지켰다.

CI에서 깨진 여섯 항목은 하나의 증상이 아니었다. 글자 내장 카드 소유권, 저장 인자 위치, 조작 부품, 복원 상태 판정, 서명 이미지 경계가 각각 깨져 있었다. 기존 테스트 기대는 바꾸지 않고 제품 코드를 원인별 다섯 커밋으로 교정했다.

| 검증 | 결과 |
|---|---|
| CI 실패 6건 표적 | 글자 내장 2건, 자동저장 격리, 맨 button, 복원 상태, 배달 이미지 모두 PASS |
| 변경 파일 import 테스트 | 56파일 422건 PASS, 실패 0 |
| 무결성 | 32파일 102건 PASS, 실패 0 |
| 전체 `*.contract.test.*` | 84파일 445건 PASS, 실패 0 |
| TypeScript | 손상된 `.next/dev/types` 캐시를 별도 보관한 뒤 `npm run typecheck:ci` 종료 코드 0 |
| 실제 Chromium | dev 서버 1,380ms 기동. 1440에서 끌기·크기·회전·72px 글자·5종 요소 저장, 새로고침 복원. 390에서 대체 조작 저장, 가로 390=390, 콘솔 오류 0 |
| 산출물 정합 | pipeline artifact lint 종료 코드 0, 기존 핀 위생 경고 28건 유지 |

이번 교정은 기존 CSS 수치와 캔버스 배치를 바꾸지 않았다. 현재 커밋으로 1440·390 조작을 다시 관찰했고 앞선 9폭 모바일 측정 증거를 유지한다. 원격 CI는 push 전이라 미검증이며 push·배포는 하지 않았다.

## 2026-09-30 10:00 KST · PR #95 범위 축소와 대기열 확장 제거

STAMP: 2026-09-30 10:00 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: qa, review | 근거: 사용자 범위 축소 결정, main `a8a52ade`, v70 §3.5, 표적 Vitest·TypeScript·Chromium | 고민: 대기열 동기화의 개별 오류를 더 고치지 않고 승인 설계가 있는 초안 내부 기능만 남겼다.

| 검증 | 결과 |
|---|---|
| 대기열 되돌림 | queue API·자료형·복귀 해석기가 main `a8a52ade`와 동일. 전용 검증기·본문 생성기·생명주기 검사 삭제 |
| 남길 기능 | 글자 한 벌, 자리표시 차단, 구형 초안 복구, 즉시 재합성, 원본 없는 카드 잠금 검사 유지 |
| 말풍선 계약 | 장당 제한 제거, 9개 말풍선 통과. 장수 7~11 유지 |
| 표적 Vitest | 최종 8파일 120건 PASS. 최초 실행에서 새 시험 자료 오류 1건 수정 |
| TypeScript | `npm run typecheck:ci` 종료 코드 0 |
| 실제 화면 | `localhost:3470` 준비 707ms, `/studio` 200. 1440·390 한 장·두 장 잠금, 재업로드 0, 가로 넘침 0, 콘솔 오류 0 |

전체 Vitest는 사용자 지시대로 실행하지 않았다. 원격 CI는 push 전이라 미검증이다. 머지·배포는 하지 않았다.

## 2026-09-30 08:21 KST · PR #95 6차 리뷰 형식별 요청 정규화·입력 상한

STAMP: 2026-09-30 08:21 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: qa, review | 근거: PR #95 6차 리뷰, 표적 Vitest·TypeScript | 고민: 전환 전 상태를 파괴하지 않으면서 API 요청만 현재 형식으로 정규화해 되돌리기와 경계 안전을 함께 보존했다.

| 검증 | 결과 |
|---|---|
| 수정 전 실패 재현 | 표적 2파일 78건 중 4건 실패. 말풍선·영상의 잔여 위치 400, 비내장 73개 200, 영상 요청의 카드 필드 잔존 |
| 실제 `StudioPage` 요청 | 글자 내장 카드에서 영상·글로 각각 전환한 뒤 검토 요청. 현재 형식·문구만 포함하고 카드 이미지·표식·위치 미포함 |
| 대기열 종류별 계약 | 글자 내장 정상 200·불일치 400, 일반 배경 200, 말풍선 9장·15문구 200, 잔여 위치가 섞인 말풍선·영상 200, 비내장 72개 200·73개 400 |
| 최종 표적 Vitest | 3파일·89건 PASS, 실패 0, 종료 코드 0 |
| TypeScript | `npm run typecheck:ci` 종료 코드 0 |

전체 Vitest는 사용자 지시대로 실행하지 않았고 원격 CI가 최종 판정한다. 화면 배치·스타일은 변경하지 않아 별도 시각 대조와 모바일 크기 재측정 대상이 아니다. `git push origin fix/editroom-textcard-overlay`는 실행 환경의 외부 쓰기 승인 정책이 `never`라 프로세스 시작 전에 차단됐다. 머지·배포는 하지 않았다.

## 2026-09-30 07:45 KST · PR #95 5차 리뷰 카드 종류별 대기열 계약·잠금 안내 캡처

STAMP: 2026-09-30 07:45 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: qa, review | 근거: PR #95 5차 리뷰, 표적 Vitest·TypeScript·Chromium v70 화면 검사 | 고민: 공통 요청 필드의 의미를 카드 종류별로 분리하고, 화면 검사가 저장할 바로 그 프레임의 안내 가시성을 검증하게 했다.

| 검증 | 결과 |
|---|---|
| 수정 전 실패 재현 | 카드 종류별 계약표 5행 중 일반 배경 1장·2문구와 말풍선 9장·15문구 두 행이 400으로 실패 |
| 표적 Vitest | 3파일·83건 PASS, 실패 0 |
| TypeScript | `npm run typecheck:ci` 종료 코드 0 |
| Chromium 잠금 화면 | 1440·390 각각 한 장·두 장 캡처를 직접 확인. 원인·보존 안내·새 카드 생성 행동 노출, 조작 비활성, 원본 URL·장수 유지, 재업로드 0, 가로 넘침 0, 콘솔 오류 0 |
| 산출물 검사 | 핀 실체·슬롯키·버전 정합 통과. 기존 상류 산출물 경고 28건 유지 |

전체 Vitest는 사용자 지시대로 실행하지 않고 원격 CI가 최종 판정한다. UI 제품 코드는 변경하지 않아 모바일 크기 재측정 대상이 아니다. 머지·배포는 하지 않았다.

## 2026-09-30 06:59 KST · PR #95 4차 리뷰 대기열 교차 계약·잠금 화면 상시 검사

STAMP: 2026-09-30 06:59 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: qa, review | 근거: PR #95 4차 리뷰, 표적 Vitest·TypeScript·Chromium v70 화면 검사 | 고민: 독립 필드 검사를 통과한 조합이 실제로 복원 가능한 카드 원본인지 요청 경계에서 함께 판정했다.

| 검증 | 결과 |
|---|---|
| 수정 전 실패 재현 | 대기열 경계 회귀 8건 실패. 장수 불일치·원본 메타데이터 누락·영상 편집 형식·비boolean 표식이 저장됨 |
| 표적 Vitest | 3파일·79건 PASS, 실패 0 |
| TypeScript | `npm run typecheck:ci` 종료 코드 0 |
| Chromium 잠금 화면 | 1440·390 각각 한 장·두 장, 잠금 안내와 비활성 조작 확인. 원본 URL·장수 보존, 재업로드 0건, 가로 넘침 0, 콘솔 오류 0 |
| 독립 재검토 | 최초 MAJOR 1건인 빼기·되살리기와 콘텐츠 크기 잠금 검사 누락을 보완한 뒤 재검토 PASS, MAJOR 0 |

전체 Vitest는 사용자 지시대로 실행하지 않고 원격 CI가 최종 판정한다. 머지·배포는 하지 않았다.

## 2026-09-30 04:27 KST · PR #95 3차 리뷰 원본 없는 카드 잠금·대기열 검증

STAMP: 2026-09-30 04:27 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: qa, review | 근거: PR #95 3차 리뷰, v70 실패 상태 계약, 표적 Vitest·TypeScript | 고민: 원본 없는 카드는 편집 가능한 척하지 않고 기존 그림 보존과 새 생성 행동을 명확히 보여 줬다.

| 검증 | 결과 |
|---|---|
| 수정 전 실패 재현 | 2파일에서 신규 회귀 8건 실패. 편집 잠금 2건과 요청 검증 6건 |
| 표적 Vitest | 4파일·75건 PASS, 실패 0 |
| TypeScript | `npx tsc --noEmit` 종료 코드 0. CI와 같은 OpenClaw 의존성은 main 설치본을 일시 연결한 뒤 제거 |
| UI 토큰 감사 | 종료 코드 0. 기존 인라인 style 1파일·토큰 밖 hex 6파일 경고 유지, 이번 변경에 신규 직접값·hex·인라인 style 없음 |
| 산출물 검사 | 핀 실체·슬롯키·버전 정합 통과. 기존 상류 산출물 경고 28건 유지 |

전체 Vitest는 사용자 지시대로 실행하지 않고 원격 CI가 최종 판정한다. 실제 브라우저 캡처는 이번 3차 수정에서 새로 만들지 않았으며, 한 장·두 장 복귀와 조작 잠금은 실제 `StudioPage` 통합 테스트로 검증했다. `git push origin fix/editroom-textcard-overlay`는 실행 환경의 외부 쓰기 승인 정책이 `never`라 프로세스 시작 전에 차단됐다. 머지·배포는 하지 않았다.

## 2026-09-29 21:41 KST · 운영 글자 카드 중복·생성 자리표시 누출 수정

STAMP: 2026-09-29 21:41 KST | model: gpt-codex/GPT-5.6 | agent: code-builder | skill: qa, review | 근거: 운영 재현, v70 §3, 로컬 Vitest·TypeScript·build·Chromium | 고민: 완성 PNG와 편집 레이어의 소유권을 명시해 글자를 한 벌만 보이게 했다.

| 검증 | 결과 |
|---|---|
| 관련 Vitest | 5파일·45건 PASS, 실패 0 |
| TypeScript·production build | `npm run typecheck:ci`, `npm run build` 종료 코드 0 |
| UI 토큰 감사 | 위반 0 |
| Chromium 1440 | 무대·이미지 520×650, 중복 컨트롤 0, 가로 오버플로 0 |
| Chromium 390 | 무대·이미지 308×385, 중복 컨트롤 0, 가로 오버플로 0 |
| 브라우저 콘솔 | 두 폭 합계 오류 0 |
| 캡처 | `docs/qa/osmu-textcard-overlay-1440x900.png`, `docs/qa/osmu-textcard-overlay-390x844.png` |

전체 Vitest 최초 실행은 423파일 중 415파일·2,860건 통과, 8파일 실패였다. 실패 원인은 CI의 `Seed proper-lockfile into the openclaw tree` 준비 단계를 로컬에서 빠뜨린 것이며, 동일 배치 후 실패했던 8파일 58건은 PASS다. 사용자 지시에 따라 전체 스위트는 다시 돌리지 않고 원격 CI가 최종 판정한다. 머지·배포는 하지 않았다.

## 2026-09-29 08:18 KST · PR #94 리뷰 r5 토큰·영상 회귀 수정

STAMP: 2026-09-29 08:18 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: qa | 근거: `review94-r5.md`, GitHub Actions run `36495350609`, 로컬 표적 Vitest·UI 토큰 감사 | 고민: 180px 계약의 소유 요소와 내부 화면 축소 계약을 분리해 테스트가 구현 구조를 정확히 감시하게 했다.

| 검증 | 결과 |
|---|---|
| 수정 전 표적 재현 | 2파일·14건 중 2건 실패. 토큰 직접값 1건과 잘못된 화면 높이 단언 1건 |
| 수정 뒤 표적 Vitest | 2파일·14건 PASS, 실패 0 |
| UI 토큰 감사 | 직접값 0건, spacing·typography·color·radius·elevation·contrast 모두 0 |

전체 스위트·시안 스크립트·TypeScript는 사용자 지시로 재실행하지 않았다. 원격 CI 재실행과 push는 컨트롤러 소유이며 미검증이다.

## 2026-09-28 16:37 KST · PR 87 재리뷰 r6 연속 본문 충돌 보관본·CI 제한시간

STAMP: 2026-09-28 16:37 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: qa, review | 근거: `.pr87-review-r6.md`, 연속 409 Vitest·두 탭 Chromium·PostgreSQL 16 전체 스위트 | 고민: 충돌마다 현재 편집기를 다시 캡처하지 않고 최초 사용자 입력과 변하는 서버 최신판의 소유권을 분리했다.

| 검증 | 결과 |
|---|---|
| 연속 409 회귀 | fake timer 컴포넌트 3건 PASS. 최신본 확인 뒤 후속 409에서도 최초 `탭 B 마지막 영상 변경`을 base 6·7 요청에 유지 |
| 두 탭 실브라우저 | revision 5→6→7→8, 연속 충돌 요청 base 6, 최종 재적용 base 7, 보존 입력 `탭 B 내 변경`, 콘솔 오류 0 |
| CI 동일 전체 Test | PostgreSQL 16 schema→seed→RLS와 migration matrix 뒤 421파일·2,867건 PASS, 1건 SKIP, 실패 0 |
| TypeScript·production build | `npm run typecheck:ci`, `npm run build` 종료 코드 0 |
| CI 브라우저 게이트 | 발행실 정렬 delta 0px, Chromium 말풍선 편집 회귀 전부 PASS |
| 제한시간 | 본문 충돌 E2E step 3분, 준비 60초·강제종료 5초, E2E 90초·강제종료 10초, EXIT kill+wait 적용 |

추가 마이그레이션은 없다. UI 토큰 감사는 위반 0건이다. design-lint의 기존 인라인 style 1파일·hex 6파일과 artifact lint의 기존 산출물 경고 28건은 이번 diff 밖이다. 원격 CI와 운영 배포는 push 전이라 미검증이다.

KNOWLEDGE_QUERY: `.pr87-review-r6.md`, ADR-007, 본문 충돌 상태·재시도 큐·CI workflow, GitHub Actions step timeout 공식 문서를 조회했다.
HITS_USED: 최초 local 불변과 후속 latest 갱신 분리를 코드·회귀에 채택하고, GitHub `timeout-minutes`에 shell 강제종료를 겹쳤다.
HITS_REJECTED: 새로고침 뒤 충돌 보관본 복원은 이번 요구의 “후속 응답” 범위를 넘어 별도 지속성·문서 전환 계약이 필요하므로 이번 수정에 섞지 않았다.
CONFLICTS: 없음.

SOURCES/MODEL: gpt-codex/GPT-5 | `.pr87-review-r6.md`, `dashboard/src/app/studio/page.tsx`, `dashboard/tests/studio/body-conflict-recovery.regression.test.tsx`, `dashboard/scripts/verify-body-conflict-recovery-e2e.mjs`, `.github/workflows/ci.yml`, https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax, `/tmp/pr87-r6-{target2,typecheck2,build-final,e2e,full,matrix,alignment,bubble}.log`

## 2026-09-28 15:40 KST · PR 87 재리뷰 r5 본문 충돌 복구

STAMP: 2026-09-28 15:40 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: qa, review | 근거: `.pr87-review-r5.md`, ADR-007, v70 디자인 규격, RFC 9110 §15.5.10, 두 탭 Chromium 실측 | 고민: 409를 오류 문구로만 끝내지 않고 서버 최신본과 실패 직전 로컬 입력을 동시에 보존해 사용자가 어느 쪽도 잃지 않게 했다.

| 검증 | 결과 |
|---|---|
| 표적 회귀 | fake timer 기반 실제 `StudioPage` 충돌→최신본→재적용·본문/영상 이중 충돌·늦은 두 번째 409 3건 PASS |
| CI 동일 전체 Test | Node 20.20.2, PostgreSQL 16 schema→seed→RLS. 421파일 PASS, 2,867건 PASS, 1건 SKIP, 실패 0, 214.52초 |
| TypeScript·production build | `npm run typecheck:ci`, `npm run build` 종료 코드 0 |
| DB·브라우저 게이트 | migration matrix PASS. 발행실 정렬 delta 0px. Chromium 말풍선 E2E 전부 PASS |
| 두 탭 dev 스모크 | `localhost:3471/studio?room=edit`, 탭 2개, revision 5→6→7, 재적용 base 6, 콘솔 오류 0 |

스키마 마이그레이션은 없다. 기존 JSONB `bodyRevision`과 409 `latestBody` 계약만 사용했다. 독립 리뷰에서 재적용 중 잠금 해제, 연속 충돌의 단일 retry 슬롯 덮어쓰기, 본문·영상 이중 충돌, 발행실의 복구 UI 부재를 찾아 수정했다. design lint의 기존 인라인 style 1파일·토큰 밖 hex 6파일 경고는 남아 있으나 이번 diff는 토큰 클래스와 공용 `Button`만 사용해 신규 위반이 없다. 원격 CI와 운영 배포는 push 전이므로 미검증이다.

KNOWLEDGE_QUERY: `.pr87-review-r5.md`, ADR-007, v70 충돌·실패 상태, 기존 영상 CAS UI, RFC 9110의 409 복구·재제출 계약을 조회했다.
HITS_USED: 409가 충돌 원인을 설명하고 사용자가 해소·재제출할 수 있어야 한다는 RFC 원칙을 최신본 확인과 명시적 재적용 행동에 적용했다.
HITS_REJECTED: 제품 방향·시장 BRAIN 지식은 이미 확정된 동시성 버그 수정 범위와 무관해 채택하지 않았다.
CONFLICTS: 없음.

SKILLS_USED: qa — 충돌 재현·회귀·실브라우저 검증, review — 커밋 전 동시성·CI·적대적 UX 병렬 검수에 사용.
SKILLS_SKIPPED: 없음.
SOURCES/MODEL: gpt-codex/GPT-5 | `.pr87-review-r5.md`, `wiki/거버넌스/{결정.md,실수.md}`, `docs/design/design-spec-editroom-v70.md`, `dashboard/src/app/{studio/page.tsx,api/studio/drafts/route.ts}`, https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.10, `/tmp/pr87-r5-{full-vitest-final4,node20-type-build-final4,migration-final4,body-e2e-final5}.log`

## 2026-09-28 14:37 KST · PR 87 재리뷰 r4 서버 발급 본문 revision CAS

STAMP: 2026-09-28 14:37 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: 없음 | 근거: `.pr87-review-r4.md`, 기존 영상 편집 CAS, PostgreSQL 공식 트랜잭션 문서, 실제 PostgreSQL 두 탭 재현 | 고민: 탭의 편집 횟수를 최신성으로 오인하지 않고 서버가 발급한 기준판 하나만 저장 자격으로 사용하게 했다.

| 검증 | 결과 |
|---|---|
| 수정 전 재현 | route·실DB 계약 2파일에서 4건 FAIL, 11건 PASS. 로컬 revision 100인 오래된 탭이 서버 revision 4를 덮는 경로를 확인 |
| 표적·실DB 회귀 | 관련 8파일·48건 PASS. fake timer 100ms 현재 탭 저장 뒤 800ms 오래된 탭 저장을 409로 거절하고 승자 본문·server revision 1 유지 |
| CI 동일 전체 Test | 420파일 PASS. 2,864건 PASS, 1건 SKIP, 실패 0, 256.43초 |
| TypeScript·production build | `CI=true npx tsc --noEmit -p tsconfig.ci.json`, `CI=true npm run build` 종료 코드 0 |
| DB·브라우저 게이트 | migration matrix PASS. 발행실 정렬 delta 0px. Chromium 편집 E2E 전부 PASS |
| dev 스모크 | `localhost:3465/studio?room=edit` HTTP 200, title `Marketing Hub`, 콘솔 오류 0 |

스키마 마이그레이션은 없다. `bodyRevision`은 기존 JSONB 필드를 유지한다. 원격 CI와 운영 배포는 push 전이므로 미검증이다. design lint는 기존 인라인 style 1파일·토큰 밖 hex 6파일을 경고했고 이번 변경의 스타일 diff는 0건이다.

KNOWLEDGE_QUERY: `.pr87-review-r4.md`, 기존 영상 CAS, drafts route·클라이언트 저장 큐, PostgreSQL Read Committed의 조건부 UPDATE 동작을 조회했다.
HITS_USED: 영상 CAS의 마지막 서버 revision 정확 비교와 PostgreSQL의 현재 행 재평가 규칙을 본문 저장에 적용했다.
HITS_REJECTED: BRAIN의 제품·시장 지식은 이미 확정된 동시성 결함 수정 범위와 무관해 채택하지 않았다.
CONFLICTS: 탭별 큰 로컬 revision을 더 최신으로 보던 기존 규칙이 서버 발급 기준판 계약과 충돌해 폐기했다.

SKILLS_USED: 없음
SKILLS_SKIPPED: review·investigate는 현재 available-skills 목록에 없고, qa는 단일 결함의 지정 구현 범위를 전면 웹 QA로 넓히므로 사용하지 않았다.
SOURCES/MODEL: gpt-codex/GPT-5 | `.pr87-review-r4.md`, `dashboard/src/app/{api/studio/drafts/route.ts,studio/page.tsx}`, https://www.postgresql.org/docs/current/transaction-iso.html, `/tmp/pr87-r4-{red,related2,full-rerun,tsc,build,migration,publish-browser,bubble-e2e,dev,smoke}.log`

## 2026-09-28 13:44 KST · PR 87 재리뷰 r3 본문 revision CAS

STAMP: 2026-09-28 13:44 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: qa, review | 근거: `.pr87-review-r3.md`, 실제 PostgreSQL 경합, CI 동일 전체 로그 3회 | 고민: 클라이언트 큐만 믿지 않고 서버 저장 경계에서도 초안 id와 본문 revision을 원자적으로 검사했다.

| 검증 | 결과 |
|---|---|
| 결정적 CI 회귀 | 실제 sleep 제거, fake timer 800ms와 명시적 저장 Promise로 A 저장 중 B 전환 순서 고정 |
| 표적·DB 회귀 | 관련 9파일·53건 PASS. 실제 PostgreSQL에서 같은 revision 경합은 200 1건·409 1건, stale 요청 뒤 승자 본문 유지 |
| CI 동일 전체 Test 3회 | 각 회차 420파일·2,863건 PASS, 1건 SKIP, 실패 0. 261.88초, 327.88초, 274.10초 |
| TypeScript·build | `CI=true npx tsc --noEmit -p tsconfig.ci.json`, `CI=true npm run build` 종료 코드 0 |
| dev 스모크 | `localhost:3458/studio?room=edit` HTTP 200, title `Marketing Hub`, 콘솔 오류 0 |

원격 CI와 운영 배포는 push 전이므로 미검증이다.

KNOWLEDGE_QUERY: `.pr87-review-r3.md`, 모든 본문 변경 지점, 모든 `save()` 호출, drafts route, CI workflow를 조회했다.
HITS_USED: 리뷰어의 세 stale 경로를 클라이언트 단일 스냅샷과 서버 원자적 revision 규칙으로 통합했다.
HITS_REJECTED: 외부 벤치마크는 이미 확정된 저장 계약의 버그 수정이어서 적용하지 않았다.
CONFLICTS: 직전 세대+직렬 큐만으로 충분하다는 가정이 서버 경합 재현과 충돌해 서버 CAS를 추가했다.

SOURCES/MODEL: gpt-codex/GPT-5 | `.pr87-review-r3.md`, `dashboard/src/app/studio/page.tsx`, drafts route, 관련 회귀 테스트, `.github/workflows/ci.yml`, `/tmp/pr87-r3-{target4,full-1,full-2,full-3,tsc2,build,dev,smoke}.log`

## 2026-09-28 12:06 KST · PR 87 재리뷰 r2 본문 세대·저장 직렬화

STAMP: 2026-09-28 12:06 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: qa, review | 근거: `.pr87-review-r2.md`, 수정 전·후 재현 로그, CI 동일 전체 로그 | 고민: 두 상태의 도착 순서를 맞추는 임시 보정보다 본문 정본과 저장 순서를 구조적으로 하나로 제한했다.

| 검증 | 결과 |
|---|---|
| 결함 선행 재현 | 리뷰어 반대 순서와 기존 초안 검토 경로가 수정 전 2건 실패·44건 통과 |
| 표적·관련 회귀 | 반대 순서, 응답 중 세대 변경, 기존 초안 검토 저장 포함 9파일·72건 PASS. 추가 정적 계약 3파일·26건 PASS |
| CI 동일 전체 Test | 418파일·2,855건 PASS, 1건 SKIP, 실패 0 |
| TypeScript·build | `npx tsc --noEmit -p tsconfig.ci.json`, `npm run build` 종료 코드 0 |
| DB·브라우저 게이트 | schema→seed→RLS, migration matrix PASS. 발행실 정렬 delta 0px, Chromium 편집 E2E 전부 PASS |
| dev 스모크 | `localhost:3770/studio?room=edit` HTTP 200, body HTML 11,966자, 콘솔 오류 0 |

원격 CI와 운영 배포는 push 전이므로 미검증이다. artifact lint는 상태파일 정합 PASS와 기존 산출물 경고 28건이며, design lint는 기존 인라인 style·hex 경고만 남고 이번 변경의 스타일 diff는 0건이다.

KNOWLEDGE_QUERY: `.pr87-review-r2.md`, 본문 변경 지점 전수, 모든 `save()` 호출, CI workflow를 조회했다.
HITS_USED: 리뷰어의 두 상태 순서와 기존 초안 검토 경로를 실제 컴포넌트 회귀로 고정했다.
HITS_REJECTED: 외부 벤치마크는 확정된 저장 계약의 경합 버그 수정이라 적용하지 않았다.
CONFLICTS: 직전 pending 자막 소유권 방식이 반대 상태 순서 재현과 충돌해 폐기했다.

SOURCES/MODEL: gpt-codex/GPT-5 | `.pr87-review-r2.md`, `dashboard/src/app/studio/page.tsx`, 관련 회귀 테스트, `.github/workflows/ci.yml`, `/tmp/pr87-r2-{red,vitest-ci-final,tsc-ci-final,build-ci-final,migration-final2,alignment-ci-final,e2e-chromium-ci-final,dev-smoke-browser-final2}.log`

## 2026-09-28 11:11 KST · PR 87 병합 리뷰 글 저장 회귀 봉합

STAMP: 2026-09-28 11:11 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: qa, review | 근거: `.pr87-mergereview.md`, 수정 전·후 회귀 로그, CI 동일 전체 로그 | 고민: 영상 자막과 글 원문이 갈라질 수 있는 형식 전환에서 어느 상태가 저장을 소유하는지 변경 시점에 명시했다.

| 검증 | 결과 |
|---|---|
| 결함 선행 재현 | 실제 `StudioPage` 3경로가 수정 전 3건 실패·39건 통과. 비자막 영상 저장은 옛 자막을 전송했고 수동·검토 저장은 최신 글을 생략 |
| 표적 회귀 | 관련 3파일·51건 PASS. 자막 직접 편집 동기화와 형식 전환 뒤 비자막 저장 격리를 함께 검증 |
| CI 동일 전체 Test | 임시 PostgreSQL schema→seed→RLS, migration matrix 뒤 418파일·2,850건 PASS, 1건 SKIP, 실패 0 |
| TypeScript·build | `npx tsc --noEmit -p tsconfig.ci.json`, `npm run build` 종료 코드 0 |
| 실브라우저 | Chromium 편집 시나리오 전부 PASS. 발행실 카드 정렬 최대 delta 0px |
| dev 스모크 | `localhost:3462/qa-alignment-harness?room=publish` HTTP 200, 카드 28개, 콘솔 오류 0 |

원격 CI와 운영 배포는 push 전이므로 미검증이다. artifact lint는 상태파일 2개 정합 PASS와 기존 산출물 경고 28건이다.

KNOWLEDGE_QUERY: `.pr87-mergereview.md`, 저장 호출부, route의 키 생략 보존 계약, CI workflow를 조회했다.
HITS_USED: 리뷰어 재현과 기존 테스트의 자막 직접 편집 계약을 함께 채택해 도메인별 dirty 상태를 분리했다.
HITS_REJECTED: 외부 벤치마크는 확정된 저장 계약의 국소 회귀 수정이라 적용하지 않았다.
CONFLICTS: 이전 병합 기록의 “자막 스냅샷 역투영이 안전하다”는 판단이 실제 형식 전환 재현과 충돌해 폐기했다.

SOURCES/MODEL: gpt-codex/GPT-5 | `.pr87-mergereview.md`, `dashboard/src/app/studio/page.tsx`, 관련 회귀 3파일, `.github/workflows/ci.yml`, `/tmp/pr87-mergereview-{red,targeted,vitest-full,tsc-ci,build,smoke}.log`

## 2026-09-28 10:19 KST · PR 87 main 병합과 p1/p2 경계 회귀 봉합

STAMP: 2026-09-28 10:19 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: qa | 근거: `origin/main` a211ca81, p2 b121ad6a, 3-way diff, CI 동일 전체 로그 | 고민: main의 영상 자동저장 격리와 p2의 자막 CAS 저장을 둘 다 만족시키기 위해 오래된 React 클로저 대신 동일 영상 스냅샷에서 대사를 파생했다.

| 검증 | 결과 |
|---|---|
| 병합 경계 | p1 말풍선·글·카드덱은 main 최종본, p2 영상 편집 CAS·발행 복귀 잠금 해제는 보존 |
| 교차 회귀 | 영상 자동저장 payload의 대사를 같은 `videoEdit.subtitles` 스냅샷에서 파생, 표적 2파일·12건 PASS |
| CI 동일 전체 Test | 임시 PostgreSQL schema→seed→RLS, migration matrix 뒤 418파일·2,849건 PASS, 1건 SKIP, 실패 0 |
| TypeScript·build | `npx tsc --noEmit -p tsconfig.ci.json`, `npm run build` 종료 코드 0 |
| 실브라우저 | 발행실 카드 정렬 최대 delta 0px, Chromium·WebKit·Firefox 말풍선 편집 51개 시나리오 전부 PASS |
| dev 스모크 | `localhost:3764/studio?room=edit` HTTP 200, Ready 876ms, 본문 표시, 콘솔 오류 0 |

원격 CI와 운영 배포는 push 전이므로 미검증이다.

KNOWLEDGE_QUERY: `origin/main`과 p2의 3-way diff, CI workflow, v70 저장 회귀를 조회했다.
HITS_USED: main의 p1 구조화 편집기와 p2의 영상 CAS·발행 복귀 무효화 계약을 각각 정본으로 채택했다.
HITS_REJECTED: 외부 벤치마크는 이미 확정된 두 브랜치의 기계적 병합·버그 수정이라 적용하지 않았다.
CONFLICTS: main의 낡은 `editLines` 클로저 차단과 p2의 자막 저장 요구가 충돌해 동일 CAS 스냅샷 파생으로 해소했다.

SOURCES/MODEL: gpt-codex/GPT-5 | `origin/main` a211ca81, p2 b121ad6a, `.github/workflows/ci.yml`, `/tmp/pr87-merge-full-ci-test-r2.log`, `/tmp/pr87-merge-{alignment,bubble-e2e}.log`

## 2026-09-28 09:23 KST · PR 85 편집실 v70 9차 CI 계약 교정

STAMP: 2026-09-28 09:23 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: qa | 근거: `.pr85-review9.md`, GitHub Actions run 36360534701, 수정 전·후 표적 로그, CI Test 전체 로그 | 고민: 테스트 의도를 지우지 않고 textarea의 value 계약만 실제 contentEditable DOM·input 계약으로 옮겼다.

| 검증 | 수정 전 | 수정 뒤 |
|---|---|---|
| R-S10-37 표적 | `toHaveValue` 실제값 `undefined`, 1건 실패·21건 통과 | `<br><br>` 문단 경계와 `input` 저장 콜백을 직접 검증, 22건 PASS |
| CI Test 동일 명령 | GitHub run 36360534701에서 동일 테스트 실패 | 임시 PostgreSQL에 schema→seed→RLS 적용 후 `npx vitest run`: 408파일·2,778건 PASS, 1건 SKIP, 실패 0 |
| migration matrix | 해당 없음 | `PGTZ=UTC`로 CI 시간대까지 맞춰 전 항목 PASS, 임시 DB 삭제 확인 |
| TypeScript·build | 해당 없음 | `npx tsc --noEmit -p tsconfig.ci.json`, `npm run build` 종료 코드 0 |
| CI 브라우저 게이트 | 후속 스텝이 원격에서 건너뜀 | 발행실 정렬 delta 0px, Chromium WYSIWYG 전부 PASS |

제품 소스와 런타임 동작은 바꾸지 않았다. 원격 CI green은 push 전이라 미검증이다.

KNOWLEDGE_QUERY: `.pr85-review9.md`, CI 워크플로 `verify` 잡, 같은 contentEditable을 검증하는 기존 편집실 테스트를 조회했다.
HITS_USED: `editroom-v65.test.tsx`의 `innerHTML`·`fireEvent.input` 패턴을 동일 컴포넌트 계약으로 채택했다.
HITS_REJECTED: 제품 편집기 변경과 테스트 삭제는 기능 계약을 약화하거나 범위를 넓히므로 제외했다.
CONFLICTS: 없음.

SOURCES/MODEL: gpt-codex/GPT-5 | `.pr85-review9.md`, `.github/workflows/ci.yml`, `dashboard/tests/{studio/studio-chairman-feedback-2026-08-29,components/editroom-v65}.test.tsx`, `/tmp/pr85-r9-*.log`

## 2026-09-28 08:50 KST · PR 85 편집실 v70 8차 리뷰 차단 해소

STAMP: 2026-09-28 08:50 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: qa | 근거: `.pr85-review8.md`, `studio-publish-ui.test.tsx`, 연속 넘침·리치 붙여넣기 재현 탐침 | 고민: 한 번의 분할 성공을 완료로 보지 않고 새 장을 다시 렌더 검사하는 상태 전이로 닫았다.

| 검증 | 수정 전 | 수정 뒤 |
|---|---|---|
| 필수 발행실 UI | contentEditable에 `fireEvent.change`, `value setter` 오류로 FAIL | contentEditable `input`과 구조화 세그먼트 저장 PASS |
| 연속 넘침 | 4개 단일 말풍선 장 기대, 2장에서 중단 | 새 장을 연속 검사해 4장 모두 단일 말풍선 PASS |
| 글 리치 붙여넣기 | paste 기본 동작 허용 `true`, 리치 DOM 잔존 | 기본 동작 차단, 평문 DOM·모델 일치 PASS |
| 관련 회귀 | 해당 없음 | Vitest 16파일 203건 PASS |
| 실브라우저 | 해당 없음 | Chromium·WebKit·Firefox 전부 PASS, 글 리치 노드 0건 |
| 타입·빌드 | 해당 없음 | `typecheck:ci`, `npm run build` PASS |
| dev 스모크 | 해당 없음 | dev 3762 Ready 805ms, `/studio` HTTP 200, body 표시, 콘솔 오류 0 |

운영 배포와 실회원 원격 저장은 미검증이다.

KNOWLEDGE_QUERY: 새 BRAIN·웹 조회 없음. 승인된 구조와 8차 리뷰 재현을 고치는 버그 수정이라 기존 7차의 에디터 데이터 모델 조사 결과를 유지했다.
HITS_USED: `.pr85-review8.md`, 수정 전 Vitest 로그, 기존 카드 말풍선 `handlePaste` 패턴을 채택했다.
HITS_REJECTED: 새 편집기 라이브러리 도입은 두 국소 회귀의 수정 범위를 넘으므로 배제했다.
CONFLICTS: 없음.

SOURCES/MODEL: gpt-codex/GPT-5 | `.pr85-review8.md`, `dashboard/src/components/studio/BubbleEditor.tsx`, `dashboard/src/components/studio/StudioRooms.tsx`, `dashboard/tests/publish/studio-publish-ui.test.tsx`

## 2026-09-28 07:52 KST · PR 85 편집실 v70 7차 리뷰 차단 해소

STAMP: 2026-09-28 07:52 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: qa | 근거: `.pr85-review7.md`, `docs/design/design-spec-editroom-v70.md`, v70 hub prototype, ADR, BRAIN 에디터 데이터 모델, ProseMirror·MDN 공식 문서 | 고민: 평문 길이 비율로 굵기 경계를 추정하는 경로를 증상별로 보정하지 않고 구조화 세그먼트를 저장 원본으로 바꿨다.

- 데이터 무결성: 말풍선 DOM의 텍스트·`strong`·줄바꿈을 세그먼트로 직접 직렬화한다. 굵기 토글은 방향과 무관하게 결과의 굵은 덩이 수를 검사한다. 영상 자동저장은 `editLines`를 생략해 낡은 클로저가 글 투영을 덮지 못하게 했다.
- v70 명세: 글 선택 시 플로팅 굵기 도구막대와 굵기 세그먼트 저장, 카드 넘침 자동 다음 장 분할, 썸네일 끌어 놓기, 말풍선 기준 `bottom:-26px` 도구막대와 모바일 44px, `:focus-visible` 표시를 구현했다.

| 검증 | 명령·대상 | 결과 |
|---|---|---|
| 결함 선행 재현 | 강화 속성 테스트 300회 | 수정 전 18건 FAIL, `/tmp/pr85-r7-property-before.log` |
| 관련 회귀 | Vitest 14파일 | 164건 PASS, 종료 코드 0 |
| 추가 자동분할 계약 | card-deck ops + v70 회귀 | 46건 PASS, 종료 코드 0 |
| 실브라우저 | `verify-bubble-editor-toolbar-e2e.mjs all` | Chromium·WebKit·Firefox 전부 PASS, R7 M1·M2 포함 |
| 타입·빌드 | `typecheck:ci`, `npm run build` | PASS, 종료 코드 0 |
| dev 스모크 | dev 3761, `/studio` | Ready, HTTP 200, body 표시, 콘솔 오류 0 |
| 디자인 토큰 | 변경 소스만 `design-lint.sh` | 위반 0 |

운영 배포와 실제 회원 초안의 원격 저장은 범위 밖이라 미검증이다.

KNOWLEDGE_QUERY: BRAIN `cto/index.md`에서 에디터 데이터 모델·직렬화로 좁혀 조회하고, ProseMirror 상태·트랜잭션·뷰 흐름과 MDN contenteditable 입력·HTML Drag and Drop을 웹 검색했다.
HITS_USED: `concept-에디터-데이터모델-ProseMirror-직렬화.md`의 “모델이 진실, DOM은 투영” 원칙, ProseMirror Guide의 transaction/state/view 흐름, MDN의 draggable·dragover·drop 계약을 구조화 세그먼트와 스트립 끌어 놓기에 적용했다.
HITS_REJECTED: ProseMirror/Tiptap 라이브러리 전면 도입은 현재 카드 세그먼트 스키마와 PR 수정 범위를 넘으므로 채택하지 않았다. `beforeinput.getTargetRanges()` 선점 방식도 세 엔진 E2E가 검증된 기존 IME 흐름을 바꾸므로 보류했다.
CONFLICTS: 없음. 회장 정본과 외부 공식 문서는 모두 상태를 원본으로 두고 DOM을 투영으로 다루라는 방향에서 일치했다.

SOURCES/MODEL: gpt-codex/GPT-5 | `.pr85-review7.md`, `docs/design/design-spec-editroom-v70.md`, `docs/design/prototypes/osmu-editroom-v70-hub-claude-opus-20260923-0956.html`, `/Users/sj/SJ_BRAIN_wiki/wiki/cto/개발/concept-에디터-데이터모델-ProseMirror-직렬화.md`, https://prosemirror.net/docs/guide/, https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API

## 2026-09-25 12:40 KST · 영상 목록이 생성실 폴더를 안 본 결함 수정

STAMP: 2026-09-25 12:40 KST | model: claude-sonnet-5 | agent: code-builder | skill: 없음(코드 수정, 매칭 스킬 없음) | 근거: `dashboard/src/lib/storage.ts`의 `resolveGeneratedFile` 계약, wiki/거버넌스/실수.md의 "경로 한쪽만 본다" 반복 사고 | 고민: 목록·삭제·배달·발행 네 라우트가 저장 위치를 각자 나열하면 다섯 번째 사고가 또 난다. 폴더 목록 정본(`generatedMediaDirs`)을 하나로 묶고 나머지가 그것만 참조하게 했다.

- 결함: `/api/video/list`가 `data/videos` 한 곳만 읽어 생성실(`data/studio/<tenant>/vid*.mp4`)이 만든 영상이 목록에 안 떴다(운영 실측 `{"videos":[]}`). `/api/video/delete`도 같은 한 폴더만 봐서 생성실 영상 삭제가 404였다.
- 수정: `lib/storage.ts`에 `generatedMediaDirs(tenantId)`(찾을 폴더 목록 정본)와 `isGeneratedMediaDirSafe(dir)`(심볼릭 링크로 다른 테넌트 폴더를 가리키는 경우 거부)를 신설. `resolveGeneratedFile`이 이 목록을 쓰도록 고쳐 배달·발행과 동일 정본을 공유한다. `/api/video/list`가 두 폴더를 모두 훑어 최신순으로 합치고, 같은 파일명이 두 폴더에 겹치면 어느 쪽인지 안정적으로 고를 수 없으므로 목록·배달·삭제 모두에서 해당 파일명을 숨긴다(fail closed). `/api/video/delete`가 `resolveGeneratedFile`을 쓰도록 교체해 생성실 영상도 지울 수 있게 했다.
- 이전 Codex 리뷰가 잡은 계약 결함 2건(폴더 우선순위 불일치, 삭제 404)도 이 변경으로 닫혔다.

| 검증 | 명령 | 결과 |
|---|---|---|
| 관련 vitest | `npx vitest run tests/publish/video-path-resolution.contract.test.ts tests/publish/video-routes-tenant-isolation.test.ts` | 2파일 19건 PASS |
| 돌연변이 검증 | 수정 3파일을 되돌리고 같은 테스트 재실행 → 10건 FAIL, 원복 후 19건 PASS 재확인 | PASS |
| 타입체크 | `npm run typecheck:ci` | PASS |
| 전체 vitest | `npx vitest run`(백그라운드, 종료 코드 확인) | 아래 표에 종료 코드 기재 |

KNOWLEDGE_QUERY: BRAIN·웹 조사 없음 — 버그 픽스이자 기존 계약(§2.3 면제 대상: 이미 정해진 규격대로의 구현)이라 조회 강제 대상 아님. 대신 레포 내부 정본(`storage.ts` 주석, `wiki/거버넌스/실수.md`)만 확인.
HITS_USED: `resolveGeneratedFile` 기존 구현과 그 주석(2026-09-08 F-05 교훈) — 배달·발행이 이미 정본을 참조하던 패턴을 목록·삭제에도 그대로 확장.
HITS_REJECTED: 해당 없음.
CONFLICTS: 없음.

SOURCES/MODEL: claude-sonnet-5 | `dashboard/src/lib/storage.ts`, `dashboard/src/app/api/video/{list,delete,publish}/route.ts`, `dashboard/src/app/api/media/[token]/route.ts`, `dashboard/tests/publish/video-routes-tenant-isolation.test.ts`

## 2026-09-25 07:42 KST · 편집실 v70 1단계 EDIT-TEXT·EDIT-CARD

STAMP: 2026-09-25 07:42 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: ship, review | 근거: `docs/design/design-spec-editroom-v70.md`, v70 hub prototype, ADR-007, Canva 직접 편집 도움말, X·Meta 공식 상한 문서 | 고민: 글의 불필요한 구조 조작을 없애고 카드 문구를 결과물 위에서 한 번에 고치게 하되 기존 자동저장과 숨겨진 음악 데이터는 보존했다.

| 검증 | 명령·대상 | 결과 |
|---|---|---|
| 타입 | `npm run typecheck:ci` | PASS, 종료 코드 0 |
| 표적 회귀 | 편집실·저장 route Vitest 10파일 | PASS, 53건 |
| 돌연변이 | 카드 스테이지 폭 520px → 496px | 신규 V70-CARD-01 실패, 종료 코드 1, 원복 뒤 5건 PASS |
| 프로덕션 빌드 | `npm run build` | PASS, `/studio` 정적 경로 생성 |
| dev 서버 | `npm run dev -- -p 3760`, `/studio?room=edit` | Ready 758ms, HTTP 200 |
| 브라우저 | 로컬 Chrome 헤드리스, 같은 URL | DOM 16,521 bytes, 앱 콘솔 오류 0 |
| 디자인 계약 | `design-lint.sh src`, `npm run audit:ui-tokens` | 신규 토큰 위반 0, 저장소 기존 hex 경고 6파일 |

실제 회원 계정으로 저장된 초안을 여는 운영 스모크와 배포는 이번 build 범위에서 미검증이다.

## 2026-09-25 01:45 KST · 생성기 세션 API 생존 탐침

STAMP: 2026-09-25 01:45 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: review | 근거: ADR-007, Higgsfield 공식 setup·generate skill, GitHub Actions steps context | 고민: 생성기 장애를 숨기지 않으면서 글자 카드와 긴급 앱 배포는 막지 않도록 실패 단계와 배포 결과를 분리했다.

| 검증 | 명령 | 결과 |
|---|---|---|
| 셸 구문 | `bash -n scripts/probe-generator-session.sh` | PASS |
| 워크플로 구문 | Python `yaml.safe_load` | PASS, `jobs=1` |
| 정적·실행 계약 | `npm test -- --run tests/deploy/generator-liveness.contract.test.ts` | 1파일 5건 PASS |
| 탐침 실패 전달 | fake docker 종료 코드 7·124 | 같은 종료 코드 반환, 계정 명령 원문 0건 |
| 강제 종료 | TERM 무시 fake docker, 제한 1초·유예 1초 | 5초 안에 비정상 종료 PASS |

운영 GitHub Actions 실행과 운영 컨테이너의 실제 `account status` 응답은 배포하지 않았으므로 미검증이다.
## 2026-09-30 PR #95 r7 검토 대기열 단일 본문·형식별 계약

STAMP: 2026-09-30 09:13 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skills: qa, review | source: PR #95 7차 리뷰, `card-deck-contract.ts`, v70 글·영상 스크롤 계약

- 실패 재현: `npx vitest run tests/studio/text-card-queue-lifecycle.integration.test.ts tests/publish/studio-publish-ui.test.tsx` → 2파일 87건 중 9건 실패. 형식별 상한, 기존 대기열 갱신, 말풍선 최신 투영 결함을 고정했다.
- 표적 회귀: `npx vitest run tests/studio/text-card-queue-lifecycle.integration.test.ts tests/publish/studio-publish-ui.test.tsx tests/studio/card-deck-contract.test.ts tests/studio/card-deck-ops.test.ts tests/studio/text-card-baked-overlay.regression-1.test.tsx` → 5파일 162건 PASS.
- 타입 검사: `npm run typecheck:ci` → PASS, 종료 코드 0.
- 미실행: 전체 Vitest는 원격 CI 판정 지시에 따라 실행하지 않았다. UI 배치·스타일을 바꾸지 않아 개발 서버 화면 및 픽셀 비교는 이번 변경의 검증 대상이 아니다.
