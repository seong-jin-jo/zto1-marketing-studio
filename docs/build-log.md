# OSMU build log

## 2026-09-28 10:51 KST · tenant2·3·4 gateway 영속 마운트 전환

STAMP: 2026-09-28 10:51 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: review | 근거: 운영 EACCES 로그, Compose·GitHub Actions 계약, Docker 공식 bind mount 문서 | 고민: 삭제된 bind mount의 최신 상태를 checkout에서 다시 복사하지 않고 살아 있는 컨테이너를 pause해 회수하도록 했다.

| 검증 | 결과 |
|---|---|
| Compose 해석 | tenant2·3·4 gateway/dashboard 12개 bind source가 영속 루트. dashboard UID 1000·Docker GID 987. legacy tenant1 상대 경로와 OSMU named volume 유지 |
| 계약·배포 회귀 | Vitest 7파일 33건 PASS |
| 마이그레이션 경계 | fresh bootstrap, 기존 checkout 거절, pause snapshot, snapshot 실패 자동 unpause PASS |
| 정적 검증 | bootstrap·migration `bash -n`, workflow YAML parse, 의도 파일 `git diff --check` PASS |
| 운영 | 서버 접속·마이그레이션·배포 미실행. EACCES 소멸과 CPU 정상화 미검증 |

독립 리뷰는 환경파일 유실, Docker 소켓 GID, 빈 표식, 실패 시 정지 잔존, 삭제 bind mount의 stop 후 회수 불가를 발견해 수정했다. 3회 검토 상한 뒤 마지막 수명주기 수정은 테스트로 닫았으며 리뷰 상태는 미수렴이다.

KNOWLEDGE_QUERY: BRAIN business 허브와 OSMU 관련 페이지, 레포 ADR·실수 원장·기존 persistence 계약, Docker 공식 bind mount·Compose volume 문서를 조회했다.
HITS_USED: 레포의 체크아웃 밖 `~/openclaw-persist` 계약과 Docker의 host-path 결합 특성을 채택해 long bind syntax와 명시적 이전 절차를 사용했다.
HITS_REJECTED: BRAIN PMF·마케팅 문서는 운영 마운트 구현 근거가 아니어서 반영하지 않았다. Docker named volume 전환은 기존 운영 경로·백업 계약을 바꾸므로 OSMU 기존 서비스에만 유지했다.
CONFLICTS: 없음.

SOURCES/MODEL: gpt-codex/GPT-5 | `wiki/거버넌스/{결정,실수}.md`, `docker-compose.postagi-4tenants.yml`, `.github/workflows/deploy-marketing.yml`, `dashboard/tests/integrity/osmu-persistence.contract.test.ts`, https://docs.docker.com/engine/storage/bind-mounts/, https://docs.docker.com/reference/compose-file/volumes/

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
