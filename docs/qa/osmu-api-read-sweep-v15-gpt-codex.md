# OSMU API 읽기 경로 전수 실사 v15

STAMP: 2026-09-16 17:57 KST | model: gpt-codex/gpt-5 | agent: qa-verifier | skill: qa | 근거: localhost 106회 실요청, 전체 회귀, 격리 프로덕션 빌드, RFC 9110, Next.js 공식 문서 | 고민: HTTP 500만 세지 않고 HTTP 200 오류 본문과 빈 정상 배열을 분리했다.

한 줄 결론: 최신 실행본 `50ac3341`에서 읽기 경로 105개에 GET 105회와 HEAD 1회를 보냈고, 정상 88건과 계약상 거절 18건, 예상 밖 응답 0건, HTTP 500 0건을 관찰했다.

## 범위와 실행 귀속

- 대상: `dashboard/src/app/api/**/route.ts` 중 읽기를 내보내는 Route Handler 전부
- 실행 주소: `http://localhost:3456`
- 작업 공간: `cd1d0a40-540d-4524-9b49-bf2445d82182`
- 실행 커밋과 검사 커밋: `50ac3341aea889bf3430d8319c48c6ee08fb1346`, 일치
- listener PID: 시작과 종료 모두 `19902`
- Route Handler 소스 합성 SHA-256: 시작과 종료 모두 `543d24a0c96c9b44c85335f67a471f1c56d3984a28af25fc2a16171e376e1541`
- 기계 판독 원본: `logs/diff/osmu-api-read-sweep-20260916-v15/api-read-sweep-final.json`

## 최초 결함과 수정

| 경로 | 수정 전 관찰 | 수정 후 관찰 | 판정 |
|---|---|---|---|
| `/api/blog-stats` | 미설정 오류 본문을 HTTP 200으로 반환 | HTTP 503, `BLOG_NOT_CONFIGURED` | 고장 수정 |
| `/api/elevenlabs-voices` | API 키 누락 오류 본문을 HTTP 200으로 반환 | HTTP 503, `ELEVENLABS_NOT_CONFIGURED` | 고장 수정 |
| `/api/ga-analytics` | 서비스 계정 누락 오류 본문을 HTTP 200으로 반환 | HTTP 503, `GA_NOT_CONFIGURED` | 고장 수정 |
| `/api/gsc-analytics` | 서비스 계정 누락 오류 본문을 HTTP 200으로 반환 | HTTP 503, `GSC_NOT_CONFIGURED` | 고장 수정 |
| `/api/images` | HTTP 200 빈 배열을 검사기가 오류로 오판 | HTTP 200 `[]`, 정상 배열로 판정 | 검사기 수정 |

네 Route Handler는 설정 누락을 503, 상류 공급자 실패를 502로 분리한다. 기존 정상 데이터와 캐시 성공 응답은 유지했다. 검사기는 빈 배열도 유효한 정상 목록으로 인정하고, 경로별 의도된 거절은 상태코드와 본문 표식을 함께 확인한다.

## 2026-08-28 실사와 차이

| 기준 | 2026-08-28 | 2026-09-16 v15 | 차이 |
|---|---:|---:|---:|
| 문서상 고유 GET 경로 | 84 | 105 | +21 |
| HEAD 별도 실행 | 0 | 1 | +1 |
| 총 메서드 실행 | 84 | 106 | +22 |
| 실사 중 발견한 HTTP 500 | 2, 수정 후 0 | 0 | 최종 동일 |
| HTTP 200 오류 본문 | 미기록 | 최초 4, 수정 후 0 | 본문 계약 신설 |
| 호출값 누락 | 3 | 0 | 작업 공간과 경계값 고정 |
| 실행본 귀속 | 실행 중 앱 서술 | 커밋, PID, 소스 해시 전후 일치 | 증거 강화 |
| 기계 판독 원본 | 없음 | JSON 106건 | 재현 가능 |

과거 문서는 경로 84개라고 적었지만 결과 표의 79, 2, 2, 3 합은 86이다. 과거 정상과 거절 건수를 현재 분모와 직접 비교하지 않았다. 신뢰 가능한 비교는 문서상 경로가 84개에서 105개로 늘었고, 과거 HTTP 500 두 건과 현재 HTTP 500이 최종 0건이라는 점이다.

## 회귀 증거

| 검증 | 판정 | 관찰 증거 |
|---|---|---|
| 전 경로 live 요청 | PASS | 105경로, 106요청, 정상 88, 계약상 거절 18, 예상 밖 0, HTTP 500 0 |
| 네 방 기본 흐름 | PASS | localhost 실요청 11/11 |
| Studio v1 계약 | PASS | localhost 실요청 14/14 |
| 표적 회귀 | PASS | 신규 2파일 12건 |
| `npm run test` | PASS | 371파일, 2,385건 통과, 조건부 3건 제외 |
| `npx tsc --noEmit` | PASS | 종료 코드 0 |
| `npm run build` | PASS | 실행 서버와 `.next` 충돌을 피한 격리 사본에서 184/184 생성 |
| schema, seed, RLS | PASS | 지정 작업 공간 멱등 시드, 확장 2개와 `osmu_service` 확인 |
| `/api/health` | PASS | HTTP 200, DB up, 실행 커밋 일치 |
| 디자인 lint | PASS | 토큰 위반 0 |
| 390px 브라우저 스모크 | PASS | 로그인 HTTP 200, 화면 렌더 관찰, 콘솔 오류 0 |
| mobile typecheck | 미해당 | mobile 또는 Expo 패키지 없음 |
| Maestro | 미해당 | 모바일 앱과 Maestro 흐름 없음 |

## UI 계승과 제품 전체 판정

과제 지정 v63 프로토타입, 디자인 README, UI architecture, screen inventory, user flow, captures manifest를 읽었다. 이번 수정은 API 상태 계약과 검사기만 바꾸며 화면 배치와 인터랙션은 바꾸지 않는다. 390px 로그인 렌더를 관찰했고 신규 영문 단추 라벨은 없다.

과제 지정 v63과 canonical pipeline의 승인 디자인 v68 핀이 충돌하고 기존 디자인 정합 행렬의 NG가 남아 있다. 따라서 API 읽기 범위는 PASS지만 디자인 QA와 제품 전체 QA는 NG를 유지한다. 운영 배포의 동적 URL, 외부 공급자 실제 자격증명 성공, 외부 채널 실발행도 미검증이다.

## 요청 번호 승계

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68 | 성과 읽기와 데이터 진실성 | API-READ-ALL-V15 | PASS | `/api/metrics`를 포함한 106건 계약 일치 |
| R98 | 운영 대시보드와 읽기 기능 보존 | API-READ-ALL-V15 | PASS | 운영 읽기 경로 포함, 예상 밖 상태 0 |
| R104 | QA 자격증명과 임시 데이터 정리 | API-READ-AUTH-V15 | PASS | `.env.local` 사용, 비밀값 기록 0, 경계 fixture만 사용 |
| R200 | 성과실 데이터 읽기 | API-READ-PERFORMANCE-V15 | PASS | `/api/metrics`와 학습 읽기 HTTP 200 |
| R207 | 성과실 학습 정보와 후속 행동 | API-READ-LEARNING-V15 | PASS | 학습 읽기 HTTP 200, 기본 흐름 11/11 |
| R01부터 R207 및 세부 요청 232건 중 이번 범위 밖 | 회장 확정 요구 전건 | REQ-ALL-V15 | 이월 | 요구 정본 판정을 유지한다. 이번 API 수정으로 판정이 바뀐 항목은 위 다섯 건이다. |

## 페르소나 결정 1문항

문항: 비기술 대표가 빈 데이터와 서비스 고장을 구분해 다음 행동을 결정할 수 있는가.

답: 이번 네 경로는 구분할 수 있다. 설정 누락은 503, 공급자 실패는 502, 유효한 빈 목록은 HTTP 200 빈 배열로 분리했다. 실제 외부 공급자 연결 성공은 미검증이다.

## 벤치마크 적용

- RFC 9110의 502 상류 실패 의미를 공급자 실패에 적용했다: https://www.rfc-editor.org/rfc/rfc9110.html
- Next.js Route Handler의 HTTP 메서드 계약에 따라 GET과 HEAD를 별도 분모로 실행했다: https://nextjs.org/docs/app/getting-started/route-handlers
- Next.js Backend for Frontend 지침을 따라 상류 실패를 성공 본문으로 숨기지 않았다: https://nextjs.org/docs/app/guides/backend-for-frontend
- BRAIN의 사일런트 실패 원칙과 MSA 테스트 전략을 적용해 live 관찰과 회귀 테스트를 분리했다.

## 레드팀과 셀프심문

레드팀: HTTP 500이 0이어도 HTTP 200 본문 안에 오류가 남으면 이번 실사는 거짓 성공이다. 상태코드뿐 아니라 오류 키, 성공 표식, 배열 계약, 경로별 거절 본문까지 판정하고 회귀 테스트로 고정했다.

셀프심문: 이 결론이 틀렸다면 가장 그럴듯한 이유는 미설정 503을 허용 목록으로 남용했거나 실제 공급자 실패 502를 live로 보지 않은 점이다. 네 503은 정확한 오류 코드와 본문을 고정했고 나머지 경로는 예상 밖 응답 0으로 관찰했다. 502는 회귀 테스트 증거이며 운영 외부 계정 동작은 미검증으로 남겼다.

SOURCES: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `docs/_archive/legacy-20260912/audit/openclaw-api-live-sweep-2026-08-28.md` | `docs/qa/qa-tracker.md` | RFC 9110 | Next.js Route Handlers | BRAIN `concept-훅-사일런트-실패-게이트-무력화.md` | BRAIN `concept-MSA-테스트-전략-유닛-통합-계약-E2E.md`

MODEL: gpt-codex/gpt-5

RUBRIC_SCORE: 완결성=5/5 정밀성=5/5 벤치마크=5/5 추적성=5/5 전문성=4/5 total=24/25

WEAKEST_LINE: "공급자 실패 502는 실제 자격증명을 소비하는 live 요청이 아니라 회귀 테스트로 검증했다."

SKILLS_USED: qa, 전수 live 탐색과 증거 기반 수정 및 회귀 검증에 사용 / SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: BRAIN business 허브에서 API 실패 진실성, 사일런트 실패, 통합·계약·E2E 테스트 전략을 검색했다.

HITS_USED: `concept-훅-사일런트-실패-게이트-무력화.md`는 HTTP 200 오류 은폐 방지에, `concept-MSA-테스트-전략-유닛-통합-계약-E2E.md`는 live와 회귀 증거 분리에 사용했다.

HITS_REJECTED: 마케팅 레버리지와 해외 벤치마킹 문서는 이번 API QA의 상태 계약 판정과 직접 관련이 없어 반영하지 않았다.

CONFLICTS: RFC 9110에서 503은 주로 일시적 과부하나 유지보수를 뜻한다. 이 프로젝트는 기존 `/api/auth/google` 계약과 일관되게 준비되지 않은 외부 연동도 503으로 표현하며, 외부 공급자 통신 실패는 502로 분리한다.
