# tenant2·3·4 게이트웨이 영속 경로 이전

STAMP: 2026-09-28 13:21 KST | model: gpt-codex/GPT-5 | agent: code-builder | skill: review | 근거: `.pr93-review3.md`, Docker Compose bind mount 계약, rsync 문서 | 고민: 무중단 회수와 임의 중단 재개를 포기하고, 짧고 검증 가능한 정지형 절차로 운영 위험을 줄였다.

## 목적과 범위

tenant2·3·4의 gateway와 dashboard가 체크아웃 안의 `config-tenantN`, `data-tenantN` 대신 `${HOME}/openclaw-persist`를 직접 사용하게 한다. legacy tenant1과 OSMU named volume은 변경하지 않는다. 운영 서버 작업은 UID 1000 계정에서 2분 이내 유지보수 창을 잡고 한 번만 수행한다.

## 실행 전 확인

1. 현재 체크아웃 루트에 tenant2·3·4의 `config-tenantN`, `data-tenantN` 여섯 디렉터리가 모두 있어야 한다.
2. `${HOME}/openclaw-persist/.env.tenant2~4`가 존재하고 비어 있지 않아야 한다.
3. `docker compose`와 `rsync`가 설치돼 있어야 한다.
4. 자동 배포를 잠시 중지하고 아래 명령을 체크아웃 루트에서 실행한다.

```bash
OPENCLAW_PERSIST_ROOT="${HOME}/openclaw-persist" bash migrate-postagi-persist-mounts.sh
```

스크립트는 다음 순서로 실행된다.

1. tenant2·3·4의 gateway와 dashboard 여섯 컨테이너를 최대 30초 유예로 정지한다.
2. 기존 persist의 여섯 config/data를 `backup-pre-cutover-<시각>.<임의값>`에 백업한다.
3. 체크아웃의 여섯 config/data를 persist에 `rsync --delete`로 복사하고 config 0700, data 0750을 적용한다.
4. 기존 이미지를 새 마운트로 강제 재생성하고 최대 60초 동안 Compose health를 확인한다.

성공하면 `이전 완료. 백업: <경로>`가 출력된다. 실패하면 즉시 중단하며 stderr에 백업 복구 명령과 재기동 명령을 출력한다. 복사 전 실패는 persist를 바꾸지 않으므로 출력된 재기동 명령만 실행한다. 복사 도중 또는 health 실패는 출력된 백업 복구 명령을 먼저 실행한 뒤 재기동한다.

## 종료 확인

```bash
docker compose -f docker-compose.postagi-4tenants.yml ps \
  openclaw-gateway-tenant2 openclaw-dashboard-tenant2 \
  openclaw-gateway-tenant3 openclaw-dashboard-tenant3 \
  openclaw-gateway-tenant4 openclaw-dashboard-tenant4
docker logs --since 5m openclaw-gateway-tenant2 2>&1 | grep -F EACCES || true
docker logs --since 5m openclaw-gateway-tenant3 2>&1 | grep -F EACCES || true
docker logs --since 5m openclaw-gateway-tenant4 2>&1 | grep -F EACCES || true
```

여섯 서비스가 running 또는 healthy이고 세 gateway의 최근 로그에 `EACCES`가 0건이면 자동 배포를 다시 연다. 백업은 다음 정상 배포과 상태 쓰기 확인 전까지 보존한다.

SOURCES/MODEL: gpt-codex/GPT-5 | `.pr93-review3.md`, `docker-compose.postagi-4tenants.yml`, `migrate-postagi-persist-mounts.sh`, https://docs.docker.com/reference/cli/docker/compose/up/, https://rsync.samba.org/documentation.html
