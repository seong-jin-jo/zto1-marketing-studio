# OSMU build log

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
