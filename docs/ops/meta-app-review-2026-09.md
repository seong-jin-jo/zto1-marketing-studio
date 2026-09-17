# Meta App Review 제출 패키지, 2026-09

STAMP | line: osmu-meta-app-review | 생성: 2026-09-17 18:48 KST | model: gpt-codex/GPT-5 | agent: tech-architect-worker | skill: postagi-app-deploy | 근거: ADR-004·006, 현재 OAuth·발행·성과·댓글 코드, Meta App Review·Instagram Platform·Threads API 공식 문서, 2026-09-17 사용자 콘솔 실측 | 고민: 심사 통과 가능성을 높이기 위해 넓은 권한 신청보다 실제 화면과 API 호출로 증명되는 최소 권한만 남기되, 현재 코드가 이미 요청하는 `threads_read_replies`와 새로 구현된 Instagram 인사이트의 드리프트는 숨기지 않았다.

> 이 문서는 Meta 앱 `정성컴퍼니`(`1553503759757107`)의 제출 문안과 촬영 대본이다. 비밀값, 개인 Meta 계정 자격증명, 액세스 토큰은 넣지 않는다. Meta 콘솔 메뉴 위치는 2026-09-17 현재 화면 캡처 없이 추측하지 않는다. 아래의 필드명은 Meta 공식 제출 가이드의 명칭이며, 실제 콘솔 라벨이 다르면 현재 화면을 기준으로 다시 대조한다.

## 1. 한 줄 판정

정책 목표는 고객이 테스터 등록 없이 OSMU에서 Instagram, Facebook, Threads를 OAuth로 연결하는 것이다. 제출 권한은 Instagram 4개, Threads 5개, Facebook Page 4개로 잡고 `business_management`는 제외한다. 다만 현재 상태로 제출은 **NO-GO**다. Instagram 인사이트 scope와 호출 host 불일치, Facebook `read_insights` configuration 누락, 액세스 인증 미완료, 심사관 접근 계정 미확보, 권한별 최근 성공 호출과 완성 영상 미확보를 먼저 닫아야 한다.

### 2026-09-17 콘솔 실측과 코드 대조

| 항목 | 현재 근거 | 판정 |
|---|---|---|
| 앱 상태 | 사용자 실측: 앱 `정성컴퍼니` 라이브 | 충족 |
| 이용 사례 | 사용자 실측: Threads API, Instagram 메시지·콘텐츠, 페이지 관리 | 충족 |
| Instagram 3개 권한 | 사용자 실측: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`가 테스트 준비 완료, 표준 액세스 | 고급 액세스 신청 전 상태. 심사 통과 상태가 아님 |
| Redirect URI | 사용자 실측: Facebook 로그인과 Instagram redirect URI가 정확 | 충족. 제출 당일 재확인 |
| 비즈니스 포트폴리오 | 사용자 실측: 정성컴퍼니 연결 | 충족 |
| 액세스 인증 | 사용자 실측: `기술 제공업체 되기: 액세스 인증 완료 필요` 안내 | **미충족, 제출 차단** |
| 개인정보처리방침 | `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/privacy` HTTP 200 직접 관찰 | 충족 |
| 데이터 삭제 안내 | `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/data-deletion` HTTP 200 직접 관찰 | 안내 URL 방식 충족. 콜백 방식은 구현하지 않았다고 명확히 제출 |
| 앱 아이콘·카테고리 | 현재 콘솔 캡처 없음 | **미검증** |

## 2. 최종 요청 권한

### 2.1 요청한다

| 플랫폼 | 요청 권한 | 제품 기능 | 코드 판정 |
|---|---|---|---|
| Instagram | `instagram_business_basic` | 연결 계정 식별·표시 | 구현됨 |
| Instagram | `instagram_business_content_publish` | 이미지·카드뉴스·Reels 발행 | 구현됨 |
| Instagram | `instagram_business_manage_comments` | 댓글 읽기, 답글, 첫 댓글 | 구현됨 |
| Instagram | `instagram_business_manage_insights` | 성과실에서 게시물 조회·좋아요·댓글 지표 수집 | **필요하지만 제출 전 코드 갭 해소 필수** |
| Threads | `threads_basic` | 연결 프로필 식별과 모든 Threads API의 기반 | 구현됨 |
| Threads | `threads_content_publish` | 글·이미지 발행 | 구현됨 |
| Threads | `threads_read_replies` | 소유 게시물의 답글 읽기 | 구현됨. 과제 초안 목록에는 없었지만 현재 OAuth가 이미 요청하고 제품이 실제 사용하므로 반드시 함께 심사 |
| Threads | `threads_manage_replies` | 첫 댓글·답글 작성 | 구현됨. 숨김·숨김 취소는 이번 설명에서 주장하지 않음 |
| Threads | `threads_manage_insights` | 게시물 조회·좋아요·답글·재게시 지표 | 구현됨 |
| Facebook Page | `pages_show_list` | 사용자가 관리하는 Page를 확인하고 Page token을 얻음 | 구현됨 |
| Facebook Page | `pages_manage_posts` | Page feed·photo 게시 | 구현됨 |
| Facebook Page | `pages_read_engagement` | Page 게시물 읽기, `pages_manage_posts`·`read_insights` 종속 권한 | 구현에 필요한 기반 권한. 실제 성공 호출 증거 필요 |
| Facebook Page | `read_insights` | Page 게시물 인사이트 읽기 | **필요하지만 Facebook Login configuration 갭 해소 필수** |

### 2.2 요청하지 않는다

| 권한 | 판정 | 근거 |
|---|---|---|
| `business_management` | **제외** | OSMU는 Business Manager API로 광고 계정·비즈니스 자산을 조회·요청·관리하지 않는다. 현재 OAuth scope와 런타임 호출에도 없다. Meta 공식 허용 용도는 비즈니스 자산 관리와 광고 계정 요청이다. Page 목록, Page token, Page 게시·인사이트에는 위 4개 Page 권한만 사용한다. |
| `pages_read_user_content`, `pages_manage_engagement` | 이번 제출에서 제외 | Facebook 댓글 읽기·답글 코드는 존재하지만 이 두 권한은 현재 Facebook OAuth configuration 목록에 없다. 이번 Facebook 영상은 연결·Page 발행·Page 성과만 보여준다. Facebook 댓글 기능까지 심사하려면 두 권한과 별도 사용 사례를 추가한 뒤 재제출한다. |

## 3. 권한별 제출 문안과 코드 증거

아래 영문은 Meta 제출창에 붙여넣는 본문이다. 각 권한마다 문안을 따로 넣고 해당 플랫폼 영상과 타임스탬프를 함께 적는다. Meta 공식 가이드는 권한별 설명을 복사해 재사용하지 말라고 하므로 문장과 증거를 권한별로 분리했다.

### 3.1 Instagram

#### `instagram_business_basic`

**한국어 설명**

OSMU는 사용자가 OAuth로 연결한 Instagram 프로페셔널 계정의 ID와 사용자명을 읽어 채널 화면과 발행실에 연결 대상을 표시합니다. 사용자는 발행 전에 어떤 계정으로 게시되는지 확인할 수 있습니다. Instagram 비밀번호는 OSMU가 받거나 저장하지 않습니다.

**English submission text**

OSMU uses `instagram_business_basic` to identify the Instagram professional account that the user connects through Instagram OAuth. We retrieve the account ID and username, display the connected identity in the channel and publishing screens, and let the user verify the destination account before publishing. OSMU never receives or stores the user's Instagram password. Without this permission, we cannot identify the connected account or safely associate later publishing and analytics actions with the correct workspace.

**실제 사용 근거**

- 요청 scope: `dashboard/src/lib/social-connect.ts:182-190`.
- OAuth callback 뒤 외부 identity 확인과 `channel_accounts` 저장: `dashboard/src/app/api/connect/[provider]/callback/route.ts:156-195`.
- 촬영 증거: Instagram 영상 `00:18-00:58`.

#### `instagram_business_content_publish`

**한국어 설명**

OSMU는 사용자가 발행실에서 최종 확인한 이미지, 카드뉴스 또는 Reels와 캡션을 연결된 Instagram 프로페셔널 계정에 게시합니다. 미디어 컨테이너를 만들고 처리 완료를 확인한 뒤에만 게시하며, 성공하면 실제 게시물 링크를 사용자에게 보여줍니다.

**English submission text**

OSMU uses `instagram_business_content_publish` to publish organic image posts, carousels, and Reels that the user has reviewed and explicitly approved in the Publish Room. The app creates the media container, waits for Meta to finish processing it, publishes the container, and displays the resulting Instagram permalink. The permission is used only for content selected by the connected business user and is essential to OSMU's core publishing workflow.

**실제 사용 근거**

- 요청 scope: `dashboard/src/lib/social-connect.ts:186-188`.
- 이미지·카드뉴스 `/{ig-user-id}/media`와 `/media_publish`: `dashboard/src/lib/publish.ts:367-482`.
- Reels container·publish: `dashboard/src/lib/publish.ts:498-588`.
- 촬영 증거: Instagram 영상 `00:58-01:38`.

#### `instagram_business_manage_comments`

**한국어 설명**

OSMU는 사용자가 발행한 Instagram 게시물의 댓글을 성과실에서 읽고, 사용자가 직접 입력하거나 승인한 답글과 첫 댓글을 게시합니다. 자동으로 임의 답글을 보내지 않으며, 사용자가 선택한 댓글과 텍스트에만 동작합니다.

**English submission text**

OSMU uses `instagram_business_manage_comments` to retrieve comments on media owned by the connected Instagram professional account and to publish a first comment or a reply only when the user explicitly requests it. Comments are shown in the Performance Room so the account owner can review engagement and respond from the same workspace. OSMU does not send unsolicited replies and does not use this permission for accounts or media the user does not manage.

**실제 사용 근거**

- 요청 scope: `dashboard/src/lib/social-connect.ts:186-188`.
- 댓글 목록 `/{media-id}/comments`: `dashboard/src/lib/engagement-provider.ts:79-92`.
- 댓글 답글 `/{comment-id}/replies`: `dashboard/src/lib/engagement-provider.ts:156-179`.
- 첫 댓글: `dashboard/src/lib/first-comment.ts:74-90`.
- 촬영 증거: Instagram 영상 `01:18-01:38`, `02:02-02:30`.

#### `instagram_business_manage_insights`

**한국어 설명**

OSMU는 연결된 Instagram 프로페셔널 계정에서 OSMU로 발행한 게시물의 노출, 조회, 좋아요, 댓글 성과를 가져와 성과실에 표시합니다. 이 지표는 사용자가 어떤 콘텐츠가 반응을 얻었는지 확인하고 다음 콘텐츠를 개선하는 데 사용합니다.

**English submission text**

OSMU uses `instagram_business_manage_insights` to retrieve media insights for content published to the connected Instagram professional account. We display impressions or views, likes, and comments in the Performance Room so the account owner can evaluate results and improve future content. The data is used only for the connected account's own performance reporting. Without this permission, Instagram posts remain unmeasured in the user's analytics workflow.

**실제 사용 근거와 제출 전 갭**

- 성과 조회 구현: `dashboard/src/lib/publish.ts:811-890`, `dashboard/src/lib/metrics-collector.ts:785-814`.
- 성과 화면 호출: `dashboard/src/components/home/PerformanceDashboard.tsx:38-85`.
- **GAP IG-INSIGHTS-01:** `dashboard/src/lib/social-connect.ts:182-190`의 OAuth scope에는 이 권한이 없다.
- **GAP IG-INSIGHTS-02:** Instagram Login 토큰은 공식 문서상 `graph.instagram.com`을 써야 하지만 `dashboard/src/lib/publish.ts:843-845`는 `graph.facebook.com`으로 고정돼 있다.
- 위 두 갭 수정, 테스트, 최근 성공 호출, 실제 수치 화면 촬영 전에는 이 권한을 제출하지 않는다.
- 촬영 증거 목표: Instagram 영상 `01:38-02:02`.

### 3.2 Threads

#### `threads_basic`

**한국어 설명**

OSMU는 사용자가 OAuth로 연결한 Threads 프로필의 식별 정보를 확인해 채널 화면과 발행실에 표시합니다. 이 권한은 모든 Threads API 호출의 기반이며, 사용자가 올바른 계정에 연결했는지 확인하는 데 필요합니다.

**English submission text**

OSMU uses `threads_basic` to identify the Threads profile connected through OAuth and display the connected profile in the channel and publishing screens. This base permission is required for all Threads API endpoints used by OSMU and lets the user confirm the destination profile before publishing or reviewing analytics. OSMU does not receive or store the user's Threads password.

**실제 사용 근거**

- 요청 scope: `dashboard/src/lib/social-connect.ts:207-215`.
- OAuth identity 확인과 저장: `dashboard/src/app/api/connect/[provider]/callback/route.ts:156-195`.
- 촬영 증거: Threads 영상 `00:18-00:58`.

#### `threads_content_publish`

**한국어 설명**

OSMU는 사용자가 발행실에서 최종 확인한 글과 이미지를 연결된 Threads 프로필에 게시합니다. 컨테이너 생성과 게시가 성공한 뒤 실제 permalink를 사용자에게 보여줍니다.

**English submission text**

OSMU uses `threads_content_publish` to create and publish text or image Threads that the user has reviewed and explicitly approved in the Publish Room. The app creates the Threads media container, publishes it, and returns the actual permalink so the user can verify the result. This permission is essential to the core workflow of publishing approved content to the user's connected Threads profile.

**실제 사용 근거**

- 요청 scope: `dashboard/src/lib/social-connect.ts:207-215`.
- `/{threads-user-id}/threads`와 `/threads_publish`: `dashboard/src/lib/publish.ts:286-331`.
- 촬영 증거: Threads 영상 `00:58-01:32`.

#### `threads_read_replies`

**한국어 설명**

OSMU는 사용자가 소유한 Threads 게시물의 답글을 성과실에서 읽어 한 화면에서 반응을 확인하게 합니다. 다른 사용자의 소유 게시물이나 사적인 대화를 읽는 용도로 사용하지 않습니다.

**English submission text**

OSMU uses `threads_read_replies` to retrieve replies to Threads owned by the connected profile and display them in the Performance Room. This lets the account owner review responses to their own published content before deciding whether to reply. The permission is not used to read private conversations or replies to Threads the connected profile does not own.

**실제 사용 근거**

- 요청 scope: `dashboard/src/lib/social-connect.ts:207-215`.
- `/{thread-id}/conversation` 조회: `dashboard/src/lib/engagement-provider.ts:63-76`.
- 촬영 증거: Threads 영상 `01:54-02:12`.

#### `threads_manage_replies`

**한국어 설명**

OSMU는 사용자가 선택한 Threads 답글에 직접 회신하거나, 발행할 때 사용자가 작성한 첫 답글을 게시합니다. 이번 제출은 답글 작성만 설명하며 숨김, 숨김 취소, 답글 가능 사용자 관리 기능은 구현했다고 주장하지 않습니다.

**English submission text**

OSMU uses `threads_manage_replies` to publish a reply on behalf of the connected Threads profile only after the user explicitly chooses a reply and approves the response text. The same permission is used for an optional first reply entered by the user during publishing. This submission demonstrates reply creation only. OSMU does not claim to provide hide, unhide, or reply-control features in this version.

**실제 사용 근거**

- 요청 scope: `dashboard/src/lib/social-connect.ts:207-215`.
- `reply_to_id`를 포함한 container 생성: `dashboard/src/lib/publish.ts:290-320`.
- 성과실 답글 작성: `dashboard/src/lib/engagement-provider.ts:174-179`.
- 촬영 증거: Threads 영상 `01:54-02:30`.

#### `threads_manage_insights`

**한국어 설명**

OSMU는 연결된 Threads 프로필에서 OSMU로 발행한 게시물의 조회, 좋아요, 답글, 재게시 수를 읽어 성과실에 표시합니다. 사용자는 이 데이터를 다음 콘텐츠 개선에 사용합니다.

**English submission text**

OSMU uses `threads_manage_insights` to retrieve views, likes, replies, and reposts for Threads published by the connected profile. These metrics are displayed in the Performance Room so the account owner can evaluate results and improve future content. The insights are used only for the connected profile's own reporting and are not sold or used to profile unrelated users.

**실제 사용 근거**

- 요청 scope: `dashboard/src/lib/social-connect.ts:207-215`.
- `/{thread-id}/insights?metric=views,likes,replies,reposts`: `dashboard/src/lib/metrics-collector.ts:731-747`.
- 촬영 증거: Threads 영상 `01:32-01:54`.

### 3.3 Facebook Page

#### `pages_show_list`

**한국어 설명**

OSMU는 OAuth에 동의한 사용자가 관리하는 Facebook Page를 확인하고 해당 Page의 ID와 Page access token을 얻어 OSMU 작업 공간에 연결합니다. 연결 뒤 Page identity를 표시해 사용자가 발행 대상을 확인할 수 있게 합니다.

**English submission text**

OSMU uses `pages_show_list` to verify the Facebook Pages managed by the authenticated user and obtain the Page identity and Page access token needed for the selected Page connection. After OAuth, OSMU stores the connected Page identity in the user's workspace and displays it as the publishing destination. This permission is also a required dependency for the Page permissions used by our publishing workflow.

**실제 사용 근거**

- Facebook permission configuration: `dashboard/src/lib/social-connect.ts:323-342`.
- user token에서 `/me/accounts`로 Page token과 ID 확인: `dashboard/src/lib/social-connect.ts:609-640`.
- 촬영 증거: Facebook 영상 `00:18-01:00`.

#### `pages_manage_posts`

**한국어 설명**

OSMU는 사용자가 발행실에서 최종 확인한 텍스트 또는 이미지를 연결된 Facebook Page에 게시합니다. 텍스트는 Page feed, 이미지는 Page photos endpoint에 게시합니다.

**English submission text**

OSMU uses `pages_manage_posts` to publish user-reviewed text or image content to the Facebook Page connected to the user's workspace. Text posts are sent to the Page feed, while image posts are sent to the Page photos endpoint with the approved caption. OSMU publishes only after the user explicitly approves the content and target Page in the Publish Room.

**실제 사용 근거**

- Facebook permission configuration: `dashboard/src/lib/social-connect.ts:334-342`.
- `/{page-id}/feed` 또는 `/{page-id}/photos`: `dashboard/src/lib/publish.ts:972-994`.
- 촬영 증거: Facebook 영상 `01:00-01:38`.

#### `pages_read_engagement`

**한국어 설명**

OSMU는 연결된 Page가 게시한 콘텐츠를 읽어 OSMU가 발행한 게시물과 실제 Facebook 게시물을 연결하고 성과 수집 대상을 확인합니다. 또한 이 권한은 `pages_manage_posts`와 `read_insights`의 공식 종속 권한입니다.

**English submission text**

OSMU uses `pages_read_engagement` to read content published by the connected Facebook Page and associate the Page post with the corresponding item published through OSMU. This lets the Page owner verify the correct content before viewing its performance. The permission is also an official dependency of both `pages_manage_posts` and `read_insights`. Page content is shown only inside the connected owner's workspace.

**실제 사용 근거**

- Facebook permission configuration: `dashboard/src/lib/social-connect.ts:334-342`.
- Facebook permission configuration: `dashboard/src/lib/social-connect.ts:334-342`.
- Page 게시물과 성과 수집 대상 연결: `dashboard/src/lib/metrics-collector.ts:785-814`.
- 촬영 증거: Facebook 영상 `00:50-01:00`, `01:38-02:04`.

#### `read_insights`

**한국어 설명**

OSMU는 연결된 Facebook Page에 OSMU로 게시한 콘텐츠의 노출과 반응 인사이트를 읽어 성과실에 표시합니다. 이 데이터는 Page 소유자가 자신의 콘텐츠 성과를 평가하고 다음 콘텐츠를 개선하는 데만 사용합니다.

**English submission text**

OSMU uses `read_insights` to retrieve insights for posts published through OSMU to the connected Facebook Page. We display impressions and reactions in the Performance Room so the Page owner can evaluate the Page's own content and improve future posts. The data is visible only inside the connected owner's workspace and is not used for advertising profiles or unrelated Pages. Without this permission, OSMU cannot provide the Facebook performance step shown in our product workflow.

**실제 사용 근거와 제출 전 갭**

- Page post `/{post-id}/insights` 호출: `dashboard/src/lib/publish.ts:811-890`.
- 성과 수집 연결: `dashboard/src/lib/metrics-collector.ts:785-814`.
- **GAP FB-INSIGHTS-01:** `dashboard/src/lib/social-connect.ts:334-342`의 참고 permission configuration에 `read_insights`가 없고, 실제 `FB_CONFIG_ID`가 가리키는 Facebook Login for Business configuration 포함 여부도 현재 증거가 없다.
- 코드 참고 목록과 Meta Login configuration에 권한을 추가하고 최근 실제 성공 호출을 확보하기 전에는 제출하지 않는다.
- 촬영 증거 목표: Facebook 영상 `01:38-02:04`.

## 4. 심사용 스크린캐스트 대본

### 4.1 공통 촬영 규칙

- 영상은 1080p 이상, 브라우저 창 전체를 1440px 이하 폭으로 촬영한다.
- 오디오는 평가 근거가 아니므로 제거한다. 큰 커서와 영문 자막을 사용한다.
- OSMU UI가 한국어이면 각 행동 직전에 영문 캡션을 넣는다. 예: `Connect Instagram`, `Publish now`, `Collect performance`, `Reply to this comment`.
- 실제 OAuth 동의 화면에서 요청 권한을 보여주고, callback 뒤 연결 identity를 보여준다.
- 샘플 데이터가 아니라 심사관용 Meta 계정으로 실제 API를 호출한다. 발행물은 `Meta App Review test`라고 명시한 테스트 콘텐츠를 사용한다.
- 비밀값, access token, App Secret, 개인 이메일 수신함은 영상에 노출하지 않는다.
- 각 권한 제출란에 해당 플랫폼 영상을 올리고 아래 타임스탬프를 문안 끝에 붙인다.

### 4.2 Instagram 영상, 목표 2분 30초

| 시간 | 화면과 행동 | OSMU endpoint·component | 실제 Meta API | 증명 권한 |
|---|---|---|---|---|
| `00:00-00:08` | 영문 제목 카드: `OSMU Instagram OAuth, Publishing, Comments, and Insights` | 해당 없음 | 해당 없음 | 제출 범위 식별 |
| `00:08-00:18` | 전용 OSMU 심사관 계정으로 로그인, 작업 공간 진입 | `/login` → `/channels/instagram`, `AuthGate` | 해당 없음 | 심사관 접근 가능성 |
| `00:18-00:32` | Instagram 채널 화면에서 `Instagram 연결` 선택 | `SocialConnectButton`, `GET /api/connect/instagram` | Instagram OAuth authorize | `instagram_business_basic` |
| `00:32-00:48` | Instagram 공식 동의 화면에서 요청 scope와 프로페셔널 계정 확인, 허용 | callback `/api/connect/instagram/callback` | code 교환, `/me` identity | 4개 Instagram 권한의 사용자 부여 장면 |
| `00:48-00:58` | OSMU로 돌아와 연결된 username과 상태 표시 | `channel_accounts`, `InstagramPage` | identity 결과 | `instagram_business_basic` |
| `00:58-01:18` | 발행실에서 실제 이미지, 캡션, 첫 댓글을 확인하고 `지금 발행` 선택 | `/studio?room=publish`, `POST /api/publish` | `POST /{ig-id}/media` | `instagram_business_content_publish` |
| `01:18-01:30` | 컨테이너 처리 뒤 게시 완료와 permalink 표시 | `publishInstagram` | `GET /{container-id}?fields=status_code`, `POST /{ig-id}/media_publish` | `instagram_business_content_publish` |
| `01:30-01:38` | permalink를 열어 실제 게시물과 첫 댓글 확인 | 외부 Instagram | `POST /{media-id}/comments` | `instagram_business_manage_comments` |
| `01:38-01:50` | 성과실에서 `성과 새로 모으기` 선택 | `/performance`, `POST /api/metrics` | `GET /{media-id}/insights` | `instagram_business_manage_insights` |
| `01:50-02:02` | 실제 조회·좋아요·댓글 수치와 갱신 시각 표시 | `PerformanceRoom`, `GET /api/metrics` | insights 응답 | `instagram_business_manage_insights` |
| `02:02-02:16` | 같은 게시물의 댓글 목록 열기 | `GET /api/engagement` | `GET /{media-id}/comments` | `instagram_business_manage_comments` |
| `02:16-02:30` | 특정 댓글에 테스트 답글 입력·전송, Instagram에서 결과 확인 | `POST /api/engagement` | `POST /{comment-id}/replies` | `instagram_business_manage_comments` |

### 4.3 Threads 영상, 목표 2분 30초

| 시간 | 화면과 행동 | OSMU endpoint·component | 실제 Threads API | 증명 권한 |
|---|---|---|---|---|
| `00:00-00:08` | 영문 제목 카드: `OSMU Threads OAuth, Publishing, Replies, and Insights` | 해당 없음 | 해당 없음 | 제출 범위 식별 |
| `00:08-00:18` | 전용 OSMU 심사관 계정으로 로그인, Threads 채널 진입 | `/login` → `/channels/threads` | 해당 없음 | 심사관 접근 가능성 |
| `00:18-00:32` | `Threads 연결` 선택 | `SocialConnectButton`, `GET /api/connect/threads` | Threads OAuth authorize | `threads_basic` |
| `00:32-00:48` | 공식 동의 화면에서 5개 권한 확인 후 허용 | callback `/api/connect/threads/callback` | code 교환, `/me` identity | 5개 Threads 권한의 사용자 부여 장면 |
| `00:48-00:58` | 연결된 Threads username 표시 | `channel_accounts`, `ChannelPage` | identity 결과 | `threads_basic` |
| `00:58-01:18` | 발행실에서 글, 선택 이미지, 첫 답글을 확인하고 발행 | `/studio?room=publish`, `POST /api/publish` | `POST /{threads-user-id}/threads` | `threads_content_publish`, `threads_manage_replies` |
| `01:18-01:32` | publish 완료와 실제 permalink 표시·열기 | `publishThreads` | `POST /{threads-user-id}/threads_publish` | `threads_content_publish` |
| `01:32-01:44` | 성과실에서 성과 수집 실행 | `/performance`, `POST /api/metrics` | `GET /{thread-id}/insights` | `threads_manage_insights` |
| `01:44-01:54` | 조회·좋아요·답글·재게시 수치 표시 | `PerformanceRoom` | insights 응답 | `threads_manage_insights` |
| `01:54-02:12` | 게시물 답글 목록 표시 | `GET /api/engagement` | `GET /{thread-id}/conversation` | `threads_read_replies` |
| `02:12-02:30` | 한 답글에 회신하고 Threads에서 결과 확인 | `POST /api/engagement` | reply container와 publish | `threads_manage_replies` |

### 4.4 Facebook Page 영상, 목표 2분 4초

| 시간 | 화면과 행동 | OSMU endpoint·component | 실제 Graph API | 증명 권한 |
|---|---|---|---|---|
| `00:00-00:08` | 영문 제목 카드: `OSMU Facebook Page Connection, Publishing, and Performance` | 해당 없음 | 해당 없음 | 제출 범위 식별 |
| `00:08-00:18` | 전용 OSMU 심사관 계정으로 로그인, Facebook 채널 진입 | `/login` → `/channels/facebook` | 해당 없음 | 심사관 접근 가능성 |
| `00:18-00:34` | `Facebook 연결` 선택 | `SocialConnectButton`, `GET /api/connect/facebook` | Facebook Login for Business authorize | Page 권한의 사용자 부여 장면 |
| `00:34-00:50` | 공식 동의 화면에서 관리 Page와 권한 확인 후 허용 | callback `/api/connect/facebook/callback` | code와 user token 교환 | `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `read_insights` |
| `00:50-01:00` | 연결된 Page identity 표시 | `channel_accounts`, `ChannelPage` | `GET /me/accounts` | `pages_show_list` |
| `01:00-01:24` | 발행실에서 Page, 텍스트 또는 이미지 확인 후 발행 | `/studio?room=publish`, `POST /api/publish` | `POST /{page-id}/feed` 또는 `/photos` | `pages_manage_posts` |
| `01:24-01:38` | 발행 완료 결과를 실제 Facebook Page에서 확인 | `published_posts` | 게시 결과 ID | `pages_manage_posts` |
| `01:38-01:52` | 성과실에서 성과 수집 실행 | `/performance`, `POST /api/metrics` | `GET /{post-id}/insights` | `read_insights`, dependency `pages_read_engagement` |
| `01:52-02:04` | Page 게시물 성과와 갱신 시각 표시 | `PerformanceRoom` | insights 응답 | `read_insights` |

## 5. 제출 전 체크리스트

### 5.1 공개 URL과 앱 기본 정보

- [x] 서비스 URL: `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/`, 2026-09-17 HTTP 200 관찰.
- [x] 개인정보처리방침 URL: `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/privacy`, HTTP 200 관찰. Meta 프로필·게시물·댓글·답글·인사이트, 토큰, 이용 목적, 보유·삭제, 제3자 제공 제한을 설명한다.
- [x] 데이터 삭제 안내 URL: `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/data-deletion`, HTTP 200 관찰. 현재 구성은 callback이 아니라 사용자용 삭제 지침 URL이다.
- [x] 이용약관 URL: `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/terms`, HTTP 200 관찰.
- [ ] 앱 아이콘이 콘솔에서 1024×1024이며 Meta 상표·로고를 포함하지 않는지 현재 화면 캡처로 확인.
- [ ] 앱 카테고리가 OSMU의 실제 용도인 비즈니스·생산성·마케팅 관리 중 현재 콘솔이 제공하는 정확한 항목으로 설정됐는지 캡처로 확인.
- [ ] 기본 연락처 이메일이 실제 수신 가능한 운영 이메일인지 확인.
- [ ] 앱 목적은 외부 고객이 사용하는 서비스이므로 `클라이언트`에 해당하는지 현재 콘솔 문구로 확인.

### 5.2 인증·권한·호출

- [x] 앱 라이브 상태. 사용자 콘솔 실측.
- [x] 정성컴퍼니 비즈니스 포트폴리오 연결. 사용자 콘솔 실측.
- [x] Facebook·Instagram redirect URI 정확. 사용자 콘솔 실측.
- [ ] `기술 제공업체 되기` 액세스 인증 완료. 현재는 완료 필요 안내가 있어 **차단**.
- [ ] 요청할 13개 권한 모두 제출 목록에 있고, 요청하지 않는 권한은 OAuth와 제출 목록에서 제거.
- [ ] Advanced Access를 요청할 각 권한으로 제출일 기준 최근 30일 안에 최소 1회 성공 API 호출. Meta 시스템 반영에는 최대 2일이 걸릴 수 있으므로 제출 직전이 아니라 여유 있게 실행.
- [ ] Instagram 인사이트 scope와 `graph.instagram.com` host 갭 수정 후 실제 성공 호출.
- [ ] Facebook 참고 permission 목록과 `FB_CONFIG_ID`의 Login configuration에 `read_insights` 추가 후 실제 `/{post-id}/insights` 성공 호출.
- [ ] Threads OAuth와 영상에 `threads_read_replies` 포함. 또는 기능과 scope를 둘 다 제거. 현재 제품은 읽기를 사용하므로 포함이 추천안.
- [ ] Facebook `business_management` 미요청 확인.
- [ ] Facebook 영상에서 댓글 기능을 보여주지 않음. 댓글 기능을 심사하려면 `pages_read_user_content`·`pages_manage_engagement`를 별도 설계·검증·신청.

### 5.3 심사관 접근과 테스트 자격증명

**판정: 심사관용 OSMU 테스트 계정이 필요하다.** 서비스가 인증 뒤 네 방과 채널 연결을 제공하므로, Meta 심사관이 영상과 같은 경로로 접근할 수 있어야 한다.

- [ ] 개인 Google·Meta 계정 자격증명을 제출하지 않는다.
- [ ] Meta가 테스트에 사용하는 Meta 테스트 계정과 별개로, OSMU에 들어올 수 있는 전용 reviewer 계정 또는 비밀번호 없는 전용 접근 절차를 제공한다.
- [ ] reviewer 계정은 발행실·성과실·채널 연결 기능이 모두 열려 있고 유료 게이트, OTP, 관리자 승인, 초대 대기 없이 접근 가능해야 한다.
- [ ] OSMU가 Google OAuth 로그인만 허용해 심사관이 접근할 수 없다면 제출 전에 reviewer 전용 이메일 로그인 또는 안전한 심사 접근 경로를 구현·검증한다. 개인 Google 비밀번호 공유는 금지한다.
- [ ] 제출 메모에는 로그인 URL, OSMU reviewer 계정, 작업 공간 이름, 플랫폼별 시작 URL, 정확한 테스트 단계, 예상 결과를 영문으로 적는다.
- [ ] 고객 정상 절차에는 앱 테스터 등록이나 초대 수락을 넣지 않는다. 테스터 역할은 심사 전 내부 검증과 Meta 심사 환경에만 한정한다.

### 5.4 영상·설명·정책

- [ ] 3개 영상을 1080p 이상으로 촬영하고 영문 캡션을 삽입.
- [ ] 각 영상에서 OAuth 동의, 연결 identity, 실제 API 기능, 최종 외부 결과를 연속으로 보여줌.
- [ ] 각 권한 제출란에 고유 영문 설명과 정확한 영상 타임스탬프를 입력.
- [ ] 영상과 제출 설명의 메뉴명·버튼명·작업 공간·결과가 실제 reviewer 계정과 일치.
- [ ] 개인정보처리방침과 데이터 삭제 URL이 로그아웃 상태에서도 열림.
- [ ] Meta Platform Terms·Developer Policies·각 permission의 Allowed Usage와 제출 설명을 최종 대조.
- [ ] 데이터 처리 질문 응답이 실제 저장·보유·삭제 구조와 일치.

## 6. 자주 반려되는 사유와 OSMU 대응

| 반려 사유 | OSMU 대응 |
|---|---|
| 심사관이 앱에 로그인할 수 없음 | 전용 OSMU reviewer 계정과 로그인 URL을 제공하고 개인 Google·Meta 자격증명은 공유하지 않는다. 제출 전 새 브라우저에서 같은 경로를 재현한다. |
| 영상에 OAuth 동의나 요청 권한이 안 보임 | 세 영상 모두 연결 전 상태에서 시작해 공식 OAuth 동의 화면의 권한과 연결 identity를 연속 촬영한다. |
| 영상에 권한이 필요한 실제 기능이 안 보임 | 권한별 타임스탬프에서 실제 발행, 실제 인사이트, 실제 댓글·답글과 외부 결과를 보여준다. 정적인 화면 설명만 제출하지 않는다. |
| 여러 권한에 같은 설명을 복사 | 13개 문안을 사용자 이익, 데이터, 기능이 없을 때의 손실까지 권한별로 분리한다. |
| 쓰지 않는 권한을 넓게 요청 | `business_management`를 제외하고, Facebook 댓글 권한은 첫 제출 범위에서 제외한다. 현재 코드가 요청하는 `threads_read_replies`는 기능과 함께 심사한다. |
| 성공 API 호출 이력이 없어 고급 액세스 요청이 비활성 | 각 권한의 실제 endpoint를 reviewer 계정으로 성공 호출하고 최대 2일의 기록 반영 시간을 둔다. |
| Instagram Login 토큰을 잘못된 host에 사용 | 인사이트 호출을 `graph.instagram.com`으로 맞춘 뒤 실제 응답과 성과 화면을 촬영한다. |
| 한국어 UI를 심사관이 이해하지 못함 | 공식 권고대로 가능하면 영문 UI를 사용하고, 불가능하면 영문 캡션·툴팁·큰 커서로 모든 행동과 버튼 의미를 설명한다. |
| 영상과 제출 설명이 다른 기능·순서를 가리킴 | 이 문서의 시간표를 촬영 체크리스트로 사용하고, 제출 직전 reviewer 계정으로 처음부터 끝까지 재현한다. |
| 개인정보처리방침·삭제 URL이 비공개이거나 내용 부족 | 두 URL의 로그아웃 HTTP 200을 재확인하고, 수집 데이터·목적·보유·삭제·문의·Meta 데이터 사용을 대조한다. |
| 비즈니스 인증 또는 액세스 인증이 미완료 | 콘솔의 미완료 상태를 먼저 닫고, 완료 화면을 캡처한 뒤에만 제출한다. |
| 테스터 등록을 고객 절차로 설명 | ADR-004·006대로 고객은 OAuth 동의만 한다. 테스터 역할은 심사 전 내부 검증에만 사용하며 제품 설명과 고객 온보딩에서 제외한다. |

## 7. 사용자 흐름 1:1 구현 매핑

| 사용자 step | 화면·frontend component | OSMU endpoint | 외부 API | DB table | 매핑 |
|---|---|---|---|---|---|
| 1. 회원 로그인 | `/login`, `AuthGate` | 인증 provider callback, `/api/me` | OSMU 회원 OAuth | Supabase Auth, tenant membership | 매핑됨 |
| 2. 소셜 채널 연결 | `/channels/[channel]` 또는 발행실 `ChannelConnect`, `SocialConnectButton` | `GET /api/connect/{provider}`, `GET /api/connect/{provider}/callback` | Meta OAuth, token exchange, profile·Page identity | `channel_accounts`, `integrations` | 매핑됨 |
| 3. 콘텐츠 검수·발행 | `/studio?room=publish`, `StudioRooms`, `PlatformPreview` | `POST /api/publish` | Threads `/threads`·`/threads_publish`, Instagram `/media`·`/media_publish`, Facebook `/feed`·`/photos` | `published_posts`, `queue_posts`, `usage_events` | 매핑됨 |
| 4. 성과 수집·표시 | `/performance`, `PerformanceDashboard`, `PerformanceRoom` | `POST /api/metrics`, `GET /api/metrics` | Threads·Instagram·Facebook insights | `published_posts`의 metrics columns·`provider_meta` | 매핑됨 |
| 5. 댓글·답글 읽기·회신 | `/performance`, `PerformanceRoom` | `GET·POST /api/engagement` | Threads conversation·reply, Instagram comments·replies | `engagement_items`, `published_posts` | 매핑됨 |

**매핑 gap 수: 0.** 흐름의 화면, endpoint, provider 호출, DB table은 모두 연결된다. 다만 제출 준비 gap은 별개다. Instagram 인사이트의 scope·host 드리프트, Facebook `read_insights` configuration 누락, Facebook 댓글 권한 미포함은 위 NO-GO 목록에 남긴다.

## 8. 제출 실행 순서와 종료 증거

| 순서 | 소유자 | 실행 | 종료 증거 |
|---|---|---|---|
| 1 | code-builder | Instagram 인사이트 scope·API host와 Facebook `read_insights` configuration 갭 수정 | OAuth scope 테스트, 실제 Instagram·Facebook insights 2xx, 성과실 실제 수치 |
| 2 | 회장 | Meta 액세스 인증 완료 | 현재 콘솔 완료 상태 캡처 |
| 3 | code-builder·qa-verifier | reviewer 전용 OSMU 접근 경로 준비·새 브라우저 E2E | 개인 자격증명 없이 로그인→연결→발행→성과 재현 |
| 4 | 회장·qa-verifier | 13개 권한별 최근 성공 호출 확보 | 권한, endpoint, 호출시각, HTTP 2xx, 화면 결과 원장 |
| 5 | 회장·qa-verifier | 3개 스크린캐스트 촬영 | 1080p, 영문 캡션, 타임스탬프, 비밀값 노출 0 |
| 6 | 회장 | 현재 콘솔 캡처 기반으로 아이콘·카테고리·연락처·앱 목적·데이터 처리 응답 확인 | 제출 체크리스트 전 항목 체크 |
| 7 | 회장 | 권한 13개와 이 문서 영문 문안·영상 제출 | Meta 제출 receipt 또는 pending 상태 캡처 |

## 9. 레드팀과 셀프심문

### 레드팀 공격

까다로운 심사관은 “성과실이 있는데 Instagram 인사이트 scope가 없고, 영상은 같은 설명을 권한마다 재사용하며, reviewer가 Google 로그인에서 막힌다”고 반려할 수 있다. 그래서 지금 제출을 GO로 포장하지 않고, scope와 host를 고친 실제 성공 호출, 전용 reviewer 접근, 권한별 타임스탬프가 생기기 전까지 NO-GO로 두었다. 경쟁 소셜 도구 관점에서도 불필요한 `business_management`를 얹으면 최소권한 원칙과 사용 사례 정합성이 약해지므로 제외했다.

### 이 결론이 틀렸다면 가장 그럴듯한 이유

가장 하중을 받는 가정은 Facebook 성과실의 `/{post-id}/insights` 호출이 실제 App Review에서 설명한 지표와 일치한다는 것이다. Meta 권한 reference는 `read_insights`를 Page 인사이트용 권한으로, `pages_read_engagement`와 `pages_show_list`를 종속 권한으로 명시한다. 그래서 세 권한을 함께 신청하되, 실제 reviewer 계정의 성공 호출과 화면 수치가 없으면 제출하지 않는다. 문서만으로 성공을 주장하지 않는다.

## 10. 벤치마크와 차용

- Meta 공식 App Review Submission Guide의 권한별 최근 성공 호출, 심사관 접근, 1080p 화면 녹화, 영문 UI 또는 캡션, 권한별 고유 설명 원칙을 그대로 채택했다.
- Meta 공식 Instagram·Threads API 문서의 permission과 endpoint 매핑을 사용해 코드 scope와 실제 호출을 대조했다.
- 동종 오픈소스 소셜 스케줄러 Mixpost의 Instagram 심사 문안에서 `연결 → identity → 발행 → 외부 게시물 → 댓글·인사이트`를 한 영상에 연속으로 보여주는 구조를 차용했다. OSMU는 실제 네 방, endpoint, 코드 줄, scope gap을 추가했고 Mixpost의 기능·수치 문구는 복사하지 않았다.
- 회장 정본과 충돌한 과거 2026-08-31 제출 문서는 당시 Instagram 인사이트 호출이 없어서 해당 권한을 제외했다. 현재는 수집 코드가 생겼으므로 포함 판단으로 바꾸되, scope와 host가 맞기 전 제출하지 않는다.

## 11. 공식 출처

- [Meta App Review Submission Guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide)
- [Meta Permissions Reference](https://developers.facebook.com/docs/permissions)
- [Meta Data Deletion Request Callback and Instructions](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback)
- [Instagram Insights, official](https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights)
- [Instagram Content Publishing, official](https://developers.facebook.com/docs/instagram-platform/content-publishing)
- [Instagram Comment Moderation, official](https://developers.facebook.com/docs/instagram-platform/comment-moderation)
- [Threads API Get Started, official](https://developers.facebook.com/docs/threads/get-started)
- [Threads Insights, official](https://developers.facebook.com/docs/threads/insights)
- [Meta official Threads Postman collection](https://www.postman.com/meta/threads/folder/34203612-e0373e84-de6b-46f1-b90d-3fea76ba6782)
- [Meta official Instagram Postman collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Mixpost Instagram App Review example](https://docs.mixpost.app/services/social/instagram/app-review/)

SOURCES: `wiki/거버넌스/결정.md` ADR-004·006; `wiki/5-hubs/hub-eng/architecture/system-architecture.md`; `docs/design/{README,user-flow}.md`; `dashboard/src/lib/{social-connect,publish,metrics-collector,engagement-provider,first-comment}.ts`; `dashboard/src/app/api/{connect/[provider],publish,metrics,engagement}`; 위 Meta 공식 문서와 Mixpost 벤치마크

MODEL: gpt-codex/GPT-5

SKILLS_USED: `postagi-app-deploy`, 콘솔 UI 추측을 금지하고 사용자 실측·공식 문서·코드 증거를 분리하는 데 사용

SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: BRAIN `wiki/business/index.md`에서 OSMU·Meta App Review·OAuth·소셜 연결 정본을 검색하고, 레포 ADR-004·006 및 플랫폼 권한·현재 코드·과거 제출 문서를 조회함

HITS_USED: BRAIN business goal은 고객 마찰을 줄이는 사업 맥락에 사용, ADR-004·006은 고객 OAuth와 테스터 비정상화 금지의 정책 정본이라 채택, system-architecture는 scope·redirect 경계에 사용, Meta 공식 문서는 제출 요건과 권한 허용 용도에 사용, Mixpost는 영상 순서 벤치마크에만 사용

HITS_REJECTED: BRAIN 검색에서 Meta App Review·권한에 대한 직접 세부 문서는 0건이라 기술 사실 근거로 사용하지 않음. 2026-08-31 제출 문서의 Instagram 인사이트 제외 결론은 현재 코드가 바뀌어 그대로 채택하지 않음. 검색 결과의 비공식 블로그·Reddit 조언은 공식 요건 판정 근거에서 제외함

CONFLICTS: 아키텍처 문서는 Instagram이 `instagram_business_manage_insights`를 요청한다고 적지만 현재 `social-connect.ts`는 요청하지 않는다. 과거 제출 문서는 Instagram 인사이트 수집이 없다고 적지만 현재 `publish.ts`·`metrics-collector.ts`에는 수집 코드가 있다. Meta 공식 문서는 Instagram Login 인사이트에 `graph.instagram.com`과 `instagram_business_manage_insights`를 요구하지만 현재 수집 코드는 `graph.facebook.com`으로 고정돼 있다. Facebook 공식 권한 reference는 Page 인사이트에 `read_insights`를 지정하지만 현재 참고 permission 목록과 확인된 콘솔 근거에는 이 권한이 없다.
