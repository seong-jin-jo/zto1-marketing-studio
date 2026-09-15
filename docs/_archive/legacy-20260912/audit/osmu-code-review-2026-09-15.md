# OSMU 최근 24시간 코드 공격 재리뷰

STAMP

- 생성: 2026-09-15 17:25 KST
- 검토 고정 범위: `fe24d05180b99b1c39e30e915b8557bd8e03d0fe..f4b0f5a5188ef6343e22d9ed4cbebd79b05d0bcc`
- 규모: 91 commits, 202 files, +24,289 / -773
- 모델: gpt-codex/gpt-5
- 에이전트: code-reviewer
- 스킬: review
- 결론: 대시보드 전체 회귀는 통과했지만 MAJOR 17건과 불안정한 실제 Studio 흐름, OpenClaw 표적 테스트 5건 실패 때문에 머지와 배포를 차단한다.

검토 중 다른 세션이 HEAD를 이동시켰다. 따라서 줄 번호와 판정은 위 고정 커밋의 파일 내용을 기준으로 한다. `pipeline-state.osmu.md`의 승인 디자인 허브는 v68이지만 과제는 v63을 명시했다. 이번 코드 계약 대조는 사용자 지정 v63과 루트 `DESIGN.md`를 우선했다.

## MAJOR

MAJOR: [승인 시안 이탈, 무기록 삭제] `dashboard/src/components/layout/Sidebar.tsx:413` - 접힌 레일에서 `showLabels`가 false가 되면 `RoomFlowNav` 자체를 렌더하지 않아 생성실, 편집실, 발행실, 성과실 네 방과 현재 방 강조가 모두 사라진다 / `DESIGN.md:161`의 "사이드바 맨 위에 네 방을 둔다"와 `DESIGN.md:165`의 "접히면 아이콘과 현재 항목 강조만 남는다"에 어긋난다. 커밋 제목은 네 방 복원인데 접힌 상태 삭제 사유는 없다 / `RoomFlowNav`는 항상 렌더하고 접힌 상태에서는 라벨만 감춘 아이콘과 현재 항목 강조를 유지해야 한다.

재현 시나리오: 데스크톱에서 `사이드바 접기`를 누른다. 채널 아이콘은 남지만 네 방 링크는 DOM에서 모두 없어져 현재 방을 확인하거나 다른 방으로 이동할 수 없다.

MAJOR: [승인 시안 이탈, 회귀 위험] `dashboard/src/components/layout/Sidebar.tsx:307` - 첫 방문의 `railCollapsed`는 화면 폭이 아니라 로컬 저장값만 보고 기본 false가 되며, 1024에서도 224px로 열린다. 펼친 상태는 `md:sticky` flex 항목의 폭을 56px에서 224px로 바꿔 본문을 밀어낸다 / `DESIGN.md:157`의 "1024는 좌 56px 자동 축소"와 `DESIGN.md:262`의 "224px 패널이 56px 레일 위로 임시 겹침된다. 본문과 담당의 폭은 바뀌지 않는다"에 어긋난다 / 1024 기본값은 56px로 정하고, 펼침은 56px 레일의 레이아웃 폭을 유지한 채 별도 겹침 패널로 구현해야 한다.

재현 시나리오: 로컬 저장을 비운 새 브라우저로 1024px 화면을 연다. 사이드바는 224px로 시작한다. 접었다가 펴면 flex 항목 폭이 56px에서 224px로 바뀌어 본문 폭도 함께 줄어든다.

MAJOR: [회귀 위험, 동시성, 돈] `dashboard/src/lib/anthropic.ts:361` - 공유 OAuth CLI 직렬화가 프로세스 로컬 Promise 한 줄뿐이다. 서버를 두 개 띄우면 각 프로세스가 같은 공유 자격증명으로 동시에 실행하고, 재시작하면 대기열과 포기 상태가 사라진다. 한 프로세스 안에서도 실행 제한 120초보다 대기 제한 60초가 짧아 정상적인 둘째 요청을 거절할 수 있다 / `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md:51`의 여덟 컨셉 동시 운영과 `:59`의 "프로세스 메모리에 있으면 사업 자체가 성립하지 않는다"에 어긋난다 / DB 기반 전역 대기열 또는 세션 advisory lock과 영속 작업 상태, fencing token, 테넌트별 공정성, 취소 전파를 둬야 한다.

재현 시나리오: 서버 인스턴스 A와 B에 공유 CLI 생성 요청을 동시에 보낸다. 두 인스턴스의 `cliQueueTail`은 서로를 몰라 같은 OAuth 프로필을 동시에 쓴다. 한 인스턴스에 75초 작업 두 개를 보내면 둘째 요청은 60초에 거절된다. Studio v1 실요청도 첫 실행 12/14 실패 후 같은 조건 재실행 14/14로 바뀌었다.

MAJOR: [회귀 위험, 런타임] `dashboard/src/lib/anthropic.ts:34` - CLI 후보를 `existsSync`만으로 확정해 디렉터리와 실행 권한 없는 파일도 선택하며, spawn이 EACCES나 ENOENT로 실패해도 다음 후보 또는 PATH로 넘어가지 않는다 / 최근 커밋의 목적 "감독 실행환경의 Claude CLI 경로 복구"와 실제 실행 검증 계약에 어긋난다. Node 문서도 존재 여부와 실행 가능 권한을 구분한다 / 후보마다 regular file과 실행 권한을 확인하고, 실제 spawn의 ENOENT와 EACCES에서 다음 후보를 순차 시도해야 한다.

재현 시나리오: `~/.local/bin/claude`에 실행 권한 없는 파일을 두고 `~/.claude/local/claude` 또는 PATH에는 정상 실행 파일을 둔다. 첫 파일이 선택된 뒤 EACCES로 모든 공유 생성이 실패하며 정상 후보는 시도되지 않는다.

MAJOR: [회귀 위험, 동시성, 돈] `dashboard/src/app/api/video/subtitle/route.ts:164` - 인증된 고객 요청마다 최대 180초짜리 ffmpeg 프로세스를 바로 만들며 테넌트별 및 전역 동시 실행 상한, 영속 큐, 호출 속도 제한이 없다. 입력과 출력 크기 제한만으로 프로세스 수와 CPU 사용량은 제한되지 않는다 / OWASP API4의 프로세스 수, 실행 시간, 요청 빈도 제한 권고와 사업 좌표의 유료 몫 계약에 어긋난다 / DB 작업 큐, 테넌트 1개와 전역 N개 worker 상한, rate limit, 요청별 비용 장부를 적용해야 한다.

재현 시나리오: 서로 다른 자막 본문으로 고객 POST 30개를 동시에 보낸다. 라우트는 요청 수만큼 ffmpeg를 시작하고 각 프로세스가 최대 180초 동안 CPU와 임시 디스크를 점유한다.

MAJOR: [회귀 위험, 격리] `dashboard/src/lib/metrics-collector.ts:635` - 게시물에는 `account_id`가 있지만 플랫폼별 기본 자격증명 하나로 해당 플랫폼의 모든 글을 조회한다 / `wiki/거버넌스/요청.md:9807`이 이미 "작업 공간의 기본 계정 토큰 하나로 모든 글을 조회한다"를 유력 원인으로 명시했고, 한 작업 공간에 한 채널을 전제하면 안 된다는 사업 좌표 `:51`과 어긋난다 / 대상을 `platform + account_id`로 묶고 `getChannelCred`에 정확한 accountId를 전달해야 하며, 자격증명이 없다고 다른 계정 글을 retire하면 안 된다.

재현 시나리오: 같은 작업 공간에 Threads A와 B를 연결하고 B 계정으로 올린 글을 수집한다. 기본 A 토큰으로 B 글을 조회해 실제 B 글을 "이 계정에 없음"으로 오판할 수 있다.

MAJOR: [회귀 위험, 무기록 삭제] `dashboard/src/lib/metrics-collector.ts:66` - `post_not_in_account`를 영구 제외 코드로 취급한다. X 응답에서 요청한 글 번호가 한 번 빠지고 발행 후 60분만 지났으면 계정 확인이나 삭제 확인 없이 같은 코드를 만들고 이후 모든 수집에서 제외한다 / 같은 파일 `:93`의 "한 번 빼면 영영 못 돌아오는 구조는 만들지 않는다"와 요청 대장의 삭제 승인 원칙에 어긋난다 / 공급자가 삭제를 확정했거나 특정 계정 불일치를 확정한 경우만 terminal로 두고, 나머지는 재시도 가능한 blocked 상태와 backoff로 남겨야 한다.

재현 시나리오: 발행 61분 된 X 글을 bulk 응답에서 한 번 누락시킨다. `dashboard/src/lib/metrics-collector.ts:774`가 `post_not_in_account`를 기록하고 다음 수집부터 그 글은 공급자에게 다시 묻지 않는다.

MAJOR: [회귀 위험, 돈, 자원] `dashboard/src/lib/metrics-collector.ts:258` - 일곱 플랫폼 쿼리에 LIMIT와 cursor가 없고 재시도 시각이나 지수 backoff를 저장하지 않는다. 오래된 실패 행은 사용자가 누를 때마다 전체 공급자 호출로 다시 들어간다 / OWASP API4의 페이지 크기, 요청 빈도, 작업당 자원 상한과 사업 좌표의 유료 몫 계약에 어긋난다 / 한 번의 수집량과 총 deadline을 제한하고 continuation cursor, `attempted_at`, `next_attempt_at`, Retry-After 기반 backoff를 영속화해야 한다.

재현 시나리오: 성과가 오래된 게시물 10,000건을 만들고 공급자가 429를 반환하게 한다. 성과 수집을 반복할 때마다 전체 대상을 다시 읽고 공급자 호출을 반복해 API 몫과 DB 시간을 소진한다.

MAJOR: [회귀 위험, 동시성, 자원] `dashboard/src/lib/metrics-collector.ts:735` - Threads insights fetch만 제한시간이 없고, 이 호출이 끝날 때까지 `collectMetrics`가 PostgreSQL session advisory lock을 잡은 전용 연결을 유지한다 / PostgreSQL 문서상 session lock은 명시 해제나 세션 종료까지 유지되며, 끝나지 않는 worker 금지와 어긋난다 / 각 공급자 요청에 AbortSignal 제한시간과 전체 collection deadline을 두고 timeout을 영속 backoff로 기록한 뒤 finally에서 연결을 해제해야 한다.

재현 시나리오: Threads endpoint가 연결만 유지하고 본문을 끝내지 않게 한다. 수집 Promise와 reserved DB 연결이 계속 남고, 같은 작업 공간의 다음 수집은 `collection_in_progress`만 돌려받는다.

MAJOR: [승인 시안 이탈, 부분 실패] `dashboard/src/components/home/PerformanceDashboard.tsx:41`, `dashboard/src/lib/metrics-collector.ts:890` - 글별 실패 근거는 POST 응답 뒤 컴포넌트 메모리에만 있고 새로고침하면 사라진다. DB의 비종료 `metricsBlocked`에는 code와 at만 저장되며 GET 타입도 evidence를 갖지 않는다 / `wiki/거버넌스/요청.md:9783`의 "어느 글이 왜 실패했는지 말한다"와 `:9796`의 고객에게 글 번호, 발행 시각, 경과 분, 근거를 반드시 준다는 계약에 어긋난다 / 고객 노출 가능한 scrubbed evidence를 영속 저장하고 GET 응답과 화면 초기 상태가 이를 복원해야 한다.

재현 시나리오: 서로 다른 원인으로 두 글의 성과 수집을 실패시킨 직후에는 상세가 보인다. 페이지를 새로고침하면 `failureDetails`가 빈 배열로 시작하고 글에는 일반 코드만 남아 무엇을 보고 실패로 판정했는지 사라진다.

MAJOR: [회귀 위험, 격리, 돈] `openclaw/extensions/instagram-publish/src/instagram-publish-tool.ts:102` - 캐러셀 덮어쓰기를 막으려고 최대 10개의 고유 R2 객체를 만들지만 공개 URL로 반환한 뒤 삭제, 만료, lifecycle 등록, 보관 장부가 전혀 없다 / `wiki/거버넌스/요청.md:628`의 고객 결과물은 고객 자산이라는 계약과 `:636`의 재발급, 삭제, 보관 기간은 studio 책임이라는 계약에 어긋난다 / 비공개 테넌트 경로, 짧은 수명의 공급자 전달 URL, 공급자 fetch 완료 후 정리, 실패 및 재시도 cleanup, 보관 장부를 함께 구현해야 한다.

재현 시나리오: 로컬 이미지 10장 캐러셀을 여러 번 발행하거나 공급자 호출 전에 실패시킨다. 매 시도마다 인증 없는 공개 객체가 추가되고 코드에는 이를 지우는 경로가 없어 저장 비용과 노출 시간이 계속 늘어난다.

MAJOR: [회귀 위험, 부분 실패, 증거] `dashboard/scripts/verify-api-read-sweep.mjs:148` - 전후 해시 대상 파일 목록을 시작 때 한 번만 만들며, 실행 중 새 파일은 종료 해시에서 빠진다. 더 심각하게 `:263`은 실행 중 서버가 아니라 현재 checkout의 HEAD를 보고서 커밋으로 적는다. health 응답에는 서버 build SHA가 없다 / "완료는 실제 그 경로에서 직접 관찰"이라는 증거 계약에 어긋난다 / 고정 커밋의 격리 checkout에서 서버를 직접 띄우고 health의 build SHA와 대조하며, 종료 시 파일 목록을 다시 열거하고 dirty tree를 실패로 처리해야 한다.

재현 시나리오: 이전 커밋 서버를 localhost에 둔 채 checkout만 새 HEAD로 이동한다. listener PID와 현재 소스 해시는 실행 중 안정적이므로 sweep은 통과하고 새 HEAD를 보고서에 쓰지만 실제 요청은 이전 서버가 처리한다. 실행 중 새 route를 추가해도 최초 파일 목록 밖이라 해시 변화가 없다.

MAJOR: [회귀 위험, 부분 실패, 증거] `dashboard/scripts/capture-studio-fe3-playwright.mjs:15` - 핵심 생성 흐름을 기본값에서 건너뛰며, 생성 후보 0개와 `skipped-production-identity-contract`를 출력하고도 성공 종료한다 / 과제의 실제 localhost 요청 의무와 부분 실패를 전체 성공으로 세지 말라는 계약에 어긋난다 / 캡처 전용과 생성 E2E를 별도 명령으로 나누고, 게이트용 명령은 생성 요청과 후보 3개를 필수로 해야 한다.

재현 시나리오: 필수 토큰만 주고 `FE3_RUN_GENERATION` 없이 실행한다. 생성 API가 500이어도 요청 자체가 발생하지 않고 `dashboard/scripts/capture-studio-fe3-playwright.mjs:372`가 skipped를 기록한 뒤 exit 0으로 끝난다.

MAJOR: [회귀 위험, 테스트 실패] `openclaw/test/scripts/tsdown-build.test.ts:90` - 새 `RAYON_NUM_THREADS`와 3,584MB headroom 정책을 넣고 기존 invocation 및 메모리 기대값을 갱신하지 않아 표적 테스트가 26건 중 5건 실패한다 / 머지 전 회귀 테스트 통과와 거짓 완료 금지에 어긋난다 / 정책을 먼저 확정한 뒤 Windows, 직접 node, 1GiB, 4GiB, 7GiB, 8GiB 경계 기대값을 코드와 같은 계약으로 갱신해야 한다.

재현 시나리오: `pnpm exec vitest run test/scripts/tsdown-build.test.ts --config test/vitest/vitest.tooling.config.ts --maxWorkers=1`을 실행한다. 21건만 통과하고 5건이 실패한다. 세 건은 기대 6400 대비 실제 3584, 두 건은 새 `RAYON_NUM_THREADS` 때문에 객체가 달라진다.

MAJOR: [회귀 위험, 돈, 자원] `openclaw/scripts/tsdown-build.mjs:431` - cgroup 예산에서 headroom을 뺀 값이 작아도 `Math.max`로 V8 heap 최소 2,048MB를 강제한다. 1GiB 컨테이너에서는 heap 상한이 컨테이너 전체 한도보다 크다 / 자원 상한은 실제 한도를 넘지 않아야 한다는 OWASP API4 원칙과 이번 커밋의 VM OOM 방지 목적에 어긋난다 / 안전 최소를 확보하지 못한 환경은 preflight 실패시키고, 어떤 입력에서도 heap과 비힙 예산 합이 실제 cgroup 한도를 넘지 않게 해야 한다.

재현 시나리오: 메모리 한도를 1GiB로 주고 invocation을 계산한다. `limitMb - 3584`가 음수인데도 결과는 2,048MB가 되어 프로세스가 cgroup보다 큰 heap을 설정한다.

MAJOR: [회귀 위험, 동시성, 자원] `openclaw/scripts/tsdown-build.mjs:639` - `OPENCLAW_TSDOWN_TIMEOUT_MS`가 없으면 `timeoutMs`가 null이고 종료 timer를 만들지 않는다. Dockerfile과 배포 workflow에도 기본값이 없다. heartbeat는 로그만 쓰고 자식을 끝내지 않는다 / 무인 worker의 끝나지 않는 명령 금지와 어긋난다 / 유한한 기본 deadline을 두고 자식 process group 전체에 SIGTERM 후 SIGKILL을 보내며 실제 wall-clock 경계 테스트를 추가해야 한다.

재현 시나리오: rolldown child를 deadlock시키고 timeout 환경 변수를 비운다. 30초마다 heartbeat만 찍히고 self-hosted runner job은 종료되지 않는다.

MAJOR: [회귀 위험, 무기록 삭제, 돈] `.github/workflows/deploy-marketing.yml:546` - 공유 self-hosted runner에서 `docker builder prune -af`와 `docker volume prune -f`를 `if: always()`로 실행한다. OSMU 전용 범위나 label filter가 없어 다른 서비스의 미사용 build cache와 분리된 anonymous volume까지 지운다. 모든 오류도 `|| true`로 삼킨다 / 범위를 넘지 말라는 작업 계약과 삭제 사유 및 대상의 추적 가능성 계약에 어긋난다. Docker 문서상 builder prune은 사용하지 않는 build cache 전체, volume prune은 사용하지 않는 anonymous volume을 대상으로 한다 / OSMU 전용 builder와 label 기반 정리, 삭제 전 대상 목록, named persistent volume 강제, 정리 실패 경보를 적용해야 한다.

재현 시나리오: 같은 runner에 다른 앱의 미사용 build cache와 분리된 anonymous data volume을 만든 뒤 OSMU deploy를 실행한다. OSMU와 무관한 자산이 정리되고 다음 앱은 cold build 또는 데이터 유실을 겪어도 이 step은 성공으로 남는다.

## MINOR

MINOR: [회귀 위험, 테스트 실효성] `dashboard/src/lib/anthropic-runtime.regression-1.test.ts:13` - resolver와 spawn을 실행하지 않고 함수명과 경로 문자열 존재만 검사한다 / 실제 경로 선택과 실행 가능성 검증 계약에 어긋난다 / 임시 HOME과 PATH, 실행 가능 파일과 실행 불가 파일을 만들어 후보 fallback과 실제 spawn 결과를 관찰해야 한다.

재현 시나리오: resolver를 호출하지 않는 죽은 코드로 남기거나 spawn을 다시 고정 문자열로 바꿔도 네 문자열만 남아 있으면 테스트는 통과한다.

## 직접 실행 및 관찰 증거

- `GET http://localhost:3456/api/health`: HTTP 200, `ok=true`, `db=up`.
- `cd dashboard && npm run test`: 360 files passed, 2,317 tests passed, 3 skipped, exit 0.
- `cd dashboard && npx tsc --noEmit`: exit 0.
- `dashboard/scripts/verify-basic-flow-e2e.mjs`: 지정 작업 공간에서 11/11 passed, exit 0.
- `dashboard/scripts/verify-studio-v1-e2e.mjs`: 첫 실행 12/14, 2건 실패. 같은 조건 재실행 14/14. 연속 안정 통과가 아니므로 NG.
- OpenClaw tsdown 표적 테스트: 26건 중 21건 통과, 5건 실패. NG.
- `git diff --check fe24d051..f4b0f5a5`: 위반 0건.
- 운영 배포, 외부 SNS 실제 발행, 외부 계정 성과 수집은 미검증.

## 셀프심문

"내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?"

1024에서 사이드바를 접는 순간 네 방 이동이 통째로 사라지는 문제, 같은 작업 공간의 두 채널 성과가 기본 계정 하나로 조회되는 문제, 동시에 생성하면 둘째 작업이 거절되거나 다른 서버 프로세스와 공유 CLI가 경합하는 문제가 가장 그럴듯하다. 모두 MAJOR로 확인했으므로 PASS를 줄 수 없다.

## 4축 판정

- 승인 시안 이탈: 지적 3건. 접힌 레일의 네 방 삭제, 1024 자동 축소 및 겹침 계약 위반, 성과 실패 근거의 새로고침 후 소실.
- 회귀 위험: 지적 17건. 격리, 비용, 동시성, 부분 실패, 런타임, 테스트, 증거, 배포 삭제를 포함한다. 여러 축에 걸친 항목은 중복 집계했다.
- 토큰 위반: 문제없음. 고정 diff의 변경 UI에서 새 색상 리터럴이나 인라인 style을 발견하지 않았고 대시보드 전체 테스트의 토큰 계약이 통과했다.
- 무기록 삭제: 지적 3건. 접힌 레일의 네 방 링크 제거, 불확실한 글의 영구 성과 제외, 공유 runner의 비OSMU Docker 자산 삭제.

REVIEW_VERDICT: BLOCK

SKILLS_USED: review
SKILLS_SKIPPED: review의 자동 수정과 서브에이전트 단계는 코드 수정 금지 역할 계약과 현재 위임 제한 때문에 사용하지 않음.

KNOWLEDGE_QUERY: OSMU 사업 좌표, v63 승인 프로토타입, 확정 요구 대장, 자원 상한, session advisory lock, 실행 권한, Docker builder 및 volume 정리
HITS_USED: BRAIN의 ZERO-ONE Marketing Studio 정의는 한 원본에서 채널별 변환과 성과 회수로 이어지는 제품 경계 판단에 사용. repo 사업 좌표는 다계정, 동시 운영, 영속 몫의 직접 계약이라 사용. v63과 DESIGN.md는 네 방과 1024 레이아웃 및 사족 판정에 사용. OWASP, PostgreSQL, Node, Docker 공식 문서는 자원 상한, 잠금 수명, 실행 가능성, 전역 정리 범위를 판정하는 데 사용.
HITS_REJECTED: 다른 벤처의 마케팅 심리 문서는 이번 코드의 격리, 동시성, 빌드 안전 판정과 직접 연결되지 않아 제외. pipeline의 v68 프로토타입은 실제로 열어 확인했지만 사용자가 이번 리뷰의 기반을 v63으로 명시했으므로 계약 인용에는 사용하지 않음.
CONFLICTS: `pipeline-state.osmu.md`의 최신 승인 design_hub는 v68이지만 과제는 v63을 고정 기반으로 지정한다. 이번 리뷰는 v63을 우선했고 핀 충돌 때문에 시각적 전체 일치 판정은 하지 않았다.

SOURCES:

- `pipeline-state.osmu.md`
- `DESIGN.md`
- `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`
- `docs/design/prototypes/legacy-prototype-20260912/prototype/osmu-v68-create-performance-hub-gpt-codex-20260903-0022.html`
- `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md`
- `wiki/거버넌스/요청.md`
- `wiki/거버넌스/결정.md`
- `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`
- `/Users/sj/Documents/SJ_BRAIN_wiki/wiki/business/index.md`
- `/Users/sj/Documents/SJ_BRAIN_wiki/wiki/business/pmf/idea-zero-one-marketing-studio.md`
- https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/
- https://www.postgresql.org/docs/17/explicit-locking.html
- https://nodejs.org/api/fs.html
- https://docs.docker.com/reference/cli/docker/builder/prune/
- https://docs.docker.com/engine/manage-resources/pruning/

MODEL: gpt-codex/gpt-5
