# Channel Status & Implementation

**최종 갱신: 2026-08-28** (근거: current code, `session-state.osmu.md`, `docs/qa/qa-tracker.md`. 소스 존재는 운영 연결을 증명하지 않는다.)

> Current UI truth is mapped in [Marketing Hub surface map](../2-product/build/marketing-hub-surface-map.md). In particular,
> provider connection/publish status is **not** inferred from a local component, landing copy, or an extension entry.
> User-reported production observations remain open: OAuth false-success, duplicate Instagram token UI,
> missing Settings status, and an OSMU 502.

## 현재 판정

- 최신 QA에서 실제 공개 채널 발행과 provider 댓글 읽기는 **미검증**이다. 과거 Threads Live, Instagram 연결 관찰을 현재 운영 상태로 승격하지 않는다.
- 텍스트 예약·발행 코드의 단일 목록은 Threads, X, Facebook, Instagram, Bluesky, Telegram, Discord, Slack의 8개다.
- 영상 직접 발행 경로는 YouTube와 TikTok 2개이며 텍스트 예약 루프와 분리돼 있다.
- 저장소에는 15개 발행 extension이 있지만 extension 존재만으로 credential, 심사, 연결, 실발행을 주장하지 않는다.

과거 2026-08-14 관찰에서는 Threads가 Live, Instagram이 연결 상태로 기록됐다. 이 기록은 이력이며 2026-08-28 운영 재검증 증거가 아니다.

**OAuth 자동 연결 (2026-07-06 확정, ADR-004)**:
- 9채널 OAuth 코드 구현 완료 (X PKCE, LinkedIn, YouTube, Naver, Pinterest, Tumblr, TikTok PKCE, Slack, LINE — commit 5b21197d) + env 배선 완료. **플랫폼별 Developer Portal 앱 등록 후 활성화** (env 없으면 버튼 숨김).
- 수동 입력 유지(플랫폼 표준): Telegram(봇토큰), Discord(Webhook), Bluesky(App Password).
- X 주의: OAuth 로그인 무료, 발행은 고객 각자 Developer Portal 등록 (우리가 $100/월 Basic 대납 안 함 — 2026-07-06 결정).

전체 UI 규칙은 코드의 `dashboard/src/lib/channel-capabilities.ts`와 `dashboard/src/lib/constants.ts`, 제품 설명은 [제품](../2-product/_index.md)을 따른다.

For each channel the pattern is:
1. Extension (publish tool)
2. Credential verification
3. Guide + keywords support
4. Queue channel status
5. (Video channels) media handling

See extensions/ directory and dashboard/src/lib/constants.ts for IMPLEMENTED_PLUGINS.

## 계정 재연결 저장 계약 (2026-09-04)

- 모든 OAuth provider callback은 `upsertChannelAccount` 한 경로로 계정을 저장한다.
- `(tenant_id, provider, external_account_id)`가 처음이면 새 행을 만든다. 같은 키가 이미 있으면
  오류를 내거나 새 행을 만들지 않고 기존 행의 access token, refresh token, 표시 이름, 사용자명,
  meta, 상태, 토큰 만료 시각을 갱신한다.
- 재연결은 기존 `is_default`를 갱신하지 않는다. 이미 기본이던 계정은 기본을 유지하고,
  비기본 계정의 재연결은 기존 기본 계정을 밀어내지 않는다. 기존 기본이 사용할 수 없는 경우에만
  아래 다중 계정 계약의 승격 규칙을 적용한다.
- 새 refresh token이 없는 재연결은 저장된 refresh token을 지우지 않는다. 새 값이 있으면
  pgcrypto 암호문을 교체한다. 자격증명 원문은 응답과 로그에 포함하지 않는다.
- callback 결과는 처음 연결이면 `연결 완료`, 기존 행 갱신이면 `연결을 새로 고쳤습니다`로 알린다.
- 실제 PostgreSQL 16 검증 수치: 1회차 성공 1, 2회차 성공 1, provider 행 1,
  토큰 갱신 1, 표시 이름 갱신 1, 기본 행 1, 기본 유지 1.


## 남의 공개 게시물을 읽을 수 있나 (2026-08-21 실측)

공식 문서를 직접 확인한 결과다. **온보딩에서 "주소만 주면 분석"이 성립하는지의 근거 자료.**

| 플랫폼 | 남의 공개 글 읽기 | 조건과 한도 | 근거 |
|---|---|---|---|
| Threads | **프로필·피드 조회 불가.** 키워드 검색만 조건부 | `threads_keyword_search` 앱 심사 승인 필요. **미승인이면 오류가 아니라 본인 글만 검색되는 축소 동작.** 사용자당 24시간 롤링 2,200쿼리(전 앱 합산, 결과 0건은 미차감) | developers.facebook.com/docs/threads/keyword-search |
| Instagram | **가능** | `business_discovery`. 대상이 프로 계정이어야 하고 **호출하는 쪽도 자기 IG 프로 계정과 토큰 필요**. 연령제한 계정 미반환. 반환된 미디어를 직접 조회하면 권한 부족으로 실패하고 중첩 조회로만 지표 획득 | developers.facebook.com/docs/instagram-api/guides/business-discovery/ |
| X | 기술적으로 가능, 유료 | 2026년 구독제 폐지 후 선불 크레딧 종량제. 24시간 내 같은 자원 재요청은 1회만 과금. **크레딧 단가와 무료 허용량 미확인**(가격 문서 접근 차단) | docs.x.com/x-api/introduction |
| Meta 공통 | 자동 수집 금지 | 이용약관 명문: 자동화된 수단으로 데이터에 접근하거나 수집할 수 없다 | facebook.com/terms.php |

**결론: 본인 계정을 연결해 본인 과거 글을 읽는 것이 전 플랫폼에서 확실한 유일한 경로다.**

## 트렌드와 인기 콘텐츠 공식 경로 (2026-08-21 실측)

| 경로 | 무엇을 주나 | 비용과 인증 | 판정 |
|---|---|---|---|
| **YouTube Data API** | 국가별·카테고리별 인기 영상 | **쿼터 1 unit, 인증 불필요(열쇠만)** | **지금 바로 쓸 수 있는 유일한 확실한 소스** |
| Google Trends | 공식 통로가 2025년 7월 초기 단계로 발표 | 범위·쿼터·신청 절차 미확인 | 의존 금지. 지켜보기 |
| 비공식 트렌드 도구 | 공개 화면 역이용 | 없음 | 자동 수집 금지 조항에 걸린다. 안 쓴다 |
| 네이버 데이터랩 | 미확인 | 미확인 | 재조사 필요 |
| Google Search Console | 검색어·노출·클릭·순위 | 우리 소유 사이트만 | 남의 트렌드가 아니다 |
| **TikTok Research API** | 해시태그·키워드로 영상 조회 | **학술 기관 전용. 상업 사업자는 신청 자체 불가** | 공식 경로 없음으로 간주 |

---


## 외부 트렌드 데이터를 사 오는 경로 (2026-08-21 조사)

### 무료 공개 소스 (인증 부담 없음)

| 소스 | 접근 | 한도 | 확인 |
|---|---|---|---|
| **구글 트렌드 RSS** `trends.google.com/trending/rss?geo=KR` | **열쇠도 인증도 불필요** | 명시 한도 없음. 나라별 지정 가능 | **컨트롤러가 직접 호출해 확인.** 국내 실시간 트렌드가 검색량 근사치와 관련 기사까지 딸려 옴 |
| 해커뉴스 공개 통로 | 인증 불필요 | 문서에 한도 없음 명시. 인기글 500건 | 문서 확인 |
| GDELT | 무료·공개 | 15분마다 갱신 | 문서 확인 |
| 유튜브 데이터 통로 | 열쇠만 | 하루 1만 단위. 다만 검색은 실사용상 비쌈 | 문서 확인 |
| 뉴스 종합 통로 | 열쇠 | 무료는 개발용 한정, 하루 100건, 24시간 지연 | 문서 확인 |

### 데이터를 파는 서비스

| 서비스 | 어느 플랫폼 | 수집 방식 | 가격 |
|---|---|---|---|
| EnsembleData | 틱톡·인스타·유튜브·**스레드**·레딧·엑스 등 | 자체 수집 | 월 100달러부터. 무료 하루 50단위 |
| ScrapeCreators | 36곳 이상. **스레드 포함** | 자체 수집 | 월 47달러부터. 무료 100크레딧 |
| Apify | 장터 방식 | 자체 인프라 + 남이 만든 수집기 | 월 29달러부터 |
| Bright Data | 링크드인·인스타·틱톡·엑스 등 | 자체 수집 + 데이터셋 판매 | 천 건에 2.5달러 |
| Data365 | 페이스북·인스타·엑스·틱톡·**스레드** 등 | 자체 수집 | 월 300유로부터. 14일 무료 |
| **Phyllo** | 20곳 이상 | **공식 통로 재판매**(플랫폼 승인 대행) | 견적 |
| Ayrshare | 13곳 이상 | 공식 통로 감싸기. 발행 중심 | 월 149달러부터 |
| Brandwatch | 엑스·텀블러는 **공식 대량 공급 계약** 보유 | 라이선스 + 수집 혼합 | 견적 |

**국내 SNS 트렌드를 통로로 파는 서비스는 사실상 없습니다.** 국내 도구들은 화면을 팔지 데이터를 팔지 않습니다.

### 직접 긁는 것과 사서 쓰는 것

| 축 | 사서 쓰기 | 직접 긁기 |
|---|---|---|
| 약관 위반 주체 | 파는 쪽 | **우리** |
| 우리 계정 정지 위험 | 낮다. 발행 계정과 수집 경로가 분리된다 | **높다. 발행 계정이 죽으면 제품이 죽는다** |
| 개인정보 책임 | **면제 안 된다.** 우리가 처리하면 우리 책임 | 같고 수집 단계 책임까지 |
| 비용 | 월 47~400달러 수준으로 예측 가능 | 우회와 유지보수가 상시 비용 |

**판례 요지:** 로그인 없이 공개 페이지를 긁는 것은 무단 접근 법 위반이 아니라는 판단이 있었지만, **같은 사건에서 이용약관 위반은 인정**됐습니다. 법 위반과 약관 위반은 다른 층입니다. 그리고 차단 통보를 받은 뒤에도 계속하면 그때부터는 법 위반으로 넘어갑니다.

**설계 결론:** 어느 쪽이든 개인정보 책임은 우리에게 남습니다. 그래서 **누가 썼는지가 아니라 무엇이 뜨는지만 저장**합니다. 작성자와 팔로워는 안 담습니다.

---

## 채널 capability SSOT

대시보드의 채널 그룹과 상세 탭은 `dashboard/src/lib/channel-capabilities.ts`가 단일 소스다.
Sidebar, Settings>Channels, Studio, generic 채널, Instagram, Messaging이 이 계약을 공유한다.
`constants.ts`는 기존 import 호환을 위해 발행 그룹을 재수출한다.

탭 원칙은 구조적으로 불가능한 기능만 제거하고, 가능한 미구현 기능은 탭을 유지한 채 비활성화해
`연동 예정`으로 표시하는 것이다. 비활성 탭 클릭은 `연동 예정입니다` 안내를 낸다. Threads의 Growth와
Popular, Instagram의 Editor, 기존 8개 발행 채널은 유지한다. Messaging은 구조적으로 불가능한 Queue,
Analytics, Growth, Popular를 제거하고 Settings만 노출한다.

### Video 그룹은 텍스트 예약과 분리

- YouTube/TikTok 영상 직접 발행은 `/api/video/publish`를 사용하며 각 채널 상세로 연결한다.
- 두 영상 provider가 채널 그룹에 보이는 사실은 텍스트 예약 발행 지원을 뜻하지 않는다.
- Studio의 실제 발행 대상은 `SCHEDULABLE_PLATFORMS`와 preview capability의 교집합으로 제한한다.

## 연결 readiness 상태 계약

`/api/connect/readiness`는 `connected`, `not_connected`, `opening_soon`, `publish_pending`, `error`를 반환한다.
중앙 앱 credential이 없거나 외부 심사가 필요한 공급자는 `opening_soon`, 앱 credential이 준비됐지만 tenant
계정이 없으면 `not_connected`다. 고객 화면은 `미연결`을 활성 연결 버튼으로, `오픈 준비중`을 회색 대기로
구분한다. 연결은 됐지만 발행 심사가 남으면 `발행 준비중`, 판정 실패는 재시도 가능한 오류로 표시한다.

`connected` 판정의 저장소 계약은 `channel_accounts.status='active'`만이 아니다. Threads,
Instagram, Facebook은 `token_expires_at` non-null과 미만료가 필수다. 만료된 access token은
암호화된 refresh token이 있는 provider만 연결을 유지하며, 나머지는 `reconnect`로 판정한다.
연결 콜백은 장기 토큰 교환과 실제 계정 신원 검증을 둘 다 통과한 후에만
`active`를 저장한다. 이 계약의 실 OAuth 재현은 운영 계정 재검증 전까지 미검증이다.

## 다중 계정과 기본 계정 계약

- 한 tenant는 같은 provider에 여러 `channel_accounts` 행을 둘 수 있지만 기본은 최대 하나다.
- 채널 상세 Settings의 계정 목록은 사용자명, 연결 상태, 토큰 만료 시각, 기본 여부만 보여준다. 자격증명 값과 암호문은 목록 응답에 포함하지 않는다.
- 기본은 해당 플랫폼에 올릴 때 account id를 따로 고르지 않은 발행이 사용하는 계정이다. `getChannelCred`는 `is_default=true` 행을 먼저 읽는다.
- 기본 전환은 active이며 사용 가능한 토큰인 계정만 허용한다. 만료, 비활성, revoked, Meta 장기 토큰 만료 시각 누락은 서버가 409로 거절한다.
- 기본 계정 삭제 뒤에는 사용 가능한 계정만 승격한다. 남은 계정이 모두 사용할 수 없으면 기본과 legacy 미러를 비워 발행이 다른 계정으로 새지 않게 한다.
- 벌크 연결 판정도 기본 계정만 읽는다. 기본이 없으면 다른 최신 계정이 active여도 해당 provider는 연결됨으로 표시하지 않는다.
- 연결 해제는 계정 한 행만 삭제하며 되돌릴 수 없음과 예약 발행 영향을 확인한 뒤 실행한다.

### 운영자/고객 shell 경계

- `/api/me.isOperator=true`이면 Sidebar identity는 `Admin`이고 운영자 고객 관리 메뉴만 노출한다.
  persisted customer workspace는 AuthGate가 children mount 전에 제거하며 운영자 shell은 workspace
  switcher·고객 마케팅 메뉴를 렌더하지 않는다.
- 고객은 `/api/me.tenant`의 자기 workspace identity와 기존 마케팅 메뉴를 그대로 사용한다.

채널을 추가할 때는 [협업 가이드](../3-operations/guides/_index.md)를 따르고 이 레퍼런스와 [제품](../2-product/_index.md)을 함께 갱신한다.
