# OSMU 코드 공격 리뷰 수정 핸드오프

STAMP: 2026-09-17 05:12 KST | line: osmu-codefix0917 | model: gpt-codex/gpt-5 | owner: code-builder

## 무엇을 어디까지 했나

- `osmu-code-review-2026-09-17.md`의 MAJOR 6건을 위험도 순으로 모두 수정했다.
- 사용량 장부 outbox, YouTube resumable 세션 재개와 재개권 경합, 외부 성공 뒤 내부 확정 실패,
  태그와 파일 내용 기반 멱등 키, 제외 채널 partial 상태, 긴 대시 문구를 고쳤다.
- 코드와 테스트 커밋: `1f7fbed4`, `46e75b2d`, `dc5165cf`, `72044c45`.
- QA와 구현현황 커밋: `2d1e617e`.

## 남은 이슈와 블로커

- 이번 리뷰 수정 범위는 PASS다.
- 공개 SNS 실발행과 운영 배포는 미검증이다.
- v63과 v68 디자인 핀 충돌 및 기존 디자인 정합 NG 때문에 제품 전체 QA와 배포는 NG다.
- `codex-qa-verifier-63000`은 `osmu-sweep091705`가 소유한 별도 API 읽기 전수 실사다. 이 라인의
  위임이 아니므로 중단하거나 레지스트리에서 제거하지 않았다.
- 과거 QA 산출물 세 건의 verify FAIL은 이번 수정 산출물이 아니다. 최종 보고에서 검증 실패 등급과
  출고 제외를 명시한다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio/dashboard
set -a && source .env.local && set +a
node scripts/verify-basic-flow-e2e.mjs
node scripts/verify-studio-v1-e2e.mjs
```

다음 소유자는 QA 재검수에서 MAJOR 6건의 수정 커밋과 `docs/qa/qa-tracker.md` 증거를 대조한다.
종료 증거는 회귀 전체 통과, 실제 Postgres outbox 1회 집계, localhost 기본 흐름 11/11과 Studio v1
14/14다. 공개 SNS나 운영 배포가 필요하면 회장 승인 뒤 별도 회수한다.

## 검증했나

- `npm run test`: 374파일, 2,414건 통과, 3건 제외.
- `npx tsc --noEmit`: 통과.
- `npm run build`: 통과.
- design lint: 위반 0.
- 실제 Postgres outbox relay 두 번: 장부 1행, 상태 recorded.
- localhost 기본 흐름: 11/11.
- localhost Studio v1: 14/14.
- health: HTTP 200, DB up. 관찰 실행본 `35f11ab0`은 제품 수정 `46e75b2d`의 후손이다.
