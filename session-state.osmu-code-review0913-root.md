# OSMU 최근 24시간 코드 리뷰 메인 핸드오프

## 무엇을 어디까지 했나

- 회장 요청 원문을 handoff basis로 사용했다. tmux pane은 동시 작업과 localhost 실행 상태 확인에만 참고했다.
- 착수 시점 범위를 `8652fb5b29fecad7aa688b99ad1c2bab534d2fc4..e65a1d1b1aecbc11ce589ecf9db4183bf4d4296e`로 고정해 71개 커밋, 283개 파일을 검토했다.
- 승인 프로토타입 v63, pipeline 승인 핀 v68, `DESIGN.md`, 회장 확정 요구 대장, OSMU 사업 좌표, 결정·실수·요청 원장, 구현 현황을 읽고 대조했다.
- 제품 코드는 수정하지 않았다. MAJOR 26건, MINOR 1건으로 `REVIEW_VERDICT: BLOCK`을 기록했다.
- 리뷰 문서는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-13.md`다.
- 리뷰와 QA 기록 커밋은 `39c01597`, `d91a8e41`, `731d79e5`다.

## 남은 이슈·블로커

- 핵심 차단점은 OpenClaw publisher의 작업 공간 밖 파일 반출과 승인 payload 바꿔치기, queue lock heartbeat와 소유권 부재, corrupt queue의 빈 큐 덮어쓰기, outbox ABA 삭제다.
- 성과 수집은 전체 실패를 HTTP 200으로 응답하고 뒤 batch 실패 시 앞선 성공을 폐기한다. 실제 localhost metrics 요청도 15초 안에 끝나지 않았다.
- 카드뉴스는 실제 2장 이후 미리보기와 편집 결과 PNG 발행이 끊겼고, 예약 발행은 다섯 장을 첫 장 하나로 축소한다.
- QA 시드는 임의 원격 `DATABASE_URL`에서도 월 생성 사용량을 0으로 되감을 수 있다. 네 방 검증기는 전체 deadline 없이 방별 120초 제한을 반복한다.
- 운영 배포와 외부 채널 실발행은 미검증이다. pipeline 상태는 바꾸지 않았다.
- 별도 QA 전수 실사 위임 `codex-qa-verifier-97793`이 `/tmp/osmu-sweep091317.log`에서 105개 읽기 API 실호출을 수행 중이다. 현재 리뷰 산출과는 독립 작업이다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio
tail -120 /tmp/osmu-sweep091317.log
test -f /tmp/osmu-sweep091317.done && ~/.claude/harness/bin/bg-agents.sh rm codex-qa-verifier-97793
sed -n '1,180p' docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-13.md
cd dashboard
npm run test
npx tsc --noEmit
node scripts/verify-basic-flow-e2e.mjs
node scripts/verify-studio-v1-e2e.mjs
```

수정 후 QA는 경로 이탈, 승인 payload binding, lock 임계구역 중첩, outbox version 경합, 성과 전체 실패와 뒤 batch 실패, 카드 PNG 미리보기와 실제 발행 bytes, 예약 다중 이미지, 운영 DB seed 거부, 검증기 전체 deadline을 직접 재현해야 한다.

## 검증했나

- queue lock 재현에서 첫 writer가 12,502ms에 끝나기 전 둘째 writer가 10,257ms에 진입해 임계구역이 2,245ms 겹쳤다.
- `npm run test`와 `npx tsc --noEmit`은 종료 코드 0이었다.
- localhost:3456 health HTTP 200을 관찰했다. metrics 요청은 15초 timeout이었다.
- 지정 작업 공간에서 기본 흐름 11/11과 Studio v1 14/14를 실제 요청으로 통과했다.
- 시각 디자인 픽셀 일치 판정은 수행하지 않았다. 이번 리뷰는 지시된 코드와 구조 계약 이탈만 판정했다.
- localhost 및 테스트는 동시 작업이 있는 현재 공유 작업 트리에서 실행했으므로 고정 리뷰 커밋의 결함 해소 증거로 사용하지 않았다.
- 공유 작업 트리의 다른 세션 변경은 수정하거나 커밋하지 않았다.
