FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# NEXT_PUBLIC_* 는 빌드 시점에 클라 코드에 인라인됨(런타임 env로는 안 들어감).
# 고객 로그인용 Supabase 공개키를 빌드 arg로 주입해야 createBrowserSupabase 동작.
ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=""
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
# GA4 client tracking measurement ID (공개값 — 클라 번들에 baking 안전). 미설정 시
# dashboard/src/lib/analytics/ga.ts의 gaEnabled=false → 전체 트래킹 no-op(스크립트 미로드).
# GitHub secret 이름: OSMU_GA4_MEASUREMENT_ID (.github/workflows/deploy-marketing.yml 참고).
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID=""
ENV NEXT_PUBLIC_GA_MEASUREMENT_ID=$NEXT_PUBLIC_GA_MEASUREMENT_ID
# next build의 중복 검사는 이웃 OpenClaw 테스트 의존성을 설치하지 않는 이미지에서 제외한다.
# 대신 같은 builder stage와 같은 소스에서 CI 전용 타입 검사를 먼저 통과해야 빌드가 시작된다.
RUN npm run typecheck:ci && npm run build

FROM node:20-alpine
ARG BUILD_COMMIT="unknown"
LABEL org.opencontainers.image.revision=$BUILD_COMMIT
# ffmpeg = 영상 자막 굽기(api/video/subtitle)와 내레이션 합성(lib/higgsfield addNarration)의
# 실행기. font-noto-cjk = 그 자막을 한글로 그릴 글꼴.
#
# 2026-09-14 확인: 이 이미지에 둘 다 없었다. 그래서 발행 대기 중인 영상에 자막이 한 자도
# 없었고(내려받아 프레임을 떠서 확인) 내레이션 합성도 조용히 실패하고 있었다. 편집실에는
# 자막 크기를 고르는 자리가 있는데 결과물에는 자막이 없는 상태였다. 글꼴이 없으면 ffmpeg 은
# 한글을 네모로 그리므로 실행기만 넣는 것으로는 부족하다. 둘은 같이 들어와야 한 기능이 된다.
RUN apk add --no-cache docker-cli ffmpeg font-noto-cjk
# claude CLI — generateText의 폴백 경로(테넌트 Anthropic 키 미등록 시 `claude -p`).
# 내부 4앱은 이 폴백으로 운영(운영자 Max 구독). 인증(~/.claude OAuth)은 런타임 볼륨 마운트로 주입:
#   compose에 `- ~/.claude:/root/.claude:ro` (호스트가 사전 인증 필요 — 운영자 액션).
# 테넌트가 자기 API 키를 등록하면 그 경로(HTTP API)로 가므로 claude CLI 불필요.
RUN npm install -g @anthropic-ai/claude-code
# 이미지·영상 생성기. 2026-09-06 실측으로 운영 컨테이너에 이 실행기가 없어 고객이 카드뉴스를
# 만들 수 없다는 것이 드러났다(생성 요청이 곧바로 502). 자격증명은 이미지에 넣지 않고
# 호스트에서 마운트한다. CLI가 잠금 파일과 갱신 자격증명을 써야 하므로 compose에서 이 경로만
# 쓰기 허용한다. 이미지 계층에는 자격증명을 넣지 않는다.
RUN npm install -g @higgsfield/cli
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
CMD ["sh", "-c", "PORT=${DASHBOARD_PORT:-34560} node server.js"]
