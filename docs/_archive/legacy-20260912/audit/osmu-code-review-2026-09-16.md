<!--
STAMP
line: osmu
created_at: 2026-09-16 05:47 KST
model: gpt-codex/gpt-5
agent: code-reviewer
skills: review
scope: 2026-09-16 04:09:49 KST 기준 직전 24시간, cd2e04c6..7cc7f848 순변경
basis: pipeline-state.osmu.md approved_artifacts, DESIGN.md v37, v63 요구 시안, v68 승인 핀, 회장 요구 대장, 사업 좌표
benchmarks: OWASP API4:2023, PostgreSQL 16 explicit locking, YouTube resumable upload, Node.js fs
deliberation: 후속 수정의 자기신고를 믿지 않고 발행 상태 전이, 다중 프로세스 경합, 배포 실행본 귀속, 실제 고객 작업 공간 오염을 역방향으로 공격했다.
-->

# OSMU 최근 24시간 코드 공격 리뷰

한 줄 결론: MAJOR 10건, MINOR 1건이다. 외부 발행을 한 번도 하지 않고도 전체 발행 완료가 될 수 있고, 공급자 실패와 결과 불명은 큐에 영구 정지하며, 다중 서버에서 자막 자원 제한이 배로 늘어난다. 검증기는 구 서버를 최신 코드로 오인하고 고정 고객 작업 공간의 데이터와 무료 몫을 소비한다. 머지를 막아야 한다.

## 범위와 계약

- 검토 창: 2026-09-15 04:09:49 KST부터 2026-09-16 04:09:49 KST까지다.
- 순변경: `cd2e04c650abf2a4ead4b855c5c887d0d82dfca7..7cc7f848e2238c1691fc7467cca4bf2bd89e1b2a`, 85개 커밋, 236개 파일, 추가 11,959줄, 삭제 609줄이다.
- 승인 핀: `pipeline-state.osmu.md:236-240`의 v68 디자인 허브와 `DESIGN.md` v37이다. 현재 승인 블록에는 PRD 핀이 없다.
- 지정 시안: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`을 실제로 열어 구조, 네 방, 사이드바, 확정 문구를 확인했다. v63과 v68의 시각 차이는 MAJOR 근거로 쓰지 않고 공통 계약만 적용했다.
- 요구 원장: 지정 파일은 15줄짜리 이동 안내였다. 정본 `wiki/거버넌스/요청.md`의 현재 요청과 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md:45-59`를 대조했다.
- 직접 관찰: localhost:3456은 HTTP 200과 DB up이었지만 `build_commit=5bad0913`이고 검토 대상은 `7cc7f848`이었다. 기본 흐름은 10/11, Studio v1은 14/14였다. 둘 다 구 서버 관찰이라 최신 코드 통과 증거는 아니다.

## MAJOR

MAJOR: [회귀 위험] openclaw/extensions/threads-queue/src/threads-queue-tool.ts:520 - `skipped` 전이는 기존 `publishing` 상태와 공급자 결과 검증을 전혀 받지 않고, 565-570행은 세 채널이 모두 `skipped`여도 최상위 글을 `published`로 바꾼다 / 사용자 요구는 부분 실패를 전체 성공으로 세지 말라는 것이고, 이 파일 520-533행도 `published`와 `failed`에는 공급자 결과를 요구한다 / `skipped`에 허용된 사유와 계획된 채널을 검증하고, 실제 성공이 0건이면 `published`가 아닌 부분 완료 또는 실패로 닫아야 한다.

재현: 유효한 claim으로 아직 `pending`인 Threads, X, Instagram에 `update_channel({channelStatus:"skipped"})`를 차례로 세 번 호출한다. 공급자 발행 호출 0회인데 마지막 호출에서 `post.status`가 `published`가 되고 claim도 해제된다.

MAJOR: [회귀 위험] openclaw/extensions/threads-queue/src/queue-claim.ts:105 - 채널이 `publishing`이면 lease가 만료돼도 재청구를 영구 차단하지만 공급자 조회와 조정 행동이 없다 / 사업 좌표 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md:59`는 멱등이 재시작 뒤에도 남아야 한다고 확정했고, `threads-queue-tool.ts:171`의 행동 목록에는 결과 조정이 없으며 470-480행은 claim 해제도 막는다 / provider ID와 idempotency key로 공급자 결과를 조회해 `published`, `failed`, `retry-safe`로 수렴시키는 reconcile 행동과 재시작 회귀가 필요하다.

재현: 공급자가 게시물을 만든 뒤 응답 연결만 끊기게 한다. publisher가 `result_unknown`을 기록하면 lease 만료 뒤 `get_approved`는 null이고 `release_claim`도 `result-recovery-required`로 막혀 글이 영구 정지한다.

MAJOR: [회귀 위험] openclaw/extensions/threads-publish/src/threads-publish-tool.ts:212 - 명시적 공급자 실패는 `publishAttempt.state=provider_failed`만 기록한 뒤 예외를 던지고 채널 상태는 `publishing`으로 남긴다 / cron 계약 `config/cron/jobs.json.example:37`은 채널별 성공과 실패 기록을 요구하지만 종료 상태 전이는 별도 agent 행동이라 publisher 실패와 원자적으로 묶이지 않는다. Instagram 200-269행과 X 163-175행도 같은 구조다 / publisher 또는 상위 오케스트레이터가 `finally`에서 `failed` 전이를 보장하고, 그 전이가 실패하면 복구 가능한 outbox를 남겨야 한다.

재현: Threads container API가 HTTP 400을 반환하게 하고 발행 도구 호출 직후 격리 agent 세션을 종료한다. 공급자 실패는 기록됐지만 채널은 `publishing`이라 다음 cron의 `get_approved`가 다시 가져오지 못한다.

MAJOR: [회귀 위험] dashboard/src/lib/studio/subtitle-work-limit.ts:9 - `active`, `activeTenants`, `waiting`이 Node 프로세스 메모리에만 있어 테넌트당 1개와 전체 2개 제한이 서버 인스턴스마다 따로 생긴다 / 사업 좌표 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md:59`는 돈과 몫을 프로세스 메모리에 두면 서버를 늘릴 때 몫이 배로 늘어 사업이 성립하지 않는다고 못 박았다 / Postgres advisory lock이나 영속 lease로 테넌트 permit과 전체 permit을 공유하고 다중 인스턴스 경합 테스트를 추가해야 한다.

재현: 같은 DB와 같은 tenant를 쓰는 dashboard 인스턴스 둘에 자막 요청을 동시에 두 건씩 보낸다. 각 프로세스는 `active=0`에서 시작하므로 합계 4개의 ffmpeg가 429 없이 실행될 수 있다.

MAJOR: [승인 시안 이탈] dashboard/src/components/layout/Sidebar.tsx:397 - 접힌 데스크톱 분기에는 `sticky`가 없고 펼친 분기에만 `xl:sticky`가 있어 1440에서 접으면 56px 네 방 레일이 본문과 함께 위로 사라진다 / `DESIGN.md:161-165`는 네 방을 어디서든 한 번에 가는 상시 이동으로 두고 접힘에도 아이콘과 현재 강조를 남기라고 확정했다 / 너비 상태와 무관하게 데스크톱 rail에 `sticky/top-0`을 유지하고 1024 overlay 규칙만 별도 처리해야 한다.

재현: 1440px에서 `사이드바 접기`를 누르고 `/studio`의 긴 본문을 아래로 스크롤한다. 56px rail이 viewport에 붙지 않아 네 방 진입로가 사라진다.

MAJOR: [회귀 위험] dashboard/src/app/studio/page.tsx:1335 - 텍스트 발행 요청을 45초에 중단하고 1343-1355행에서 AbortError를 일반 `failed`로 표시해 `실패한 곳만 다시 발행`을 연다 / 서버 `dashboard/src/app/api/publish/route.ts:357-363`은 결과 불명 상태를 `PUBLISH_STATE_UNCERTAIN`, `retryPublish:false`로 정의해 재발행을 막는다 / AbortError는 `확인 필요` 상태로 분리하고 재발행을 잠근 뒤 draft와 platform 상태를 폴링해 공급자 결과로 수렴시켜야 한다.

재현: 공급자 응답을 46초 뒤에 반환시킨다. 화면은 45초에 실패와 재발행 단추를 보이지만 서버 요청은 이미 공급자에 전달됐거나 `in_progress`로 남아 화면과 서버 상태가 모순된다.

MAJOR: [회귀 위험] dashboard/Dockerfile:22 - `BUILD_COMMIT`을 OCI label에만 쓰고 런타임 `OSMU_BUILD_COMMIT`으로 보존하지 않아 운영 health의 `build_commit`이 `unknown`이 된다 / `dashboard/src/app/api/health/route.ts:3-5`는 시작 때 주입된 커밋만 신뢰한다고 선언하고, compose `docker-compose.postagi-4tenants.yml:53`과 배포 `deploy-marketing.yml:220`은 build arg만 전달한다 / final image에 `ENV OSMU_BUILD_COMMIT=$BUILD_COMMIT`을 보존하거나 compose runtime environment로 같은 값을 주입해야 한다.

재현: 배포 workflow와 같은 compose build arg로 이미지를 만들고 컨테이너의 `/api/health`를 호출한다. image label에는 SHA가 있지만 Node 환경에는 값이 없어 응답은 `build_commit:"unknown"`이다.

MAJOR: [회귀 위험] dashboard/scripts/verify-basic-flow-e2e.mjs:13 - 세 필수 E2E가 URL과 자격증명만 정하고 `/api/health`의 실행 커밋을 현재 Git SHA와 대조하지 않는다. `verify-studio-v1-e2e.mjs:6-18`과 `verify-four-room-ui-e2e.mjs:8-17`도 같다 / 완료는 현재 변경을 실제 구동한 증거여야 하고 health route도 구 서버를 새 커밋으로 포장하지 말라고 만든 것이다 / 세 스크립트 모두 첫 요청에서 health `build_commit`과 고정 대상 SHA를 비교하고 불일치면 어떤 데이터도 만들기 전에 종료해야 한다.

재현: 검토 대상 HEAD가 `7cc7f848`인 상태에서 localhost:3456은 `5bad0913`을 반환했다. 그런데 기본 흐름은 실제 생성과 큐 쓰기를 진행해 10/11, Studio v1은 14/14를 보고했다. 현재 코드 검증으로 귀속할 수 없다.

MAJOR: [회귀 위험] dashboard/scripts/verify-basic-flow-e2e.mjs:30 - 고정 고객 작업 공간에서 generation, handoff, queue, suggestion enqueue를 만들고 정리하지 않는다. `verify-studio-v1-e2e.mjs:50-104`도 작업 두 건, 후보 거절 여섯 건, 무료 재생성 몫을 남긴다 / 사업 좌표 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md:59`는 유료 몫을 실제 계약으로 지키라고 했고, 테스트 실패가 고객 데이터와 몫을 소비해서는 안 된다 / 전용 QA workspace를 쓰거나 생성된 모든 행과 큐 항목을 `finally`에서 역순 정리하고 실패한 정리도 NG로 올려야 한다.

재현: 지정 작업 공간으로 두 스크립트를 한 번 실행했다. 기본 흐름은 draft `13d01f4b-f84c-4e7a-a484-f8c7bec77486`와 발행 큐를 만든 뒤 10번째 단계에서 실패했고 정리 없이 종료했다. Studio v1은 두 generation과 후보 거절 기록을 남기고 당일 무료 재생성 몫을 조회 또는 소비했다.

MAJOR: [회귀 위험] dashboard/scripts/lib/api-sweep-contract.mjs:8 - 모든 정상 빈 JSON 배열 `[]`을 응답 구조 오류로 분류한다 / `dashboard/src/app/api/images/route.ts:25-31`은 이미지가 없는 정상 고객에게 의도적으로 HTTP 200과 `[]`를 반환하므로 새 고객의 정상 빈 상태가 배포 검증 실패로 뒤집힌다 / 전역 휴리스틱을 없애고 route별 성공 schema에서 빈 배열 허용 여부를 선언해야 한다.

재현: 분류기에 HTTP 200, `application/json`, body `[]`를 넣으면 `응답 구조 오류`다. 같은 입력은 `/api/images`의 정상 빈 갤러리 응답이다.

## MINOR

MINOR: [토큰 위반] dashboard/src/app/globals.css:176 - select 화살표 여백에 `2rem`과 179행의 `0.75rem`을 직접 넣었다 / `DESIGN.md:154-156`은 간격을 4, 8, 12, 16, 24, 32, 48 토큰으로만 쓰고 임의 값을 금지한다 / 같은 32px와 12px을 기존 spacing token으로 치환해야 한다.

재현: 최근 추가행을 토큰 검사하면 색상은 semantic token을 쓰지만 select의 두 spacing 선언만 리터럴로 남는다.

## 검증 증거

| 검증 | 결과 | 증거 등급 |
|---|---|---|
| `npm run test` | 366개 파일 중 365 통과, 1 실패. 2,344건 통과, 3건 제외. 다른 세션의 미커밋 `verify-four-room-ui-e2e.mjs`가 기존 `waitUntil:commit` 계약 테스트와 충돌 | 테스트됨, 전체 NG |
| `npx tsc --noEmit` | `.next/dev/types/routes.d.ts`와 `validator.ts` 문법 오류 5건, 종료 코드 2. 실행 중인 구 dev 서버 산출물과 작업 트리 경합 | 테스트됨, NG |
| `verify-basic-flow-e2e.mjs` | localhost:3456, 10/11. 제안의 생성 큐 인계 실패 | 관찰됨, NG |
| `verify-studio-v1-e2e.mjs` | localhost:3456, 14/14 | 관찰됨, 단 구 서버라 현재 커밋 귀속 NG |
| 서버 귀속 | health HTTP 200, DB up, server `5bad0913`, target `7cc7f848` | 관찰됨, NG |
| OpenClaw 표적 테스트 | 의존성 확인이 자동 설치로 번져 중단. 직접 vitest도 2분 이상 종료하지 않아 PID 28607을 종료 | 미검증 |
| 시안과 토큰 | v63 원문, v68 승인 핀, DESIGN v37 실제 파일 대조 | 근거 확인 |
| 삭제 파일 | 고정 순변경에서 삭제 파일 0건. Instagram 직접 생성 제거는 `fix(instagram): route customer card creation to Studio` 커밋에 사유 기록 | 근거 확인 |
| 확정 문구 | 추가 UI diff와 문구 계약 테스트에서 새 긴 대시, 이모지, 영문 단추 라벨 위반 0건 | 테스트됨 |

## 셀프심문

질문: 내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?

답: 외부 발행이 하나도 없는데 자동 워커가 세 채널을 `skipped`로 닫아 작업물 전체를 `published`로 보여 주는 문제다. 이어서 45초가 지난 실제 발행을 화면이 실패로 표시해 재발행을 권하는 문제가 보인다. 둘 다 MAJOR로 확인했으므로 PASS를 줄 수 없다.

SKILLS_USED: review. 고정 범위, 계약 우선 대조, 독립 동시성·발행·UI·검증기 공격 검토, 거짓 성공 역검증에 사용했다.
SKILLS_SKIPPED: 자동 수정과 외부 Codex 재호출은 실행하지 않았다. 사용자가 코드 수정 금지를 명시했고 현재 실행 모델이 Codex라 독립 읽기 전용 검토자로 대체했다.
SOURCES: https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/ , https://www.postgresql.org/docs/16/explicit-locking.html , https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol , https://nodejs.org/api/fs.html , `pipeline-state.osmu.md`, `DESIGN.md`, v63 요구 시안, v68 승인 시안, `wiki/거버넌스/요청.md`, `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`
MODEL: gpt-codex/gpt-5
KNOWLEDGE_QUERY: BRAIN의 ZERO-ONE Marketing Studio 고객과 OSMU 루프, 레포의 승인 핀, 발행 정확성, 돈과 멱등 제약을 좁혀 조회했다. 웹에서는 API 자원 한도, PostgreSQL 잠금, resumable upload, 파일 시스템 원자성의 공식 문서를 조회했다.
HITS_USED: BRAIN `idea-zero-one-marketing-studio.md`는 생성, 다채널 발행, 성과, 다음 제안 루프 확인에 사용했다. 사업 좌표 59행은 프로세스 메모리 몫 금지의 직접 계약이라 사용했다. PostgreSQL 공식 문서는 영속 lease 대안, OWASP는 비용과 자원 한도, YouTube 문서는 결과 불명 업로드 복구 대조에 사용했다.
HITS_REJECTED: v63과 v68의 순수 시각 표현 차이는 자동 MAJOR로 쓰지 않았다. PRD 비승인 참고본은 계약 근거에서 제외했다. 현재 미커밋 네 방 검증기 변경은 24시간 고정 커밋 diff의 결함 수에 넣지 않고 검증 증거에만 남겼다.
CONFLICTS: 과제는 v63 대조를 명시하지만 pipeline 최신 승인 핀은 v68이다. 두 산출물과 DESIGN v37이 함께 확정한 네 방 상시 이동, 56px 접힘, 결과 보존만 계약으로 적용했다.

## 4축 판정

- 승인 시안 이탈: 지적 1건
- 회귀 위험: 지적 9건
- 토큰 위반: 지적 1건
- 무기록 삭제: 문제없음

REVIEW_VERDICT: BLOCK
