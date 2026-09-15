# OSMU API 읽기 경로 전수 실사 v12 핸드오프

작성: 2026-09-15 17:47 KST
라인: osmu-api-sweep091517
브랜치: session/zto1-marketing-studio-20260912
상태: API 읽기 범위 PASS, 제품 전체 NG

## 무엇을 어디까지 했나

- canonical `pipeline-state.osmu.md`는 착수 때 이미 `current_stage: qa`라 단계 값을 바꾸지 않았다.
- `dashboard/src/app/api/**/route.ts`의 읽기 메서드를 파일 시스템 재귀로 열거했다. 고유 경로 105개, GET 105건, HEAD 1건이다.
- localhost:3456과 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`에서 총 106건을 두 번 권위 실행했다. 정상 92건, 계약상 거절 14건이며 HTTP 500, 예상 밖 5xx와 4xx, redirect, timeout은 모두 0이다.
- 긴 JSON 19건을 미리보기 길이로 먼저 잘라 형식 오류로 오판하던 검사기를 고쳤다. 전체 본문으로 판정하고, 비밀 키를 제거한 220자 미리보기만 기록한다.
- 수정 커밋은 `2c50d68b`, 회귀 커밋은 `1aefc861`, QA 증거 커밋은 `724e5c6e`다.
- 상세 보고서는 `docs/qa/osmu-api-read-sweep-v12-gpt-codex.md`, 최종 원본은 `logs/diff/osmu-api-read-sweep-20260915-v12-authoritative-final2.json`이다.
- `docs/qa/qa-tracker.md`, `docs/구현현황.md`, `wiki/ops/session-state.md`에 최신 판정을 기록했다.

## 남은 이슈와 블로커

- API 읽기 범위 외 제품 전체는 NG다. v63 과제와 v68 승인 핀이 충돌하고 기존 8개 배치 속성 디자인 정합도 NG다.
- 2026-09-15 17시 25분 코드 공격 리뷰가 MAJOR 17건, MINOR 1건으로 BLOCK이다.
- 운영 배포, 외부 채널 실발행, 외부 계정 성과 수집은 미검증이다.
- `verify-agent-quality.sh`는 배포 환경 접촉 증거 0건으로 종료 코드 2다. 로컬 API 범위 PASS를 제품 전체 PASS로 확대하지 않는다.
- 공유 작업 트리에 이 작업과 무관한 대규모 문서 이전 및 다른 라인 변경이 남아 있다. 되돌리거나 함께 커밋하지 않는다.

## 다음에 칠 명령

1. 코드 공격 리뷰 MAJOR를 닫은 새 고정 커밋이 나온 뒤 `cd dashboard && npm run test && npx tsc --noEmit && npm run build`.
2. `cd dashboard && set -a && source .env.local && set +a && STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-basic-flow-e2e.mjs && node scripts/verify-studio-v1-e2e.mjs`.
3. `cd dashboard && set -a && source .env.local && set +a && API_SWEEP_WORKSPACE_ID=cd1d0a40-540d-4524-9b49-bf2445d82182 API_SWEEP_OUTPUT=../logs/diff/osmu-api-read-sweep-next.json API_SWEEP_BASE_URL=http://localhost:3456 API_SWEEP_TIMEOUT_MS=120000 API_SWEEP_TOTAL_TIMEOUT_MS=600000 API_SWEEP_CONCURRENCY=1 node scripts/verify-api-read-sweep.mjs`.
4. 단일 승인 디자인 핀이 확정되면 390, 768, 1024, 1440 네 방 캡처와 8개 배치 속성 정합표를 다시 판정한다.

## 검증했나

- `npm run test`: 360파일, 2,317건 통과, 조건부 3건 제외.
- `npx tsc --noEmit`: 종료 코드 0.
- `npm run build`: Next.js 16.2.2, 정적 페이지 184/184. 기존 NFT 경고 1건.
- schema, seed, RLS 적용: 종료 코드 0.
- health: HTTP 200, DB up, 19ms.
- 기본 흐름: 11/11. Studio v1: 14/14.
- Playwright: 390 라이트와 다크, 768, 1024, 1440의 네 방 20/20. 가로 넘침, 가린 모달, 브라우저 401, 콘솔 오류 0.
- design lint: 위반 0.
- 임시 QA 토큰: 이번 실행 폐기 HTTP 200, 활성 `qa-four-room-*` 0.
- 최종 전수 실행: PID 64529와 소스 SHA-256 `8c65d5fa62b8f3d49cac66f3a41c82018d7735a7641379d95d1f454c88e07a75`가 전후 동일.
