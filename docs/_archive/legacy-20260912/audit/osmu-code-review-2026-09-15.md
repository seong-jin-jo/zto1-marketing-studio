# OSMU 최근 24시간 코드 공격 재리뷰

STAMP

- 생성: 2026-09-15 20:43 KST
- 검토 고정 범위: `0774bf9e89ad1a215bdeddeabbc92e97799e3a02..bd0d349959ffcd771db77b617d39daae55f38f34`
- 규모: 55 commits, 103 files, +12,667 / -439
- 모델: gpt-codex/gpt-5
- 에이전트: code-reviewer
- 스킬: review
- 결론: Dashboard 전체 테스트와 지정 localhost 흐름은 통과했지만 코드와 검증 계약에 MAJOR 25건이 남아 머지와 배포를 차단한다.

줄 번호는 끝 커밋 `bd0d349959ffcd771db77b617d39daae55f38f34`의 blob 기준이다. `pipeline-state.osmu.md`의 최신 승인 디자인 허브는 v68이지만 과제는 v63을 기반 산출물로 명시했다. 계약 인용은 사용자 지정 v63과 루트 `DESIGN.md`를 우선했고, v68도 실제로 열어 충돌을 확인했다.

## MAJOR

MAJOR: [승인 시안 이탈, 무기록 삭제] `dashboard/src/components/layout/Sidebar.tsx:413` - 접힌 레일에서 `showLabels`가 false가 되면 `RoomFlowNav` 자체를 렌더하지 않아 생성실, 편집실, 발행실, 성과실 링크와 현재 방 강조가 모두 사라진다 / `DESIGN.md:161`의 "사이드바 맨 위에 네 방을 둔다"와 `DESIGN.md:165`의 "접히면 아이콘과 현재 항목 강조만 남는다"에 어긋난다. 커밋 제목은 네 방 복원이고 접힌 상태 삭제 사유는 없다 / `RoomFlowNav`는 항상 렌더하고 접힌 상태에서는 라벨만 감춘 아이콘과 현재 항목 강조를 유지해야 한다.

재현 시나리오: 데스크톱에서 `사이드바 접기`를 누른다. 채널 아이콘은 남지만 네 방 링크는 DOM에서 모두 사라진다. 변경된 `dashboard/tests/components/SidebarShell.test.tsx:217`도 이 삭제를 정상 동작으로 고정한다.

MAJOR: [승인 시안 이탈, 회귀 위험] `dashboard/src/components/layout/Sidebar.tsx:307` - 첫 방문의 `railCollapsed`는 화면 폭이 아니라 로컬 저장값만 보고 기본 false가 되며, 1024에서도 224px로 열린다. `:393`의 flex 항목 폭도 56px에서 224px로 바뀌어 본문을 밀어낸다 / `DESIGN.md:157`의 "1024는 좌 56px 자동 축소"와 `DESIGN.md:262`의 "224px 패널이 56px 레일 위로 임시 겹침된다. 본문과 담당의 폭은 바뀌지 않는다"에 어긋난다 / 1024 기본값은 56px로 정하고, 펼침은 56px 레일의 레이아웃 폭을 유지한 겹침 패널로 구현해야 한다.

재현 시나리오: 로컬 저장을 비운 새 브라우저로 1024px 화면을 연다. 사이드바는 224px로 시작하고, 접었다가 펴면 본문 폭도 함께 줄어든다.

MAJOR: [승인 시안 이탈] `dashboard/src/components/layout/Sidebar.tsx:540` - 접기 단추가 작업 공간 브랜드 오른쪽이 아니라 전체 탐색 뒤 하단에 있고 `:550`에서 문자 기호 `▶`, `◀`를 직접 노출한다 / `DESIGN.md:165`의 "브랜드 오른쪽 아이콘 하나"와 승인 v63의 브랜드 내부 SVG 단추 구조에 어긋난다 / 단추를 작업 공간 머리줄 오른쪽에 두고 승인 시안의 SVG 꺾쇠를 재사용해야 한다.

재현 시나리오: 데스크톱 사이드바를 끝까지 내려 본다. 접기 조작은 브랜드 머리줄이 아니라 메뉴 하단에 있고 확정 시안과 다른 문자 기호가 보인다.

MAJOR: [회귀 위험, 상태] `dashboard/src/app/studio/page.tsx:521` - 계정 조회 대기 상태의 초깃값은 빈 객체인데 `:1597`은 해당 플랫폼 값이 true일 때만 불러오는 중으로 판단하고 `:2226`은 첫 effect 전 즉시 `계정 연결하기`를 노출한다 / `DESIGN.md:668`의 다섯 상태와 계정 조회 중 발행 행동 비활성 계약에 어긋난다 / 첫 렌더부터 지원 플랫폼을 대기 상태로 초기화하고 조회 완료 전 연결 링크와 발행 행동을 열지 않아야 한다.

재현 시나리오: 느린 네트워크에서 `/studio?room=publish`를 새로 연다. 계정 조회 전에 모든 채널이 잠깐 미연결로 보이고 `계정 연결하기`가 나타난 뒤 불러오는 중으로 뒤집힌다.

MAJOR: [무기록 삭제, 회귀 위험] `dashboard/src/proxy.ts:41` - 고객 허용 목록에서 `/api/generate-image`, `/api/midjourney/generate`, `/api/card-news/generate`를 제거했지만 고객 UI 호출은 그대로 남았다 / `dashboard/src/components/queue/ImagePickerModal.tsx:49`와 `dashboard/src/components/channel/InstagramPage.tsx:77`, `:305`가 해당 경로를 계속 호출하고 `wiki/거버넌스/결정.md:141`의 고객 직접 생성 계약과 어긋난다. 보안 차단 사유는 있으나 고객 기능 삭제나 대체 동선 승인은 없다 / 취약한 경로를 다시 열지 말고 UI를 테넌트 저장소, 비용 장부, 결과 manifest가 있는 Studio 생성 경로로 이관해야 하며 이관 전에는 깨진 조작을 노출하지 않아야 한다.

재현 시나리오: 고객으로 큐 이미지 추가 창에서 `새 이미지 만들기`를 누르거나 Instagram 카드뉴스 및 미드저니 생성을 누른다. 조작은 보이지만 프록시에서 403이 난다.

MAJOR: [무기록 삭제, 회귀 위험] `dashboard/src/app/api/video/subtitle/route.ts:116` - 자막 경로만 기존 `data/videos` 폴백을 없애고 테넌트 폴더만 찾는다 / `dashboard/src/lib/storage.ts:91`의 기존 영상 지원과 이를 쓰는 재생, 재서명, 발행 경로는 유지돼 같은 영상이 재생과 발행은 되지만 편집만 422로 막힌다. 커밋에는 소유권 강화만 있고 기존 영상 이전이나 기능 중단 결정은 없다 / 공용 폴더를 다시 열지 말고 기존 파일 소유권을 manifest 또는 DB로 확정해 테넌트 폴더로 이전해야 한다.

재현 시나리오: `data/videos`에만 남은 기존 작업물을 서명 URL로 재생한 뒤 같은 파일명으로 자막 넣기를 호출한다. 재생은 되지만 자막 경로는 422를 반환한다.

MAJOR: [무기록 삭제, 기능 삭제] `openclaw/extensions/threads-publish/src/threads-publish-tool.ts:150` - 승인 큐와 스키마가 계속 허용하는 `/images/` 로컬 이미지를 Meta 요청 전에 무조건 `provider_failed`로 닫는다 / 같은 파일의 이미지 게시 스키마와 `openclaw/extensions/threads-queue/src/threads-queue-tool.ts:293`의 `imageUrl` 보관은 남았고 `docs/구현현황.md:350`은 기존 기능 유지라고 반대로 기록돼 있다 / 테넌트 비공개 저장소에서 짧은 만료의 공급자 배달 URL을 발급하는 대체 경로를 완성해야 한다.

재현 시나리오: 승인 큐의 `/images/customer.png`를 가진 Threads 작업물을 발행한다. Meta 호출 전에 항상 실패한다.

MAJOR: [회귀 위험, 배포] `openclaw/extensions/instagram-publish/src/instagram-publish-tool.ts:82` - 로컬 이미지 업로드는 `R2_PUBLIC_URL`을 필수로 요구하고 `:88`에서 없으면 실패하지만 배포 workflow가 만드는 운영 환경에는 이 값을 넣지 않는다 / `.github/workflows/deploy-marketing.yml:203`의 R2 환경 렌더에는 키, 버킷, endpoint만 있고 `.env.example:55`도 공개 URL을 쓰지 않는다고 확정한다. 새 테스트만 운영에 없는 값을 주입했다 / 공개 버킷 변수를 되살리지 말고 기존 비공개 저장소와 만료 가능한 HMAC 배달 경로를 발행기에 연결해야 한다.

재현 시나리오: workflow가 만든 운영 `.env.osmu`로 `/images/first.png` 게시를 실행한다. `R2 credentials not configured`로 끝나고 Instagram에는 요청조차 가지 않는다.

MAJOR: [회귀 위험, 돈, 격리] `openclaw/extensions/instagram-publish/src/instagram-publish-tool.ts:94` - 최대 10장의 고객 이미지를 인증 없는 공개 R2 객체로 만들지만 성공, 중간 업로드 실패, Meta 실패 어느 경로에도 삭제나 만료 계약이 없다 / 고객 결과물은 고객 자산이며 재발급, 삭제, 보관 기간을 Studio가 소유한다는 요청 계약에 어긋난다 / 발행 전 실패에는 보상 삭제를 하고 성공 객체는 공급자 fetch에 필요한 짧은 lifecycle TTL과 테넌트 장부를 가져야 한다.

재현 시나리오: 10장 중 8번째 업로드를 반복 실패시킨다. 매 시도에서 앞선 공개 객체가 남아 저장 비용과 노출 시간이 누적된다.

MAJOR: [회귀 위험, 영속성] `openclaw/extensions/threads-queue/src/queue-lock.ts:13` - `proper-lockfile` 대상으로 없는 `queue.json`을 0바이트 생성하지만 `openclaw/extensions/threads-queue/src/threads-queue-tool.ts:268`과 `openclaw/extensions/threads-queue/api.ts:30`은 빈 문자열을 `JSON.parse`하고 파일 부재만 신규 큐로 취급한다 / 신규 작업 공간이 첫 실행부터 동작해야 한다는 사업 좌표와 어긋난다 / 잠금 안에서 부재 파일을 유효한 초기 큐로 원자 생성하고 첫 list, add, 재시작까지 통합 검증해야 한다.

재현 시나리오: `queue.json`이 없는 신규 작업 공간에서 큐 목록이나 추가를 처음 호출한다. 빈 파일이 남은 뒤 `Unexpected end of JSON input`이 반복된다.

MAJOR: [회귀 위험, 동시성] `openclaw/extensions/threads-insights/src/threads-insights-tool.ts:160` - 새 공용 큐 잠금은 queue 도구와 발행기만 감싸고 Insights는 잠금 밖에서 전체 큐를 읽은 뒤 외부 API를 기다리고 `:262`에서 오래된 전체 스냅샷을 다시 쓴다 / 취소, claim, `publishAttempt`를 보존해야 하는 동시성 계약에 어긋난다 / 외부 조회 결과는 patch로만 들고 공용 잠금 안에서 최신 큐를 다시 읽어 지표 필드만 병합하고 임시 파일 rename으로 저장해야 한다.

재현 시나리오: Insights가 큐를 읽은 뒤 지표 API를 기다리는 동안 고객이 취소하거나 발행기가 claim을 기록한다. Insights가 마지막에 옛 큐를 쓰면 새 취소와 claim이 사라진다.

MAJOR: [부분 실패, 영구 정체] `openclaw/extensions/threads-queue/src/queue-claim.ts:105` - `result_unknown`으로 `publishing`이 남은 작업은 lease가 끝나도 재claim을 영구 거절하고 `openclaw/extensions/threads-queue/src/threads-queue-tool.ts:470`은 release도 거절하지만 공개 action에는 결과를 확정하는 reconciliation 경로가 없다 / 부분 실패는 외부 게시 여부를 확인해 닫아야 한다는 v63 계약에 어긋난다 / 공급자 조회 또는 운영자 판정으로 unknown을 published 또는 failed로 종결하는 명시적 복구 action이 필요하다.

재현 시나리오: Meta가 게시를 수락한 직후 응답 연결을 끊는다. `result_unknown` 뒤 release와 재claim이 모두 불가능해 해당 글이 영구 정체된다.

MAJOR: [회귀 위험, 동시성, 돈] `dashboard/src/lib/anthropic.ts:361` - 공유 OAuth CLI 직렬화가 프로세스 로컬 Promise라 서버가 둘이면 같은 자격증명을 동시에 쓰고 재시작하면 대기 상태가 사라진다. `:389`의 대기 제한 60초는 실행 제한 120초보다 짧다 / 사업 좌표의 영속 몫 계약에 어긋난다 / DB 기반 전역 큐 또는 advisory lock, 영속 상태, fencing token, 테넌트별 공정성을 둬야 한다.

재현 시나리오: 인스턴스 A와 B에 공유 생성 요청을 동시에 보내면 같은 OAuth 프로필을 함께 쓴다. 한 인스턴스에 70초 요청 두 건을 보내면 둘째는 실행 전에 60초에 거절된다.

MAJOR: [회귀 위험, 런타임] `dashboard/src/lib/anthropic.ts:34` - CLI 후보를 `existsSync`만으로 확정해 디렉터리나 실행 권한 없는 파일도 선택하며 spawn의 EACCES 또는 ENOENT에서 다음 후보와 PATH로 넘어가지 않는다 / 최근 커밋의 감독 실행환경 복구 목적과 Node의 실행 가능 권한 계약에 어긋난다 / regular file과 실행 권한을 확인하고 실제 spawn 실패 시 다음 후보를 순차 시도해야 한다.

재현 시나리오: 첫 후보에 실행 권한 없는 파일을 두고 다음 후보에는 정상 실행 파일을 둔다. 첫 파일에서 모든 공유 생성이 실패하고 정상 후보는 시도되지 않는다.

MAJOR: [돈, 부분 실패] `dashboard/src/app/api/ai-suggest/guide/route.ts:36`, `dashboard/src/app/api/ai-suggest/keywords/route.ts:32`, `dashboard/src/app/api/card-news/outline/route.ts:24` - `generateText`는 `dashboard/src/lib/anthropic.ts:582`에서 quota와 사용 기록을 확정한 뒤 반환하고 라우트는 그 뒤에 JSON 파싱과 결과 구조 검증을 한다 / 잘못된 형식이면 고객은 500을 받고 재시도하지만 월 생성 몫은 이미 줄며, `null`이나 문자열 대체값도 `success:true`가 될 수 있다 / 구조 검증까지 성공 경계에 포함하고 파싱 실패에는 reserve 보상 또는 동일 시도 재사용을 적용해야 한다.

재현 시나리오: 공유 CLI가 일반 텍스트 또는 `{"guide":null}`을 반환한다. 전자는 HTTP 500과 quota 차감이 함께 발생하고 후자는 사용할 수 없는 값이 200 성공으로 반환된다.

MAJOR: [동시성, 돈, 자원] `dashboard/src/app/api/video/subtitle/route.ts:164` - 인증된 고객 요청마다 최대 180초 ffmpeg를 즉시 만들며 테넌트별 및 전역 동시 실행 상한이나 호출 속도 제한이 없다. `probeVideo` 실패도 `:66`에서 6초 기본값으로 닫혀 길이 제한을 우회한다 / OWASP API4의 프로세스 수, 실행 시간, 요청 빈도 제한과 여덟 컨셉 동시 운영 계약에 어긋난다 / probe 실패는 닫고 영속 작업 큐와 테넌트 1개 및 전역 N개 worker 상한, 429와 `Retry-After`를 적용해야 한다.

재현 시나리오: 같은 고객 토큰으로 자막 POST 30개를 동시에 보낸다. 요청 수만큼 ffmpeg가 떠 공유 CPU와 디스크를 최대 180초 점유한다.

MAJOR: [승인 시안 이탈, 부분 실패] `dashboard/src/components/home/PerformanceDashboard.tsx:41` - 글별 실패 근거는 POST 응답 뒤 컴포넌트 메모리에만 있고 새로고침하면 빈 배열로 돌아간다. GET 응답은 coverage만 초기화하고 실패 evidence를 복원하지 않는다 / 요청 대장의 "어느 글이 왜 실패했는지 말한다" 계약에 어긋난다 / 고객 노출 가능한 근거를 영속 저장하고 GET 응답과 화면 초기 상태가 복원해야 한다.

재현 시나리오: 두 글의 성과 수집을 실패시킨 직후에는 상세가 보인다. 페이지를 새로고침하면 `failureDetails`가 비어 판정 근거가 사라진다.

MAJOR: [회귀 위험, 중복 과금과 게시] `dashboard/src/app/studio/page.tsx:1304` - 화면은 발행 요청을 45초에 실패 처리하지만 YouTube 서버 업로드는 `dashboard/src/app/api/video/publish/route.ts:229`에서 최대 120초 계속되며 YouTube 분기에는 영속 멱등 예약이 없다 / 부분 성공을 실패로 오인해 재시도하면 외부 게시와 비용이 중복될 수 있다 / 공급자 호출 전에 draft, account, payload 기반 영속 예약을 잡고 시간 초과를 결과 확인 중으로 전환해야 한다.

재현 시나리오: YouTube 업로드가 60초 걸리게 한다. 화면은 45초에 실패를 표시하지만 서버는 게시를 완료한다. 사용자가 다시 누르면 같은 영상이 한 번 더 올라갈 수 있다.

MAJOR: [회귀 위험, 파괴 범위] `.github/workflows/deploy-marketing.yml:541` - 공유 self-hosted Docker daemon에서 모든 실행이 `if: always()`로 전역 builder cache, 오래된 중지 컨테이너, 미사용 익명 볼륨을 정리하며 workflow concurrency와 프로젝트 label 경계가 없다 / Docker 문서상 해당 daemon의 모든 미사용 대상을 다루며 범위를 넘지 말라는 계약에 어긋난다 / OSMU 전용 builder와 label 대상만 정리하고 같은 호스트 배포에는 호스트 lock과 workflow concurrency를 적용해야 한다.

재현 시나리오: 같은 runner의 다른 앱이 익명 볼륨을 가진 채 24시간 넘게 중지돼 있거나 다른 빌드가 겹친다. OSMU 정리가 다른 앱의 컨테이너 참조와 볼륨 또는 재사용 캐시를 삭제한다.

MAJOR: [부분 실패를 성공 처리] `.github/workflows/deploy-marketing.yml:543` - 모든 Docker 조회와 정리 명령에 `|| true`가 붙어 daemon 중지, 권한 오류, prune 실패가 나도 마지막 `df`만 성공하면 단계와 배포 전체가 green이다 / 디스크 재발 방지가 실제 작동했는지 확인한다는 자체 주석과 어긋난다 / 실패를 모아 마지막에 비정상 종료하거나 정리 후 가용 디스크와 캐시 크기의 후조건을 검사해야 한다.

재현 시나리오: Docker 소켓 권한을 제거하고 workflow를 실행한다. 모든 prune이 실패하지만 단계는 성공으로 남는다.

MAJOR: [회귀 위험, 자원] `openclaw/scripts/tsdown-build.mjs:503` - Rayon 수를 남은 메모리가 아니라 V8 heap 상한으로 계산한다. 자체 수치인 7,941MB VM에서 heap 4,357MB와 Rayon 2GiB, 상시 서비스 1,800MB를 합치면 이미 총량을 넘고 Docker와 운영체제 몫은 없다. 기존 `RAYON_NUM_THREADS`도 검증 없이 상한을 우회한다 / VM OOM 방지 목적과 어긋난다 / 총 메모리에서 상시 서비스, 운영체제, BuildKit, native worker를 한 통합식으로 예산화하고 기존 값도 양의 정수 및 계산 상한으로 제한해야 한다.

재현 시나리오: 주석의 VM 수치를 함수에 넣으면 자체 예산부터 총량을 넘긴다. `RAYON_NUM_THREADS=64`를 주면 새 계산도 건너뛴다.

MAJOR: [회귀 위험, 테스트 실패] `openclaw/scripts/tsdown-build.mjs:46` - headroom과 `RAYON_NUM_THREADS` 정책을 바꾸고 기존 테스트 기대값을 갱신하지 않아 표적 테스트 26건 중 5건이 실패한다 / 머지 전 회귀 테스트 통과와 거짓 완료 금지에 어긋난다 / 자원 산식을 바로잡은 뒤 플랫폼과 메모리 경계 기대값을 같은 커밋에서 갱신해야 한다.

재현 시나리오: `pnpm exec vitest run test/scripts/tsdown-build.test.ts --config test/vitest/vitest.tooling.config.ts --maxWorkers=1`을 실행한다. 21건만 통과하고 5건이 실패한다.

MAJOR: [부분 실패를 성공 처리, 증거] `dashboard/scripts/lib/api-sweep-contract.mjs:2` - 예상 상태코드가 같으면 본문 사유를 보지 않고 계약상 거절로 통과시키고 `:8`은 2xx JSON에서 최상위 `ok:false`만 실패로 본다 / 503 DB 장애, `200 {error:...}`, `200 {success:false}`, 200 HTML 로그인 페이지가 정상으로 집계될 수 있다 / 라우트별 status, media type, 안정적 error code, 성공 body schema를 함께 검사해야 한다.

재현 시나리오: 연결 API가 OAuth 미설정 대신 DB 장애 503을 반환하거나 GET 라우트가 `{"error":"API key not set"}`를 200으로 반환한다. 둘 다 sweep 성공으로 집계된다.

MAJOR: [부분 실패를 성공 처리, 증거] `dashboard/scripts/verify-api-read-sweep.mjs:252` - `evidence_stable`은 현재 디스크 source hash와 listener PID의 동일성만 보고 `git rev-parse HEAD`를 검증 커밋으로 적는다. 서버가 그 커밋으로 빌드됐다는 결선이 없다 / 검토 당시 3456 listener는 05:20 시작, 끝 커밋은 19:02였고 health 응답에는 build SHA가 없었다 / build SHA를 서버 응답에 주입하고 기대 SHA와 일치시켜야 한다.

재현 시나리오: 커밋 A 서버를 3456에 띄운 뒤 checkout만 B로 옮겨 sweep한다. 응답 계약이 같으면 보고서는 B를 검증했다고 거짓 기록한다.

MAJOR: [부분 실패를 성공 처리, 증거] `dashboard/scripts/verify-basic-flow-e2e.mjs:71` - 성과 제안의 `suggestionId` 보존은 detail 문구로만 출력하고 통과 조건은 HTTP 200 하나다 / 성과가 다음 생성 결정으로 돌아가야 한다는 사업 좌표의 핵심 루프와 어긋난다 / status와 원 요청의 `suggestionId` 보존을 함께 통과 조건으로 묶어야 한다.

재현 시나리오: enqueue 응답에서 `post.sourceContext.suggestionId`를 제거하고 200만 유지한다. `출처 보존 안 됨`이 찍히지만 11/11과 exit 0이 나온다.

## MINOR

MINOR: [회귀 위험, 테스트 실효성] `dashboard/src/lib/anthropic-runtime.regression-1.test.ts:13` - resolver와 spawn을 실행하지 않고 함수명과 경로 문자열 존재만 검사한다 / 실제 경로 선택과 실행 가능성 검증 계약에 어긋난다 / 임시 사용자 경로와 PATH에 실행 가능 파일과 실행 불가 파일을 만들어 fallback과 실제 spawn 결과를 관찰해야 한다.

재현 시나리오: 실행 경로를 다시 깨뜨려도 검사 문자열만 남으면 테스트는 통과한다.

## 직접 실행 및 관찰 증거

- `GET http://localhost:3456/api/health`: HTTP 200, `ok=true`, `db=up`. build SHA는 없음.
- listener: PID 64529, 시작 2026-09-15 05:20:05 KST. 검토 끝 커밋은 2026-09-15 19:02:48 KST이므로 같은 빌드라는 증거가 없음.
- 지정 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`에서 `dashboard/scripts/verify-basic-flow-e2e.mjs`: 11/11, exit 0.
- 같은 작업 공간에서 `dashboard/scripts/verify-studio-v1-e2e.mjs`: 14/14, exit 0. 이번 실행은 무료 재생성 성공 경로가 아니라 이미 소진된 409 경로를 통과함.
- `cd dashboard && npm run test`: 361 files passed, 2,319 tests passed, 3 skipped, exit 0.
- `cd dashboard && npx tsc --noEmit`: exit 0.
- OpenClaw tsdown 표적 테스트: 26건 중 21건 통과, 5건 실패, exit 1.
- `git diff --check 0774bf9e..bd0d3499`: 위반 0건.
- 운영 배포, 외부 SNS 실제 발행, 외부 계정 성과 수집은 미검증.

## 셀프심문

"내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?"

사이드바를 접는 순간 네 방 이동이 사라지는 문제, 고객 화면의 생성 단추가 403으로 끝나는 문제, 신규 작업 공간의 큐가 빈 파일에서 영구 실패하는 문제, 느린 YouTube 업로드가 실패로 보인 뒤 재시도돼 중복 게시되는 문제가 가장 그럴듯하다. 모두 MAJOR로 확인했으므로 PASS를 줄 수 없다.

## 4축 판정

- 승인 시안 이탈: 지적 5건. 네 방 접힘 삭제, 1024 레일 폭, 접기 단추 위치, 계정 로딩 상태, 성과 실패 근거 소실.
- 회귀 위험: 지적 25건. 격리, 비용, 동시성, 부분 실패, 런타임, 영속성, 테스트, 배포 삭제를 포함하며 여러 축 항목은 중복 집계했다.
- 토큰 위반: 문제없음. 고정 diff의 변경 UI에서 새 색상 리터럴이나 인라인 style을 발견하지 않았고 `ui-token-audit`를 포함한 Dashboard 전체 테스트가 통과했다.
- 무기록 삭제: 지적 5건. 접힌 레일의 네 방, 고객 생성 세 경로, 기존 영상 자막 편집, Threads 로컬 이미지 발행, 공유 runner의 비OSMU Docker 자산.

REVIEW_VERDICT: BLOCK

SKILLS_USED: review
SKILLS_SKIPPED: review의 자동 수정 단계는 코드 수정 금지 역할 계약에 따라 사용하지 않음.

KNOWLEDGE_QUERY: OSMU 사업 좌표, v63 승인 프로토타입, v68 최신 승인 핀, 확정 요구 대장, 큐 동시성, 유료 몫, R2 운영 계약, API 자원 상한, 실행 권한, Docker 정리 범위
HITS_USED: BRAIN의 ZERO-ONE Marketing Studio 정의는 채널별 변환과 성과 회수의 제품 경계 판단에 사용. repo 사업 좌표는 다계정, 동시 운영, 영속 몫의 직접 계약이라 사용. v63과 DESIGN.md는 네 방, 1024 레이아웃, 상태 계약에 사용. OWASP, GitHub, Node, Docker 공식 문서는 자원 상한, workflow 동시성, 실행 가능성, 전역 정리 범위를 판정하는 데 사용.
HITS_REJECTED: 다른 벤처의 마케팅 심리 문서는 이번 코드의 격리, 동시성, 빌드 안전 판정과 직접 연결되지 않아 제외. v68은 실제로 열었지만 사용자가 이번 리뷰 기반을 v63으로 명시했으므로 직접 계약 인용에는 사용하지 않음.
CONFLICTS: `pipeline-state.osmu.md`의 최신 승인 design_hub는 v68이지만 과제는 v63을 고정 기반으로 지정한다. 이번 리뷰는 v63을 우선했고 핀 충돌 때문에 시각 표현의 전체 일치 판정은 하지 않았다.

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
- https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency
- https://nodejs.org/api/fs.html
- https://docs.docker.com/reference/cli/docker/builder/prune/
- https://docs.docker.com/reference/cli/docker/volume/prune/

MODEL: gpt-codex/gpt-5
