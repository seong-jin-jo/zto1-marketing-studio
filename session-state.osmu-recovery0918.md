# OSMU 발행 복구·사용량 수리 인계 · 2026-09-18 09:56 KST

## 무엇을 어디까지 했나

- 인계 기준: 부모 컨트롤러가 지정한 최신 08:27 코드 감사 MAJOR 6건·MINOR 1건. 기존 tmux와 9555·9444 브라우저는 이 워커가 사용하지 않았다.
- 격리 worktree `/Users/sj/sj_code_master/_wt_osmu_recovery0918`, 브랜치 `work/osmu-recovery0918`, 시작 HEAD `81da66ee`. 메인 worktree는 수정하지 않았다.
- 일반 글과 YouTube·Reels의 발행 복구 서명 증표, 행·초안·단계 결속, 사용량 발생 시각, 50건 뒤 pending 판정, 기존 예약 크론의 사용량 적체 relay, 성과실 오류 구분과 값 보존, 토큰 요청 abort 통합을 구현했다. DB schema/migration 변경 없음.
- 관련 테스트 표적 묶음 18/18, UI·증표·실 HTTP abort 10/10, 예약 크론·정합 20/20, 기존 발행 분기 32/32 통과. Studio 38건 중 신규 복구 오류 검증 포함 37건 통과, 기존 무관 테스트 1건은 공유 호스트 부하로 5초 시간 초과. 다시 표적 확인 필요.
- TypeScript 수정 후 `npm run typecheck:ci` 종료 0, 디자인 lint 종료 0. 영상 증표 추가 뒤 최종 TypeScript 재실행 중. 기본 `next build`는 worktree의 외부 node_modules symlink를 Turbopack이 거부해 환경 실패. `npm run build -- --webpack` 실행 중.

## 남은 이슈·블로커

- `npm run build -- --webpack` 종료 확인과 dev 서버 실화면 스모크가 남았다.
- 9555/9444 계정 브라우저 및 운영 DB, 실제 공개 SNS 발행/복구는 부모 컨트롤러 소유이며 이 격리 코드 작업에선 미검증.
- 서명 증표가 없는 과거 partial 응답은 자동 완료를 거절하고 외부 게시 확인 후 운영자 조치를 안내한다. 운영자 전용 과거 건 수동 복구 도구는 이번 변경에 없다.
- 예약 발행 크론의 실제 운영 스케줄 등록 및 주기는 직접 관찰하지 않았다.

## 다음에 칠 명령

`cd /Users/sj/sj_code_master/_wt_osmu_recovery0918/dashboard && npm run typecheck:ci`

그다음 `npm run test -- tests/publish/studio-publish-ui.test.tsx -t 'FE-V63-RETURN-01|REVIEW-20260918-13' --testTimeout=20000 --maxWorkers=1 --minWorkers=1`로 흔들린 기존 테스트와 신규 테스트를 함께 재확인한다. Build 실행 세션 15601의 종료를 확인한다. 이후 `git diff --check`, dev 스모크, 문서 갱신, 전용 브랜치 커밋을 한다.

## 검증했나

표적 Vitest, TypeScript, design-lint는 위 범위에서 테스트됨. 실제 공급자·운영 배포·브라우저 UX는 미검증.
