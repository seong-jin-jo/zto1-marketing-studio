# 갭 감사 재확인 2026-08-28

한 줄 결론: 이전 재확인 문서가 남았다고 적은 댓글 다섯 항목은 현재 코드에 모두 구현돼 있다. 2026-08-29 11:56 build는 기존 초안에서 현재 작업과 이어갈 방을 서버가 한 번만 판정하게 해 생성, 편집, 발행, 성과 흐름의 재개 갭을 닫았다.

이 문서는 `docs/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md`의 2026-08-28 현재 정정본이다. 원 감사의 당시 판정은 보존하되 새 작업 발주는 이 문서를 먼저 본다.

## 2026-09-12 이번에 닫은 갭(코드 완료, 검증 미실행)

이 문서와 원 감사가 공통으로 남긴 잔여 네 항목(§`아직 남은 감사 항목`)을 현재 코드와 다시 대조했다.
"성과가 규칙을 고친다"는 이 문서 이후 별도로 이미 닫혀 있었다(`891d0577`, `learned-rules-context.ts`,
2026-09-10 확장 `learned-rules-merge.ts` — 재작업하지 않았다). 남은 네 항목 중 게시물별 성과 시계열,
학습 이력, Threads 외 provider 수집기는 DB 구조나 외부 자격증명이 필요해 이번에도 배제한다.
"일곱 플랫폼을 아우르는 서버 측 발행 중지 계약"만 기본 흐름(생성, 편집, **발행**, 성과)의 발행 단계에
직접 붙어 있고 새 DB나 외부 자격증명 없이 만들 수 있어 이번 build 대상으로 골랐다.

| 계약 | 구현 | 검증 |
|---|---|---|
| 대기 채널만 취소 | `queue.json`의 `channels[*].status === 'pending'`인 항목만 `canceled`로 전환 | 미검증(단위 계약 작성, 실행 못함) |
| 이미 종료된 채널 보존 | `published`/`failed`/`skipped` 채널은 손대지 않음 | 미검증 |
| 크론 경합 안전 | `mutateJson` fresh-read로 `threads-queue-tool.ts`의 `get_approved`→`update_channel`이 같은 순간에 일부 채널을 이미 끝냈어도 그 상태를 보고 나머지만 취소 | 미검증 |
| 취소할 것이 없으면 거절 | 대기 채널이 하나도 없으면(이미 전부 끝남) 409 `NOTHING_TO_CANCEL`, 기존 상태 보존 | 미검증 |
| 기존 흐름 보존 | 기존 승인, 삭제, 편집 인계, 큐 조회 경로는 그대로 유지(신규 라우트 추가만, 기존 라우트 수정 없음) | 근거 확인(diff 범위 확인) |

이번 build는 코드와 계약 테스트(`dashboard/tests/api/queue-cancel.test.ts` 4건)까지만 완료했다.
이번 세션에서 `npx vitest`·`npm run test`·`npx tsc --noEmit`·E2E 스크립트·localhost 실제 클릭 확인이
전부 Bash 명령 승인 차단으로 실행되지 못했다. 승인 후 `docs/qa/qa-tracker.md`의 같은 항목 표를
관찰 증거로 갱신해야 완료로 볼 수 있다. 자세한 내용은 `session-state.osmu.md` 2026-09-12 03시 18분 항목.

이번 범위에서 구현하지 않은 것: 게시물별 성과 시계열 snapshot과 30일 비교, 학습 후보 수락·거절 이력,
Threads 외 여섯 플랫폼의 실제 provider 성과 수집기. 이 셋은 그대로 남아 있다.

STAMP | line: osmu | 생성: 2026-09-12 03:18 KST | model: claude-sonnet-5 | agent: code-builder | skill: 없음 | 고민: 검증을 못 돌린 상태에서 "닫았다"고 쓰면 위조가 된다. 그래서 이 절 전체를 "코드 완료, 검증 미실행"으로 못 박았다.

SKILLS_USED: 없음. 코드 구현 전용 매칭 스킬 없음. SKILLS_SKIPPED: qa는 QA 단계 소유라 사용하지 않음.

SOURCES: `docs/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md` | `docs/audit/osmu-프로덕션수준-갭판정-v1.0.md` | `docs/prototype/openclaw-auto-4room-v63.html` | `docs/requests/회장-확정-요구사항-대장.md`

MODEL: claude-sonnet-5 / code-builder

## 2026-08-29 현재 작업 단일 계약 build

두 감사 문서의 미구현 및 부분 구현 항목을 현재 코드와 다시 대조했다. 댓글 행동, 성과 제안 큐 인계, 성과 0건 가설, 편집 장면 조작, 형식 검증, 첫 댓글, 발행 상태, 검토 후 복귀, 성과 수집 범위는 이미 구현돼 있어 제외했다. DB 구조나 외부 자격증명이 필요한 성과 snapshot, 학습 이력, 외부 수집기와 승인 시안이 지원하지 않는 서버 발행 중지도 제외했다. 그 결과 생성실 감사의 `현재 작업과 현재 단계 표시`를 기본 흐름에 가장 가까운 실제 갭으로 선택했다.

| 계약 | 구현 | 관찰 증거 |
|---|---|---|
| 현재 작업 단일 판정 | 최근 50개 초안 중 유효한 최신 작업을 서버가 하나만 고름 | 실제 작업 공간 GET 200, 초안 39건 중 현재 작업 1건 |
| 현재 방 판정 | 생성 전, 편집 중, 발행 준비 및 복구, 발행 완료를 생성실, 편집실, 발행실, 성과실로 매핑 | 실제 응답의 현재 단계 `발행실` 관찰 |
| 안전한 재개 | 응답의 현재 작업 ID가 같은 응답의 초안 목록에 있을 때만 `이어하기`를 노출하고 기존 초안 복원 경로를 사용 | 실제 응답에서 목록 일치 `예`, 화면 정상 및 ID 불일치 거절 계약 통과 |
| 기존 흐름 보존 | `작업물 전체`의 기존 네 방 단추, 초안 목록, 방별 화면과 발행 복귀 흐름을 유지 | 기본 흐름 11/11, Studio v1 12/12, 전체 회귀 통과 |
| 저장 시각 경계 | PostgreSQL 드라이버의 `Date`와 문자열 저장 시각을 같은 ISO 시각으로 정규화 | 첫 실요청에서 빈 현재 작업을 발견한 뒤 Date 회귀 계약 추가, 재요청에서 발행실 판정 관찰 |

첫 localhost 요청은 초안 38건을 반환했지만 `currentWork`가 비어 실패했다. 원인은 단위 테스트가 문자열 시각만 사용한 반면 실제 PostgreSQL 드라이버는 `Date` 객체를 반환한 것이었다. 드라이버 경계를 정규화하고 API 및 도메인 회귀 계약을 추가한 뒤 같은 실제 경로에서 HTTP 200, 초안 39건, 현재 단계 발행실, 목록 일치 예를 관찰했다. 자동 이동은 하지 않고 사용자가 `이어하기`를 눌렀을 때만 기존 작업을 복원하므로 최신 초안이 사용자의 의도와 다를 수 있는 위험도 제한했다.

최종 검증은 `npm run test` 199파일, 1,450건 통과와 조건부 1건 제외, `npx tsc --noEmit`, production build 174/174, 기본 흐름 11/11, Studio v1 12/12, design lint 위반 0이다. production build의 기존 NFT 추적 경고 1건은 유지됐다. 운영 배포와 실제 공개 채널 발행은 미검증이다.

레드팀: 가장 최근 초안이 사용자가 다시 열려는 작업과 다를 수 있다. 서버 판정은 자동 이동이나 자동 덮어쓰기를 하지 않고 명시적 재개 동작만 제공하며, 현재 작업 ID가 같은 tenant 초안 목록에 없으면 동작 자체를 숨긴다.

셀프심문: 이 계약이 틀렸다면 가장 그럴듯한 이유는 실제 DB 반환형을 mock이 재현하지 못한 경우다. 첫 실요청이 바로 그 결함을 드러냈고, `Date` 객체 회귀 테스트와 localhost 재요청을 최종 증거로 추가했다.

STAMP | line: osmu-gapfill082911 | 생성: 2026-08-29 11:56 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder | skill: 없음 | 고민: 별도 현재 작업 테이블을 만들지 않고 기존 tenant 초안 목록에서 안전하게 재개 가능한 한 건을 판정했다.

SKILLS_USED: 없음. 설치된 스킬 중 build 코드 구현에 직접 대응하는 스킬이 없다. SKILLS_SKIPPED: qa는 QA 단계의 브라우저 E2E 소유 스킬이라 사용하지 않았다.

SOURCES: `docs/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md` | `docs/prototype/openclaw-auto-4room-v63.html` | `docs/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `DESIGN.md` | https://nextjs.org/docs/app/guides/backend-for-frontend | https://linear.app/docs/search

MODEL: gpt-codex/gpt-5.6-sol / code-builder

## 2026-08-29 성과 수집 범위 계약 build

원 감사와 직전 재확인의 `플랫폼별 실제 성과 수집 범위와 결측 이유의 단일 계약`을 선택했다. 생성, 편집, 발행 뒤 성과를 확인하는 기본 흐름의 마지막 경계이며, 기존 `/api/metrics`는 게시물만 반환해 값이 0인 이유를 구분할 수 없었다.

| 계약 | 구현 | 관찰 증거 |
|---|---|---|
| 일곱 대상 단일 응답 | Threads, X, Instagram, Facebook, YouTube Shorts, Instagram Reels, TikTok을 `coverage.version=v1` 한 응답으로 반환 | 실제 작업 공간 GET 200, `platforms` 7건 관찰 |
| 실제 지원 범위 | 현재 앱에서 수집기가 연결된 Threads만 `collectionSupported=true`, 수집기와 지표 목록을 명시 | 실제 응답에서 `threads_post_insights`, views·likes·replies·reposts 관찰 |
| 결측 이유 | 발행 없음, 수집 전, 부분 수집, 수집기 미구현을 코드와 한국어 설명으로 구분 | 임시 실제 DB 행에서 Threads `PARTIAL_COLLECTION`, X `COLLECTOR_NOT_IMPLEMENTED` 관찰 |
| 수집 진척 | 플랫폼별 발행, 수집, 미수집 건수와 마지막 수집 시각 제공 | Threads 발행 2건, 수집 1건, 미수집 1건 관찰 |
| 잘못된 집계 거절 | 음수, 정수가 아닌 건수, 수집 건수가 발행 건수보다 큰 입력을 계약 오류로 거절 | 정상·거절 단위 계약과 route 통합 계약 4/4 통과 |

작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`에 검증용 발행 행 3건을 잠시 넣어 실제 앱 응답을 관찰한 뒤 모두 삭제했고 잔여 0건을 확인했다. 기존 `posts` 응답과 Threads POST 수집 경로는 보존했다. 새 DB 구조와 provider 호출은 추가하지 않았다.

이번 build가 닫은 것은 수집 지원 범위와 결측 이유를 숨기지 않는 단일 계약이다. Threads 외 여섯 플랫폼의 실제 수집기는 여전히 미구현이며 응답에 그 사실을 명시한다. 실제 외부 provider 수치 수집과 운영 배포는 미검증이다.

검증 결과는 전체 Vitest 196파일, 1,408건 통과와 조건부 1건 제외, `npx tsc --noEmit`, production build 174/174, 기본 흐름 11/11, Studio v1 12/12, design lint 위반 0이다. production build의 기존 NFT 추적 경고 1건은 유지됐다.

STAMP | line: osmu-gapfill082907 | 생성: 2026-08-29 07:42 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder | skill: 없음 | 고민: 없는 수집기를 만든 척하지 않고 실제 지원 범위와 결측 이유를 기존 성과 API에 호환 방식으로 드러냈다.

SKILLS_USED: 없음. 설치된 스킬 중 build 코드 구현에 직접 대응하는 스킬이 없다. SKILLS_SKIPPED: qa는 QA 단계의 브라우저 E2E 소유 스킬이라 사용하지 않았다.

SOURCES: `docs/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md` | `docs/prototype/openclaw-auto-4room-v63.html` | `docs/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `DESIGN.md` | https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api | https://developers.google.com/youtube/analytics/metrics

MODEL: gpt-codex/gpt-5.6-sol / code-builder

## 2026-08-29 이번 build에서 닫은 갭

원 감사와 직전 재확인의 `비율, 자막, 음악, 카드 등 형식별 서버 validation 완결`을 선택했다. 생성 결과를 편집하고 발행하기 직전의 기본 흐름에 붙어 있으며, 기존 코드는 편집값을 화면 로컬 상태에만 두어 잘못된 값도 서버가 거절할 수 없었다.

| 계약 | 구현 | 관찰 증거 |
|---|---|---|
| 승인 형식 단일 계약 | 영상 9:16·1:1·16:9, 카드 1:1·4:5, 자막 3단계, 속도 4단계, 목소리·배경·음악 허용 목록을 순수 도메인 계약으로 고정 | 정상·거절 단위 계약 통과 |
| 편집값 보존 | 편집실 선택값을 작업 공간 로컬 상태와 초안 payload에 저장하고 다시 불러옴 | 실제 작업 공간 초안 POST 200, GET 200, 카드 4:5 형식값 재조회 |
| 발행 전 차단 | Studio 발행 body에 `edit_format`을 넣고 `/api/publish`가 자격 조회와 provider 호출 전에 검증 | 잘못된 4:3 영상 비율을 localhost에서 HTTP 422 `INVALID_EDIT_FORMAT`으로 관찰 |
| 사전 검증 | `/api/content/validate`도 같은 계약을 사용 | 승인된 9:16, 1.25배 영상 형식을 localhost에서 HTTP 200, `valid:true`로 관찰 |
| 기존 흐름 보존 | 기존 생성, 편집 인계, 큐, 성과 제안 경로는 그대로 유지 | 기본 흐름 11/11, Studio v1 12/12 |

서버 계약이 받는 허용값은 승인 프로토타입 v63의 값과 일치한다. Next.js 공식 지침의 외부 시스템 전달 전 입력 검증 원칙을 적용했고, YouTube 공식 규격에서 세로·정사각·16:9 비율을 교차 확인했다. 실제 provider가 이 형식대로 영상이나 카드를 렌더하는지는 이번 범위에서 검증하지 않았다.

검증 결과는 전체 Vitest 193파일, 1,388건 통과와 조건부 1건 제외, `npx tsc --noEmit`, production build 174/174, design lint 위반 0이다. production build의 기존 NFT 추적 경고 1건은 유지됐다. 운영 배포와 실제 공개 채널 발행은 미검증이다.

STAMP | line: osmu-gapfill082903 | 생성: 2026-08-29 03:27 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder | skill: 없음 | 고민: 편집 화면에만 있던 값을 새 API나 DB 없이 기존 초안과 발행 경계에 연결했다.

SKILLS_USED: 없음. 설치된 스킬 중 build 코드 구현에 직접 대응하는 스킬이 없다. SKILLS_SKIPPED: qa는 QA 단계의 브라우저 E2E 소유 스킬이라 사용하지 않았다.

SOURCES: `docs/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md` | `docs/prototype/openclaw-auto-4room-v63.html` | `docs/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `DESIGN.md` | https://nextjs.org/docs/app/guides/backend-for-frontend | https://support.google.com/youtube/answer/1722171?hl=en | https://support.google.com/youtube/answer/15424877?hl=en

MODEL: gpt-codex/gpt-5.6-sol / code-builder

## 두 감사 문서 대조 결과

이전 재확인 문서의 `아직 못 하는 것` 다섯 줄은 더 이상 개발 갭이 아니다.

| 이전 잔여 항목 | 현재 코드 근거 | 현재 판정 |
|---|---|---|
| 댓글과 반응의 본문 목록 | `GET /api/engagement`, `engagement_items` | 구현됨. 실 provider 읽기는 미검증 |
| 댓글 답글 초안 만들기 | `engagement-service.ts`, 성과실 댓글 행동 | 구현됨 |
| 답글 보내기 | engagement reply route와 경합 계약 | 구현됨. 실 provider 발송은 미검증 |
| 댓글 좋아요와 나중 처리 | like, defer 상태 전환과 DB 잠금 | 구현됨. 실 provider 좋아요는 미검증 |
| 댓글에서 편집실로 넘기기 | draft 생성과 `comment_id`, `draft_id` 인계 | 구현됨 |

따라서 댓글 저장 구조를 새로 만들지 않았다. 이미 승인된 migration과 서비스 위에 중복 구현하는 선택을 배제했다.

## 이번에 닫은 갭

원 감사의 발행실 항목 `inbox와 calendar에서 발행실로 복귀`를 선택했다. 생성, 편집, 발행, 성과의 기본 흐름 중 편집 결과를 검토하거나 예약한 뒤 다시 발행 상태로 돌아오는 연결이기 때문이다.

| 계약 | 구현 | 관찰 증거 |
|---|---|---|
| 검토 요청과 원 초안 연결 | Studio가 초안을 먼저 저장하고 queue에 `draftId`를 보존 | 정상 및 저장 실패 거절 계약 통과 |
| inbox 복귀 | 각 항목에 `발행실로 돌아가기` 링크와 source context 제공 | 실제 Chromium 클릭 후 발행실 도착 |
| calendar 복귀 | 선택 날짜의 각 항목에 같은 복귀 링크 제공 | 실제 Chromium 클릭 후 발행실 도착 |
| 발행 상태 복원 | 연결 초안의 플랫폼별 본문을 우선 사용하고, 본문 없는 편집 인계 초안은 queue 본문과 초안 메타데이터를 결합 | 실제 편집 인계 초안 제목과 `3곳에 올리기` 노출 |
| 잘못된 URL 거절 | queue 항목이 없거나 본문이 없으면 빈 작업물을 발행 가능 상태로 만들지 않음 | 거절 계약 통과 |

localhost 실요청에서 같은 queue 항목이 inbox와 calendar 각각에 대해 source, queue ID, draft ID, Studio 복귀 URL을 반환했다. Studio 복귀 페이지는 HTTP 200이었다. 미디어 없는 검증 항목으로 inbox와 calendar 링크를 실제 Chromium에서 눌렀고 브라우저 401과 콘솔 오류는 각각 0건이었다. 임시 queue와 고객 토큰은 검증 뒤 삭제했다.

## 아직 남은 감사 항목

이번 범위에서는 다음 원 감사 항목을 구현하지 않았다.

- 일곱 플랫폼을 아우르는 서버 측 발행 중지 계약
- 게시물별 성과 시계열 snapshot과 재현 가능한 30일 비교
- 학습 후보 수락 및 거절 이력
- Threads 외 여섯 플랫폼의 실제 provider 성과 수집기

현재 코드에 부분 구현이 있으므로 다음 작업 전에는 각 항목을 다시 실측해야 한다. 이 목록만 보고 새 스키마나 API를 만들면 안 된다.

## 검증

- `npm run test -- --maxWorkers=8 --minWorkers=1 --testTimeout=15000`: 187파일, 1,336건 통과, 조건부 6건 건너뜀
- `npx tsc --noEmit`: 통과
- `npm run build`: 정적 경로 174개 생성, exit 0. 기존 NFT 추적 경고 1건 유지
- 기본 흐름 E2E: 11/11
- Studio v1 E2E: 12/12
- UI 토큰 감사와 design lint: 위반 0건
- localhost Chromium: inbox 복귀, calendar 복귀, 401 0건, 콘솔 오류 0건

운영 배포, 실제 공개 채널 발행, 실 provider 댓글 행동은 미검증이다. 전체 v63 디자인 정합 NG와 단계 승인 보류도 유지한다.

STAMP | line: osmu-gapfill082823 | 생성: 2026-08-28 23:46 KST | model: gpt-5.6-sol | agent: code-builder | skill: pipeline | 고민: 이미 구현된 댓글 기능을 재창조하지 않고 기본 발행 흐름의 실제 단절을 선택했다.

SKILLS_USED: pipeline. build 허용 범위와 단계 gate 확인에 사용. SKILLS_SKIPPED: 설치 코드 구현 전용 매칭 스킬 없음.

SOURCES: `docs/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md` | `docs/prototype/openclaw-auto-4room-v63.html` | `docs/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `DESIGN.md` | https://support.buffer.com/en-us/articles/managing-and-approving-draft-posts-57li7M8tDA

MODEL: gpt-5.6-sol / code-builder
