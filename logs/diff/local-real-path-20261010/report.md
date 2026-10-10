# 로컬 실제 경로 R4 검증 보고

STAMP: 2026-10-11 02:13 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: qa | 근거: 실제 `/api/higgsfield/image` 요청 3건·원본 PNG 육안·4방향 Apple Vision OCR·로컬 PostgreSQL·Next.js 3483 | 고민: 프롬프트 문구만 반복하지 않고 실제 요청의 모델·참조 이미지·초안 본문 유입 여부를 분리해 원인을 확정했다.

기반 포맷: `logs/diff/chairman-defects-20261009/report.md`

## 한 줄 결론

생성실 목록 → 편집실 → 발행실 → 13채널 발행 요청은 기존 R3 판정을 유지한다. 마지막 실패였던 무문자 이미지는 Soul V2의 자율 장식 캡션이 원인이었고, GPT Image 2.5로 바꾼 실제 앱 API 생성 3장이 육안과 4방향 OCR에서 모두 글자 0건이라 R4 전체 경로가 통과했다.

## 단계별 판정

| 단계 | 판정 | 직접 관찰 증거 |
|---|---|---|
| 실제 생성 | ✅ 관찰됨 | 앱의 실제 `/api/higgsfield/image` 경로로 GPT Image 2.5 PNG 3장을 생성했다. 모두 752×1344이고 픽셀 명암차 212~219이며, 원본 육안과 4방향 OCR에서 글자 0건이다. [검증 JSON](r4-image-generation-verification.json) |
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

## 무문자 이미지 R4 원인과 수정

### 실제 요청 추적

- R3 job JSON과 route→CLI import chain을 대조했다. 실제 제공자 요청은 `text2image_soul_v2`, 텍스트 프롬프트, 9:16, 1.5k뿐이었다.
- `image_references`·`custom_reference_id`는 전송되지 않았다. 초안 본문, 카드뉴스 문구, 화면 캡처도 프롬프트에 들어가지 않았다.
- 최종 프롬프트는 컵·잎 장면 묘사와 무문자 조건뿐이었는데 Soul V2가 왼쪽에 세로 장식 캡션을 자체 생성했다. 즉 이번 결함은 참조 이미지 복제가 아니라 모델 출력 성향과 무문자 제어 실패다.
- Higgsfield CLI `model get`으로 Soul V2와 GPT Image 2.5 계약을 확인했다. 두 모델 모두 별도 `negative_prompt` 입력은 없다. 무문자는 자연어 제약으로 전달해야 한다.

### 수정과 실생성 3장

- 무문자 대표 이미지 모델을 `gpt_image_2_5`, 1k, low로 고정했다. CLI 비용 실측은 장당 0.25 credit이며 3장만 생성했다.
- 저장된 job input에 실제 모델·해상도·품질·빈 참조 이미지 목록을 남겨 다음 조사에서 요청을 추측하지 않게 했다.
- 세 요청 모두 `imageReferences: []`이고 초안 본문은 없다. 결과 파일은 `img_1791652044820.png`, `img_1791652046886.png`, `img_1791652048605.png`다.
- 세 원본을 각각 육안으로 확인해 글자·숫자·로고·서명·워터마크가 없음을 확인했다.
- Tesseract는 이 Mac에 설치돼 있지 않았다. 대체 OCR로 Apple Vision을 0·90·180·270도에 적용했다. 결함 원본은 `SHIORdYN ...`을 검출해 음성 대조가 성립했고, 새 3장은 검출 0건이다.

## 드라이런 안전성

- `PUBLISH_DRY_RUN=1`일 때만 로컬 요청 원장을 만든다.
- `NODE_ENV=production`에서는 `PUBLISH_DRY_RUN=1`도 무시한다. 계약 테스트로 고정했다.
- 기록에는 Authorization, 토큰, 시크릿을 저장하지 않는다.
- 브라우저에서 관찰된 외부 HTTP 요청은 0건이다.
- 로컬 생성 미디어와 `.env.local`은 `.gitignore` 대상이며 커밋하지 않았다.

## 검증 결과

| 검증 | 결과 | 증거 |
|---|---|---|
| 무문자 모델 계약 | ✅ PASS | 신규 정상·거절 2건과 기존 비동기 생성 10건, 합계 12건 통과, `/tmp/zto1-r4-vitest-1.log` |
| 실제 API 생성 | ✅ PASS | GPT Image 2.5 3건 completed, 참조 이미지 0건, 생성 한도 3장 준수 |
| 원본 육안 | ✅ PASS | 3장 모두 글자·숫자·로고·서명·워터마크 0건 |
| 4방향 OCR | ✅ PASS | 결함 원본 검출 성공, 새 3장 검출 0건, `/tmp/zto1-r4-ocr-negative-control.json`, `/tmp/zto1-r4-ocr.json` |
| TypeScript | ✅ PASS | `npx tsc -p tsconfig.ci.json --noEmit`, 종료 코드 0, `/tmp/zto1-r4-final-tsc.log` |
| 관련 Vitest | ✅ PASS | 이미지 프롬프트 포함 집중 4파일·44건, Higgsfield 회귀 12파일·91건 통과, 실패 0, `/tmp/zto1-r4-final-vitest.log`, `/tmp/zto1-r4-higgsfield-suite.log` |
| Next.js production build | ✅ PASS | `npx next build --webpack`, 종료 코드 0, `/tmp/zto1-r4-final-build.log` |
| 실제 사용자 경로 | ✅ PASS | `verification.json`의 `ok=true`, 미리보기 13개, 요청 20건, 콘솔·401·외부 요청 0 |
| 실생성 이미지 의미 품질 | ✅ PASS | 새 PNG 3장 모두 육안·OCR 글자 0건 |
| 발행실 캡처 | ✅ PASS | 첫 화면과 채널별 13장이 모두 1440×900 |
| design lint | ⚠️ 기존 경고 | 종료 코드 0, 인라인 style 3파일·토큰 밖 hex 8파일. 이번 변경은 신규 리터럴을 추가하지 않았다. |
| pipeline artifact lint | ✅ 정합 PASS | 상태파일 2개 정합 통과, 기존 핀 위생 경고 28건 |

## 셀프심문과 레드팀

셀프심문: 이 결론이 틀렸다면 가장 그럴듯한 이유는 OCR이 세로 글자를 놓치거나, 실제 앱 경로가 아닌 CLI 직접 호출을 검증했기 때문이다. 그래서 네 방향 OCR을 사용하고, 결함 원본이 실제로 검출되는 음성 대조를 세운 뒤 같은 `/api/higgsfield/image` 경로의 새 3장을 판정했다.

레드팀: 까다로운 고객은 “프롬프트에서 글자만 지운 척하고 참조 이미지가 다시 글자를 넣을 수 있다”고 공격할 수 있다. 이에 각 실제 job input의 모델·전체 프롬프트·빈 reference 목록을 확인하고, 클라이언트가 reference 필드를 보내도 CLI 인자로 승격하지 않는 거절 테스트를 추가했다.

## 벤치마크 적용

- Higgsfield 공식 Soul 2 자료는 Soul 2를 패션·에디토리얼 사진 특화로 설명하고, 공식 비교 자료도 텍스트 렌더링이 핵심 강점이 아니라고 밝힌다. 실제 세로 장식 캡션과 일치해 무문자 대표 이미지에서 Soul을 제외했다.
- Higgsfield 공식 API와 CLI 메타데이터에서 GPT Image 2.5의 1k·low·9:16 계약과 별도 negative prompt 부재를 확인했다. 참조 없이 직접 생성하고 무문자 자연어 제약을 적용했다.
- LinkedIn Vector Assets와 UGC Post 공식 절차를 자산 등록, 업로드, 미디어 연결 3단계로 반영했다.
- X 공식 chunked upload 절차를 initialize, append, finalize, tweet 연결 4단계로 반영했다.
- Telegram Bot API의 `sendPhoto`·`sendVideo`, Bluesky의 `uploadBlob` 뒤 record embed 계약을 반영했다.
- 외부 문서와 회장 정본이 충돌한 지점은 없다. 외부 실제 게시 금지 정책 때문에 호출은 드라이런 경계에서 멈췄다.

SKILLS_USED: qa, 실제 로컬 사용자 경로·요청 원장·미디어·콘솔을 검증하는 데 사용
SKILLS_SKIPPED: review, 이번 위임은 pre-landing 독립 코드리뷰가 아니라 지정된 R4 원인 규명·수정·실생성 검증 작업이므로 사용하지 않음
SOURCES/MODEL: gpt-6.1-sol/Codex | 실제 R3·R4 job JSON | Higgsfield CLI `model get`·`generate cost` | `r4-image-generation-verification.json` | https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/standard/playground | https://higgsfield.ai/blog/soul-2-vs-nano-banana-pro | https://open.higgsfield.ai/models/marketing-studio/image/flare/api-reference
PRESENTATION_CHECK: 내부 태그 잔재 없음 확인 / R3 결함 PNG와 R4 새 PNG 3장 원본 실제 확인함
KNOWLEDGE_QUERY: BRAIN business 인덱스에서 OSMU 제품 맥락을 조회하고, Higgsfield 공식 Soul 2·GPT Image 2.5 문서와 CLI 모델 입력·비용 계약을 검색했다.
HITS_USED: 실제 job JSON을 요청 진실원으로, Higgsfield 공식 모델 설명과 CLI 메타데이터를 모델 교체·negative prompt 부재·비용 근거로 채택했다.
HITS_REJECTED: 다른 사업체의 게시 자동화 사례는 계정·정책·미디어 계약이 달라 채택하지 않았다.
CONFLICTS: 없음. 공식 모델 계약에는 별도 negative prompt가 없었고, 회장 정본의 무문자 요구는 모델 교체와 실제 생성 3장·4방향 OCR 게이트로 충족했다.
