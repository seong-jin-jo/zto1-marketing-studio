# 운영 Higgsfield HTTP 503 근본원인 및 수정 보고

## 2026-10-09 PR 136 Claude 재리뷰 5건 처리

이 절은 아래 1차 교차 리뷰 기록보다 우선한다. 1차의 Docker Desktop bind mount `flock` 수치는 운영 Linux bind mount의 배타성을 증명하지 못하므로 운영 증거에서 제외했다. 운영 Linux runner 검증은 **미검증, 운영 러너 복구 후 실행**이다.

| 번호 | 등급 | 지적 | 처리 | 증거 |
|---|---|---|---|---|
| 1 | CRITICAL | 비root 배포 러너가 root:root 0700 자격 증명 디렉터리의 lock 파일을 직접 열어 배포가 중단됨 | 배포 전환용 lock holder 컨테이너가 root로 동일 bind mount 안의 `flock`을 획득하고, 러너는 Docker API로 준비 여부만 확인한다. 정상 경로는 삭제를 3회 확인하고, 러너 강제 종료 때는 step 20분보다 긴 30분 상한과 `--rm`으로 고아 lock을 회수한다. dashboard 미포함 선택 배포는 holder 없이 정상 종료한다. | 권한 000 합성 디렉터리에서 추출한 셸이 호스트 파일 접근 없이 Docker 호출을 구성하는 계약은 성공했다. holder 삭제 실패와 holder 미생성 선택 배포 경계도 통과했다. 실제 비root Linux runner는 미검증이다. |
| 2 | MAJOR-A | CLI의 실제 갱신 기준 60~90초와 애플리케이션의 5분 보호 구간 사이에서 실제 명령이 잠금 없이 갱신할 수 있음 | 잠금 아래 `auth token` 뒤 만료시각을 다시 읽고, 여전히 5분 이내면 이어지는 실제 CLI 명령도 같은 커널 파일 잠금으로 실행한다. | 만료 2분 fixture에서 미갱신이면 `true`, 갱신 뒤 1시간이면 `false`인 경계 계약 성공. |
| 3 | MAJOR-B | 10ms 임계구역과 `set -e`가 겹침·경쟁자 실패를 놓칠 수 있음 | lock과 sentinel을 컨테이너 내부 파일시스템으로 옮기고 임계구역을 0.5초로 늘렸다. 각 경쟁자 종료 코드를 수집해 실패 1건도 전체 실패로 판정한다. | 로컬 Linux 컨테이너: `critical_seconds=0.5 contenders=4 rounds=50 overlaps=0 events=400 contender_failures=0 lock_timeout_status=75`. |
| 4 | MINOR-1 | 만료 access token과 살아 있는 refresh token을 확인 없이 force 교체하고 백업이 무한 누적됨 | 기존 파일이 `missing` 또는 `invalid`가 아니면 모두 2차 확인을 요구한다. 성공·복원 뒤 최신 백업 3개만 남긴다. | force 상태 행렬, 만료 상태 거절, 백업 보존 계약 성공. |
| 5 | MINOR-2 | monitor 종료 코드 75·127이 무한히 보류돼 조용한 장애가 될 수 있음 | 연속 보류 횟수를 cache에 저장하고 3회째부터 3회 간격으로 별도 Slack 경보를 보낸다. 정상·장애 판정 시 횟수를 0으로 초기화한다. | Bash 판정 12건과 workflow 계약 7건 성공. |

### R2 검증 요약

최종 독립 재검수에서 임시 holder의 5분 수명이 배포 제한시간보다 짧은 문제와 holder가 없는 선택 배포에서 정리 함수가 종료 코드 1을 반환하는 문제를 추가 발견했다. holder는 20분 step보다 긴 30분 상한과 `--rm`을 사용하고, 명시 정리는 삭제 확인 실패를 배포 실패로 전파한다. holder 미생성 경로는 명시적으로 성공을 반환하며 두 경계 모두 계약 테스트에 포함했다. 재검수 결과는 `NO FINDINGS`다.

| 항목 | 결과 | 증거 등급 |
|---|---|---|
| 관련 계약 테스트 | 5파일 59건 성공 | 테스트됨, `/tmp/higgsfield-r2-vitest.log` |
| monitor 순수 Bash | 12건 성공 | 테스트됨, `/tmp/higgsfield-r2-static.log` |
| 셸·YAML | 관련 셸 `bash -n`, workflow YAML 3개 파싱 성공 | 테스트됨, `/tmp/higgsfield-r2-static.log` |
| 파이프라인 산출물 검사 | 상태파일 2개의 실체·슬롯키·버전 정합 성공, 기존 핀 위생 경고 28건 | 근거 확인, `/tmp/higgsfield-r2-artifact-lint.log` |
| 로컬 잠금 스트레스 | 4경쟁자×50회, 0.5초, 겹침 0, 이벤트 400, 경쟁자 실패 0 | 관찰됨, 로컬 컨테이너 내부 경로, `/tmp/higgsfield-r2-lock-stress.log` |
| 운영 Linux bind mount | runner 오프라인 | 미검증, 운영 러너 복구 후 실행 |
| 운영 배포·실제 생성 | 실행하지 않음 | 미검증 |

## 2026-10-09 PR 136 Claude 교차 리뷰 9건 처리

| 번호 | 등급 | 지적 | 처리 |
|---|---|---|---|
| 1 | CRITICAL | `mkdir` stale 회수의 판정·이동 경쟁 | owner 파일과 stale 회수를 제거하고 커널 `flock`으로 교체했다. wrapper 내부 명령 제한시간을 추가했고 실제 컨테이너에서 경쟁자 4개×50회, 임계구역 200회, 이벤트 400건, 겹침 0을 관찰했다. |
| 2 | MAJOR | force 교체의 백업·검증·복원·2차 확인 부재 | 살아 있는 파일은 별도 입력 없이는 거절한다. 잠금 안에서 `credentials.json.bak-<UTC>` 0600 백업, 원자 교체, `account status` 확인, 실패 시 자동 복원을 수행한다. |
| 3 | MAJOR | monitor가 75·127을 로그인 만료로 오분류 | 두 종료 코드를 `hold`로 분류해 기존 상태를 유지한다. 장애 알림은 서버 재로그인, 새 서버 전용 세션 발급, 시크릿 갱신, force 배포 순서를 명시한다. |
| 4 | MAJOR | 모든 생성·조회 직렬화와 거짓 자동 재시도 문구 | 만료가 5분 넘게 남으면 생성·조회는 잠금 없이 실행하고, 임박할 때만 `auth token`을 잠금 아래 선갱신한다. 접수 화면은 1초·2초 간격으로 실제 두 번 재시도하며 소진 문구를 별도로 표시한다. |
| 5 | MINOR | JSON 파싱 오류의 입력 일부 로그 노출 | 파싱 예외를 고정 문구 `invalid credential JSON`으로 치환했다. 입력 원문은 출력하지 않는다. |
| 6 | MINOR | compose 기동·진단 timeout이 갱신 중 CLI를 절단 | dashboard 기동은 같은 host `flock`을 기다린다. 진단과 탐침은 wrapper 내부 timeout에 명령 수명을 맡긴다. |
| 7 | MINOR | credential 파일 부재 원인 불명 | 최종 생존 확인 전에 파일 존재·비어 있지 않음을 확인하고 전용 오류를 출력한다. |
| 8 | MINOR | 자식 명령의 종료 코드 75도 BUSY로 오분류 | wrapper가 잠금 대기 실패 때만 `HIGGSFIELD_LOCK_BUSY` 표식을 쓰고, 애플리케이션은 종료 코드와 표식이 함께 있을 때만 BUSY로 분류한다. |
| 9 | MINOR | 결정 ID 충돌 | Higgsfield 결정을 `OD-2026-10-09-3`으로 변경하고 브랜치 초안 OD-1의 스냅샷 덮어쓰기 방식을 폐기한다고 명시했다. |

## 결론

운영 503의 구조적 원인은 OAuth 갱신 토큰을 맥과 서버가 같은 스냅샷으로 공유했고, 서버 컨테이너는 자격 증명 디렉터리를 읽기 전용으로 마운트해 갱신된 토큰을 영속할 수 없었다는 것이다. 서버가 옛 갱신 토큰을 다시 쓰면 세션 계열이 무효화될 수 있으며, 2026-10-09 08:19 KST에 맥 세션까지 함께 죽은 관찰과 부합한다.

컨트롤러는 맥과 분리된 서버 전용 OAuth 세션을 만들고 GitHub 시크릿 `HIGGSFIELD_CREDENTIALS_JSON`을 2026-10-09 00:44:12 UTC에 갱신했다. 코드는 서버 전용 파일을 쓰기 가능 bind mount로 영속하고, 자격증명 갱신 구간만 커널 `flock`으로 직렬화한다. 배포 전 생존 판정은 만료 메타데이터만 읽으며, `force_generator_credentials=true`일 때만 검증·자동 복원 가능한 경로로 시크릿을 파일에 쓴다.

로컬 Linux 컨테이너의 내부 파일시스템에서 경쟁자 4개를 50회 실행해 0.5초 임계구역 겹침 0, 이벤트 400건, 경쟁자 실패 0, 살아 있는 잠금의 종료 코드 75, 자격 증명 파일 0600을 직접 관찰했다. 이 결과는 Docker Desktop bind mount의 배타성을 증명하지 않는다. 운영 Linux runner의 동일 bind mount 재현, 운영 배포, 운영 컨테이너의 DNS/TLS, 실제 이미지 생성은 미검증이다.

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
| 갱신 주체 | API, 진단, 탐침이 동시에 refresh 가능 | dashboard 한 컨테이너만 파일을 마운트하고 만료 임박 refresh만 같은 `flock` 경유 |
| 잠금 실패 복구 | 사용자 공간 owner 판정과 stale 회수 경쟁 | 커널이 파일 설명자 수명으로 원자 획득·자동 해제, 자식은 wrapper 내부 timeout 적용 |
| 배포 생존 판정 | `account status`가 갱신을 유발할 수 있음 | `expires_at` 메타데이터만 읽음 |
| 시크릿 배치 | 실패 또는 파일 부재 시 자동 덮어쓰기 가능 | force 입력과 살아 있는 파일 2차 확인, 0600 백업, 쓰기 후 계정 확인, 실패 자동 복원 |
| 진단 | CLI 실패가 pipeline에서 success로 가려짐 | DNS, token 없는 HTTPS, proxy 존재, CLI 버전, 만료시각, 503 분기를 제한된 고정 형식으로 출력 |
| 이미지 빌드 컨텍스트 | 로컬 `node_modules` 심볼릭 링크가 Docker context를 깨뜨릴 수 있음 | `.dockerignore`로 의존성·빌드 산출물 제외 |

## 단일 갱신 주체 확인

- `openclaw-dashboard-osmu`만 Higgsfield 자격 증명 경로를 마운트한다.
- `openclaw-studio-export-worker`는 해당 파일을 마운트하지 않는다.
- 만료가 5분 이내인 애플리케이션 선갱신, 진단 `account status`, 배포 탐침과 force writer는 `/usr/local/bin/run-higgsfield-locked`를 경유한다. 만료가 5분 넘게 남은 `generate create/get`은 잠금 없이 실행한다.
- 잠금은 공유 bind mount 내부 파일에 대한 커널 `flock`이며, 획득 실패 때 종료 코드 75와 전용 표식을 함께 반환한다.
- wrapper는 명령 자체를 제한시간으로 감싸 멈춘 CLI가 잠금을 무기한 점유하지 못하게 한다.

## 검증

| 항목 | 결과 | 증거 등급 |
|---|---|---|
| 관련 계약 테스트 | 5파일 59건 성공. Linux 컨테이너 안 wrapper 통합 계약도 실행됨 | 테스트됨, Docker 격리 Vitest 실행 |
| 배포 시크릿 분기 | unexpired, expired, missing에서 force=false 쓰기 0회, force=true 쓰기 1회. 빈 값·잘못된 JSON·token 누락·공백·비문자열은 기존 파일 보존 | 테스트됨 |
| 셸 문법 | probe, lock runtime test, lock wrapper 3파일 `bash -n` PASS | 테스트됨, `/tmp/higgsfield-standard-dev-bash.log` |
| YAML 및 workflow run block | workflow 2파일 파싱, Bash run block 19개 `bash -n` PASS | 테스트됨, `/tmp/higgsfield-standard-dev-yaml-final.log` |
| Dashboard 이미지 | `f12908ca`까지의 선행 Docker image build는 Next production build 포함 PASS. 이번 재검수의 TypeScript 변경 뒤 Docker rebuild는 사용자 지시에 따라 생략 | 근거 확인, `/tmp/higgsfield-refresh-docker-build5.log`; 현재 이미지 미검증 |
| 로컬 컨테이너 내부 잠금 | `critical_seconds=0.5 contenders=4 rounds=50 overlaps=0 events=400 contender_failures=0 credential_mode=600 lock_timeout_status=75` | 관찰됨, `/tmp/higgsfield-r2-lock-stress.log` |
| 운영 Linux bind mount 잠금 | runner 오프라인으로 실행하지 못함 | 미검증, 운영 러너 복구 후 실행 |
| Compose 해석 | runtime UID 0:0, credential mount RW, lock 경로 확인 | 테스트됨 |
| 시크릿 literal 검사 | 추가 코드에서 고위험 token prefix 0건 | 테스트됨 |
| 파이프라인 산출물 lint | 상태파일 2개의 핀 실체·슬롯키·버전 정합 PASS. 기존 design·QA 핀 위생 경고 28건 | 테스트됨, `/tmp/higgsfield-standard-dev-artifact-lint.log` |
| 최종 수렴 리뷰 | 배포·시크릿·마이그레이션·롤백·lock·API·증거 정직성 재검수 `CLEAN` | 근거 확인 |
| 전체 TypeScript | 현재 로컬 의존성·타입 baseline이 전체 검사를 막았고, 이번 실행의 진단 목록에는 변경한 Higgsfield 파일이 없음. `origin/main` 동일 환경 비교는 실행하지 않음 | 실패 그대로 기록, `/tmp/higgsfield-standard-dev-typecheck.log`; 전체 타입체크 미검증 |
| 운영 배포 및 실제 이미지 생성 | 아직 push 전 | 미검증 |

선행 수정 커밋은 `070acb63`, `b571db16`, `05353bbb`이며, Claude 교차 리뷰 9건 교정은 이 보고와 같은 후속 커밋으로 묶는다.

## `standard-dev.md` 재검수 대조표

기준 파일은 2026-10-09 13:30 KST에 전문을 다시 읽었다. 인증·시크릿·운영 파일 상태를 바꾸는 고위험 변경이므로 독립 Codex 리뷰를 병렬 수행했고, 최초 지적을 수정한 뒤 재검수했다.

| 품질헌법 기준 | `f12908ca`까지의 상태 | 재검수 결과와 조치 | 증거 |
|---|---|---|---|
| 직접 관찰 증거 2종 이상 | 계약 테스트, Docker image build, 실제 컨테이너 잠금이 있었음 | 현재 diff의 계약 테스트와 셸·YAML 검증을 재실행. 선행 실제 컨테이너 잠금 관찰을 별도 증거로 유지 | 테스트됨·관찰됨 |
| 미검증 정직 선언 | 운영 배포와 실제 생성이 미검증으로 기록됨 | 현재 Docker rebuild, GitHub Linux 전용 경합 테스트, 운영 배포·생성을 미검증으로 분리 | 근거 확인 |
| 스펙 대비 diff | force 쓰기와 정상 생성 동시성의 세부 계약이 빠져 있었음 | force는 같은 lock·백업·검증·복원을 사용하고, 만료가 5분 넘게 남은 생성은 잠금 없이 실행. BUSY는 실제 두 번 재시도 | 테스트됨 |
| 고위험 코드 2차 리뷰 | 배포·인증 경계 독립 리뷰에서 경합 1건이 발견됨 | 보안·API·테스트·성능·단순화·적대적 리뷰를 수행. token 쌍 검증, 실제 Linux wrapper 테스트, wrapper 사망 뒤 live child 보호를 추가 | 근거 확인 |
| 경계 테스트 | 정상 force와 wrapper 잠금 단위 계약 중심 | 빈 시크릿, 잘못된 JSON, token 누락·공백·비문자열, 살아 있는 파일 2차 확인, 옛 이미지 wrapper 부재, 표식 있는 75, 5분 만료 경계, BUSY 재시도 소진을 추가 | 테스트됨 |

## 배포·시크릿·마이그레이션·롤백 대조

| 축 | 발견한 위반 또는 위험 | 수정·판정 | 남은 검증 |
|---|---|---|---|
| 배포 | 실행 중 dashboard가 refresh 중이어도 force writer는 별도 helper에서 lock 없이 쓸 수 있었음 | 실행 컨테이너가 있으면 동일 wrapper 잠금 아래 `docker exec -i`로 원자 교체. wrapper 없는 옛 이미지는 fail-closed | 운영 force 배포 미검증 |
| 시크릿 | access token만 있거나 token 필드가 공백·객체·배열인 갱신 불가능 JSON도 배치될 수 있었음 | 두 token 모두 공백 아닌 문자열인 쌍만 허용. 값은 stdin으로만 전달하고 argv·로그에 넣지 않음 | GitHub Actions 실제 시크릿 입력 미검증 |
| 마이그레이션 | DB 변경은 없으나 credential 저장소가 read-only에서 read-write, root:root 0700·0600으로 상태 전환됨 | 배포 단계가 기존 파일을 제자리 권한 교정하고, 평상시 배포는 파일 내용을 덮어쓰지 않음. export worker는 mount 없음 | 운영 호스트 소유권 전환 미검증 |
| 롤백 | 단순히 `f12908ca` 이전 Compose로 되돌리면 mount가 다시 read-only가 되어 장애가 재발함 | 애플리케이션 rollback 시에도 RW mount, UID 0, 0600, lock wrapper는 유지. credential 파일은 현재 운영본을 보존하고 시크릿 스냅샷으로 자동 복원하지 않음 | 실제 rollback rehearsal 미검증 |

## 안전한 출고·롤백 순서

1. 옛 dashboard가 실행 중이면 먼저 `force_generator_credentials=false`로 새 이미지와 lock wrapper를 배포한다.
2. 새 컨테이너에서 RW mount, UID 0, credential 0600/root를 확인한다.
3. 필요한 경우에만 `force_generator_credentials=true`로 서버 전용 access·refresh token 쌍을 같은 lock 아래 배치한다.
4. 애플리케이션 rollback이 필요해도 credential 저장소와 lock 변경은 되돌리지 않는다. 현재 운영 `credentials.json`을 보존한 채 앱 이미지만 직전 버전으로 되돌린다.
5. read-only mount로 되돌려야 하는 비상상황이면 생성 요청과 monitor·diagnose를 먼저 중지하고, 현재 credential 파일을 보존한 뒤에만 수행한다. 이 경로는 장애 원인을 다시 만드는 조치이므로 기본 rollback으로 쓰지 않는다.

## 셀프심문과 레드팀

- 이 결론이 틀릴 가장 그럴듯한 이유: 인증 문제와 동시에 운영 호스트의 DNS, TLS, 외부 IP 차단이 발생했을 수 있다. 수정된 branch workflow가 운영에서 실행되기 전까지 이 축은 미검증으로 남긴다.
- 까다로운 운영자 관점의 공격: 파일을 쓰기 가능하게 만든 것만으로 동시 갱신은 해결되지 않는다. 그래서 갱신·진단·배포의 실제 자격증명 변경 구간을 하나의 wrapper로 모았고 4개 경쟁자 50회와 살아 있는 잠금 제한시간을 실제 컨테이너에서 검증했다.
- 가장 하중이 큰 가정: 운영 Linux bind mount의 `flock`이 모든 갱신 주체를 실제로 직렬화하는가. 로컬 컨테이너 내부 파일시스템의 200개 경쟁 호출은 겹침 0이지만, 운영 bind mount 증거를 대신하지 않는다. 운영 runner 복구 뒤 같은 스크립트를 실행해야 이 가정을 닫을 수 있다.

## 후속 종료 조건

1. 운영 runner 복구 뒤 `scripts/verify-higgsfield-lock.sh`를 실행해 Linux bind mount의 겹침 0을 확인한다.
2. 브랜치를 push하고 `diagnose-generator.yml`을 이 브랜치 ref로 실행한다.
3. 배포 workflow를 `force_generator_credentials=true`로 한 번 실행한다.
4. 운영 컨테이너에서 mount RW, UID 0, mode 600, 계정 탐침 성공을 확인한다.
5. 운영 `/api/higgsfield/image`가 202를 반환하고 작업 완료 뒤 생성실에 실제 미디어가 나타나는지 확인한다.

KNOWLEDGE_QUERY: OSMU Higgsfield 503, OAuth 갱신 토큰 회전, Docker bind mount 쓰기, Linux flock 파일 설명자 잠금
HITS_USED: `wiki/거버넌스/결정.md`의 서버 전용 세션·단일 갱신 주체 결정, Docker 공식 bind mount 문서의 read-only/read-write 계약, Claude Opus 교차 리뷰의 실제 중첩 재현과 flock 교정안
HITS_REJECTED: 맥 네트워크 성공은 운영 호스트 네트워크 증거가 아니므로 운영 복구 완료 근거로 쓰지 않음. 업스트림 CLI issue는 동일 증상이지만 운영 버전·네트워크를 직접 증명하지 못해 보조 근거로만 유지
CONFLICTS: 기존 배포 주석은 CLI가 갱신 결과를 파일에 쓴다고 했지만 Compose 실물은 해당 경로를 읽기 전용으로 마운트했음

SKILLS_USED: review, 전체 diff·배포·경합·롤백 계약 검수와 독립 전문 리뷰
SKILLS_SKIPPED: investigate, 현재 available-skills에 없어 직접 재현과 계약 테스트로 대체
SOURCES/MODEL: gpt-6.1-sol/Codex | `docker-compose.postagi-4tenants.yml` | `.github/workflows/deploy-marketing.yml` | `dashboard/scripts/run-higgsfield-locked.sh` | `logs/diff/higgsfield-503-20261009/cross-review-claude-opus.md` | https://docs.docker.com/engine/storage/bind-mounts/

🏷 STAMP | line: osmu | 생성: 2026-10-09 13:41 KST | model: gpt-6.1-sol | agent: code-builder | skill: review
근거: `standard-dev.md`, 운영 run 4건, 시크릿 metadata, 계약 55건, 셸·YAML, 컨테이너 4×50 경합 실측, Claude Opus 교차 리뷰 | 고민: 사용자 공간 stale 회수 경쟁을 없애고 refresh만 직렬화해 안전과 동시 처리량을 함께 지켰다.
