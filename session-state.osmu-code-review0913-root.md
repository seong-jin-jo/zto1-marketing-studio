# OSMU 최근 24시간 코드 리뷰 메인 핸드오프

## 무엇을 어디까지 했나

- 회장 요청 원문을 handoff basis로 사용했다. tmux pane은 동시 작업과 localhost 실행 상태 확인에만 참고했다.
- 착수 시점 범위를 `8652fb5b29fecad7aa688b99ad1c2bab534d2fc4..7e39d0a7ddee8a9d7344cb08f56dea8baaf94419`로 고정해 55개 커밋, 236개 파일을 검토했다.
- 승인 프로토타입 v63, pipeline 승인 핀, `DESIGN.md`, 회장 확정 요구 대장, OSMU 사업 좌표, 결정·실수·요청 원장, 구현 현황을 읽고 대조했다.
- 제품 코드는 수정하지 않았다. MAJOR 23건, MINOR 0건으로 `REVIEW_VERDICT: BLOCK`을 기록했다.
- 리뷰 문서는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-13.md`다.
- 리뷰와 QA 기록 커밋은 `afe2a312`, `4bff798d`, `4ec37004`, `ed9d9f2f`다.

## 남은 이슈·블로커

- 핵심 차단점은 OpenClaw publisher의 작업 공간 밖 파일 반출과 승인 payload 바꿔치기, queue lock heartbeat와 소유권 부재, corrupt queue의 빈 큐 덮어쓰기, outbox ABA 삭제다.
- 성과 수집은 전체 실패를 HTTP 200으로 응답하고 뒤 batch 실패 시 앞선 성공을 폐기한다. 카드뉴스는 실제 2장 이후 미리보기와 편집 결과 PNG 발행이 끊겨 있다.
- localhost의 두 필수 E2E는 실제 생성 요청에서 공유 AI 월간 한도 소진 HTTP 429로 중단됐다. 코드 결함 통과가 아니라 환경 블로커가 관찰된 NG다.
- 운영 배포와 외부 채널 실발행은 미검증이다. pipeline 상태는 바꾸지 않았다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio
sed -n '1,240p' docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-13.md
git show --stat ed9d9f2f
cd dashboard
npm run test
npx tsc --noEmit
node scripts/verify-basic-flow-e2e.mjs
node scripts/verify-studio-v1-e2e.mjs
```

수정 후 QA는 경로 이탈, 승인 payload binding, lock 임계구역 중첩, outbox version 경합, 성과 전체 실패와 뒤 batch 실패, 카드 PNG 미리보기와 실제 발행 bytes 일치를 직접 재현해야 한다.

## 검증했나

- queue lock 재현에서 첫 writer가 12,502ms에 끝나기 전 둘째 writer가 10,253ms에 진입해 임계구역이 2,249ms 겹쳤다.
- `npm run test`는 319파일, 2,106건 통과, 3건 제외였다. `npx tsc --noEmit`은 통과했다.
- localhost:3456 루트 HTTP 200을 관찰했다.
- 지정 작업 공간에서 기본 흐름과 Studio v1 E2E를 실제 요청으로 실행했다. 둘 다 생성 단계 HTTP 429 `STUDIO_LLM_QUOTA_EXHAUSTED`로 종료돼 NG다.
- 시각 디자인 픽셀 일치 판정은 수행하지 않았고 PASS를 주장하지 않았다. 이번 리뷰는 지시된 코드·구조 계약 이탈만 판정했다.
- 공유 작업 트리의 다른 세션 변경은 수정하거나 커밋하지 않았다.
