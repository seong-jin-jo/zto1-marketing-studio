# openclaw-auto — 기술 가이드

Claude Agent와 개발자가 참고하는 기술 문서. 사용법은 README.md 참고.

## 작업 하네스 (필수 규율 — 모든 작업에 항상 적용)

이 3가지는 사용자가 명시한 최상위 규율이다. 협상 대상이 아니다.

1. **E2E 선통과 후 보고.** 새 기능을 만들거나 수정하면, 그 동작을 검증하는 E2E/테스트
   스크립트를 먼저 작성하고 **통과시킨 뒤에** 보고한다. "구현했다"가 아니라 "스크립트로
   통과를 증명했다"가 완료 기준. (발행 흐름은 `dashboard/tests/publish/*` + `npm run test:publish`,
   인증은 `dashboard/tests/api/me.test.ts`, RLS는 `tests/isolation/*`. UI는 gstack `browse`로
   라이트/다크 검수.) 로컬에서 검증 불가한 경우(예: DB/Supabase 없음)는 그 사실을 명시하고
   배포 환경 `browse`로 검증한다.
2. **문서화를 잊지 않는다.** 작업이 끝나면 `wiki/`(SSOT)와 스키마 계층 문서
   (`wiki/architecture/data-model.md` 등)에 반영한다. 채널/인증/발행 구조 변경은 해당 wiki
   페이지를 갱신한다.
3. **재실행 가능한 작업 기록.** 진행 중인 작업은 `wiki/ops/session-state.md`에 항상 최신으로
   기록해, 세션이 죽거나 재실행돼도 30초 안에 이어갈 수 있게 한다. (무엇을/어디까지/다음 단계/
   보류 항목/배포 상태.)

품질 > 실행 속도. 증명 없이 다음으로 넘어가지 않는다. 막히면 멈추고 보고(추측 금지).

### Agent/tmux 핸드오프 규칙

- **Claude/Codex가 작업을 시작/재개/전환할 때:** 먼저 `CLAUDE.md`,
  `wiki/ops/session-state.md`, `git status --short --untracked-files=no`를 읽고, 사용자가
  지목한 tmux pane 또는 이 레포/태스크와 관련된 pane을 `tmux list-panes` +
  `tmux capture-pane`으로 확인한다. 단, **무엇을 기준으로 이어갈지는 사용자가 정한다.**
  tmux pane과 `session-state.md` 둘 다 가능하거나 기준이 불명확하면, 에이전트가 추론으로
  선택하지 말고 사용자에게 어느 handoff source를 따를지 묻고 진행한다.
- **전환은 세션 시작 때만 발생하지 않는다.** Codex가 새 작업을 시작한 뒤 Claude가 이어받거나,
  Claude가 작업 중 Codex가 이어받을 수 있다. 따라서 작업 중에도 새 태스크 착수, 방향 전환,
  의미 있는 구현 단위 완료, 장시간 작업, 멈춤/보고 직전마다 `wiki/ops/session-state.md`를
  갱신한다.
- **다시 Claude/Codex tmux 세션으로 돌려줄 때:** 종료 전 `wiki/ops/session-state.md`에
  현재 태스크, 사용자가 선택한 handoff 기준(tmux pane id 또는 `session-state.md`), 변경 파일,
  검증/보류, 정확한 다음 액션을 적어 둔다. 다음 에이전트는 이 파일만 읽어도 30초 안에 재개
  가능해야 한다. tmux transcript는 보조 맥락일 뿐, 재개에 필요한 핵심 상태는 항상 파일에 남긴다.
- `.claude/settings.json`의 `Stop` hook은 최종 보고 직전 이 체크리스트를 한 번 막아서 상기한다.

## 공통 레포 정책

이 레포는 서비스 중립적 공통 플랫폼. 코드, 커밋, PR에 특정 서비스 URL/사용자명/브랜드명/API 키를 포함하지 않는다. Custom Integration은 fork에서 추가.

## 아키텍처

```
OpenClaw Cron → Claude Agent → Tool Registry
                                 ├── threads_publish   (Threads API 발행)
                                 ├── x_publish          (X API v2, OAuth 1.0a)
                                 ├── instagram_publish  (Instagram Graph API)
                                 ├── threads_queue      (queue.json CRUD, 멀티채널)
                                 ├── threads_style      (style-data.json RAG)
                                 ├── threads_insights   (반응 수집 + 터진 글 감지)
                                 ├── threads_search     (외부 인기글 수집)
                                 ├── threads_growth     (팔로워 추적)
                                 ├── image_upload       (R2 이미지 업로드)
                                 ├── card_generator     (카드뉴스 생성)
                                 ├── midjourney_image   (Midjourney 이미지 생성)
                                 ├── blog_queue         (블로그 큐)
                                 └── 15개 채널 publish extensions
```

## 대시보드

Next.js (App Router) + TypeScript. 구조:

```
dashboard/src/
  app/                    # App Router — 페이지 + API routes
    api/                  #   REST API endpoints (channel-config, queue, guide, keywords 등)
    channels/             #   채널별 capability에 따른 페이지·탭
    blog/                 #   블로그 관리
    images/               #   에셋 갤러리
    settings/             #   채널 연결, AI Engine, Notifications, Account
    page.tsx              #   Marketing Home
    layout.tsx            #   루트 레이아웃 + 사이드바
  components/             # React 컴포넌트 (공유 UI)
  lib/                    # 유틸리티, 상수, API 헬퍼, 채널 설정
  hooks/                  # 커스텀 React hooks
  types/                  # TypeScript 타입 정의
  store/                  # 상태 관리

dashboard/legacy/         # Flask 호환용 (점진적 제거 예정)
  server.py               #   Flask API 서버
  static/                 #   레거시 프론트엔드
```

주요 페이지:
- Performance Home / Studio / 승인 Inbox / 발행 Calendar: 성과 관제, 콘텐츠 제작, 검토, 일정 확인
- 채널별 페이지: Threads는 Queue / Analytics / Growth / Popular / Settings 전체 제공. 일반 소셜·영상은 Growth / Popular 비활성, Instagram은 Editor 추가, Messaging은 Settings 중심
- Videos / Images / Blog: 영상 작업대, 에셋 갤러리, 블로그 큐
- Blog Performance / Keyword Planner / Naver Trends / Google Trends: 분석·키워드 조사
- Services / Operator: 서비스 전환과 별도 운영자 고객 관리
- Settings: 채널 연결 + AI Engine + Notifications + Account

인증: `DASHBOARD_AUTH_TOKEN` 설정 시 로그인 필수. 미인증 시 랜딩페이지.

## 레거시 전환 로드맵

### Phase 1 (현재): Flask + Next.js 병행
- `dashboard/legacy/server.py` — Flask API 서버 (기존 크론잡/extension이 호출)
- `dashboard/src/` — Next.js 프론트엔드 + API routes (신규 기능)
- 두 서버가 동시에 실행, Next.js가 일부 API를 Flask로 프록시

### Phase 2: Docker를 Next.js로 전환
- Next.js API routes가 Flask API를 완전 대체
- `server.py`의 모든 엔드포인트를 `src/app/api/`로 마이그레이션
- Docker Compose에서 Flask 컨테이너 제거

### Phase 3: legacy/ 삭제
- `dashboard/legacy/` 디렉토리 완전 제거
- Next.js 단일 서버로 운영

### fork 주의사항
- 새 기능은 반드시 `src/`에 추가
- `server.py` 수정 시 `src/app/api/`에도 동일 기능 반영 (이중 구현)
- Phase 2 전환 시 `server.py` 코드는 삭제 대상

## 멀티채널 발행 구조

### 크론잡: `multi-channel-publish`
```
1. threads_queue action=get_approved → 발행 대상 글
2. 각 글에 대해:
   ├── Threads: threads_publish → update_channel(threads, published)
   ├── X: 280자 자동 압축 → x_publish → update_channel(x, published)
   ├── Instagram: 이미지 첨부 → instagram_publish → update_channel(instagram, published)
   └── 채널 비활성/미연결 → update_channel(channel, skipped)
3. 모든 채널 완료 → top-level status 자동 갱신
4. cleanup: 오래된 published/failed 정리
```

새 채널 추가 시 publish extension만 enabled하면 크론잡이 자동 감지하여 발행.

### Queue 스키마 (v2)
```json
{
  "status": "approved",
  "channels": {
    "threads": { "status": "pending", "mediaId": null, "publishedAt": null, "error": null },
    "x": { "status": "pending", "tweetId": null, "publishedAt": null, "error": null },
    "instagram": { "status": "pending", "publishedAt": null, "error": null }
  }
}
```

### 채널별 Content Guide + Keywords
```
data/
  prompt-guide.txt          ← 공통 (모든 채널 기본값)
  prompt-guide.threads.txt  ← Threads 전용 (선택, 없으면 공통 사용)
  prompt-guide.x.txt        ← X 전용 (선택)
  search-keywords.txt       ← 공통
  search-keywords.x.txt     ← X 전용 (선택)
```
- 채널 Settings에서 편집 시 채널 전용 파일로 저장
- "공통에서 복사" 버튼으로 동기화
- API: `GET/POST /api/guide/<channel>`, `GET/POST /api/keywords/<channel>`

## 채널 상태

| 상태 | 뱃지 | 조건 |
|------|------|------|
| Live | 초록 | credential 입력 + 검증 성공 + enabled |
| Connected | 파랑 | credential 입력 + 자동화 미시작 |
| (없음) | - | extension 존재, credential 미입력 |
| Coming Soon | 회색 | extension 미구현 |

### Credential 검증
저장 시 `verify_channel(channel, config)` 호출 → 실제 API로 유효성 확인.
- Threads: `GET /me?fields=username`
- Instagram: `GET /me?fields=username` (Graph API)
- Bluesky: `POST createSession`
- Telegram: `GET /bot{token}/getMe`
- Facebook: `GET /{pageId}?fields=name`
- X: 4개 키 존재 여부 (OAuth 서명 생략)

## 새 채널 추가

1. `extensions/PLATFORM-publish/` 생성 (4파일: package.json, plugin.json, index.ts, tool.ts)
2. `src/app/api/channel-config/route.ts` — `OTHER_CHANNELS`에 채널 추가
3. `src/lib/verify-channel.ts` — 검증 로직 추가
4. `src/lib/setup-guides.ts` — quick + detail 가이드 추가
5. `src/lib/constants.ts` — `CH_LABELS` + `IMPLEMENTED_PLUGINS`에 추가
6. Docker 리빌드 (`OPENCLAW_EXTENSIONS`에 포함)

## AI 엔진 (LLM)

`config/openclaw.json > agents.defaults.model`:
```json
{
  "primary": "anthropic/claude-sonnet-4-6",
  "fallbacks": ["google/gemini-2.5-flash", "ollama/llama3.1:8b"]
}
```

크론잡별 모델 오버라이드: `jobs.json > payload.model`
- 콘텐츠 생성 → Sonnet/Opus (품질 중요)
- 발행/수집/추적 → Haiku (비용 절감)
- 대시보드 Settings > AI Engine에서 GUI 설정

인증: Claude Code Max Plan (OAuth, 자동 refresh). 사용량 한도 초과 시 크론 정지.

## 환경 변수

| 변수 | 설명 |
|------|------|
| `THREADS_ACCESS_TOKEN` | Threads long-lived access token (60일) |
| `THREADS_USER_ID` | Threads user ID |
| `X_API_KEY` / `X_API_KEY_SECRET` | X 소비자 키/시크릿 (OAuth 1.0a) |
| `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | X 액세스 토큰/시크릿 (Read+Write) |
| `INSTAGRAM_ACCESSTOKEN` / `INSTAGRAM_USERID` | Instagram Graph API 토큰/유저 ID |
| `MIDJOURNEY_DISCORD_TOKEN` / `MIDJOURNEY_CHANNEL_ID` / `MIDJOURNEY_SERVER_ID` | Midjourney Discord 연동 |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_ENDPOINT` | 비공개 Cloudflare R2 저장소. 외부 배달은 HMAC 서명 경로 사용 |
| `OPENCLAW_GATEWAY_TOKEN` | Gateway 인증 |
| `DASHBOARD_PORT` | 대시보드 포트 (기본 3456) |
| `DASHBOARD_AUTH_TOKEN` | 대시보드 로그인 토큰. 미설정 시 인증 비활성화 |
| `OSMU_PUBLIC_URL` | 정본 공개 URL. OAuth redirect_uri를 이 값으로 고정(프록시 뒤 내부주소 오염 방지). 미설정 시 x-forwarded-*→request.url fallback |
| `OAUTH_APP_REVIEW_APPROVED_PROVIDERS` | 앱 심사가 승인된 provider의 쉼표 구분 목록. 예: `threads,instagram`. 여기에 든 provider는 심사 전 초대 안내와 심사 대기 사유를 readiness에서 제거 |
| `VIRAL_THRESHOLD` | 터진 글 기준 views (기본 500) |

## Cron Jobs

| 이름 | 주기 | 모델 | 설명 |
|------|------|------|------|
| `threads-generate-drafts` | 6h | Sonnet | prompt-guide 기반 draft 생성 |
| `multi-channel-publish` | 2h | Haiku | 승인 글 멀티채널 발행 |
| `instagram-generate-drafts` | 6h | Sonnet | Instagram 카드뉴스 콘텐츠 생성 |
| `instagram-auto-publish` | 2h | Haiku | Instagram 이미지 글 자동 발행 |
| `threads-collect-insights` | 6h | Haiku | 반응 수집 + 댓글 좋아요 + 저조 후보 집계(삭제 없음) |
| `threads-fetch-trending` | 주1회 | Haiku | 외부 인기글 수집 |
| `threads-track-growth` | 매일 | Haiku | 팔로워 추적 |

**저조 글 정리(안 터진 글 삭제)는 항상 사람 승낙이 있어야만 일어난다(회장 지시 2026-08-29).**
`threads-collect-insights` 크론(및 `threads_insights` agent 도구의 `cleanup_low_engagement`
액션)은 후보 목록만 계산하고 Threads API에 삭제 요청을 보내지 않는다. 실제 삭제는 대시보드에서
`GET /api/threads/low-engagement-candidates`로 후보를 확인한 사람이 `POST
/api/threads/low-engagement-cleanup`에 직접 고른 postId를 보낼 때만 수행된다.

## UI 규칙

→ **[docs/ui-rules.md](docs/ui-rules.md)** 참고

**중요**: 이 CLAUDE.md는 고수준 기술 개요와 환경 변수 중심입니다. 
**상세 지식, 아키텍처, 결정, 가이드, 제품 비전은 모두 `wiki/` 로 이동/유지관리**됩니다.

wiki/ 가 이 프로젝트의 Single Source of Truth입니다.
- 작업 전: 반드시 wiki/ 관련 섹션 읽기
- gstack 사용 시: "Load gstack. Read wiki/index.md + relevant pages first"

자세한 내용은 wiki/index.md 와 하위 폴더들을 참조하세요.

CLAUDE.md와 별도 관리. 모든 fork가 공유하는 대시보드 UI/UX 기준.

## Project Wiki (지식 조직화)

이 프로젝트의 개발 지식은 `wiki/` 디렉토리를 **Single Source of Truth**로 사용한다.

- **항상 작업 시작 전 wiki/ 읽기**: 아키텍처, 결정(ADR), 가이드, learnings 확인.
- 제품용 Brand Wiki (tenant wiki_docs, 콘텐츠 생성 grounding)와 **구분**.
- 구조: wiki/index.md, wiki/architecture/, wiki/decisions/ (ADR), wiki/product/, wiki/ops/, wiki/guides/, wiki/learnings/.
- 기존 CLAUDE.md / docs/ / README 내용은 wiki/ 로 점진 마이그레이션.
- gstack /document-generate 와 /learn 으로 유지보수.
- 검색: 간단 md + (필요시 grep 또는 향후 RAG).

## gstack Development Process (Garry Tan의 gstack 절차)

모든 **중대 작업** (새 기능, 리팩터, wiki 개선, shorts factory 확대, 아키텍처 변경)은 gstack 절차를 **항상** 따른다.

### 표준 파이프라인
1. **Load gstack** + `/office-hours` — 아이디어 브레인스톰 (6 forcing questions).
2. `/plan-ceo-review` — 비전/스코프 검토.
3. `/plan-eng-review` + `/plan-design-review` + `/plan-devex-review` — 기술/디자인/DX.
4. `/autoplan` — 종합 실행 계획 생성 (CEO+Eng+Design+QA).
5. 계획 승인 후 구현 (gstack-lite: 모든 파일 읽기 → 5줄 플랜 → self-review).
6. `/review` (코드) + `/qa` (gstack browse로 실제 플로우 테스트 + annotated screenshots) + `/cso` (보안).
7. `/ship` 또는 `/land-and-deploy`.
8. `/learn` 으로 패턴/함정/선호 기록 + `/document-generate` 로 문서 보강. wiki/ 업데이트.

### OpenClaw + gstack 연동
- OpenClaw가 Claude Code 세션 spawn 시 gstack 주입.
- AGENTS.md 또는 호출 시 "Load gstack. Run /X" 명시.
- Dispatch tiers:
  - Simple: 10줄 이하.
  - Medium: gstack-lite.
  - Heavy/Full/Plan: 해당 스킬 전체 파이프라인.

### Skill Routing (gstack 추천)
When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → /office-hours
- Strategy/scope → /plan-ceo-review
- Architecture → /plan-eng-review
- Design system/plan review → /design-consultation or /plan-design-review
- Full review pipeline → /autoplan
- Bugs/errors → /investigate
- QA/testing → /qa or /qa-only (browse 사용)
- Code review/diff → /review
- Visual polish → /design-review
- Ship/deploy/PR → /ship or /land-and-deploy
- Docs generate → /document-generate
- Learnings manage → /learn
- Save/restore context → /context-save or /context-restore

이 절차로 "AI가 가상 엔지니어링 팀처럼" 동작하게 한다. Boil the Ocean (완전성) 원칙 준수.
