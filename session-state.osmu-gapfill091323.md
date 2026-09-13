# OSMU 성과 시계열 갭 build 인계

## 2026-09-13 23시 08분 KST · 소스 수정 전 승인 차단 확인

handoff_basis: 회장 요청 원문. 기존 tmux pane과 공용 상태는 동시 작업 여부 확인에만 사용했다.

### 결론

두 갭 감사의 최신 갱신과 현재 구현을 대조했다. 생성, 편집, 발행, 성과 제안 인계,
학습 판단, 일곱 플랫폼 성과 수집은 이미 구현돼 있다. 지금도 없는 항목은 게시물별 성과
시계열 snapshot과 재현 가능한 30일 비교 하나다.

제품 소스, migration, 테스트, 갭 재확인 문서, QA tracker는 수정하지 않았다. 현재 공정은
`qa`, 승인 아님이고 데이터 모델은 성과 시계열을 별도 계약으로 남긴다. 전용 테이블,
기존 행 JSONB 누적, provider 기간 재조회 중 어느 선택도 승인되지 않았다. 이는 워커가
단독으로 확정하면 안 되는 DB 스키마와 API 계약이다.

### 직접 관찰

- 지정 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`로 localhost:3456의
  `GET /api/metrics`를 호출했다.
- HTTP 200, 최상위 키는 `coverage`, `posts`, 게시물 0건이었다.
- `history`와 `comparison`은 모두 없었다.
- 같은 NG와 승인 차단은 `docs/qa/qa-tracker.md`의 2026-09-13 07시 04분 절에 이미
  기록돼 있어 중복 기록하지 않았다.

### 설계 전 결정할 것

1. 저장 방식: tenant와 게시물 FK를 가진 append-only snapshot 테이블을 추천한다.
2. 멱등성: 게시물, provider, 관찰 구간을 기준으로 중복 수집을 막아야 한다.
3. 시간 의미: 수집 시각과 provider 적용 기간을 분리해야 한다.
4. 비교 의미: 요청 시점, 시작과 끝, 포함 게시물 수, 결측과 데이터 지연을 응답에 밝혀야 한다.
5. 보존 정책: 고객 자산 보존 원칙과 원자료 비용을 함께 반영해야 한다.

### 다음 실행

소유자는 컨트롤러와 tech-architect다. 성과 이력 저장 계약과 30일 비교 의미를 합의하고
eng-design 산출물과 build 공정을 승인한다. 그 뒤 code-builder가 migration, 수집 성공 시
snapshot write, history와 comparison 읽기 API, 정상·거절·경합 계약 테스트를 구현한다.
종료 증거는 localhost 실요청, 전체 Vitest, TypeScript, 기본 흐름 E2E 두 개다.

### 검증 상태

- 관찰됨: localhost `GET /api/metrics` HTTP 200, `coverage`와 `posts`만 반환.
- 근거 확인: `published_posts`는 최신 누계와 `metrics_at`만 보존하며 게시물별 이력 테이블이 없다.
- 근거 확인: YouTube Analytics는 날짜와 영상 차원의 기간 조회를 지원하지만 TikTok 영상 조회는
  현재 누계 지표 중심이므로 일곱 provider 공통 비교 계약을 대신하지 못한다.
- 미검증: 새 기능, migration, 단위·통합 테스트, 두 E2E, 운영 배포. 구현하지 않았다.

SKILLS_USED: 없음. 설치된 스킬 중 Next.js 성과 시계열 build에 직접 대응하는 스킬 없음.
SKILLS_SKIPPED: qa는 QA 단계 소유이며 기존 NG를 실제 요청으로 재확인하는 데 그쳤다.

KNOWLEDGE_QUERY: OSMU 기본 흐름, 게시물별 성과 시계열, 재현 가능한 30일 비교, YouTube 기간별 영상 성과, TikTok 영상 누계 성과 계약.
HITS_USED: 두 갭 감사, OSMU 사업 좌표, 데이터 모델, YouTube Analytics 공식 문서, TikTok Video Query 공식 문서를 차단 근거로 채택했다.
HITS_REJECTED: 일반 마케팅 자료와 다른 벤처 문서는 DB 및 API 계약의 직접 근거가 아니어서 제외했다.
CONFLICTS: 회장 정본과 외부 공식 API의 방향 충돌은 없다. provider별 시간 축 차이 때문에 공통 30일 비교 저장 계약이 별도로 필요하다.

SOURCES: `docs/_archive/legacy-20260912/audit/osmu-gap-recheck-2026-08-28.md` | `docs/_archive/legacy-20260912/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md` | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `dashboard/src/app/api/metrics/route.ts` | `dashboard/db/schema.sql` | https://developers.google.com/youtube/analytics/dimensions | https://developers.google.com/youtube/analytics/reference/reports/query | https://developers.tiktok.com/doc/tiktok-api-v2-video-query/

MODEL: gpt-codex/GPT-5 / code-builder
