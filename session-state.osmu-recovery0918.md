# OSMU 발행 복구·사용량 수리 인계 · 2026-09-18 20:40 KST

## 외부 부작용·증표 경계 재검토

외부 게시가 끝난 뒤 응답이나 내부 DB 기록만 실패하면 재시도가 같은 글을 두 번 게시할 수 있었다.
이전 예약은 공급자 호출 전 영속 표식이 없어 15분 후 자동 회수되었고, 첫 댓글 재시도도 경쟁 요청
두 건이 동시에 전송할 수 있었다. 일반 게시에는 외부 POST 전 `provider_meta.publishAttemptStarted`
표식을 먼저 저장하고, 표식이 있는 오래된 예약은 자동 회수하지 않는다. 첫 댓글 재시도는
`first_comment_status=in_progress` 조건부 UPDATE 선점 뒤에만 전송한다. 불명확한 결과는
`uncertain`으로 잠그며, DB 저장 실패 시 선점 상태와 서명 증표로 재전송 없이 복구한다.
초기 본문 기록 실패 증표에는 이미 시도한 댓글의 `not_requested/published/failed/uncertain`
결과를 함께 서명하고 본문·댓글 필드를 같은 트랜잭션에서 복원한다. 다른 초안·작업 공간에
증표를 쓰거나 일부 채널의 실패를 성공으로 바꾸는 것을 거절한다.

| 외부 부작용 | 성공 증거 | 명시 실패 | 결과 불명확 | 호출 전 영속 경계 | 자동 재시도 |
|---|---|---|---|---|---|
| 일반 글 Threads·IG·X·Facebook·Bluesky·Telegram·Discord·LinkedIn | 공급자 게시 ID | 명시 4xx | 408·429·5xx·응답 유실·2xx ID 누락 | `publishAttemptStarted` | 불명확 시 금지 |
| Slack webhook | HTTP 성공과 본문 `ok` | 명시 4xx | 408·429·5xx·응답 유실·2xx 본문 불일치 | `publishAttemptStarted` | 불명확 시 금지 |
| Reels `media_publish` | 공급자 media ID | 호출 이전의 명시 실패 | POST 뒤 모든 non-2xx·응답 유실·ID 누락 | `reelsPublishAttemptStarted` | 불명확 시 금지 |
| 초기 첫 댓글 | 공급자 댓글 성공 응답 | 명시 4xx | 408·429·5xx·응답 유실·ID 누락 | 본문 예약과 댓글 결과 서명 증표 | 불명확 시 금지 |
| 이미 발행한 본문의 댓글 재시도 | 공급자 댓글 ID | 명시 4xx | 408·429·5xx·응답 유실·ID 누락 | `first_comment_status=in_progress` 선점 | 불명확 시 금지 |

첫 댓글은 현재 Threads·X·Instagram·Facebook만 지원된다. 여기서 미지원 영상 댓글이나
LinkedIn 이미지 발행을 완료로 주장하지 않는다. Slack 성공 판정은 공식 문서
https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/ 의 200/`ok`
계약을 참고했다. 증표 24시간 만료는 안전한 자동 재발급 근거가 없어 지원 확인 조치가 남는다.
운영 배포·실제 SNS 게시·운영 DB 월경계 검증은 이 격리 작업에서 수행하지 않았다.

다음 실행: 코드 소유자는 provider 매트릭스 표적 테스트, 타입체크, webpack 빌드와 독립 코드 리뷰를
통과시킨 뒤 커밋 해시를 부모 컨트롤러에게 전달한다. 부모는 리뷰 PASS와 실제 고객 브라우저 및
운영 적체 증거를 회수한 뒤에만 배포 여부를 결정한다. 종료 증거는 공급자 호출 1회와
댓글 선점 경쟁 1회, 복구 뒤 댓글·큐·사용량 시각의 실제 값이다.

## 최신 변경과 검증

- 독립 리뷰가 첫 댓글 결과 저장 실패의 잘못된 `publication_record` 증표, 큐 복구일로 바뀌는 게시 시각, 여러 채널 중 X 실패가 Threads 복구 뒤 완료로 둔갑하는 문제를 찾았다. 각 경계를 댓글 전용 증표·원시 시각·플랫폼별 진행 상태 저장으로 고쳤다. 이웃 영향으로 Reels 공급자 결과 미확정의 중복 재게시 위험을 `uncertain` 잠금으로 바꾸고 LinkedIn 즉시 발행의 조용한 이미지 누락을 422로 막았다.
- 신규 경계 포함 계약 테스트 51/51, 발행·Reels 표적 66/66, 혼합 채널 새로고침 단독 재실행 1/1, 최종 TypeScript와 디자인 lint 종료 0. 이 추가 변경에 대한 webpack production build는 아직 실행하지 않았다.
- 루트 `dashboard/.env.local`을 이 worktree에서만 심볼릭 링크해 로컬 DB를 연결했다. 포트 3463의 `/api/health` 200, 고객 fixture의 실제 `/performance` 렌더와 콘솔 오류 0, metrics 1회/10초, frame latency 5ms를 관찰했다. 별도 Playwright는 사용량 503(의도적으로 주입)→안내→다시 불러오기→실제 usage 200과 값 렌더→일반 500(의도적으로 주입)의 구분을 통과했다. 응답 순서 `[503,200,500]`, 비기대 콘솔·페이지 오류 0. 재현 스크립트는 `dashboard/scripts/verify-recovery-usage-ui.mjs`, 캡처는 `logs/diff/osmu-recovery0918/` 네 장이다. 임시 고객 토큰은 스크립트가 삭제했고 9555/9444는 건드리지 않았다.
- 24시간 증표가 만료되고 DB에 외부 결과가 전혀 남지 않은 과거 부분 실패는 자동 재발급할 공급자 공통 증명 계약이 없다. 서버는 서명 확인 뒤 만료를 변조와 구분해 재게시 금지·외부 게시 주소와 작업물 번호 준비·고객 지원 문의를 명시한다. Studio는 이 오류와 약관에 기재된 지원 메일 링크를 복구 경고 안에 유지한다. 공급자별 검증 복구 API 또는 운영자 수동 확인 절차의 승인 기술계약이 필요하다.

## 다음 실행

부모 컨트롤러는 추가 변경 커밋을 독립 재검토하고, 로컬 3463 서버에서 `set -a; . ./.env.local; set +a; RECOVERY_UI_BASE_URL=http://localhost:3463 node scripts/verify-recovery-usage-ui.mjs`를 재실행한다. QA 종료 증거는 실제 고객 화면과 스크린샷·콘솔, 한 발행을 중복 호출하지 않은 기록, 적체 및 월경계 DB 결과다. 운영 배포 여부는 그 뒤 판정한다.

## 이전 10:10 인계

## 무엇을 어디까지 했나

- 인계 기준: 부모 컨트롤러가 지정한 최신 08:27 코드 감사 MAJOR 6건·MINOR 1건. 기존 tmux와 9555·9444 브라우저는 이 워커가 사용하지 않았다.
- 격리 worktree `/Users/sj/sj_code_master/_wt_osmu_recovery0918`, 브랜치 `work/osmu-recovery0918`, 시작 HEAD `81da66ee`. 메인 worktree는 수정하지 않았다.
- 일반 글과 YouTube·Reels의 발행 복구 서명 증표, 행·초안·단계 결속, 사용량 발생 시각, 50건 뒤 pending 판정, 기존 예약 크론의 사용량 적체 relay, 성과실 오류 구분과 값 보존, 토큰 요청 abort 통합을 구현했다. DB schema/migration 변경 없음.
- 관련 테스트 표적 묶음 18/18, UI·증표·실 HTTP abort 10/10, 예약 크론·정합 20/20, 기존 발행 분기 32/32, YouTube 19/19 통과. Studio 37/38과 Reels 21/22의 기존 정상 경로 각 1건은 공유 호스트 부하로 5초 시간 초과했으나 20초 제한 단독 재실행에서 모두 통과했다.
- 최종 `npm run typecheck:ci` 종료 0, 디자인 lint 위반 0, `npm run build -- --webpack` 종료 0과 정적 라우트 185/185를 확인했다. 기본 `next build`는 worktree의 외부 node_modules symlink를 Turbopack이 거부해 환경 실패했다. 제품 코드 커밋 `0092db57`.
- 독립 포트 3462 개발 서버에서 `/login`과 `/performance` HTTP 200을 직접 관찰했다. headless Chromium의 `/performance`는 10초 뒤에도 제목 `Marketing Hub`, 본문 공백이었고 HMR WebSocket handshake 오류가 났다. 이 격리 환경에 DB 설정이 없어 `/api/health`는 503이며 로그인 후 성과 화면 내용과 콘솔 오류 0은 검증 실패다.

## 남은 이슈·블로커

- 계정 로그인 뒤 발행 복구와 성과 화면의 실제 데이터·클릭 검증이 남았다. 격리 환경은 DB와 고객 인증이 없고 개발 서버 HMR handshake 오류·빈 본문이 있어 브라우저 스모크 게이트가 미통과다.
- 9555/9444 계정 브라우저 및 운영 DB, 실제 공개 SNS 발행/복구는 부모 컨트롤러 소유이며 이 격리 코드 작업에선 미검증.
- 서명 증표가 없는 과거 partial 응답은 자동 완료를 거절하고 외부 게시 확인 후 운영자 조치를 안내한다. 운영자 전용 과거 건 수동 복구 도구는 이번 변경에 없다.
- 예약 발행 크론의 실제 운영 스케줄 등록 및 주기는 직접 관찰하지 않았다.

## 다음에 칠 명령

부모 컨트롤러: `git -C /Users/sj/sj_code_master/_wt_osmu_recovery0918 log -2 --oneline`으로 제품·문서 커밋을 확인하고 별도 독립 리뷰를 수행한다. 그 뒤 고객 DB가 연결된 격리 실행본에서 로그인, 복구 버튼, 성과실 지연·인증 오류를 브라우저로 확인한다. QA 증거가 승인되기 전 공개 SNS 발행·운영 배포는 하지 않는다.

## 검증했나

표적 Vitest, TypeScript, design-lint, webpack production build는 테스트됨. 격리 HTTP 200은 관찰됨. 브라우저 스모크는 빈 본문·HMR 오류로 NG. 로그인 후 UX, 실제 공급자·운영 배포는 미검증.
