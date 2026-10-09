# 운영 Higgsfield HTTP 503 근본원인 및 수정 보고

## 결론

운영 503의 구조적 원인은 OAuth 갱신 토큰을 맥과 서버가 같은 스냅샷으로 공유했고, 서버 컨테이너는 자격 증명 디렉터리를 읽기 전용으로 마운트해 갱신된 토큰을 영속할 수 없었다는 것이다. 서버가 옛 갱신 토큰을 다시 쓰면 세션 계열이 무효화될 수 있으며, 2026-10-09 08:19 KST에 맥 세션까지 함께 죽은 관찰과 부합한다.

컨트롤러는 맥과 분리된 서버 전용 OAuth 세션을 만들고 GitHub 시크릿 `HIGGSFIELD_CREDENTIALS_JSON`을 2026-10-09 00:44:12 UTC에 갱신했다. 코드는 서버 전용 파일을 쓰기 가능 bind mount로 영속하고, 모든 운영 CLI 호출을 하나의 원자적 디렉터리 잠금으로 직렬화한다. 배포 전 생존 판정은 만료 메타데이터만 읽으며, `force_generator_credentials=true`일 때만 시크릿을 파일에 쓴다.

로컬 컨테이너에서 두 CLI 프로세스의 직렬 실행, 죽은 잠금 회수, 살아 있는 잠금의 종료 코드 75, 자격 증명 파일 0600을 직접 관찰했다. 운영 배포, 운영 컨테이너의 DNS/TLS, 실제 이미지 생성은 push 전이므로 미검증이다.

## 원인과 증거

| 관찰 | 판정 |
|---|---|
| 2026-10-08 16:30 UTC 시크릿 갱신 뒤 16:31 deploy run `37809308410`의 계정 탐침 성공 | 당시 스냅샷은 유효했음 |
| 맥 `credentials.json`이 23:19 UTC에 새 만료시각으로 재기록됨 | 맥 CLI가 자격 증명 세트를 갱신함 |
| 같은 옛 시크릿을 다시 배치한 23:19 deploy run `37857533639`가 즉시 종료 코드 2 | 정적 스냅샷 재배치가 복구가 아니라 회귀를 만들었음 |
| Compose가 `${HOME}/.config/higgsfield`를 `:ro`로 마운트 | 서버 CLI가 회전 결과를 호스트 파일에 저장할 수 없었음 |
| diagnose runs `37862950523`, `37863665063`가 `request failed (no response received)` 재현 | 단발성 실패가 아님. 종전 workflow는 pipeline 종료 코드를 잃어 success로 오판 |
| 서버 전용 시크릿 `updated_at=2026-10-09T00:44:12Z` | 맥과 분리된 복구 입력이 준비됨. 값은 조회하지 않음 |

## 변경 표

| 영역 | 변경 전 | 변경 후 |
|---|---|---|
| 자격 증명 영속성 | 컨테이너 bind mount `:ro` | `:rw`, 컨테이너 `user: 0:0`, 디렉터리 0700, JSON 0600/root |
| 갱신 주체 | API, 진단, 탐침이 동시에 CLI 실행 가능 | dashboard 한 컨테이너만 파일을 마운트하고 모든 CLI가 같은 `mkdir` 잠금 경유 |
| 잠금 실패 복구 | 없음 | boot ID, PID, 프로세스 시작시각으로 소유자를 확인해 죽은 잠금만 회수 |
| 배포 생존 판정 | `account status`가 갱신을 유발할 수 있음 | `expires_at` 메타데이터만 읽음 |
| 시크릿 배치 | 실패 또는 파일 부재 시 자동 덮어쓰기 가능 | force 입력일 때만 정확히 1회 쓰기, 그 외 상태는 0회 |
| 진단 | CLI 실패가 pipeline에서 success로 가려짐 | DNS, token 없는 HTTPS, proxy 존재, CLI 버전, 만료시각, 503 분기를 제한된 고정 형식으로 출력 |
| 이미지 빌드 컨텍스트 | 로컬 `node_modules` 심볼릭 링크가 Docker context를 깨뜨릴 수 있음 | `.dockerignore`로 의존성·빌드 산출물 제외 |

## 단일 갱신 주체 확인

- `openclaw-dashboard-osmu`만 Higgsfield 자격 증명 경로를 마운트한다.
- `openclaw-studio-export-worker`는 해당 파일을 마운트하지 않는다.
- 애플리케이션의 `auth token`, `generate create`, `generate get`, 진단 `account status`, 배포 탐침은 모두 `/usr/local/bin/run-higgsfield-locked`를 경유한다.
- 잠금은 공유 bind mount 내부의 `.cli.lock.d`를 원자적으로 만들며, 정상 소유자가 살아 있으면 기다린 뒤 75로 거절한다.
- CLI 명령 제한시간에는 잠금 대기시간을 더해 정상적인 선행 요청 때문에 조기 종료되지 않게 했다.

## 검증

| 항목 | 결과 | 증거 등급 |
|---|---|---|
| 관련 계약 테스트 | 3파일 28건 PASS | 테스트됨, `/tmp/higgsfield-final-contracts.log` |
| 배포 시크릿 분기 | unexpired, expired, missing에서 force=false 쓰기 0회, force=true 쓰기 1회 | 테스트됨 |
| 셸 문법 | probe, lock runtime test, lock wrapper 3파일 `bash -n` PASS | 테스트됨, `/tmp/higgsfield-final-bash-n.log` |
| YAML 및 workflow run block | workflow 2파일 파싱, Bash run block 20개 `bash -n` PASS | 테스트됨, `/tmp/higgsfield-final-yaml.log` |
| Dashboard 이미지 | Next production build 포함 Docker image build PASS | 테스트됨, `/tmp/higgsfield-refresh-docker-build5.log`, 이번 재실행은 사용자 지시에 따라 생략 |
| 실제 컨테이너 잠금 | contenders=2 직렬화, mode=600, stale 회수, live timeout=75 | 관찰됨, `/tmp/higgsfield-refresh-lock-final.log` |
| Compose 해석 | runtime UID 0:0, credential mount RW, lock 경로 확인 | 테스트됨 |
| 운영 배포 및 실제 이미지 생성 | 아직 push 전 | 미검증 |

## 셀프심문과 레드팀

- 이 결론이 틀릴 가장 그럴듯한 이유: 인증 문제와 동시에 운영 호스트의 DNS, TLS, 외부 IP 차단이 발생했을 수 있다. 수정된 branch workflow가 운영에서 실행되기 전까지 이 축은 미검증으로 남긴다.
- 까다로운 운영자 관점의 공격: 파일을 쓰기 가능하게 만든 것만으로 동시 갱신은 해결되지 않는다. 그래서 API, 진단, 배포 탐침의 실제 CLI 진입점을 하나의 wrapper로 모았고, 두 프로세스 경합과 죽은 잠금, 살아 있는 잠금 제한시간을 실제 컨테이너에서 검증했다.
- 가장 하중이 큰 가정: `mkdir` 잠금이 Docker Desktop의 같은 bind mount에서 직렬성을 제공하는가. 처음 채택한 `flock`은 실제 컨테이너 경합에서 겹쳐 실행돼 폐기했고, `mkdir` 구현은 같은 시험에서 정확한 순서를 관찰했다.

## 후속 종료 조건

1. 브랜치를 push하고 `diagnose-generator.yml`을 이 브랜치 ref로 실행한다.
2. 배포 workflow를 `force_generator_credentials=true`로 한 번 실행한다.
3. 운영 컨테이너에서 mount RW, UID 0, mode 600, 계정 탐침 성공을 확인한다.
4. 운영 `/api/higgsfield/image`가 202를 반환하고 작업 완료 뒤 생성실에 실제 미디어가 나타나는지 확인한다.

KNOWLEDGE_QUERY: OSMU Higgsfield 503, OAuth 갱신 토큰 회전, Docker bind mount 쓰기, POSIX mkdir 디렉터리 연산
HITS_USED: `wiki/거버넌스/결정.md`의 서버 전용 세션·단일 갱신 주체 결정, Docker 공식 bind mount 문서의 read-only/read-write 계약, POSIX mkdir·디렉터리 원자성 규정
HITS_REJECTED: 맥 네트워크 성공은 운영 호스트 네트워크 증거가 아니므로 운영 복구 완료 근거로 쓰지 않음. 업스트림 CLI issue는 동일 증상이지만 운영 버전·네트워크를 직접 증명하지 못해 보조 근거로만 유지
CONFLICTS: 기존 배포 주석은 CLI가 갱신 결과를 파일에 쓴다고 했지만 Compose 실물은 해당 경로를 읽기 전용으로 마운트했음

SKILLS_USED: review, 변경 범위·경합·배포 계약 검수
SKILLS_SKIPPED: investigate, 현재 available-skills에 없어 직접 재현과 계약 테스트로 대체
SOURCES/MODEL: gpt-6.1-sol/Codex | `docker-compose.postagi-4tenants.yml` | `.github/workflows/deploy-marketing.yml` | `dashboard/scripts/run-higgsfield-locked.sh` | https://docs.docker.com/engine/storage/bind-mounts/ | https://pubs.opengroup.org/onlinepubs/9799919799/functions/mkdir.html

🏷 STAMP | line: osmu | 생성: 2026-10-09 13:20 KST | model: gpt-6.1-sol | agent: code-builder | skill: review
근거: 운영 run 4건, 시크릿 metadata, 계약 28건, Docker build, 컨테이너 경합 실측, 공식 Docker·POSIX 문서 | 고민: 실제 bind mount에서 직렬화되지 않은 `flock`을 폐기하고 관찰된 `mkdir` 잠금으로 교체했다.
