# OSMU 채널 예약 발행·공유 생성 인계

## 2026-09-18 21:08 KST · 단일 기본 계정 저장 계약 최종 핀 후보

- 현재 묶음에서 메시징 신규값 검증 실패·불명확은 DB와 gateway 파일의 기존 값·enabled를 보존한다. Discord는 GET 응답의 Incoming Webhook type=1·대상 channel_id를 확인한다. Slack의 malformed JSON 400은 발행 권한 증거가 아니므로 unverified이며 새 연결을 확정하지 않는다. 부분 저장 503은 서버 안내를 화면 토스트로 보여주고 입력·편집 상태를 보존한다.
- 표적 Vitest 7파일 75/75 PASS 뒤 UI 503 안내 1건 추가 파일 22/22 PASS, Discord 유형 거절 1건 추가 파일 6/6 PASS. 실제 로컬 PostgreSQL 왕복 1/1 PASS(같은 manual 계정 재시도 시 동일 id). 최종 TypeScript `tsconfig.ci.json --noEmit` exit 0. 이들은 외부 공급자 실연결/실발행 증거가 아니다.
- 남은 후속: Slack 실제 연결을 확정하려면 회원에게 테스트 메시지 발행을 명시한 동의·응답 계약이 필요하다. 다중 계정·재검사는 별도 전체 플로우 백로그다. 운영 config 파일 권한 확인과 실계정 브라우저 전송은 컨트롤러 QA 소유다.

## 2026-09-18 20:51 KST · 독립 리뷰 후 연결 판정 보강

- 추가 결함 수리: 검증 실패·확인 불가인 신규 자격정보는 기존 DB 기본 계정과 gateway 파일을 모두 보존한다. Slack은 안전한 잘못된 JSON 탐침에 대한 `invalid_payload`도 실제 게시 권한의 증거가 아니므로 `unverified`로 두고 기본 계정을 만들지 않는다. 실제 Slack 연결 완료에는 회원에게 보이는 테스트 메시지 발행 계약이 별도로 필요하다. 미러·파일 저장 실패는 503이며 DB 기본 계정만 남을 수 있다. UI는 저장 미완료를 알리고 입력을 보존하며 재조회·같은 값 재시도를 안내한다. CHANNEL-32·33 mock 오류 주입과 실제 DB 동일 값 재시도에서 중복 계정 없음으로 검증했다.
- 기존 제품 갭: 최신 승인 범위를 벗어나는 과거 v64 메시징 다중 계정 목록·기본 전환·삭제·저장 키 재검사는 이 단일 기본 계정 수리에 포함되지 않았다. 전체 회원 플로우의 후속 백로그다.

- Discord 기본 계정의 OAuth/임의 토큰이 연결됨으로 표시되는 오류를 막았다. Slack·Discord는 URL 스킴, 정확한 호스트, 경로와 저장된 API 유형을 모두 확인한다. Telegram 공개 채널은 봇의 관리자·게시 권한을, 그룹은 봇의 메시지 전송 자격을 getChatMember로 확인한다. 공급자 응답에서 채팅 유형이나 권한을 확인하지 못하면 연결 검증을 거절한다. 이는 연결 사전 검사이며 실제 메시지 발행 성공의 증거는 아니다.
- CI의 postgres/testdb 서비스와 루프백 fixture DB만 DB 왕복 테스트 대상으로 허용하고, 전용 고정 테스트 암호화 키를 사용한다. 운영 DB 주소는 거절한다. 최신 표적 Vitest 6파일 64/64 이후 그룹 기본 권한 3건 추가(최종 합계 67건), 실제 로컬 PostgreSQL 왕복 1/1 PASS. TypeScript 최종 검사가 진행 중이며 종료 결과를 확인한 뒤 두 번째 커밋에 반영한다.
- 잔여 위험: 수동 저장은 channel_accounts와 integrations 미러가 별도 트랜잭션이므로 미러 실패 시 저장된 기본 계정이 있는데도 POST는 503일 수 있다. 기존 generic POST가 openclaw.json에도 자격증명을 저장하므로 DB 암호화만으로 저장 전체가 암호화된 것은 아니다. 운영 배포 전 config 파일·디렉터리 권한과 사설 볼륨 접근 범위를 확인해야 한다. Telegram 사람 계정/실제 게시 채널 선택, Slack·Discord 실 Webhook 발행은 미검증이다.
- 다음 실행: TypeScript 결과 확인, 변경 파일만 커밋, 독립 리뷰를 부모가 재확인한다. 부모는 통합 빌드와 실제 회원 채널 연결·원장 검증을 맡고, 실제 외부 발행은 회원이 대상 채널을 지정한 시점에 회수한다.

## 2026-09-18 20:43 KST · 메시징 연결 API 첫 커밋

- `aa663ecb`는 메시징 채널 수동 계정 저장·조회 판정·Telegram 대상 확인과 관련 API·DB 계약 테스트 9파일을 담았다. 로컬 PostgreSQL fixture 왕복 1/1 PASS, 표적 API 테스트 포함 6파일 58/58 PASS, TypeScript 종료 코드 0, 디자인 lint 채널·공용 위반 0. 전체 빌드는 컨트롤러가 통합 worktree에서 한 번 수행하기로 했다.
- 현재 미커밋 잔여는 실제 채널 화면 안내, Bluesky 중복 폼 제거, `CredentialForm` 비동기 값 동기화, 브라우저 픽스처 스모크, 문서·이 인계 파일이다. 변경·테스트를 검토하고 두 번째 scoped commit으로 묶어 부모 컨트롤러에 해시를 알린다.

## 2026-09-18 20:38 KST · 실제 로컬 DB 저장과 화면 검증 분리

- `dashboard/tests/db/channel-config-manual.db.test.ts`에서 루프백 PostgreSQL에 고유 테넌트를 만들고 인증 테넌트 해석과 공급자 검증을 stub했다. 실제 POST 라우트의 저장 결과 `channel_accounts` 기본 계정 1개, 암호문(원문 불포함), 같은 암호문의 `integrations` 미러 1개, 요청 본문 다른 테넌트 ID 무시를 확인했다. 실제 GET 라우트 재조회는 Slack `connected=true`, Webhook 값 `********`, 원문 응답 미포함이었다. 테스트 종료 때 fixture tenant를 삭제했다. 단일 DB 통합 테스트 1/1 PASS. 실제 회원 인증·RLS 전체 보증이나 외부 Slack API 검증은 아니다.
- 브라우저 스모크는 별도 API 가로채기 픽스처이므로 DB 증거와 혼동하지 않는다. 저장소 스크립트 `dashboard/scripts/verify-channel-connection-fixture-e2e.mjs`는 로컬 HTTP origin만 허용하고 Playwright를 패키지 또는 홈 디렉터리 fallback으로 로드한다. 실제 화면 캡처는 `/private/tmp/osmu-channel-3464.png`이고 포트 3464 서버는 종료됐다.
- 최신 검증: TypeScript `tsconfig.ci.json --noEmit` 종료 코드 0, 스크립트 `node --check` 종료 코드 0, `git diff --check` 종료 코드 0. 지난 최신 표적 Vitest는 6파일 58/58 PASS, 로컬 DB 1/1 PASS와 폼 회귀 2/2 재실행, 디자인 lint 2범위 모두 위반 0. 실제 공급자 연결·공개 발행과 운영 배포는 미검증이다.
- 자체 보안 실수: 환경 파일을 검색 대상으로 넣어 로컬 개발 fixture의 `DATABASE_URL`, `OSMU_SECRET_KEY` 값이 도구 출력에 노출됐다. 값은 문서·커밋에 기록하지 않았다. 자체 평가 `ev-20260918-35`에 남겼고 로그는 지우지 않았다. 부모 컨트롤러가 값 비출력 운영 비교로 운영 암호화 키·DB URL·DB 암호가 로컬 개발 fixture와 모두 다름을 확인했다. 로컬 공동 개발환경의 키 회전은 부모가 별도 판단한다.
- 다음 실행: 최신 타입 검사와 좁은 테스트 확인 후 작업 브랜치에 변경 파일만 커밋, 부모에게 커밋 해시와 파일·증거·남은 실계정 경계를 전달한다. 부모는 회원이 실제 대상 채널을 지정한 뒤 운영 브라우저에서 연결→발행→원장 확인을 한다.

## 2026-09-18 20:30 KST · 실제 Slack 화면 스모크와 늦은 설정 수신 수정

- 격리 Next dev 포트 3464에서 저장소 `dashboard/scripts/verify-channel-connection-fixture-e2e.mjs`를 실행했다. 실제 Settings의 Slack 링크를 눌러 `/channels/slack`로 이동, 가짜 Webhook URL을 입력하고 브라우저에서 가로챈 모의 API가 검증 성공을 응답하게 했다. 새로고침 뒤 연결됨과 저장값 `********` 마스킹, 브라우저 콘솔 오류 0건을 관찰했다. 화면 캡처 `/private/tmp/osmu-channel-3464.png`를 직접 열어 마스킹된 입력과 수정 단추를 확인했다. 이 스모크는 브라우저 UI만 실구동하며 DB와 Slack은 건드리지 않았다. 개발 서버는 종료했다.
- 첫 스모크에서 연결됨인데 빈 입력과 새 연결 단추가 보이는 결함을 찾았다. SWR 설정이 첫 렌더 뒤 도착해도 `CredentialForm` 내부 값이 초기 빈 상태에서 갱신되지 않았다. 사용자가 이미 입력 중이면 보존하고, 입력하지 않은 폼은 서버 마스킹 값을 받아 수정 상태로 바꾸는 동기화를 추가했다. 라벨과 입력 연결도 보완했다.
- 최신 표적 Vitest 6파일 58/58 통과, 채널 및 공용 컴포넌트 디자인 lint 위반 0. TypeScript는 새 테스트의 `queryByRole` 옵션 타입 한 건을 발견해 수정했고 최신 재실행 결과 대기 중이다. `git diff --check`는 이전 종료 코드 0, 커밋 전 재확인 예정.
- 다음 실행: TypeScript 종료 코드 확인, handoff와 구현현황 최신화, `git diff --check`, 변경 파일만 커밋. 부모 컨트롤러는 커밋 독립 검토 후 회원 실제 연결·DB 기본 계정·대상 채널 발행·원장을 검증한다. 실계정/공개 발행의 외부 회수 시점은 회장이 사용할 대상 채널을 정한 뒤다.

## 2026-09-18 20:02 KST · 메시징 채널 연결 정합, 격리 작업 진행

- 작업 범위: 부모가 위임한 Slack·Telegram·Discord·Bluesky 연결 화면과 저장 상태. 실제 Settings 링크 `/channels/slack`는 `MessagingPage`를 렌더한다. 착수 때 `ChannelPage`의 죽은 Slack OAuth 상수만 보고 현재 화면에도 버튼이 있다고 잘못 판단했다. 라우트 확인 뒤 관련 UI 변경을 철회하고 실제 `MessagingPage`에 안내를 구현했다. 자체 오류는 eval `ev-20260918-29`에 기록했다.
- 현재 변경: 검증된 메시징 자격증명을 인증 테넌트의 `channel_accounts` 기본 계정으로 암호화 저장하고 `integrations`에 동기화한다. DB 실패면 성공 응답을 거부한다. GET은 Slack OAuth bot token, Telegram Chat ID 누락, 서버 암호화 키 부재를 연결됨으로 표시하지 않는다. Telegram 신규 연결은 Bot Token `getMe`와 대상 `getChat`을 확인한다. Bluesky의 중복 일반 폼은 숨기고 기존 AccountManager만 남긴다. 스키마·새 API·실제 시크릿 변경 없음.
- 검증: 표적 Vitest 5파일 54건 통과(추가한 저장→GET 재조회 1건은 별도 단일 파일 15/15 통과), TypeScript `tsconfig.ci.json --noEmit` 종료 코드 0, 채널 컴포넌트 design-lint 위반 0, `git diff --check` 0. Slack/Telegram/Discord 실계정·실 Webhook·회원 브라우저 E2E·운영 배포는 미검증. 컨트롤러 Chrome 9555/9444는 건드리지 않았다.
- 남은 이슈: 회장 회원 계정에 실제 공급자 자격증명과 발행 채널이 없어서 외부 메시지 검증은 컨트롤러 소유. Slack 기존 빈 POST 검증 로직은 실제 채널에서 확인하지 않았다. 본 패치는 모든 플랫폼 카드뉴스·영상·성과 완료를 선언하지 않는다. 앞선 LinkedIn 즉시 발행 이미지 silent drop도 별도 남는다.
- 다음 실행: 이 작업 트리에서 표적 테스트 재실행과 최신 TypeScript 확인 후 변경 파일을 명시해 커밋한다. 부모 컨트롤러가 커밋을 리뷰·통합하고 회원의 Settings→Slack/Telegram/Discord 실제 연결 저장→새로고침→텍스트 발행·원장 확인을 맡는다. 외부 실발행 시점은 회원의 실제 대상 채널 선택 후다.

## 2026-09-18 09:47 KST · 격리 앱 생성 실호출

- worktree의 Next dev 서버를 포트 3462에서 띄워 기존 Studio fixture로 `POST /api/studio/v1/generations`를 호출했다. 응답 HTTP 201, 후보 3개, 서버 로그 201. 종료 후 격리 dev 서버는 내렸다. 이 로컬 환경에는 `CLAUDE_CODE_OAUTH_TOKEN`이 없으므로 이 관찰은 앱의 생성 경로 증거이고, 운영 컨테이너 토큰 전달 증거는 부모 컨트롤러가 공급한 A/B 재현과 단위 테스트다.
- 남은 검증: 패치 배포 후 실제 회원 브라우저에서 생성→편집→발행→성과를 확인해야 한다. 운영 배포와 공개 게시물 실발행은 이 워커가 하지 않았다.

## 2026-09-18 09:42 KST · 두 수정 커밋 완료

- 공유 생성 인증 전달: `c2a92cc9`. LinkedIn 예약 발행·미지원 이미지 거절: `8a13e372`. 둘 다 `work/osmu-channels0918`에 있고 원격 push, 배포는 이 워커가 하지 않았다.
- 표적 Vitest: 공유 CLI 보안 20/20, 예약 발행 20/20, 기존 LinkedIn 어댑터 7/7. 최신 코드 TypeScript `tsconfig.ci.json --noEmit` 종료 코드 0, `git diff --check` 이상 없음. 브라우저·실계정 공개 발행은 부모 컨트롤러가 별도 검증해야 한다.
- 다음 실행: 부모 컨트롤러가 두 커밋을 독립 검토해 기본 작업 트리에 반영한다. 생성 인증은 운영 회원 생성 1건을 실제 UI에서 확인하고, LinkedIn은 연결된 회원 계정의 텍스트 예약 도래와 발행 원장·사용량을 실제 확인한다. 이후 즉시 발행의 이미지 누락(`/api/publish/route.ts` 285~302, 642~644)을 수정하고 카드뉴스·영상 업로드는 별도 계약으로 이어간다.

## 2026-09-18 09:36 KST · code-builder 격리 브랜치 (이전 진행 상태)

- 인계 기준: 부모 컨트롤러가 지정한 현재 HEAD `81da66ee`에서 만든 전용 worktree `/Users/sj/sj_code_master/_wt_osmu_channels0918`, 브랜치 `work/osmu-channels0918`. 관리자·회원 크롬은 컨트롤러 소유여서 이 워커는 건드리지 않았다.
- 완료: 운영 컨테이너 공유 생성 CLI가 OAuth 토큰을 받지 못하는 코드 누락을 좁은 허용 목록에서 수정했다. `c2a92cc9`는 `dashboard/src/lib/anthropic.ts`, `dashboard/tests/anthropic-cli-safety.test.ts` 두 파일만 담는다. synthetic 토큰 상속과 상위 세션 상태·다른 비밀값 차단 테스트 포함, Vitest 20/20 통과.
- 진행: LinkedIn은 즉시 발행 어댑터와 예약 가능 목록에 있었지만 예약 실행 분기가 빠져 있었다. 현재 미커밋 diff가 기존 `publishLinkedIn`을 연결하고, LinkedIn 예약 이미지가 조용히 빠지는 대신 발행 전 거절하며, 계정·권한·불확실 결과·처리 소유권 계약을 테스트한다. `dashboard/src/app/api/schedule/publish-due/route.ts`, `dashboard/src/lib/channel-capabilities.ts`, `dashboard/tests/publish/schedule-publish-due.test.ts`, `docs/구현현황.md`, `wiki/4-reference/channel-status.md`가 해당 diff다.
- 검증: LinkedIn 예약 파일 20/20, 기존 LinkedIn helper 파일 7/7, CLI 보안 파일 20/20 통과. 전체 TypeScript는 이미지 거절 수정 전에 한 차례 종료 코드 0, 최신 코드 대상으로 재실행 중. 전체 build·실계정 공개 발행·운영 배포는 수행하지 않았다.
- 남은 이슈: `/api/publish/route.ts` 285~302행은 LinkedIn 이미지 1장을 받지만 642~644행은 텍스트만 `publishLinkedIn`에 넘겨 이미지를 버린다. LinkedIn 카드뉴스·영상 업로드는 구현되지 않았다. Reels는 Instagram 연결을 쓰는 영상 발행 별칭이므로 별도 OAuth provider로 추가하면 안 된다. Meta 심사·외부 계정 상태는 이 워커 미검증.
- 다음 명령: `git diff --check`; `cd dashboard && ./node_modules/.bin/vitest run tests/publish/schedule-publish-due.test.ts tests/publish/linkedin-publish.contract.test.ts --maxWorkers=1 --minWorkers=1`; 최신 TypeScript 종료 확인; 해당 5파일과 이 인계 파일을 명시 add·별도 commit. 부모 컨트롤러는 `c2a92cc9`를 먼저 독립 검토·배포 판단하고, LinkedIn diff는 코드 리뷰 후 통합한다.
