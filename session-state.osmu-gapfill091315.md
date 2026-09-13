# OSMU 성과 시계열 갭 build 인계

## 2026-09-13 15시 05분 KST · 동일 승인 차단 재확인

handoff_basis: 회장 요청 원문. `osmu-gapfill091315:0.1`은 이번 code-builder 위임 실행 pane이다.

### 무엇을 어디까지 했나

- 두 갭 감사의 최신순 갱신과 현재 소스를 대조했다. 생성, 편집, 발행, 성과 제안 인계,
  학습 판단, 일곱 플랫폼 성과 수집은 이미 구현돼 있다.
- 감사에서 지금도 남은 기본 흐름 갭은 게시물별 성과 시계열 snapshot과 재현 가능한 30일 비교
  하나다.
- localhost:3456의 지정 작업 공간으로 `GET /api/metrics`를 다시 호출했다. HTTP 200 응답의
  최상위 키는 `posts`, `coverage`이고 `history`, `comparison`은 없다.
- 제품 소스, migration, 테스트, 갭 재확인 문서는 수정하지 않았다. 같은 결함과 차단은 이미
  `docs/qa/qa-tracker.md`의 2026-09-13 07시 04분 절에 등록돼 있어 중복 기록하지 않았다.

### 남은 이슈·블로커

1. `pipeline-state.osmu.md`의 현재 공정은 `qa`, 승인 아님이다. 이번 요청이 정한
   "build가 허용된 범위에서만 소스 수정" 조건을 충족하지 않는다.
2. 현행 `published_posts`는 최신 누계와 `metrics_at`만 보존하고 게시물별 이력 저장소가 없다.
3. 전용 append-only 테이블, 기존 JSONB 누적, provider 기간 재조회 중 어느 계약도 승인되지
   않았다. 게시물 식별자, 멱등 키, 관찰 시각과 기간, 보존 기간, 결측 처리, 30일 비교 기준을
   정해야 하므로 워커가 단독 확정할 수 없는 DB 스키마와 API 계약이다.
4. 같은 차단은 `session-state.osmu-gapfill091307.md`와
   `session-state.osmu-gapfill091311.md`에서 이미 두 차례 확인됐다.

추천은 tenant와 게시물 FK를 가진 append-only `post_metric_snapshots` 테이블이다. 수집 시각과
provider 적용 기간을 분리하고, 동일 게시물·provider·관찰 구간의 멱등 키를 두며, 원자료 수치와
결측 사유를 함께 보존한다. 30일 비교는 요청 시점, 비교 시작·끝, 포함 게시물 수와 데이터 지연을
응답에 밝혀야 한다.

### 다음 실행

소유자는 컨트롤러와 tech-architect다. 성과 이력 저장 계약과 30일 비교 의미를 합의하고
eng-design 산출물과 build 공정을 승인한다. 그 뒤 code-builder가 migration, 수집 성공 시 snapshot
write, history와 comparison 읽기 API, 정상·거절·경합 계약 테스트를 구현하고 localhost 실요청,
전체 Vitest, TypeScript, 두 기본 흐름 E2E를 실행한다.

### 검증

- 관찰됨: localhost:3456 `GET /api/metrics` HTTP 200, 최상위 키 `coverage`, `posts`, 게시물 0건.
- 근거 확인: `history`, `comparison` 없음. `dashboard/db/schema.sql`에 게시물별 성과 이력 테이블 없음.
- 근거 확인: YouTube Analytics는 `day`와 `video` 차원의 기간 조회를 제공하지만, TikTok 영상 조회는
  현재 누계값만 제공하므로 일곱 provider 공통 30일 계약을 대신하지 못한다.
- 미검증: 새 기능, migration, 단위·통합 테스트, 기본 흐름 E2E, 운영 배포. 구현하지 않았다.

SKILLS_USED: 없음. 설치된 스킬 중 Next.js 성과 시계열 build에 직접 대응하는 스킬 없음.
SKILLS_SKIPPED: qa는 QA 단계 소유이며, 기존 QA tracker NG와 localhost 실요청을 재확인하는 데 그쳤다.

KNOWLEDGE_QUERY: OSMU 기본 흐름, 게시물별 성과 시계열, 재현 가능한 30일 비교, YouTube 일별 영상 성과, TikTok 영상 누계 성과 계약.
HITS_USED: BRAIN OSMU 사업 좌표, 두 갭 감사, 데이터 모델, YouTube Analytics 공식 문서, TikTok Video Query 공식 문서를 저장 계약 차단 근거로 채택했다.
HITS_REJECTED: 일반 마케팅 자료와 다른 벤처 문서는 DB 및 API 계약의 직접 근거가 아니어서 제외했다.
CONFLICTS: 회장 정본과 외부 공식 API의 방향 충돌은 없다. provider마다 기간 차원이 달라 공통 30일 비교의 저장 계약이 별도로 필요하다.
