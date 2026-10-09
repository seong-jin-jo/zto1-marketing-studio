# 운영 Higgsfield HTTP 503 근본원인 보고

## 결론

운영 인증 회귀의 확정 원인은 **서버에 공급한 GitHub Secret이 갱신 불가능한 오래된 OAuth 스냅샷이 된 것**이다. 16:30 UTC에 갱신한 Secret은 16:31 배포에서 정상 작동했지만, 맥 자격증명 파일이 23:19 UTC에 다시 갱신된 뒤 같은 Secret을 서버에 다시 넣자 즉시 실패했다. 맥과 서버가 하나의 refresh token 파일 스냅샷을 공유한 구조가 이 상태를 만들었다. refresh token rotation이 구 토큰을 무효화했는지는 값 비교 없이 확정할 수 없지만, 정상에서 실패로 바뀐 시각과 파일 갱신은 그 가능성을 강하게 지지한다.

단, 서버의 DNS, TLS, 외부 IP 차단 여부는 아직 분리하지 못했다. 이를 분리하는 branch workflow를 만들었지만 이 워커의 `git push`가 실행 정책에 차단되어 운영에서 실행하지 못했다. 따라서 네트워크 장애가 함께 있었는지는 `미검증`이다.

## 관찰 증거

| 시각(UTC) | 관찰 | 판정 |
|---|---|---|
| 2026-10-08 16:30:13 | GitHub Secret `HIGGSFIELD_CREDENTIALS_JSON` 갱신 | Secret 스냅샷 기준시각 |
| 2026-10-08 16:31:43 | deploy run `37809308410`: Secret 재배치 뒤 `account status` 종료 코드 0 | 해당 스냅샷은 이 시각 정상 |
| 2026-10-08 23:19:47 | 맥 `credentials.json` 수정시각. 현재 `expires_at`은 2026-10-09 23:19:46 UTC | 맥 CLI가 Secret 갱신 뒤 새 credential 세트를 기록 |
| 2026-10-08 23:19:59 | deploy run `37857533639`: 기존 서버 credential 종료 코드 2, 16:30 Secret 재배치 뒤에도 종료 코드 2 | 정적 Secret이 새 맥 credential보다 6시간 49분 낡았고 즉시 거절됨 |
| 2026-10-08 23:39:08~15 | 같은 배포의 새 컨테이너가 3회 모두 종료 코드 2 | 컨테이너 재기동으로 복구되지 않음 |
| 2026-10-09 00:05:34 | diagnose run `37862950523`: `request failed (no response received)` | 기존 진단은 exit code를 pipeline에서 잃고 run을 success로 오판 |
| 2026-10-09 00:13:36 | 재실행 run `37863665063`: 같은 오류 재현 | 일회성 한 번 실패가 아님 |
| 2026-10-09 00:15경 | 맥 CLI 직접 재확인도 `Session expired`, 파일 수정시각은 변하지 않음 | 현재는 맥 세션도 유효하지 않음. 재로그인 전 실생성 불가 |
| 2026-10-09 00:17경 | 맥에서 token 없는 `fnf-api-gw.higgsfield.ai` HTTPS: DNS 0.006s, TLS 0.039s, HTTP 404, 인증서 검증 0 | Higgsfield 호스트 자체와 맥 네트워크는 도달 가능 |

## 구조적 원인

1. `deploy-marketing.yml`은 맥 OAuth credential JSON 전체를 GitHub Secret에 복제한다. 이 파일은 짧은 access token과 refresh token을 함께 가진다.
2. 맥 CLI가 token을 갱신하면 로컬 파일은 바뀌지만 GitHub Secret은 자동 갱신되지 않는다. 서버는 다음 배포에서도 낡은 스냅샷을 받는다.
3. `docker-compose.postagi-4tenants.yml`은 Higgsfield credential 디렉터리를 `:ro`로 마운트한다. 코드 주석은 CLI가 refresh 결과를 파일에 다시 쓴다고 가정하지만 실제 컨테이너는 쓸 수 없다.
4. `dashboard/Dockerfile`은 `@higgsfield/cli` 버전을 고정하지 않는다. 16:42 배포는 해당 layer가 cache였고 23:35 배포는 새로 설치했다. 최신은 1.1.26이며, 업스트림에는 1.1.24부터 workspace 요청이 `no response received`로 실패한다는 미해결 이슈가 있다. 운영 컨테이너 버전을 아직 읽지 못해 이것은 보조 위험이며 직접 원인으로 확정하지 않았다.
5. 기존 diagnose workflow는 `account status | sed | tail` pipeline의 마지막 종료 코드만 보므로 CLI 실패에도 workflow가 success다. 네트워크, 인증, CLI 회귀를 구분하는 자료도 없다.

## 이번 변경

- `.github/workflows/diagnose-generator.yml`
  - 컨테이너 DNS 해석.
  - token 없는 HTTPS의 DNS, TCP, TLS, 전체 시간, HTTP 상태코드, 인증서 검증 결과.
  - `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` 대소문자 변형의 존재 여부만 출력하고 값은 마스킹.
  - CLI 버전.
  - credential 값은 읽지 않고 수정시각, 크기, 만료시각, 만료 여부만 출력.
  - `account status` 실제 종료 코드와 고정 오류 분류만 출력. CLI 원문은 출력하지 않음.
  - 정확한 `openclaw-dashboard-osmu` 컨테이너만 조회하고 GitHub token 권한은 비움.
  - 모든 동적 원문은 64KiB로 제한하고 고정 형식만 출력. workflow command 해석을 진단 중지하고 필수 probe 실패를 누적해 마지막에 non-zero로 종료.
  - 최근 30분 `/api/higgsfield/image` 로그를 원문 보관 없이 스트리밍. 마지막 2,000레코드 중 최신 1MiB를 20초 안에 읽고 출력은 200줄로 제한하며 각 pipeline 종료 코드를 표시. 출력은 `hf_image_step` 단계명, 인증·가용성 분기, HTTP 503 고정 분류만 허용하며 0건도 제한된 구간 판독임을 명시.
- `dashboard/tests/deploy/diagnose-generator-workflow.contract.test.ts`
  - 정적 계약 4건, 가짜 Docker 정상 통합 1건, CLI·DNS·HTTPS·proxy·metadata·expiry·account·log 실패 누적 8건.
- `docs/qa/qa-tracker.md`, `wiki/ops/session-state.md`
  - 운영 NG와 인계 상태를 최신순으로 기록.

## 검증

| 항목 | 결과 | 증거 등급 |
|---|---|---|
| 신규 계약 테스트의 구현 전 실패 | 3 fail, 1 pass | 테스트됨 |
| 진단, 배포 probe, 30분 monitor 계약 | 3파일 25건 pass | 테스트됨 |
| workflow YAML 파싱 | pass | 테스트됨 |
| workflow shell 구문 검사 | `bash -n` pass | 테스트됨 |
| 기존 main workflow 재실행 | run `37863665063`, 동일 `no response received` | 관찰됨 |
| 수정 branch workflow 운영 실행 | push 정책 차단으로 미실행 | 미검증 |
| 실제 이미지 생성 복구 | credential 재로그인 전 불가 | 미검증 |

## 필요한 결정과 복구 경로

### 추천: 서버 전용 자격증명으로 분리

맥과 서버가 같은 refresh token 파일을 복제하지 않게 해야 한다. 우선순위는 다음과 같다.

1. **추천 A: 서버 전용 Higgsfield API key 또는 별도 서버 OAuth session.** 서버가 혼자 소유하므로 맥 갱신이 서버를 무효화하지 않는다. API key 발급이 과금 체계나 계정 설정을 바꾸면 회장 결정이 필요하다.
2. B: 맥 credential JSON을 계속 GitHub Secret으로 복제. 재로그인 또는 refresh마다 Secret 갱신과 강제 배포가 필요하고, 두 실행 주체가 다시 경쟁하므로 재발 가능성이 높다.

즉시 복구는 유효한 서버 전용 credential을 만든 뒤 Secret을 갱신하고 `force_generator_credentials=true` 배포를 한 번 실행하는 것이다. 종료 증거는 `account status`가 아니라 운영 `/api/higgsfield/image` 202, 작업 완료, 생성실 미디어 표시까지의 실제 사용자 경로다.

## 셀프심문과 레드팀

- 이 결론이 틀릴 가장 그럴듯한 이유: 서버 DNS, TLS, 외부 IP 차단이 credential 실패와 동시에 발생했을 수 있다. branch workflow가 운영에서 실행되지 않아 이 가능성은 남는다.
- 반대 관점: Secret 시각 차이만으로 refresh token rotation을 직접 증명할 수 없다. 맞다. Secret 값은 읽을 수 없고 읽어서도 안 된다. 따라서 확정한 것은 `정적 Secret이 새 맥 credential보다 낡았고 새로 넣자 즉시 실패했다`는 사실이며, rotation은 파일 재기록 시각, 새 만료시각, 기존 정상→실패 전환과 배포 주석이 함께 지지하는 메커니즘 판정이다.

KNOWLEDGE_QUERY: OSMU Higgsfield 503, GitHub Actions branch dispatch, curl 연결 단계 측정, Higgsfield CLI no response received 이슈
HITS_USED: `wiki/거버넌스/결정.md` OD-2026-10-09-1(Secret 경유 계약), `wiki/거버넌스/실수.md` 2026-10-09(실사용 경로 증거), GitHub Actions 공식 문서(`--ref` branch dispatch), curl 공식 man page(DNS/TCP/TLS/HTTP 시간), Higgsfield CLI issue #74(동일 오류와 진단 축)
HITS_REJECTED: Higgsfield 전체 서비스 장애 집계는 API 정상으로 표시됐고 서버 컨테이너 경로를 증명하지 못해 직접 원인 근거로 쓰지 않음. CLI issue #50은 macOS VPN/보안 제품 사례라 Linux 운영 컨테이너 원인으로 채택하지 않음
CONFLICTS: 기존 배포 주석은 CLI가 refresh 결과를 credential 파일에 다시 쓴다고 했지만 Compose 실물은 해당 디렉터리를 읽기 전용으로 마운트함

SKILLS_USED: review(변경 전후 계약과 배포 diff 검수)
SKILLS_SKIPPED: investigate 스킬은 현재 available-skills에 없어 수동 원인 분석으로 대체
SOURCES/MODEL: gpt-6.1-sol/Codex | `wiki/거버넌스/결정.md` OD-2026-10-09-1 | `.github/workflows/deploy-marketing.yml` | `scripts/probe-generator-session.sh` | GitHub runs 37809308410, 37857533639, 37862950523, 37863665063 | https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow | https://curl.se/docs/manpage.html | https://github.com/higgsfield-ai/cli/issues/74

🏷 STAMP | line: osmu | 생성: 2026-10-09 09:18 KST | model: gpt-6.1-sol | agent: code-builder | skill: review
근거: 운영 run 4건, Secret metadata, 로컬 credential metadata, curl 실측, 업스트림 공식 문서·이슈 | 고민: token 값을 비교해 증명하는 위험한 길 대신 시각·만료·성공/실패 전환으로 rotation 가능성을 검증했다.
