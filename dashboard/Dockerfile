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
RUN npm run build

FROM node:20-alpine
ARG BUILD_COMMIT="unknown"
LABEL org.opencontainers.image.revision=$BUILD_COMMIT
RUN apk add --no-cache docker-cli
# claude CLI — generateText의 폴백 경로(테넌트 Anthropic 키 미등록 시 `claude -p`).
# 내부 4앱은 이 폴백으로 운영(운영자 Max 구독). 인증(~/.claude OAuth)은 런타임 볼륨 마운트로 주입:
#   compose에 `- ~/.claude:/root/.claude:ro` (호스트가 사전 인증 필요 — 운영자 액션).
# 테넌트가 자기 API 키를 등록하면 그 경로(HTTP API)로 가므로 claude CLI 불필요.
RUN npm install -g @anthropic-ai/claude-code
# 이미지·영상 생성기. 2026-09-06 실측으로 운영 컨테이너에 이 실행기가 없어 고객이 카드뉴스를
# 만들 수 없다는 것이 드러났다(생성 요청이 곧바로 502). 자격증명은 이미지에 넣지 않고
# claude 와 같은 방식으로 호스트에서 읽기 전용 마운트한다.
RUN npm install -g @higgsfield/cli
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
CMD ["sh", "-c", "PORT=${DASHBOARD_PORT:-34560} node server.js"]
