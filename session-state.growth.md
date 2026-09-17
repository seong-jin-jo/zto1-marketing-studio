# session-state.growth.md — OpenClaw 마케팅 레인 (OSMU) 핸드오프 (최신순)

목적: OSMU 그로스(마케팅) 레인을 개시해 2026-09 첫 바퀴(전략→우선순위→개통→발주→집행)를 돌린다. 캠페인 컨셉 = 메타 데모("이 계정의 모든 게시물은 OSMU 로 만들어졌다").

# 2026-09-18 00시 25분 로그인 시도 결과: 회원은 구글 자격증명 화면까지, 운영자는 토큰 없어 막힘
회장 "로그인도 해봐" 지시로 직접 시도했다.
회원(9333): 운영 홈 → "로그인 / 회원가입" → /login → "Google로 시작" 클릭까지 자동 진행. 현재 accounts.google.com 자격증명 입력 화면에서 대기. 아이디·비밀번호 입력은 금지 규정이라 멈춤. 회장이 그 화면에서 입력만 하면 됨.
운영자(9222): 운영 /operator/customers 는 미인증이라 랜딩이 뜬다. 진입 버튼 "운영자세요? 운영자 콘솔로 →" 확인. 토큰 입력이 필요한데 운영 토큰 읽기가 권한 분류기에 막혀(Production Reads) 값을 가져올 수 없다. 회장이 붙여넣거나 읽기 권한 허용 필요.
관찰: 관리자 창에 회장이 이미 Meta business·developers.facebook.com 앱 1553503759757107 대시보드·console.x.com 앱 33410793 탭을 로그인 상태로 열어둠.
도구: playwright connectOverCDP 가 무거운 Meta 탭 때문에 hang 해서 /tmp/cdp-eval.mjs (페이지 타깃 하나에만 붙는 최소 CDP 클라이언트) 로 우회.

# 2026-09-17 22시 15분 두 창 식별·운영 URL 전환·관리자 콘솔 탭 구성
회장 지적 3건: 9333 창 직관 식별 / 대시보드는 로컬 아닌 운영 / 관리자 창엔 개발자 콘솔·운영자 화면.
조치: 각 창 첫 탭에 큰 글씨 마커 탭(관리자 파랑 "관리자 · CDP 9222", 회원 빨강 "회원 · CDP 9333"), 창 배치 관리자 왼쪽·회원 오른쪽. 런처 기본 URL 을 운영 서비스(OSMU_PUBLIC_URL)로 변경. 관리자 창 탭: 운영 /operator/customers, Meta 개발자 앱 콘솔, X 콘솔(셋 다 로그인 대기). 회원 창 탭: 운영 홈(Google 로그인 대기).
막힘: 운영 운영자 토큰 주입은 권한 분류기가 거부. 회장이 관리자 창에서 토큰 입력.
발견: 운영 env 에 GA 측정 ID 가 이미 설정돼 있음. 그로스 가설 A "GA4 property 생성" 전제 재확인 필요(3칸에서 소유 계정·수집 실태 확인).

# 2026-09-17 22시 05분 회원 브라우저를 회장이 띄운 실회원 CDP 9333(j.the.great.investor)으로 교체
회장: CDP 엔드포인트 분리, 하나는 관리자 계정, 하나는 실제 회원 계정으로 테스트. 9333 이 실회원.
관찰: 9333 = Chrome for Testing 151, 탭 = instagram(j.the.great.investor, sessionid 있음=로그인), threads/tiktok/facebook 은 로그인 페이지(미로그인), Google 미로그인. localhost:3456 탭 identity=null(OSMU 고객 로그인은 Google OAuth 전용이라 Google 로그인 필요).
조치: osmu-browsers.sh 에 OSMU_MEMBER_CDP 도입(기본 9223, 9333 지정 가능). 9223 창 종료. admin 9222 유지(운영자 로그인 상태).
규칙: 9333 창에서 SNS 탭은 건드리지 않는다(Meta 자동 운전 금지). localhost 탭만 조작.
다음: 회장이 9333 창에서 Google 로그인(OSMU 고객 로그인) → 컨트롤러가 고객 플로우(워크스페이스 생성·채널 연결 화면까지) 자동 검증, Meta OAuth 동의 클릭은 회장.

# 2026-09-17 18시 40분 테스트 브라우저 2개(관리자·회원) 기동 완료
회장: "Chrome for Testing 굳이 필요 없지? aside 와 뭐가 달라? 일단 만들어. 하네스에 프로필 관리 방식 이미 있을걸".
확인: 하네스 정문 `~/.claude/harness/bin/social-browser.mjs`(SOCIAL_PROFILE → ~/.sj-agent-harness/browser-profiles/<이름>, 실제 크롬 채널)가 이미 있었다. Chrome for Testing 불필요. serve 모드(CDP_PORT) 추가.
만든 것: `dashboard/scripts/osmu-browsers.sh admin|member|status`. admin=osmu-admin 프로필 CDP 9222, member=osmu-member CDP 9223. 둘 다 기동 관찰(Chrome/153). admin 은 운영자 토큰 localStorage 주입으로 identity=operator 관찰. member 는 랜딩(미로그인) 상태, 회장 로그인 대기.
다음: 회장이 member 창에서 로그인 1회 → 컨트롤러가 두 창으로 3칸 개통 검증 시작.

# 2026-09-17 18시 25분 회장 정정: 질문은 SNS 자동 운전이 아니라 OSMU 대시보드 테스트용 브라우저 2개(관리자·회원) 방식
앞 턴 오독(인스타·스레드 자동 운전으로 답함) → 회장 neg 평가, hook 이 원장 적립. 실제 질문 = 관리자용 크롬 + 일반회원용 크롬을 상시 띄워 OSMU 테스트·설정 반복할 때 어떤 방식이 나은가.
답: Playwright 영구 프로필 2개(~/.osmu-browsers/admin, member) 헤디드 + remote-debugging-port 9222/9223, 컨트롤러가 connectOverCDP 로 조작. Claude in Chrome 은 회장 프로필 1개 공유·포커스 탈취라 탈락. gstack browse state save/load 는 전환식이라 보조. 회원 창 로그인·Meta OAuth 동의 클릭만 회장 손.
회장 답 대기: 채택안 진행 확인. 확인 즉시 dashboard/scripts/osmu-browsers.sh admin|member 작성, 두 창 기동, 회원 창 로그인 요청.
그로스 레인 2칸 회장 확인 3건은 여전히 열림.

# 2026-09-17 02시 30분 회장 질문: SNS 세팅 순서·Playwright 저장 프로필 자동 운전 가부
회장: "뭐부터? SNS 세팅부터? Claude in Chrome 말고 Playwright 프로필로 인스타·스레드 계정 저장해 쓸 수 없나, 안 되면 다른 브라우저".
답변(컨트롤러 직접 판단): 순서는 3칸 개통(SNS 세팅)부터가 맞음. 저장 프로필 자동 운전은 기술적으로 가능(gstack setup-browser-cookies·connect-chrome·Playwright 바이너리 실재)하나 **Meta 계정군엔 금지**: 결정.md 385행 2026-07-01 GStack 자동 운전으로 개발자 계정 플래그 실사고 + ADR-005 §7 계정 셋업 자동화 금지. 추천 = 읽기 전용 확인만, 세팅은 회장 손 + 컨트롤러 페어(URL·클릭 경로 안내, 캡처 확인).
회장 답 대기: ①자동 운전 범위(읽기 전용 추천) ②앞선 3건(A 지목 / 수동 3건 / 정적 도착 페이지 예외 배포).
다음 액션(답 즉시): 02 chairman-confirmed → decisions.md append → 03-개통 growth-analyst 위임(도착 페이지 규격·UTM 실문자열·GA4 이벤트·회장 수동 절차서).
남은 이슈: 제품 외부 실발행 미관찰(가설 B~D 선행조건). session 브랜치 커밋 상태(main 미머지, 대시보드는 작업트리 읽음).

# 2026-09-16 03시 15분 2칸 우선순위 draft 완료 · 회장 확인 대기
2칸: growth-analyst 산출 `02-우선순위.md`. 점수 A 11 / B 7 / C 7 / D 6, 지목 = A 계측 개통. B~D 는 "제품 실발행 관찰 ≥1" 선행조건이 이번 스프린트 안 충족 근거 0 이라 확신 1. verify PASS, gate-stamp 박제, 검사기 0건. status 는 draft(회장 확인 후 chairman-confirmed).
회장 확인 3건(open-decisions.md 등록): ①A 지목 ②수동 3건(GA4 property·bio 링크·osmu.kr) ③qa 미승인 상태 정적 도착 페이지 1장 배포 예외.
다음: 회장 답 → 02 status chairman-confirmed, growth-state chairman_confirms.priority 기록, decisions.md 최상단 1줄 append(문안은 02 문서 끝) → 3칸 개통(growth-analyst; tag-spec 실문자열·GA4·도착 페이지).
제품 레인에 넘길 입력 1줄: "메타 데모 전제(제품이 발행한다)가 미관찰. 제품이 먼저 낼 것 = 외부 채널 실발행 관찰 1건."

# 2026-09-16 03시 05분 1칸 전략 fixed · 2칸 우선순위 위임 중
1칸: growth-analyst 산출 `docs/growth/campaigns/2026-09/01-전략.md`. verify PASS(Skill growth-lane·웹 16회·소크라 13), gate-stamp 박제, growth-campaign-check 위반 0. 관문 = 인지도(태그 도착으로만 측정), 가설 A 계측 개통 / B 자동 출고 서명 on-off / C 출고 증거 캡처 / D 주간 출고 리포트. 컨셉은 brand.md §2·gtm-plan 병행트랙·growth-log 실험 1/5 위에 얹음(재창조 없음). status fixed, growth-state current_cell=priority. 커밋 5bad0913(session 브랜치. 규약은 main 직행이나 공유 작업트리에 다른 세션 변경이 있어 브랜치 전환 안 함. 대시보드는 작업트리를 읽으므로 화면엔 뜬다).
하네스: CLAUDE.md·AGENTS.md 에 그로스 레인 블록 추가, ~/.claude 검사 2종 벤처 목록에 등록(be1d47e).
2칸: growth-analyst 에 점수표·지목·탈락사유·회장 확인 문안 위임 중. 끝나면 verify → 회장 확인 1회 → chairman-confirmed → decisions.md append → 3칸.
검증: 01 문서 em dash 0, 검사기 0건 관찰됨. 제품 실발행은 미검증(가설 B~D 선행조건).

# 2026-09-16 02시 레인 개시 · 1칸 전략 착수
회장 지시 원문: "osmu 마케팅레인 시작하자. 기본컨셉은 지금 보고있는 이 게시물모두우리서비스를통해 만들어진것이다".
스캐폴딩 생성: docs/growth/{decisions,tag-spec,channels,costs}.md, growth-state.2026-09.md, campaigns/2026-09/01-전략.md(서식). 컨셉은 기존 hub-mkt "메타 데모 / Made with OSMU / 도그푸딩" 축과 동일 계열이라 새로 짓지 않고 그 위에 얹는다.
다음: growth-analyst 에 01-전략 위임 → verify → gate-stamp → 2칸(회장 확인 1회).
