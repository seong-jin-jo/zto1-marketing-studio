# OSMU build log

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
