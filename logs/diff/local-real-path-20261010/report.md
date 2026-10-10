# 로컬 실제 경로 R3 검증 보고

STAMP: 2026-10-11 01:48 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: qa | 근거: 로컬 PostgreSQL·디스크 PNG/MP4·Next.js 3483·Playwright·ffprobe·20건 드라이런 요청 원장 | 고민: 외부 게시를 막은 채 업로드 단계까지 실제 어댑터 순서를 검증하고, 생성 이미지의 가짜 글자 실패는 합격으로 포장하지 않았다.

기반 포맷: `logs/diff/chairman-defects-20261009/report.md`

## 한 줄 결론

생성실 목록 → 편집실 → 발행실 → 13채널 발행 요청은 실제 로컬 DB와 미디어로 통과했고, X·LinkedIn·Bluesky는 업로드 포함 전체 호출 순서가 20건 요청 원장에 남았다. 구형 초안 폴백, 내부 오류 숨김, `전체 13곳`, TikTok 사용자 선택도 통과했다. 다만 새 Higgsfield 이미지 1장에 깨진 가짜 글자가 다시 생겨 무문자 생성 항목은 실패다.

## 단계별 판정

| 단계 | 판정 | 직접 관찰 증거 |
|---|---|---|
| 실제 생성 | ⚠️ 부분 실패 | 앱의 실제 `/api/higgsfield/image` 경로로 PNG 1장을 새로 생성했다. 파일은 960×1696, 2,299,965바이트, 픽셀 명암차 219로 정상 이미지지만 왼쪽에 읽을 수 없는 가짜 글자가 보였다. |
| 생성실 목록 | ✅ 관찰됨 | 실제 초안 `32d2eaba-5281-43cf-9351-9d8705675a36`의 새 PNG 썸네일을 브라우저에서 디코딩했다. [캡처](01-create-room-list.png) |
| 편집실 | ✅ 관찰됨 | 같은 초안의 실제 MP4를 열어 크기·길이를 확인하고 0.5초 이상 재생했다. [캡처](02-edit-room-media.png) |
| 발행실 | ✅ 관찰됨 | 실제 PNG와 MP4가 미리보기에 표시되고 필터가 `전체 13곳`으로 보였다. [첫 화면 1440×900](03-publish-room-previews.png), [채널별 13장](publish-previews/) |
| 발행 요청 | ✅ 관찰됨 | 13개 채널의 외부 API 직전 요청 20건을 기록했다. 외부 브라우저 요청 0건, 콘솔 오류 0건, 401 응답 0건이다. [요청 원장](requests.jsonl) |
| 구형 초안 | ✅ 관찰됨 | `editor_handoff`가 없는 초안도 저장된 초안 미디어를 사용해 발행실과 발행 요청을 마쳤고 내부 영문 오류를 노출하지 않았다. |
| TikTok 선택 | ✅ 관찰됨 | 공개 범위와 AI 생성 표시의 초기값이 비어 있고, 사용자가 고른 `PUBLIC_TO_EVERYONE`과 AI 생성 `예`가 유지됐다. `SELF_ONLY` 자동 전환은 없다. |
| 모바일 사용성 | ✅ 관찰됨 | 실제 데이터 화면의 360·390·412·600·700·780·820·900·1000px에서 13px 미만 글자 0, 글자 중앙값 16px, 44px 미만 누름 0, 눌림 상태 100%, 가로 넘침 0이다. [측정값](mobile-ergonomics.json) |

## 13개 채널 요청과 미디어 판정

아래 합격은 로컬 파일 규격과 외부 API 직전 요청 조립 판정이다. 외부 사업자가 실제 게시를 수락했는지는 게시 금지 정책 때문에 미검증이다.

| 채널 | 기록된 실제 호출 순서 | 보낸 미디어 | 로컬 규격 | 실패 사유 또는 운영 복구 후 확인할 것 |
|---|---|---|---|---|
| Threads | `POST /{user-id}/threads` | PNG URL | ✅ 960×1696, 2.19MiB | 컨테이너 생성 후 publish·상태 조회를 실제 확인한다. |
| X | `media/upload/initialize` → `append` → `finalize` → `POST /2/tweets` | PNG 업로드 후 `media_id` | ✅ 이미지 업로드 4단계 | 운영 OAuth 권한과 media 처리 완료 뒤 트윗 첨부를 확인한다. |
| Facebook | `POST /{page-id}/photos` | PNG URL | ✅ 사진 엔드포인트 | 운영 페이지에 사진 게시물로 표시되는지 확인한다. 영상 분기는 계약 테스트에서 `/{page-id}/videos`를 통과했다. |
| Instagram | `POST /{ig-user-id}/media` | PNG URL | ✅ 이미지 컨테이너 | 컨테이너 처리 상태와 publish 완료를 확인한다. |
| LinkedIn | `assets?action=registerUpload` → 업로드 URL `PUT` → `POST /ugcPosts` | PNG 업로드 후 asset URN | ✅ 자산 3단계 | 운영 권한과 자산 상태, UGC 미디어 연결을 확인한다. |
| Bluesky | `createSession` → `uploadBlob` → `createRecord` | PNG blob 후 embed | ✅ blob 3단계 | 운영 세션과 blob ref가 실제 record embed로 표시되는지 확인한다. |
| Telegram | `POST /sendPhoto` | PNG URL | ✅ 사진 엔드포인트 | 운영 채팅에 사진으로 표시되는지 확인한다. 영상 분기는 계약 테스트에서 `/sendVideo`를 통과했다. |
| Discord | `POST webhook` | PNG embed URL | ✅ image embed | 공개 HTTPS 이미지가 실제 webhook 메시지에서 로드되는지 확인한다. |
| Slack | `POST webhook` | PNG image block URL | ✅ image block | 실제 Slack 메시지의 image block 렌더를 확인한다. |
| 카카오톡 | `POST /v2/api/talk/memo/default/send` | PNG 링크 템플릿 | ✅ 링크 계약 | 나에게 보내기 권한과 이미지 링크 미리보기를 확인한다. |
| YouTube Shorts | resumable `videos` 업로드 시작 | MP4 | ✅ H.264/AAC, 768×1356, 4.166초, 0.83MiB | 업로드 완료, 처리 상태, Shorts 분류, 공개 범위를 확인한다. |
| Instagram Reels | `POST /{ig-user-id}/media` | MP4 | ✅ H.264/AAC, 4.166초 | REELS 컨테이너 처리와 publish 완료를 확인한다. |
| TikTok | `POST /v2/post/publish/video/init/` | MP4 | ✅ H.264/AAC, 4.166초 | 회장이 고른 공개 범위·AI 표시·댓글·듀엣·스티치 설정 그대로 업로드·게시되는지 확인한다. |

## `발행실 요청 미반영`의 정체와 수정

2026-10-09 보고에서 발행실은 미리보기의 실제 미디어가 0개였고, 13개 채널 선택과 외부 API 직전 어댑터 실행도 검증하지 않았다. 특히 LinkedIn은 텍스트만, X는 `UPLOAD_REQUIRED`, Telegram은 `sendMessage`, Facebook은 `/feed`, Bluesky는 blob 업로드 전 단계를 생략했다.

이번 R3에서는 실제 초안 PNG·MP4를 발행실에 연결하고 13개 채널을 선택했다. X 4단계, LinkedIn 3단계, Bluesky 3단계, 나머지 10채널 각 1단계까지 총 20건을 요청 원장에 기록했다. 구형 초안은 인계 레코드가 없어도 초안 미디어로 정상 진입하며, 내부 오류 문자열은 사용자 문구로 내보내지 않는다.

## 무문자 이미지 재생성 판정

- 프롬프트에 `the image contains no text`와 빈 표면·근접 구도를 명시했다. 글자는 편집실에서 합성한다.
- 앱의 실제 생성 API로 새 이미지 1장만 생성해 크레딧을 제한했다.
- 새 파일은 픽셀·규격상 정상이나 왼쪽 세로 영역에 `Shiloradyn ...` 형태의 읽을 수 없는 가짜 글자가 있다. 육안 판정은 ❌ 실패다.
- 사용한 Soul V2 모델 메타데이터에는 별도 negative prompt 입력이 없다. 프롬프트만으로 무문자를 보장할 수 없다는 실제 증거다.
- 추가 생성은 이번 지시의 1장 한도를 넘으므로 실행하지 않았다. 다음 시도는 다른 모델 또는 생성 후 글자 탐지·재생성 게이트가 필요하다.

## 드라이런 안전성

- `PUBLISH_DRY_RUN=1`일 때만 로컬 요청 원장을 만든다.
- `NODE_ENV=production`에서는 `PUBLISH_DRY_RUN=1`도 무시한다. 계약 테스트로 고정했다.
- 기록에는 Authorization, 토큰, 시크릿을 저장하지 않는다.
- 브라우저에서 관찰된 외부 HTTP 요청은 0건이다.
- 로컬 생성 미디어와 `.env.local`은 `.gitignore` 대상이며 커밋하지 않았다.

## 검증 결과

| 검증 | 결과 | 증거 |
|---|---|---|
| TypeScript | ✅ PASS | `npx tsc -p tsconfig.ci.json --noEmit`, 종료 코드 0, `/tmp/zto1-r3-final-tsc.log` |
| 관련 Vitest | ✅ PASS | 7파일, 187건 통과, 실패 0, `/tmp/zto1-r3-final-vitest.log` |
| Next.js production build | ✅ PASS | `npx next build --webpack`, 종료 코드 0, `/tmp/zto1-r3-final-build.log` |
| 실제 사용자 경로 | ✅ PASS | `verification.json`의 `ok=true`, 미리보기 13개, 요청 20건, 콘솔·401·외부 요청 0 |
| 실생성 이미지 의미 품질 | ❌ FAIL | PNG 규격은 합격이나 가짜 글자 잔존을 원본 육안으로 확인 |
| 발행실 캡처 | ✅ PASS | 첫 화면과 채널별 13장이 모두 1440×900 |
| design lint | ⚠️ 기존 경고 | 종료 코드 0, 인라인 style 3파일·토큰 밖 hex 8파일. 이번 변경은 신규 리터럴을 추가하지 않았다. |
| pipeline artifact lint | ✅ 정합 PASS | 상태파일 2개 정합 통과, 기존 핀 위생 경고 28건 |

## 셀프심문과 레드팀

셀프심문: 이 결론이 틀렸다면 가장 그럴듯한 이유는 드라이런을 실제 외부 게시 성공으로 오독하거나, PNG 규격 통과를 무문자 품질 통과로 오독하는 것이다. 그래서 외부 게시를 채널별 미검증으로 남기고 새 PNG는 실패로 판정했다.

레드팀: 회의적인 운영자는 “요청 JSON을 예쁘게 만든 것뿐”이라고 공격할 수 있다. 이에 실제 로컬 DB·초안·미디어·Next.js 화면을 Playwright로 이어서 실행하고, 업로드 포함 순서와 외부 요청 0건을 동시에 단언했다. 그래도 운영 자격증명과 사업자 응답은 미검증이므로 서버 복구 후 채널별 실제 게시가 최종 관문이다.

## 벤치마크 적용

- LinkedIn Vector Assets와 UGC Post 공식 절차를 자산 등록, 업로드, 미디어 연결 3단계로 반영했다.
- X 공식 chunked upload 절차를 initialize, append, finalize, tweet 연결 4단계로 반영했다.
- Telegram Bot API의 `sendPhoto`·`sendVideo`, Bluesky의 `uploadBlob` 뒤 record embed 계약을 반영했다.
- 외부 문서와 회장 정본이 충돌한 지점은 없다. 외부 실제 게시 금지 정책 때문에 호출은 드라이런 경계에서 멈췄다.

SKILLS_USED: qa, 실제 로컬 사용자 경로·요청 원장·미디어·콘솔을 검증하는 데 사용
SKILLS_SKIPPED: review, 이번 위임은 pre-landing 독립 코드리뷰가 아니라 지정된 R3 구현·검증 작업이므로 사용하지 않음
SOURCES/MODEL: gpt-6.1-sol/Codex | `logs/diff/chairman-defects-20261009/report.md` | `logs/diff/chairman-defects-20261009-recheck/report.md` | `verification.json` | `requests.jsonl` | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/vector-asset-api | https://docs.x.com/x-api/media/quickstart/media-upload-chunked | https://core.telegram.org/bots/api | https://docs.bsky.app/docs/api/com-atproto-repo-upload-blob
PRESENTATION_CHECK: 내부 태그 잔재 없음 확인 / PNG 원본·발행실 캡처 실제 확인함
KNOWLEDGE_QUERY: BRAIN business 인덱스에서 OSMU·OpenClaw 발행 운영 맥락을 조회하고, 각 채널 공식 미디어 업로드 계약을 검색했다.
HITS_USED: 레포 ADR·회장 결함 보고를 제품 정본으로, LinkedIn·X·Telegram·Bluesky 공식 문서를 어댑터 순서 근거로 채택했다.
HITS_REJECTED: 다른 사업체의 게시 자동화 사례는 계정·정책·미디어 계약이 달라 채택하지 않았다.
CONFLICTS: 없음. 외부 문서의 실제 게시 절차는 드라이런 기록으로만 재현했고 외부 게시 금지 결정은 유지했다.
