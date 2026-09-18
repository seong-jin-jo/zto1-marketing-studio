# OSMU 발행 복구·사용량 수리 인계 · 2026-09-18 10:10 KST

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
