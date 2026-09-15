# session-state.growth.md — OSMU 그로스 레인 핸드오프 (최신순)

목적: OSMU 그로스(마케팅) 레인을 개시해 2026-09 첫 바퀴(전략→우선순위→개통→발주→집행)를 돌린다. 캠페인 컨셉 = 메타 데모("이 계정의 모든 게시물은 OSMU 로 만들어졌다").

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
