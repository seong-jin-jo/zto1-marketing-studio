# 2026-10-02 베이스 이미지를 Alpine → Debian(bookworm-slim)으로 바꿨다. 근거: Remotion
# 공식 Docker 가이드(remotion.dev/docs/docker, WebFetch 확인)는 `node:22-bookworm-slim` +
# apt로 Chrome 의존 라이브러리 설치 + `npx remotion browser ensure`를 권장한다. Alpine
# 그대로는 실제로 안 됐다 — 컨테이너 안에서 직접 재현: BusyBox의 `setpriv`가 Remotion이
# 브라우저 프로세스를 띄울 때 쓰는 `--pdeathsig` 옵션을 모른다("setpriv: unrecognized
# option: pdeathsig", troubleshooting 링크까지 그대로 뜬다). glibc(Debian)와
# musl(Alpine)이 섞이면 Next 자신의 네이티브 SWC 바이너리도 깨지므로 builder 스테이지도
# 함께 Debian으로 옮겼다(한쪽만 바꾸면 플랫폼이 어긋난다).
FROM node:20-bookworm-slim AS builder
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
# 독립 리뷰(Dockerfile, 배포 위험): node_modules 전체(COPY --from=builder .../node_modules)를
# 런타임 이미지로 통째로 옮기므로(아래 주석 참고) devDependencies(vitest·playwright·
# @types/* 등 — 런타임엔 안 쓰임)까지 그대로 끌려간다. 배포 러너 디스크가 49GB에 여유
# 16GB뿐이고 이게 콜드 빌드(캐시 없음)라 용량을 더 줄여야 한다. typecheck:ci·build가
# 이미 끝난 뒤라 devDependencies를 지워도 빌드 결과물(.next, node_modules의 런타임
# 패키지)에는 영향이 없다. Remotion 실행 패키지(remotion/@remotion/bundler/
# @remotion/renderer/@remotion/player)는 모두 package.json dependencies에 있다(devDependencies
# 아님) — prune 뒤에도 남는다(package.json 실측 확인).
RUN npm prune --omit=dev

FROM node:20-bookworm-slim
ARG BUILD_COMMIT="unknown"
LABEL org.opencontainers.image.revision=$BUILD_COMMIT
# ffmpeg = 영상 자막 굽기(api/video/subtitle)와 내레이션 합성(lib/higgsfield addNarration)의
# 실행기. fonts-noto-cjk = 그 자막을 한글로 그릴 글꼴.
#
# 2026-09-14 확인: 이 이미지에 둘 다 없었다. 그래서 발행 대기 중인 영상에 자막이 한 자도
# 없었고(내려받아 프레임을 떠서 확인) 내레이션 합성도 조용히 실패하고 있었다. 편집실에는
# 자막 크기를 고르는 자리가 있는데 결과물에는 자막이 없는 상태였다. 글꼴이 없으면 ffmpeg 은
# 한글을 네모로 그리므로 실행기만 넣는 것으로는 부족하다. 둘은 같이 들어와야 한 기능이 된다.
#
# 아래 lib*는 Remotion 공식 Docker 가이드가 Chrome Headless Shell 구동에 필요하다고
# 명시한 목록(Puppeteer/Playwright가 Debian에서 Chrome을 띄울 때 쓰는 표준 의존 세트와
# 동일 계열)이다.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg fonts-noto-cjk ca-certificates curl gnupg \
    libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2 libpango-1.0-0 libcairo2 libgtk-3-0 fonts-liberation libu2f-udev \
  && rm -rf /var/lib/apt/lists/*
# 독립 리뷰(Dockerfile, 배포 위험): `docker.io`(Debian 자체 패키지)는 데몬·containerd·
# runc까지 끌고 와(apt-cache show 실측: Installed-Size 147MB + 의존 패키지) 이 앱이
# 실제로 쓰는 건 CLI 클라이언트 하나뿐이다(src/app/api/*/route.ts가 호스트 소켓
# /var/run/docker.sock에 대고 `docker restart <container>`만 호출 — 데몬은 호스트가
# 이미 띄우고 있다). bookworm 기본 저장소에는 CLI 단독 패키지가 없다(apt-cache search
# '^docker' 실측 확인) — Docker 공식 저장소의 `docker-ce-cli`만 CLI 단독이라 그걸 쓴다
# (docs.docker.com/engine/install/debian/ 절차).
RUN install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
  && chmod a+r /etc/apt/keyrings/docker.asc \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
     > /etc/apt/sources.list.d/docker.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends docker-ce-cli \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# remotion/entry.ts는 @remotion/bundler가 런타임에 경로 문자열로 읽는다(정적 import가
# 아니라 Next의 standalone 파일 트레이싱이 못 따라간다) — 명시적으로 복사해야 한다.
COPY --from=builder /app/remotion ./remotion
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# Next standalone 파일 트레이싱은 @remotion/bundler가 webpack 설정 안에서 동적으로
# require.resolve()하는 형제 패키지(@remotion/studio, mediabunny 등 전이 의존성)와
# rspack의 플랫폼별 네이티브 바인딩(@rspack/binding-*)을 추적하지 못한다(2026-10-02
# 컨테이너 안 실측 — 하나 고치면 다음 모듈이 없다는 식으로 3단계 연속 실패:
# @rspack/binding → @remotion/studio → mediabunny). 트레이싱 갭을 하나씩 쫓는 대신
# builder가 `npm ci`로 완전히 설치한 node_modules로 standalone의 가지친 사본을
# 통째로 덮는다 — 이미지가 커지지만 Remotion 쪽 의존 그래프를 다시 추적하는 비용보다
# 싸고, 누락 재발이 구조적으로 없다.
COPY --from=builder /app/node_modules ./node_modules
# Chrome Headless Shell을 빌드 시점에 내려받아 이미지 레이어에 굳힌다(Remotion 공식
# 가이드의 `npx remotion browser ensure`와 같은 일을 한다 — 이 레포는 CLI 패키지
# `@remotion/cli`를 안 쓰고 `remotion`(코어 라이브러리)만 의존하므로, CLI 대신
# `@remotion/renderer`가 직접 내보내는 `ensureBrowser()` API를 node -e로 호출한다).
# 운영 컨테이너가 런타임에 인터넷에서 내려받게 하지 않는다 — 그 전제가 안 맞아서 Alpine
# 패키지로 대체했던 것인데, 이제 Debian으로 옮겼으니 Remotion이 직접 관리하는 바이너리를
# 쓸 수 있고 REMOTION_CHROME_PATH도 필요 없다(자동으로 캐시된 경로를 찾는다).
RUN node -e "require('@remotion/renderer').ensureBrowser().then(() => console.log('chrome headless shell ready')).catch((e) => { console.error(e); process.exit(1); })"
# claude CLI — generateText의 폴백 경로(테넌트 Anthropic 키 미등록 시 `claude -p`).
# 내부 4앱은 이 폴백으로 운영(운영자 Max 구독). 인증(~/.claude OAuth)은 런타임 볼륨 마운트로 주입:
#   compose에 `- ~/.claude:/root/.claude:ro` (호스트가 사전 인증 필요 — 운영자 액션).
# 테넌트가 자기 API 키를 등록하면 그 경로(HTTP API)로 가므로 claude CLI 불필요.
RUN npm install -g @anthropic-ai/claude-code
# 이미지·영상 생성기. 2026-09-06 실측으로 운영 컨테이너에 이 실행기가 없어 고객이 카드뉴스를
# 만들 수 없다는 것이 드러났다(생성 요청이 곧바로 502). 자격증명은 이미지에 넣지 않고
# claude 와 같은 방식으로 호스트에서 읽기 전용 마운트한다.
RUN npm install -g @higgsfield/cli
CMD ["sh", "-c", "PORT=${DASHBOARD_PORT:-34560} node server.js"]
