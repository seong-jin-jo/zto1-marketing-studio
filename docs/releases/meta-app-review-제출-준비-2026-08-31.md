# Meta App Review 제출 준비

STAMP | line: osmu-appreview0831 | 생성: 2026-08-31 05:03 KST | 갱신: 2026-08-31 17:55 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder | skills: 없음 | 근거: ADR-004, Meta 공식 Threads·Instagram API 컬렉션, 운영 법적 고지 3경로 실측, OAuth scope와 실제 API 경로 전수 대조 | 고민: 첫 제출은 실제 제품 경로가 있는 권한 8개로만 고정하고 Instagram 인사이트는 화면과 호출이 생긴 뒤 2차 제출한다.

## 한 줄 결론

첫 Meta App Review의 코드 선행 조건은 해소됐다. 제출 권한은 실제 제품 경로가 있는 8개로 고정했고 `instagram_business_manage_insights`는 제거했다. 회장이 지금 제출해도 되는가: **아직 NO-GO다. 8개 권한별 최근 성공 API 호출과 영상 증거를 확보한 뒤 제출해야 한다.**

1. [완료] Privacy Policy, Terms, Data Deletion 안내를 운영에 배포했다. 2026-08-31 운영 실측에서 세 경로 모두 HTTPS 200이었다.
2. [남음] 각 제출 권한으로 최근 30일 안에 성공한 API 호출을 만들고 영상 A부터 G까지 녹화한다.
3. [완료] `instagram_business_manage_insights`를 OAuth scope와 첫 제출 목록에서 제거했다. Instagram 인사이트 화면과 API 호출을 구현한 뒤 2차 제출한다.

## 현재 오류와 정본 결정

운영 오류는 다음과 같다.

```text
HTTP 400: This action requires the threads_basic permission.
You must submit for app review, or your user must be in the list of Threads testers.
```

`wiki/거버넌스/결정.md`의 ADR-004가 정한 방식은 다음과 같다.

- 개발 모드: Meta 앱의 테스터로 등록되고 해당 계정에서 초대를 수락한 계정만 OAuth 연결 가능
- 상품화: App Review에서 Advanced Access 승인 후 외부 고객이 테스터 등록이나 콘솔 작업 없이 OAuth 동의 화면만으로 연결
- 금지: Meta 콘솔 자동 운전. 아래 경로는 회장이 직접 클릭한다.

## 지금 당장 Threads를 연결하는 경로

대상 앱: `905965605850465`

앱 바로가기: <https://developers.facebook.com/apps/905965605850465/>

### 회장이 앱에서 할 일

1. 위 앱 바로가기를 연다.
2. 왼쪽 메뉴에서 `Use cases`를 누른다.
3. `Access the Threads API`에서 `Customize`를 누른다.
4. `Settings`의 `User Token Generator`로 이동한다.
5. `Add or Remove Threads Testers`를 누른다.
6. `App roles`의 `Roles`에서 `Add people`을 누른다.
7. 역할은 일반 `Tester`가 아니라 `Threads Tester`를 선택한다.
8. 실제 연결할 Threads 사용자 이름을 검색하여 추가한다.

Meta 콘솔 메뉴가 갱신되어 `App roles > Roles`가 바로 보이면 6번부터 진행한다. 이름이 다르게 보이면 추측해서 다른 역할을 추가하지 말고 해당 화면을 캡처해 확인한다.

### 초대받은 Threads 계정에서 반드시 할 일

1. 초대한 것과 동일한 Threads 계정으로 로그인한다.
2. <https://www.threads.com/settings/website_permissions>을 연다.
3. `Invites`에서 앱 초대를 찾아 `Accept`를 누른다.
4. OpenClaw Auto의 채널 연결 화면으로 돌아가 Threads 연결을 다시 실행한다.

초대 전송만으로는 적용되지 않는다. 초대한 Threads 계정에서 수락해야 현재 `threads_basic` 오류가 사라진다.

## 지금 당장 Instagram을 연결하는 경로

1. <https://developers.facebook.com/apps/905965605850465/>을 연다.
2. `App roles > Roles > Add people`로 이동한다.
3. `Instagram Tester`를 선택하고 실제 연결할 Instagram Professional 계정을 추가한다.
4. 초대한 것과 동일한 Instagram 계정으로 로그인한다.
5. <https://www.instagram.com/accounts/manage_access/>을 연다.
6. `Tester Invites` 또는 `테스터 초대`에서 해당 앱 초대를 수락한다.
7. OpenClaw Auto의 채널 연결 화면에서 Instagram 연결을 다시 실행한다.

Instagram API 설정 화면을 기준으로 진행할 경우 `Instagram > API setup with Instagram Login > Generate access tokens > Add account`에서도 계정을 추가할 수 있다. 어느 경로를 쓰더라도 실제 Instagram 계정에서 초대 수락이 필요하다.

## App Review 제출 위치

1. <https://developers.facebook.com/apps/905965605850465/>을 연다.
2. `App Review > Permissions and Features`로 이동한다.
3. 아래 권한별로 `Request advanced access`를 선택한다.
4. 권한마다 서로 다른 이용 사례 설명과 해당 기능의 화면 녹화를 첨부한다.
5. `Data handling questions`에 실제 구현과 같은 답을 입력한다.
6. 제출 직전 이 문서의 최종 체크리스트를 전부 확인한다.
7. 제출 버튼은 회장이 직접 누른다.

외부 고객용 앱이므로 `Settings > Basic > App Purpose`는 `Clients`로 설정해야 한다. 앱 아이콘, 카테고리, Privacy Policy URL, Terms of Service URL, User Data Deletion 안내 URL, 연락처 이메일도 같은 화면에서 확인한다. Business Verification이 요구되면 완료한 뒤 제출한다.

## 운영에 등록할 URL

기준 운영 도메인: `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud`

| Meta 앱 설정 | 입력 URL | 현재 판단 |
|---|---|---|
| Privacy Policy URL | `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/privacy` | 운영 배포 완료. 2026-08-31 HTTPS 200 관찰 |
| Terms of Service URL | `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/terms` | 운영 배포 완료. 2026-08-31 HTTPS 200 관찰 |
| User Data Deletion | `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/data-deletion` | 안내 URL 방식. 운영 배포 완료. 2026-08-31 HTTPS 200 관찰 |

Meta는 Data Deletion Request Callback URL 또는 Data Deletion Instructions URL 중 하나를 허용한다. 현재는 안내 URL 방식을 쓴다. 세 운영 URL의 HTTPS 200과 최신 본문은 컨트롤러가 실측 확인했다.

## Privacy Policy와 Terms 대조

| 요구사항 | 반영 위치 | 상태 |
|---|---|---|
| 수집 데이터 | `/privacy`의 수집하는 정보 | Meta 프로필, 게시물, 댓글, 답글, 인사이트, 게시 결과까지 보강 |
| 사용 목적 | `/privacy`의 이용 목적과 Meta 권한 표 | 권한별 사용 목적 명시 |
| 제3자 공유 | `/privacy`의 제3자 제공 | 판매하지 않음, 고객 승인 없이 광고 목적 공유하지 않음 명시 |
| 보관 기간 | `/privacy`의 보관 및 파기 | 연결 해제, 탈퇴, 삭제 요청을 기점으로 한 파기 원칙 명시 |
| 사용자 삭제 방법 | `/privacy`와 `/data-deletion` | 연결 해제, 계정 삭제, 이메일 요청 경로 명시 |
| 심사 전 계정 한계 | `/terms` | 테스터 등록과 초대 수락 계정만 연결 가능함을 명시 |

법률 자문은 수행하지 않았다. 위 대조는 Meta App Review 제출 요건과 현재 서비스 동작의 일치 여부를 확인한 결과다.

## 권한별 Advanced Access 준비표

외부 고객 계정을 연결하는 `Clients` 용도에서는 아래 8개만 첫 Advanced Access 대상으로 제출한다. Standard Access는 앱 역할, 테스터, 앱 소유 계정처럼 개발자가 소유하거나 관리하는 계정 범위다.

| 권한 | 의존 권한 | 제품에서 보여줄 실제 사용 | 제출 판단 |
|---|---|---|---|
| `threads_basic` | 없음 | OAuth 승인 후 Threads 프로필과 연결 계정 표시 | 준비 가능 |
| `threads_content_publish` | `threads_basic` | 승인된 콘텐츠를 Threads에 게시하고 permalink 확인 | 준비 가능 |
| `threads_manage_insights` | `threads_basic` | Threads 게시물 또는 계정 인사이트를 성과 화면에 표시 | 준비 가능 |
| `threads_read_replies` | `threads_basic` | 소유 게시물의 답글을 읽어 성과 화면에 표시 | 준비 가능 |
| `threads_manage_replies` | `threads_basic` | 읽은 답글에 회신하고 Threads에서 결과 확인 | 준비 가능. 숨김 기능을 구현했다고 주장하지 않음 |
| `instagram_business_basic` | 없음 | OAuth 승인 후 Instagram Professional 프로필과 연결 계정 표시 | 준비 가능 |
| `instagram_business_content_publish` | `instagram_business_basic` | 이미지 또는 영상 게시 후 Instagram에서 결과 확인 | 준비 가능 |
| `instagram_business_manage_comments` | `instagram_business_basic` | 게시물 댓글을 읽고 제품에서 답글 작성 | 준비 가능 |

공식 제출 가이드에 따라 Advanced Access를 요청하는 권한마다 제출 전 30일 안에 성공한 API 호출이 최소 1회 있어야 한다.

### 요청 권한과 실제 코드 경로 전수 대조

첫 Meta 제출 대상 provider인 Instagram과 Threads의 기존 요청 권한 9개를 모두 대조했다. 비 Meta provider의 OAuth scope는 이번 Meta App Review 제출 대상이 아니므로 변경하지 않았다.

| 권한 | 실제 사용 코드 경로 | 판정 |
|---|---|---|
| `threads_basic` | `dashboard/src/lib/channel-accounts.ts:69-76`의 `/me?fields=id,username` 연결 계정 확인 | 유지 |
| `threads_content_publish` | `dashboard/src/lib/publish.ts:293-315`의 `/threads`, `/threads_publish` | 유지. 핵심 발행 권한 |
| `threads_manage_insights` | `dashboard/src/app/api/metrics/route.ts:56-87`의 `/{post-id}/insights` 수집 | 유지 |
| `threads_read_replies` | `dashboard/src/lib/engagement-provider.ts:63-76`의 `/{post-id}/conversation` 조회 | 유지 |
| `threads_manage_replies` | `dashboard/src/lib/publish.ts:289-315`의 `reply_to_id` 답글 발행, `dashboard/src/lib/first-comment.ts:74-86`의 첫 댓글 | 유지 |
| `instagram_business_basic` | `dashboard/src/lib/channel-accounts.ts:77-84`의 `/me?fields=id,username` 연결 계정 확인 | 유지 |
| `instagram_business_content_publish` | `dashboard/src/lib/publish.ts:346-378`의 `/media`, `/media_publish` | 유지. 핵심 발행 권한 |
| `instagram_business_manage_comments` | `dashboard/src/lib/engagement-provider.ts:79-92,174-178`의 댓글 조회·답글, `dashboard/src/lib/first-comment.ts:82-86`의 첫 댓글 | 유지 |
| `instagram_business_manage_insights` | Instagram Graph `/insights` 호출 0건. `dashboard/src/lib/performance-metrics-coverage.ts:45-52`도 수집기 미구현을 명시 | 첫 제출에서 제거 |

최종 OAuth scope는 `dashboard/src/lib/social-connect.ts:180-195`가 정본이다. Instagram 3개와 Threads 5개, 총 8개다.

전수 grep 결과는 다음과 같다. 제거한 권한 문자열은 거절 계약 테스트에만 남았고 Instagram `/insights` 호출은 0건이다. 유지한 권한은 각 Meta endpoint와 연결된다.

```text
REMOVED_SCOPE_REFERENCES
dashboard/tests/brand/social-connect.test.ts:141:    expect(new URL(body.authUrl).searchParams.get("scope")).not.toContain("instagram_business_manage_insights");
INSTAGRAM_INSIGHTS_CALLS
결과 없음
RETAINED_META_ENDPOINTS
dashboard/src/app/api/metrics/route.ts:71: Threads /insights?metric 호출
dashboard/src/lib/engagement-provider.ts:65: Threads /conversation?fields 호출
dashboard/src/lib/engagement-provider.ts:81: Instagram /comments?fields 호출
dashboard/src/lib/publish.ts:289: Threads reply_to_id 설정
dashboard/src/lib/publish.ts:311: Threads /threads_publish 호출
dashboard/src/lib/publish.ts:371: Instagram /media_publish 호출
dashboard/src/lib/channel-accounts.ts:70: Threads /me?fields=id,username 호출
dashboard/src/lib/channel-accounts.ts:78: Instagram /me?fields=id,username 호출
```

### 2차 제출로 미룬 권한

`instagram_business_manage_insights` 한 개를 미룬다. 추가 전제는 Instagram Professional 계정 또는 미디어의 실제 `/insights` API 호출, 실제 값을 표시하는 성과 화면, 정상·거절 계약 테스트, 최근 성공 호출, 권한 사용 영상이다. 현재 성과 계약은 Instagram 수집기 미구현을 명시하고 값이 없을 때 `미수집`으로 표시하므로 조용히 0으로 가장하지 않는다.

## 화면 녹화 공통 규칙

- 해상도는 1080p 이상, 화면 너비는 1440px 이하로 맞춘다.
- 마우스 포인터가 보이게 하고 필요하면 포인터 크기를 키운다.
- 음성 설명은 넣지 않는다.
- 한국어 UI에는 영문 자막 또는 영문 설명 오버레이를 넣고, 어떤 버튼을 누르는지 영문으로 설명한다.
- 각 권한마다 권한 부여와 실제 기능 사용을 한 흐름으로 보여준다.
- 심사자가 자신의 테스트 계정으로 재현할 수 있도록 앱 접근 URL과 단계별 안내를 제공한다.
- 심사 메모에 개인 Meta 로그인 정보나 비밀번호를 넣지 않는다.
- 같은 영상 파일을 재사용할 수 있어도 권한별 설명은 복사하지 않고, 그 권한이 필요한 장면과 데이터 흐름을 구체적으로 쓴다.

## 화면 녹화 시나리오 대본

### 영상 A. Threads 연결과 기본 정보

1. 로그아웃 또는 Threads 미연결 상태의 채널 연결 화면을 연다.
2. 심사 전에는 테스터만 연결된다는 사전 안내를 보여준다.
3. `Threads 연결하기`를 누른다.
4. Meta OAuth 화면에서 요청 권한과 승인 동작을 보여준다.
5. 앱으로 돌아와 연결된 Threads 사용자 이름과 프로필 정보가 표시되는 장면을 보여준다.
6. 영문 자막: `The user explicitly authorizes access through Meta OAuth. The app then displays only the connected user's Threads profile and account status.`

대상 권한: `threads_basic`

### 영상 B. Threads 게시

1. 연결된 Threads 계정이 선택된 콘텐츠 승인 화면을 연다.
2. 실제 게시할 텍스트 또는 미디어와 대상 계정을 보여준다.
3. 게시를 실행한다.
4. 앱의 성공 상태와 반환된 permalink를 보여준다.
5. Threads에서 같은 게시물이 공개된 장면을 보여준다.
6. 영문 자막: `The user selects an approved item and explicitly publishes it to the connected Threads profile.`

대상 권한: `threads_content_publish`

### 영상 C. Threads 인사이트

1. 실제 게시물이 있는 연결 계정의 성과 화면을 연다.
2. 게시물 또는 프로필 인사이트 조회를 실행한다.
3. 조회된 실제 지표와 기준 기간을 보여준다.
4. 영문 자막: `The app retrieves insights only for the user's connected Threads profile and uses them to report content performance.`

대상 권한: `threads_manage_insights`

### 영상 D. Threads 답글 읽기와 회신

1. 실제 답글이 달린 회장 소유 Threads 게시물을 연다.
2. 앱의 성과 화면에서 해당 답글 목록을 불러온다.
3. 답글 하나에 회신을 작성하고 전송한다.
4. Threads 원문에서 회신이 실제 등록된 장면을 보여준다.
5. 영문 자막: `The app reads replies to posts owned by the connected user and lets that user respond from the app. It does not access unrelated accounts.`

대상 권한: `threads_read_replies`, `threads_manage_replies`

### 영상 E. Instagram 연결과 기본 정보

1. Instagram 미연결 상태의 채널 연결 화면을 연다.
2. 심사 전에는 테스터만 연결된다는 안내를 보여준다.
3. `Instagram 연결하기`를 눌러 Meta OAuth 권한 승인을 완료한다.
4. 앱으로 돌아와 연결된 Professional 계정의 사용자 이름과 프로필을 보여준다.
5. 영문 자막: `The user explicitly connects an Instagram professional account through Meta OAuth. The app displays the connected account's basic profile information.`

대상 권한: `instagram_business_basic`

### 영상 F. Instagram 게시

1. 연결된 Instagram 계정이 선택된 콘텐츠 승인 화면을 연다.
2. 실제 이미지 또는 영상과 캡션을 보여준다.
3. 게시를 실행한다.
4. 앱의 성공 상태와 Instagram의 실제 게시물을 함께 보여준다.
5. 영문 자막: `The user explicitly publishes an approved image or video to the connected Instagram professional account.`

대상 권한: `instagram_business_content_publish`

### 영상 G. Instagram 댓글 관리

1. 실제 댓글이 있는 회장 소유 Instagram 게시물을 연다.
2. 앱에서 댓글 목록을 불러온다.
3. 댓글 하나에 답글을 작성해 전송한다.
4. Instagram 원문에서 답글이 등록된 장면을 보여준다.
5. 영문 자막: `The app reads and replies to comments on media owned by the connected professional account. The user initiates every reply.`

대상 권한: `instagram_business_manage_comments`

### 영상 H. Instagram 인사이트

이 영상은 현재 녹화하지 않는다. 실제 Instagram 인사이트 API 호출과 표시 화면이 구현된 뒤 다음 순서로 녹화한다.

1. 실제 게시물이 있는 연결된 Instagram Professional 계정을 선택한다.
2. 앱의 Instagram 성과 화면에서 기간을 선택한다.
3. 인사이트 조회를 실행하고 실제 지표를 보여준다.
4. 영문 자막: `The app retrieves insights only for the user's connected Instagram professional account and displays them for performance analysis.`

대상 권한: `instagram_business_manage_insights`

## 권한별 영문 이용 사례 설명

### threads_basic

> OpenClaw Auto lets a user connect their own Threads profile through Meta OAuth. After the user grants access, the app retrieves the connected profile's basic information and media metadata to identify the publishing destination and display connection status. The data is used only inside the authenticated user's workspace.

### threads_content_publish

> OpenClaw Auto allows a user to publish text, images, or videos that the user has reviewed and approved to their connected Threads profile. Publishing is initiated by the user from the content approval workflow, and the app displays the resulting publication status and permalink.

### threads_manage_insights

> OpenClaw Auto retrieves insights for the connected user's own Threads profile and posts. These metrics are shown in the performance workspace so the user can evaluate the results of content published from the app. The app does not retrieve insights for unrelated profiles.

### threads_read_replies

> OpenClaw Auto reads replies to Threads posts owned by the connected user and displays them in the user's performance workspace. This enables the user to review engagement on content they published and does not provide access to replies on unrelated accounts.

### threads_manage_replies

> OpenClaw Auto lets the connected user reply to replies on their own Threads posts from the performance workspace. Each reply is written and submitted by the user. The current product does not claim or demonstrate reply hiding or un-hiding functionality.

### instagram_business_basic

> OpenClaw Auto lets a user connect their own Instagram professional account through Meta OAuth. The app retrieves basic profile and media metadata to identify the account, display connection status, and select the correct destination for publishing and comment management.

### instagram_business_content_publish

> OpenClaw Auto allows a user to publish an image or video and caption that the user has reviewed and approved to their connected Instagram professional account. The user initiates publication and can verify the publication result in the app and on Instagram.

### instagram_business_manage_comments

> OpenClaw Auto retrieves comments on media owned by the connected Instagram professional account and lets the authenticated account owner reply from the app. The feature is limited to the user's own connected account and each reply is explicitly submitted by the user.

### instagram_business_manage_insights

제출 보류 문안이다. 실제 기능 구현과 성공 API 호출 뒤에만 사용한다.

> OpenClaw Auto retrieves insights for the connected user's own Instagram professional account and media. The app displays the metrics in the user's performance workspace so the user can evaluate content performance. The app does not retrieve insights for accounts that the user has not connected.

## 심사 소요 기간과 반려 위험

Meta 공식 제출 가이드는 보통 1주 안에 결정을 받는다고 안내한다. 2주에서 4주는 Business Verification, 반려 후 보완, 재제출까지 포함한 운영 버퍼로 잡는다. 공식 고정 SLA로 표기하지 않는다.

다음은 공식 요구사항을 충족하지 못할 때 직접 발생하는 반려 위험이다.

- 권한 승인 장면만 있고 앱이 실제로 그 권한을 사용하는 장면이 없음
- 권한별 최근 30일 성공 API 호출이 없음
- 여러 권한에 같은 일반 설명을 복사하고 각 권한의 필요성을 설명하지 않음
- 심사자가 앱에 접근하거나 테스트 흐름을 재현할 수 없음
- 영상이 흐리거나, 포인터가 안 보이거나, 비영어 UI 설명이 없음
- Privacy Policy, Terms, Data Deletion URL이 비공개, 비HTTPS, 오류, 앱 동작과 불일치
- 제출한 권한을 실제 제품에서 사용하지 않음
- 심사 중 앱 설정이나 핵심 동작을 바꿔 재심사가 필요해짐

## 제출 전 최종 체크리스트

### 앱 기본 설정

- [ ] 앱 번호가 `905965605850465`인지 확인
- [ ] 1024x1024 앱 아이콘과 정확한 앱 카테고리 확인
- [ ] App Purpose를 `Clients`로 확인
- [ ] Privacy Policy, Terms, Data Deletion URL을 운영 URL로 입력
- [x] 운영의 세 URL을 로그아웃 상태에서 열어 HTTPS 200과 최신 본문 확인
- [ ] Primary Contact Email 확인
- [ ] 요구되는 Business Verification 완료
- [ ] Data handling questions를 실제 저장, 사용, 삭제 동작과 일치하게 작성

### 권한과 기능

- [x] 첫 제출 8개 권한 각각 Allowed Usage와 제품 기능이 일치하는지 코드 경로 전수 대조
- [ ] 각 권한에 최근 30일 성공 API 호출 최소 1회 확보
- [x] `instagram_business_manage_insights`를 OAuth scope와 첫 제출 범위에서 제거
- [ ] 심사자 자신의 계정으로 재현 가능한 앱 접근 URL과 단계별 안내 준비
- [ ] 개인 Meta 비밀번호나 장기 토큰을 제출 메모에 넣지 않음

### 영상과 설명

- [ ] 영상 A부터 G까지 1080p 이상으로 녹화
- [ ] 한국어 UI 장면마다 영문 자막 또는 영문 설명 추가
- [ ] 권한별 OAuth 승인 장면과 실제 기능 사용 장면을 함께 포함
- [ ] 실제 게시물, 답글, 댓글, 인사이트 결과를 Meta 원문에서도 확인
- [ ] 권한별 영문 이용 사례를 해당 권한 입력란에 각각 등록
- [ ] Instagram 인사이트 기능이 구현되기 전 영상 H와 해당 권한을 제출하지 않음

### 제출 직전

- [ ] App Review의 `Permissions and Features`에서 필요한 권한만 Advanced Access 요청
- [ ] 심사 중 사용할 배포 버전과 설명 문서를 고정
- [ ] 제출 버튼은 회장이 직접 누름
- [ ] 제출 일시와 심사 상태를 운영 기록에 남김

## 셀프심문과 레드팀 결과

질문: 회장이 이 문서만 보고 제출까지 갈 수 있는가, 아니면 중간에 또 막히는가?

답: 운영 법적 고지와 첫 제출 scope 정리는 끝났다. 다만 8개 권한별 최근 성공 호출과 영상 증거는 아직 미검증이다. 이 증거 없이 제출하면 심사자가 실제 사용을 재현하지 못하므로 현재 판정은 `NO-GO`다.

까다로운 심사자 관점의 공격: 한 영상으로 여러 권한을 뭉뚱그리거나 제품이 실제로 쓰지 않는 Instagram 인사이트를 문장만으로 주장하면 데이터 최소화 원칙과 Allowed Usage를 증명하지 못한다.

수정 결과: 권한별 실제 화면, 영문 설명, 성공 API 호출 조건을 분리했고, 구현되지 않은 Instagram 인사이트는 첫 제출 scope에서 제거했다. `threads_manage_replies`도 구현된 회신만 주장하고 숨김 기능은 주장하지 않는다.

질문: 내가 뺀 권한 중 실제로는 쓰이고 있어서 빼면 기능이 죽는 것이 있는가?

답: 없다. 뺀 권한은 `instagram_business_manage_insights` 하나다. Instagram Graph `/insights` 호출은 0건이고 성과 범위 계약도 Instagram 수집기를 미구현으로 표시한다. 반대로 Threads 인사이트, Threads 답글 읽기·쓰기, Instagram 댓글 읽기·답글은 각각 실제 API 경로가 있어 유지했다. 따라서 제거로 죽는 기존 기능은 없으며 Instagram 연결, 발행, 댓글 기능은 남은 3개 권한으로 보존된다.

## 공식 출처

- Meta App Review Submission Guide: <https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide>
- Meta Permissions Reference: <https://developers.facebook.com/docs/permissions>
- Meta Data Deletion Callback and Instructions: <https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/data-deletion-callback>
- Meta Platform Terms: <https://developers.facebook.com/terms/>
- Meta Platform Developer Policies: <https://developers.facebook.com/devpolicy/>
- Meta Threads API Postman collection: <https://www.postman.com/meta/threads/folder/34203612-e0373e84-de6b-46f1-b90d-3fea76ba6782>
- Meta Instagram API Postman collection: <https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api>
- Meta Instagram Insights collection: <https://www.postman.com/meta/instagram/folder/23987686-f659d7d1-d74c-44e4-9192-9b1e8694c511>

SOURCES: `wiki/거버넌스/결정.md` ADR-004, `wiki/거버넌스/실수.md`, `dashboard/src/lib/social-connect.ts`, `dashboard/src/lib/{publish,engagement-provider,first-comment,channel-accounts}.ts`, `dashboard/src/app/api/metrics/route.ts`, Meta 공식 Threads·Instagram API 컬렉션

MODEL: gpt-codex/gpt-5.6-sol

SKILLS_USED: 없음

SKILLS_SKIPPED: 매칭되는 코드 구현 스킬 없음. 저장소 계약과 `/Users/sj/.claude/standards/dev.md`를 적용함.
