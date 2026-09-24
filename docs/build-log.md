# OSMU build log

## 2026-09-25 07:42 KST · 편집실 v70 1단계 EDIT-TEXT·EDIT-CARD

STAMP: 2026-09-25 07:42 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: ship, review | 근거: `docs/design/design-spec-editroom-v70.md`, v70 hub prototype, ADR-007, Canva 직접 편집 도움말, X·Meta 공식 상한 문서 | 고민: 글의 불필요한 구조 조작을 없애고 카드 문구를 결과물 위에서 한 번에 고치게 하되 기존 자동저장과 숨겨진 음악 데이터는 보존했다.

| 검증 | 명령·대상 | 결과 |
|---|---|---|
| 타입 | `npm run typecheck:ci` | PASS, 종료 코드 0 |
| 표적 회귀 | 편집실·저장 route Vitest 10파일 | PASS, 52건 |
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
