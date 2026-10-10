# 로컬 실제 경로 검증 보고

STAMP: 2026-10-11 00:29 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skills: qa | 근거: 실제 로컬 PostgreSQL, 로컬 디스크 PNG·MP4, Next.js 3483, Playwright 실제 사용자 경로, ffprobe·픽셀 검사, 채널별 드라이런 요청 기록 | 고민: 외부 게시 금지 상태에서도 어댑터 직전 요청과 실제 미디어를 분리하지 않고 검증했다.

기반 포맷: `logs/diff/chairman-defects-20261009/report.md`

## 한 줄 결론

실제 생성 이미지와 영상이 생성실 목록, 편집실, 발행실을 거쳐 13개 채널 어댑터의 외부 API 직전까지 도달했다. 외부 HTTP 요청은 0건이었다. 다만 LinkedIn 어댑터는 미디어를 보내지 않으며, 발행실 진입 때 직접 발행과 별개인 검토 대기열 연결 경고가 남는다.

## 단계별 판정

| 단계 | 판정 | 직접 관찰 증거 |
|---|---|---|
| 실제 생성 | ✅ 관찰됨 | Higgsfield 경로로 만든 PNG `960×1696`, 2,120,925바이트와 MP4 `768×1356`, H.264/AAC, 4.165986초, 871,070바이트를 로컬 디스크에서 열었다. 픽셀 밝기 범위는 각각 219, 248이었다. |
| 생성실 목록 | ✅ 관찰됨 | 실제 초안 `32d2eaba-5281-43cf-9351-9d8705675a36`의 이미지 썸네일을 브라우저에서 디코딩하고 naturalWidth·naturalHeight가 0보다 큰지 확인했다. [캡처](01-create-room-list.png) |
| 편집실 | ✅ 관찰됨 | 같은 초안을 열어 실제 MP4의 videoWidth·videoHeight·duration을 확인하고 0.5초 이상 재생했다. [캡처](02-edit-room-media.png) |
| 발행실 | ✅ 직접 발행 경로 관찰됨 | 실제 이미지와 실제 영상을 미리보기에 표시하고 13개 채널을 선택했다. [첫 화면 1440×900](03-publish-room-previews.png), [채널별 캡처](publish-previews/) |
| 발행 요청 | ✅ 로컬 드라이런 관찰됨 | 13개 어댑터가 외부 API 직전 엔드포인트·본문·미디어 주소·미디어 규격을 기록했다. 브라우저 외부 HTTP 요청 0건, 콘솔 오류 0건, 401 응답 0건이다. [요청 기록](requests.jsonl) |
| 모바일 사용성 | ✅ 관찰됨 | 실제 데이터가 있는 발행실에서 360·390·412·600·700·780·820·900·1000px 모두 13px 미만 글자 0, 글자 중앙값 16px, 44px 미만 누름 영역 0, 눌림 상태 100%, 가로 넘침 0이다. [측정값](mobile-ergonomics.json) |
| 검토 대기열 연결 | 🔶 잔여 | 최신 내보내기 미디어는 발행실과 직접 발행 요청에 사용됐지만, 구형 Higgsfield 초안에 `editor_handoff`가 없어 화면에 `editor handoff not found` 경고가 보였다. 직접 발행 결과에는 영향이 없었으나 검토 요청 흐름은 별도 수정·검증이 필요하다. |

## 13개 채널 요청과 미디어 판정

아래 `합격`은 로컬 어댑터의 파일 열기·규격 검사와 요청 조립 합격이다. 외부 사업자의 실제 업로드 수락은 게시 금지와 서버 중단 때문에 미검증이다.

| 채널 | 외부 API 직전 엔드포인트 | 보낸 미디어 | 로컬 규격 판정 | 실패·제약과 서버 복구 후 확인할 것 |
|---|---|---|---|---|
| Threads | `graph.threads.net/v1.0/{user-id}/threads` | PNG 주소 | ✅ 960×1696, 2.02MiB, 픽셀 변화 확인 | 운영 공개 HTTPS 미디어 주소로 컨테이너 생성·게시·상태 조회를 실제 확인한다. |
| X | `api.twitter.com/2/tweets` | PNG, 선행 업로드 필요 | 🔶 파일 자체 합격 | 현재 본문은 `UPLOAD_REQUIRED`를 기록한다. 운영에서 미디어 업로드 ID 발급 후 트윗 연결을 확인한다. |
| Facebook | `graph.facebook.com/v21.0/{page-id}/feed` | PNG 주소 | ✅ 파일 자체 합격 | 현재 요청은 URL 필드다. 운영 페이지 게시에서 사진 첨부로 보이는지 확인한다. |
| Instagram | `graph.facebook.com/v21.0/{ig-user-id}/media` | PNG 주소 | ✅ 파일 자체 합격 | 컨테이너 생성 뒤 publish 호출, 공개 HTTPS 접근, 실제 피드 표시를 확인한다. |
| LinkedIn | `api.linkedin.com/v2/ugcPosts` | 없음, 텍스트만 | ❌ 미디어 미전달 | 실제 미디어 미리보기와 요청이 불일치한다. 운영 게시 전에 자산 등록·업로드·UGC 연결을 구현하고 확인해야 한다. |
| Bluesky | `bsky.social/xrpc/com.atproto.repo.createRecord` | PNG 주소 | ✅ 파일 자체 합격 | 운영에서 blob 업로드 뒤 record embed 연결을 확인한다. |
| Telegram | `api.telegram.org/bot…/sendMessage` | PNG 주소 | ✅ 파일 자체 합격 | 현재 엔드포인트 이름은 sendMessage다. 운영에서 사진 전송 API 또는 URL 미리보기 중 의도한 결과인지 확인한다. |
| Discord | `discord.com/api/webhooks/…` | PNG embed 주소 | ✅ 파일 자체 합격 | 운영 webhook에서 embed 이미지가 공개 HTTPS로 로드되는지 확인한다. |
| Slack | `hooks.slack.com/services/…` | PNG block 주소 | ✅ 파일 자체 합격 | 운영 webhook에서 image block이 공개 HTTPS로 로드되는지 확인한다. |
| 카카오톡 | `kapi.kakao.com/v2/api/talk/memo/default/send` | PNG 링크 | ✅ 링크 계약 합격 | 바이너리 첨부가 아니라 이미지 보기 링크다. 운영 메시지의 링크·버튼·권한 범위를 확인한다. |
| YouTube Shorts | `googleapis.com/upload/youtube/v3/videos` | MP4 | ✅ H.264/AAC, 768×1356, 4.166초, 0.83MiB | resumable upload 완료, Shorts 분류, 공개 범위, 처리 완료 상태를 확인한다. |
| Instagram Reels | `graph.facebook.com/v21.0/{ig-user-id}/media` | MP4 | ✅ H.264/AAC, 768×1356, 4.166초, 0.83MiB | REELS 컨테이너 생성·처리 상태·publish 완료를 확인한다. |
| TikTok | `open.tiktokapis.com/v2/post/publish/video/init/` | MP4 | ✅ H.264/AAC, 768×1356, 4.166초, 0.83MiB | `SELF_ONLY`, AI 생성 표시, 댓글·듀엣·스티치 설정, 업로드와 publish 상태를 실제 확인한다. |

## 회장 지적 `발행실 요청 미반영`의 정체와 수정

2026-10-09 재현 보고의 11번 항목은 다음 세 가지였다.

1. 플랫폼 미리보기가 가로 열로 나열돼 한 화면에서 읽기 어려웠다.
2. 발행 미리보기의 실제 이미지·영상 수가 0개였다.
3. 즉시 발행·검토 요청·예약 발행은 버튼만 확인했고 외부 API 직전 경로는 실행하지 않았다.

이번 변경은 플랫폼별 미리보기를 세로 흐름과 채널 초점 필터로 정리하고, 실제 PNG·MP4를 발행실에 연결했다. Threads·X·Facebook·Instagram·LinkedIn·Bluesky·Telegram·Discord·Slack·카카오톡·YouTube Shorts·Instagram Reels·TikTok 13개를 선택해 각 어댑터의 외부 API 직전까지 실행했다. 카카오톡은 공지용 자리표시자가 아니라 실제 채널 미리보기와 발행 어댑터로 편입했다.

실제 외부 게시, 검토 대기열 최종 승인, 예약 시각 도달 후 게시는 정책상 실행하지 않았다. 기존 계정 연결 로그인 화면도 이번 로컬 경로 검증 범위 밖이라 미검증이다.

## 드라이런 안전성

- `PUBLISH_DRY_RUN=1`일 때만 로컬 요청 기록을 만든다.
- `NODE_ENV=production`이면 `PUBLISH_DRY_RUN=1`이어도 드라이런을 비활성화한다.
- 기록에는 액세스 토큰·Authorization·시크릿을 넣지 않는다.
- 브라우저가 관찰한 외부 HTTP 요청은 0건이다.
- 로컬 PNG·MP4와 `.env.local`은 `.gitignore` 대상이며 커밋하지 않았다.

## 증거 목록

- [검증 요약](verification.json)
- [미디어 ffprobe·픽셀 검사](media-specs.json)
- [13개 요청 JSONL](requests.jsonl)
- [발행실 첫 화면](03-publish-room-previews.png)
- [13개 채널별 미리보기](publish-previews/)
- [발행 결과](04-publish-dry-run-result.png)

## 빌드·테스트 증거

| 검증 | 결과 | 로그 핵심 |
|---|---|---|
| `npm exec tsc -- -p tsconfig.ci.json --noEmit` | ✅ PASS | 종료 코드 0, 출력 오류 0 |
| 관련 Vitest 6파일 | ✅ PASS | 6파일, 95건 통과, 실패 0 |
| `next build --webpack` | ✅ PASS | `Compiled successfully in 114s`, `/studio` 정적 경로와 API 동적 경로 생성 완료 |
| 기본 `next build` | ❌ 환경 실패 | Turbopack이 이 worktree 밖을 가리키는 `node_modules` 심볼릭 링크를 파일시스템 루트 밖이라고 거부했다. 같은 소스의 Webpack build는 통과했다. |
| dev 서버 | ✅ PASS | `127.0.0.1:3483`, Ready, 실제 생성실·편집실·발행실 응답과 13개 어댑터 요청 완료 |
| 브라우저 스모크 | ✅ PASS | 실제 초안 열기, 실제 영상 0.5초 재생, 13개 채널 선택·발행 요청, 콘솔 오류 0 |
| design lint | 🔶 기존 경고 | 종료 코드 0. 기존 인라인 style 3파일, 토큰 밖 hex 8파일의 2종 경고가 남았다. 이번 변경은 신규 인라인 style·hex를 추가하지 않았다. |
| pipeline artifact lint | ✅ 정합 PASS | 상태파일 2개의 핀 실체·슬롯키·버전 정합 통과. 기존 산출물 핀 위생 경고 28건은 남았다. |

## 셀프심문과 레드팀

셀프심문: 이 결론이 틀렸다면 가장 그럴듯한 이유는 드라이런 13건을 외부 게시 성공으로 오독하는 것이다. 그래서 판정을 `외부 API 직전 요청 조립`으로 한정하고, 외부 사업자 수락은 채널별 미검증 항목으로 남겼다.

레드팀: 까다로운 사용자는 발행실 첫 화면의 검토 대기열 연결 경고와 LinkedIn 미디어 누락을 보고 `끝까지 됐다`는 결론을 거부할 수 있다. 따라서 직접 발행 경로 합격과 검토 요청·LinkedIn 잔여를 분리했으며, 전체 외부 게시 완료를 주장하지 않는다.

## 벤치마크와 출처

- Threads Publishing 공식 문서: <https://developers.facebook.com/docs/threads/posts>
- Instagram Content Publishing 공식 문서: <https://developers.facebook.com/docs/instagram-platform/content-publishing>
- X Posts 공식 문서: <https://docs.x.com/x-api/posts/create-post>
- YouTube videos.insert 공식 문서: <https://developers.google.com/youtube/v3/docs/videos/insert>
- TikTok Content Posting 미디어 전송 공식 문서: <https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide>
- 카카오 메시지 기본 템플릿 공식 문서: <https://developers.kakao.com/docs/latest/ko/message/rest-api#default-template-msg-me>

SKILLS_USED: qa, 실제 사용자 경로·미디어·브라우저 오류·외부 요청 차단 증거를 한 검증으로 묶는 데 사용.
SKILLS_SKIPPED: review, 최종 코드 리뷰보다 사용자 지정 실제 경로와 계약 테스트가 이번 잔여 과제의 정본이어서 별도 리뷰 스킬은 실행하지 않음.
SOURCES/MODEL: gpt-6.1-sol/Codex | `CLAUDE.md` | `pipeline-state.osmu.md` | `docs/design/prototypes/osmu-editroom-v71-hub-claude-opus-20261001-2335.html` | `logs/diff/chairman-defects-20261009/report.md` | `wiki/거버넌스/결정.md` | 위 6개 공식 API 문서
PRESENTATION_CHECK: 내부 도구 태그 없음 확인, 첫 화면·Threads·Shorts·TikTok 캡처 실제 렌더 확인함.
KNOWLEDGE_QUERY: BRAIN 사업 허브에서 OSMU·OpenClaw 로컬 생성·편집·발행 경로를 좁혀 조회하고, 각 외부 플랫폼의 공식 게시·미디어 전송 문서를 검색했다.
HITS_USED: 프로젝트 ADR·회장 결함 보고는 제품 계약과 미반영 요구의 정본으로, 공식 플랫폼 문서는 외부 API 직전 요청과 서버 복구 후 확인 항목의 근거로 사용했다.
HITS_REJECTED: 마케팅 소개 페이지와 비공식 블로그는 API 계약 근거가 아니어서 제외했고, 오래된 BRAIN 운영 상태는 현재 브랜치 실물보다 낡아 채택하지 않았다.
CONFLICTS: 프로젝트 정책은 외부 실제 게시를 금지하므로 공식 문서의 최종 게시 성공 조건은 이번 로컬 검증에서 확인할 수 없다. 로컬 어댑터 합격과 외부 사업자 수락을 분리했다.
