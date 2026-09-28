# 멀티 인스턴스 운영 가이드

> 1 인스턴스 = 1 서비스(테넌트). 각 테넌트는 별도 본계정 + 별도 채널 credential + 별도 cron 일정으로 운영.
> 실제 브랜드명/도메인/핸들은 공개 레포에 넣지 않는다 — fork-local `data/tenants.json`과 `.env.{slug}`에서 설정.
> (0차에서는 osmu SaaS 단일 대시보드 중심, 멀티 인스턴스는 선택)

## 왜 인스턴스 분리인가

openclaw v3.0 설계는 **1 인스턴스 = 1 서비스** (네이티브 멀티 테넌트는 v4.0 예정).
여러 서비스를 서로 다른 본계정으로 동시 운영하려면 컨테이너 분리가 정합.

| 테넌트(예시) | 슬러그 | 주 채널 | Dashboard 포트 | Gateway 포트 |
|---|---|---|---|---|
| Tenant One (기존) | tenant1 | IG + Threads | 34560 | 18789 |
| Tenant Two | tenant2 | IG + Threads | 34561 | 18790 |
| Tenant Three | tenant3 | IG | 34563 | 18792 |
| Tenant Four | tenant4 | X | 34564 | 18793 |

> 슬러그·포트·채널은 fork에서 자유롭게 정의. 위 표는 예시.

## 1회 셋업 (~5분)

```bash
cd <repo-root>

# 1. ~/openclaw-persist 아래 data/config + templates + .env.{slug} 생성
bash bootstrap-postagi-4tenants.sh

# 2. 인스턴스 가동 (build 1회 + 컨테이너 시작, ~5분)
export DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)"
docker compose -f docker-compose.postagi-4tenants.yml up -d --build

# 3. 컨테이너 상태 확인
docker compose -f docker-compose.postagi-4tenants.yml ps
```

## Cloudflare Tunnel 라우트 추가

`cloudflared` config 또는 dashboard에서 (도메인은 예시 — 실제 값은 fork-local):

```yaml
ingress:
  - hostname: marketing-tenant2.example.com
    service: http://localhost:34561
  - hostname: marketing-tenant3.example.com
    service: http://localhost:34563
  - hostname: marketing-tenant4.example.com
    service: http://localhost:34564
```

(또는 임시 — `ssh -L 34561:localhost:34561 user@server` 로컬 포워딩만으로도 가능)

## 채널 credential 입력 (테넌트별)

각 dashboard 접속 → Settings → Channels에서 입력:

| 채널 | 입력할 것 |
|---|---|
| Instagram | Instagram Graph API access token |
| Threads | Threads access token |
| X | X API key/secret + Bearer token |

> Meta App Review 통과 전이면 Instagram 채널 미연결 — dashboard에서 manual 콘텐츠 생성만 가능.

## prompt-guide 활성화

각 테넌트 dashboard → Settings → Content Guide:
- `${OPENCLAW_PERSIST_ROOT:-$HOME/openclaw-persist}/data-{slug}/prompt-guide.txt`에 박혀 있음 (bootstrap 스크립트가 자동 복사)
- 채널별 오버라이드 필요하면 dashboard에서 직접 편집

## Cron 자동화 ON

각 dashboard → Settings → Automation:
- 콘텐츠 생성: 6시간 주기 (기본)
- 발행: 2시간 주기 (승인된 글)
- 반응 수집: 6시간 주기

> 테넌트별로 단계적 ON 권장 — 채널 검수(Meta 등)/법무 검토가 필요한 서비스는 통과 후 활성화.

## 메모리 / 디스크 예상

| 항목 | 1 인스턴스 | 4 인스턴스 |
|---|---|---|
| RAM | ~500MB | ~2GB |
| 디스크 (data/config) | ~50MB | ~200MB |
| 빌드 시간 | 5분 | 5분 (image 공유) |

WSL2 런너에서 충분 (16GB+ 권장).

## 트러블슈팅

- **dashboard 접근 불가** — Cloudflare Tunnel 라우트 + 포트 매핑 확인
- **콘텐츠 생성 실패** — AI Engine 설정에서 Claude/GPT API 키 입력 확인
- **발행 실패** — Settings → Channels의 access token 만료 여부 확인 (보통 60일)
- **포트 충돌** — 기본 인스턴스(34560)와 겹치지 않게 34561~ 사용
- **영속 경로 오류** — Linux에서는 gateway의 `node` 사용자와 같은 UID 1000 계정으로 bootstrap·배포를 실행하고, config는 0700·data는 0750을 유지. 대시보드는 UID 1000으로 실행하며 Docker 소켓 GID는 배포가 자동 주입한다.

기존 checkout 상대 마운트에서 전환하는 첫 배포는 tenant2·3·4 컨테이너가 아직 실행 중일 때 `bash migrate-postagi-persist-mounts.sh`를 UID 1000 운영 계정으로 실행한다. 이 도구는 컨테이너를 pause해 쓰기를 동결하고, 살아 있는 삭제 bind mount에서 최신 config/data를 회수한 뒤 영속 `.env.tenantN`과 검증 표식을 만든다. 스냅샷이 끝나면 unpause 후 즉시 정지하며, 실패하면 자동 unpause한다. 이미 컨테이너가 멈췄다면 삭제된 마운트는 자동 회수하지 않고 기존 영속 백업 복원을 요구한다. 성공 전에는 기존 영속 경로를 교체하지 않으며, 이전 영속 경로는 백업 폴더로 옮긴다. 이 절차 없이 배포하면 워크플로가 데이터 손실을 막기 위해 실패한다.
