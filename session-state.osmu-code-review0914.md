# OSMU 최근 24시간 코드 공격 리뷰 핸드오프

## 무엇을 어디까지 했나

- 회장 요청 원문을 기준으로 `b4ec9dbdb4eaaa52a9b5d80766ab2927431c2811..acb981ea484a113eaef87ef82f05d4edc43334bf` 47개 커밋, 184개 파일을 고정해 검토했다.
- 사용자 지정 v63 프로토타입, `DESIGN.md`, pipeline 승인 핀, 요청·결정·실수 원장, 구현 현황, OSMU 사업 좌표를 읽고 diff와 대조했다.
- 제품 코드는 수정하지 않았다. MAJOR 19건, MINOR 0건, `REVIEW_VERDICT: BLOCK`이다.
- 상세 보고서는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md`다.
- QA 원장과 공용 핸드오프에 결과를 추가한 문서 커밋은 `9f272676`이다.

## 남은 이슈·블로커

- 작업 공간 밖 파일 반출 2곳, 승인 payload 바꿔치기, 큐 잠금 중첩, 발행 중 lease 복구 교착이 남아 있다.
- 예약 claim은 process 종료 뒤 영구 `processing`이 될 수 있고, 예약 Instagram 카드뉴스는 대표 한 장만 발행한다.
- 카드 객체 부분 저장, 재합성 실패 뒤 옛 그림 성공 처리, 실제 발행 이미지 덱과 미리보기 불일치가 남아 있다.
- 성과 수집은 동시 요청을 중복 호출하고, 뒤 batch 실패 시 앞 성공을 버리며, 전체 실패도 HTTP 200을 반환한다.
- 전체 Vitest 1건이 실패한다. `dashboard/tests/studio/studio-fe2-rooms.test.tsx:239`의 접근 이름 계약이며 고정 감사 범위 밖이라 최근 변경 지적 수에는 넣지 않았다.
- `docs/qa/osmu-four-room-basic-flow-v5-gpt-codex.md`의 qa-verifier 검증 실패가 별도 미해소 상태다. 이번 코드리뷰가 그 산출물을 수정하거나 재인증하지 않았다.
- 병렬 `codex-code-builder-55989`는 별도 작업이다. 중단하거나 등록 해제하지 않는다.
- 운영 배포와 실제 외부 채널 발행은 미검증이다. pipeline 상태는 바꾸지 않았다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio
sed -n '1,220p' docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md
cd dashboard
npm run test
npx tsc --noEmit
STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-basic-flow-e2e.mjs
STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-studio-v1-e2e.mjs
```

수정 후 QA는 경로 이탈 차단, 승인 payload 결속, 잠금 임계 구역 중첩 0, `processing` lease 회수, 예약 카드 덱 보존, 부분 업로드 회수, 재합성 실패 이동 차단, 실제 미리보기와 발행 bytes 일치, 성과 중복 호출 0과 전체 실패 비성공 HTTP를 직접 재현해야 한다.

## 검증했나

- `npx tsc --noEmit`: 종료 코드 0.
- `npm run test`: 종료 코드 1. 324파일 중 323 통과, 2,124건 중 2,120 통과, 3건 제외, 1건 실패.
- localhost health: HTTP 200, DB up.
- 지정 작업 공간 기본 흐름: 11/11 통과.
- 지정 작업 공간 Studio v1: 14/14 통과.
- queue lock 재현: 첫 작업 1ms 진입과 13,002ms 종료 사이에 둘째 작업이 10,254ms 진입해 2.648초 중첩.
- 현재 공유 작업 트리에 다른 세션의 미커밋 변경이 많다. 실행 증거는 고정 커밋 결함의 해소 증거로 쓰지 않았다.
- 코드 변경, 실제 외부 발행, 운영 배포는 하지 않았다.
