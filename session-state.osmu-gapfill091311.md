# OSMU 성과 시계열 갭 build 인계

## 2026-09-13 12시 31분 KST · 병렬 QA와 코드 리뷰 회수 반영

### 무엇을 어디까지 했나

- 성과 시계열 갭 자체는 아래 11시 23분 판정과 동일하다. 제품 소스와 DB migration은 수정하지 않았다.
- 병렬 QA는 localhost 네 방 렌더 4/4, 390 라이트·다크와 768·1024·1440 20화면,
  성과실에서 생성실 복귀 5/5를 관찰했다. 검증기의 고정 30초 대기를 설정 가능한 120초로
  정리한 커밋은 `d8a65e3d`, `7e39d0a7`이다.
- 독립 코드 리뷰는 MAJOR 23건으로 `REVIEW_VERDICT: BLOCK`을 냈다. 특히 현행 성과 수집의
  전체 실패 성공 응답과 뒤 batch 실패 시 앞선 성공 폐기는 성과 시계열을 얹기 전에 해소해야 한다.
- 실행 중 백그라운드 위임 0건을 확인했다.

### 남은 이슈·블로커

- 새 게시물별 성과 시계열 저장 계약과 build 공정이 승인되지 않았다.
- 최종 실제 생성 E2E는 공유 AI 월간 한도 소진으로 HTTP 429였다.
- 과제의 v63과 pipeline 승인 핀 v68이 충돌하고, 실제 화면은 v63과 디자인 불일치다.
- 코드 리뷰 MAJOR 23건, 운영 배포, 외부 실발행이 미해결 또는 미검증이다.

### 다음에 칠 명령

컨트롤러가 전용 append-only `post_metric_snapshots` 계약을 기술설계에서 합의하고 build를 승인한다.
그 전에 코드 리뷰의 성과 수집 거짓 성공과 batch 성공 폐기를 먼저 해소한다. 구현 후 아래 11시 23분
절의 테스트와 localhost `history`, `comparison` 관찰을 다시 수행한다.

### 검증했나

- 관찰됨: localhost health HTTP 200, DB up, 네 방 20화면과 복귀 5/5, 위임 0건.
- 테스트됨: Vitest 319파일 2,106건 PASS, 3건 skip, TypeScript PASS, production build 183/183.
- NG: Studio v1 최종 실행 HTTP 429, 디자인 정합, 코드 리뷰 MAJOR 23건.
- 미검증: 성과 시계열 구현, 운영 배포, 외부 실발행.

## 2026-09-13 11시 23분 KST · DB 계약과 build 공정 미승인으로 회수

handoff_basis: 회장 요청 원문. `osmu-gapfill091311:0.0`은 이번 code-builder 위임 실행 pane이다.

## 무엇을 어디까지 했나

- 두 갭 감사, 확정 v63 프로토타입, 현행 요구 대장 포인터와 정본, OSMU 사업 좌표, BRAIN 사업
  허브와 OSMU 페이지, 현재 metrics API와 DB 스키마를 대조했다.
- Threads, X, Instagram 피드, Facebook, Reels, YouTube, Shorts, TikTok 성과 수집과 제안 및
  학습 연결은 이미 구현돼 있다. 남은 기본 흐름 갭은 게시물별 성과 시계열 snapshot과 재현 가능한
  30일 비교 하나다.
- 제품 소스, migration, 테스트, 갭 재확인 문서는 수정하지 않았다. 같은 결함의 NG와 회수 근거는
  이미 `docs/qa/qa-tracker.md` 2026-09-13 07시 04분 절에 기록돼 있다.

## 남은 이슈·블로커

1. `pipeline-state.osmu.md`의 현재 공정은 `qa`이고 build 승인이 열려 있지 않다.
2. 전용 snapshot 테이블, `published_posts.provider_meta` 누적, provider 기간 조회 중 저장 계약이
   확정되지 않았다. 이는 워커가 단독 결정할 수 없는 DB 스키마와 API 계약이다.
3. 사용자 지정 v63 프로토타입과 pipeline의 v68 승인 핀이 충돌한다. 이번 비화면 감사에서 어느
   디자인을 정본으로 승격하지 않았다.
4. 공유 작업트리에 다른 세션의 미커밋 변경이 있어 전수 QA 스킬의 clean-tree gate를 통과하지
   못했다. 다른 세션 변경을 커밋하거나 stash하지 않았다.

추천은 tenant와 게시물 FK를 가진 전용 append-only `post_metric_snapshots` 테이블이다. 일별
멱등 키, provider 관찰 시각과 적용 기간, 원자료 수치, 수집 오류, 보존 기간을 기술설계에서 먼저
확정한다. provider 직접 조회는 YouTube처럼 날짜 차원을 제공하는 채널에는 가능하지만 일곱 채널의
지원 범위와 데이터 지연이 달라 단일 비교 계약을 대신하지 못한다.

## 다음에 칠 명령

전제: 컨트롤러와 회장이 저장 계약을 합의하고 eng-design 산출물과 build 공정을 승인한다.

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio/dashboard
npm run test
npx tsc --noEmit
node scripts/verify-basic-flow-e2e.mjs
node scripts/verify-studio-v1-e2e.mjs
```

구현 범위는 migration, 수집 성공 시 snapshot write, 기간 및 표본이 명시된 읽기 API, 정상·거절·
경합 계약 테스트, localhost `history`와 `comparison` 실측, 갭 재확인·구현현황·QA tracker 갱신이다.

## 검증했나

- 관찰됨: localhost:3456 `/api/health` HTTP 200, `ok:true`, DB `up`.
- 관찰됨: `.env.local` 첫 작업 공간이 요청의 `cd1d0a40-540d-4524-9b49-bf2445d82182`와 일치.
- 관찰됨: 지정 작업 공간 `GET /api/metrics` HTTP 200. 최상위 키는 `posts`, `coverage`뿐이며
  `history`, `comparison`은 없다. 현재 게시물은 0건이다.
- 근거 확인: `dashboard/db/schema.sql`에 게시물별 metrics history 테이블이 없고,
  `published_posts`는 최신 누계와 `metrics_at`만 가진다. `growth_metrics`는 팔로워 시계열이다.
- 미검증: 새 기능 구현, 단위·통합 테스트, 두 E2E, 운영 배포. 구현하지 않았으므로 통과를 주장하지 않는다.

SKILLS_USED: qa. clean-tree gate와 localhost 실측에 사용했고 공유 dirty 작업트리 때문에 수정형 QA는 abort했다.
SKILLS_SKIPPED: build 구현 전용 매칭 스킬 없음.

KNOWLEDGE_QUERY: OSMU 기본 흐름, 성과 시계열, 재현 가능한 30일 비교, YouTube 날짜별 성과 계약.
HITS_USED: BRAIN business index와 OSMU 사업 페이지, 레포 사업 좌표, 두 갭 감사, 데이터 모델,
YouTube Analytics 공식 문서를 채택했다.
HITS_REJECTED: 일반 마케팅 자료와 다른 벤처 문서는 DB 및 API 계약 근거가 아니어서 제외했다.
CONFLICTS: 사용자 지정 v63과 pipeline 승인 v68 디자인 핀이 충돌한다. 회장 정본과 외부 공식 API의
사업 방향 충돌은 없지만 provider 기간 조회가 일곱 플랫폼 공통 snapshot 계약을 대체하지는 못한다.
