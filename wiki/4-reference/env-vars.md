# Environment Variables & Configuration

## 편집실 v2 S2 카드 렌더 기능 플래그 (2026-10-05)

- `CARD_DECK_V3_RENDER_ENABLED`: 서버의 CardDeckV3 PNG 렌더·발행 허용 플래그.
- `NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED`: 브라우저 편집실 진입·발행 UI 플래그. Next.js 빌드 시 Docker build arg로 고정된다.
- 두 값이 모두 존재하면 둘 다 `1` 또는 `true`여야 활성화된다. 값이 다르거나 미설정이면 fail-closed하여 기존 CardDeckV3 발행 차단을 유지한다.
- 운영 전환은 두 값을 같은 배포에서 함께 바꾸고, 화면 장면과 서버 PNG의 픽셀 비교를 통과한 이미지에서만 수행한다.

## 로컬과 운영의 OSMU 주입 경계 (2026-08-29)

- 운영은 GitHub Secrets의 `OSMU_DATABASE_URL`, `OSMU_SUPABASE_URL`, `OSMU_SUPABASE_ANON_KEY`를 배포 workflow가 `.env.osmu`로 렌더한다. `NEXT_PUBLIC_SUPABASE_*`는 브라우저 bundle에 들어가므로 Docker build 시점 주입이 필수다.
- 로컬은 `dashboard/.env.local`의 `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 사용한다. 2026-08-29 점검 당시 DB URL은 있었지만 Supabase 공개값 두 개가 없어서 `/api/auth/google`이 HTTP 503을 반환했다.
- `~/.sj-agent-harness/secrets/openclaw-auto.env`에는 운영자 토큰만 있다. Supabase 공개값은 `scripts/recover-osmu-local-public-env.mjs`가 운영 공개 번들과 Supabase settings를 교차 검증한 뒤 기존 `dashboard/.env.local`을 보존하며 권한 600으로 주입한다. 감독은 이 복구가 실패하면 값 없는 앱을 기동하지 않는다.

## 현행 범주 (2026-08-25)

아래 목록은 대표값이며 완전한 목록이 아니다. 실제 사용 여부는 코드 검색과 배포 환경 inventory로 확인한다.

- 인증·테넌트: `OSMU_SECRET_KEY`, Supabase URL·anon/service-role 계열, operator/dashboard token 계열
- OAuth: Threads, Instagram, Facebook, X, YouTube, LinkedIn, Naver, Pinterest, Tumblr, TikTok, Slack, LINE provider별 client/app ID와 secret
- 분석·연동: GA, Google Search Console, Naver Search Advisor, Slack webhook 계열
- 미디어·생성: Higgsfield, R2, Midjourney, ElevenLabs·영상 runner 계열
- 공개 origin: `OSMU_PUBLIC_URL`

변수명은 `dashboard/src`, `scripts`, workflow·compose 예시의 환경 참조가 정본이며 실제 값은 문서에 기록하지 않는다.

## Core (from CLAUDE.md)
- `THREADS_ACCESS_TOKEN`, `THREADS_USER_ID`
- `X_API_KEY`, `X_API_KEY_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`
- `INSTAGRAM_ACCESSTOKEN`, `INSTAGRAM_USERID`
- `MIDJOURNEY_DISCORD_TOKEN`, `MIDJOURNEY_CHANNEL_ID`, `MIDJOURNEY_SERVER_ID`
- `R2_*` (access, secret, bucket, endpoint, public url)
- `OPENCLAW_GATEWAY_TOKEN`
- `DASHBOARD_PORT` (default 3456)
- `DASHBOARD_AUTH_TOKEN`
- `VIRAL_THRESHOLD` (default 500)

## LLM / Agent
- `config/openclaw.json` → agents.defaults.model (primary + fallbacks)
- Per-job model override in jobs.json

## Shorts / Video
- `CLAUDE_BIN`
- `LONGFORM_*` (CHUNK_CHARS, PER_CHUNK, MAX_CANDIDATES, TIMEOUT)
- `VIDEO_DASHBOARD_URL`
- ElevenLabs config in data/elevenlabs-config.json

## Development
- Stage Controller 단계 게이트가 기본 절차다. gstack 설치 여부는 실행 환경별 선택 사항이다.

## Tenant-specific
Loaded via dashboard settings or data/ per workspace.

Never commit real values. Use .example files.

For full list and verification logic, see src/lib/verify-channel.ts and dashboard settings APIs.
