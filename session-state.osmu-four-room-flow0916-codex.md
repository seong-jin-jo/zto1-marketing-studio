# 2026-09-16 네 방 기본 흐름 재검증 인계

## 무엇을 어디까지 했나

- canonical `pipeline-state.osmu.md`는 착수 시 이미 `current_stage: qa`였다.
- 실행 커밋 `4a44136d9c24c1ab5e863a60862f2308d199e7cc`와 health `build_commit`이 같은 통제 localhost 서버에서 기본 흐름 11/11, 네 방 단면 4/4, 390 라이트와 다크, 768, 1024, 1440 화면 20/20, 복귀 5/5, Studio v1 14/14를 통과했다.
- 원본은 `logs/diff/osmu-four-room-flow-20260916-v15/captures-final/`, 보고서는 `docs/qa/osmu-four-room-basic-flow-v15-gpt-codex.md`다.
- 정확한 `npx tsc --noEmit`, schema와 seed 및 RLS, 디자인 lint는 종료 0이다.

## 남은 이슈와 블로커

- 최종 `npm run test`에서 발행 경계 2건이 5초 timeout으로 실패했고 남은 실행은 종료 전에 중단됐다. 최신 전체 회귀 PASS가 아니다.
- Next 16.2.2의 `.next/dev/types/routes.d.ts`가 통제 서버에서도 잘린다. 손상본은 `/tmp/osmu-next-dev-types-broken-v15-20260916-0310`에 보존했다.
- 과제 지정 v63과 canonical 승인 v68 디자인 핀이 충돌하며 현재 화면은 v63 정합 NG다.
- 첫 실패 실행에서 서버가 내려가 임시 고객 토큰 폐기 응답을 받지 못한 1건은 운영 점검이 필요하다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio/dashboard
npx vitest run tests/publish/publish-route.branch.test.ts tests/publish/video-publish-reels.route.test.ts
npm run test
```

두 표적과 전체가 종료 0일 때만 `FLOW-FULL-REGRESSION-V15`를 PASS로 바꾼다.

## 검증했나

- 관찰됨: health HTTP 200과 DB up, 실행 커밋 귀속, 네 live suite, 20개 화면 원본, 대표 4폭 육안 확인.
- 테스트됨: TypeScript 종료 0, seed와 RLS 종료 0, 디자인 lint 위반 0, 착수 전체 회귀 366파일과 2,345건 통과.
- NG: 최종 전체 회귀 timeout 2건, v63 디자인 정합, 운영 배포와 외부 채널 실발행.
