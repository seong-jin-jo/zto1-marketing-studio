# zto1-marketing-studio OSMU 코드 리뷰 수정 인계

STAMP: 2026-09-18 03:20 KST | line: zto1-marketing-studio-osmu-codefix0918 | model: gpt-codex/gpt-5 | status: complete

## 무엇을 어디까지 했나

`docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-18.md`의 MAJOR 10건을 모두 수정했다.
발행 원장 복구, TikTok과 예약 발행 사용량, 사용량 지연 표시, YouTube 계정과 파일 결속,
OAuth 오류 분류, 브라우저 상태, 네 방 설정 복구를 코드와 회귀 테스트로 닫았다.
코드와 테스트 커밋은 `b35da4d1`, `b6117657`, `af7fddf5`, `9d0b4302`, 증거 문서는
`fd0fc5ce`, 종료 상태는 `1f74ce2e`다.

## 남은 이슈·블로커

이번 코드 리뷰 수정 범위의 미해결 지적은 없다. 운영 배포와 실제 SNS 공개 발행은 미검증이다.
파이프라인 QA 승격은 하지 않았다. 공유 작업 트리의 `dashboard/scripts/osmu-browsers.sh`와
`docs/구현현황.md`에는 다른 세션의 후속 변경이 남아 있으므로 되돌리거나 함께 커밋하지 않는다.

## 다음에 칠 명령

QA가 다시 검증할 때 `cd dashboard && npm run test && npx tsc --noEmit`을 실행한 뒤,
`.env.local`을 불러와 `node scripts/verify-basic-flow-e2e.mjs`와
`node scripts/verify-studio-v1-e2e.mjs`를 실행한다. 배포는 QA 승인 뒤 별도 진행한다.

## 검증했나

Vitest 376파일과 2,426건, TypeScript, Next.js build 185/185, 디자인 lint,
localhost 기본 흐름 11/11, Studio v1 14/14, 네 방 20화면을 통과했다.
임시 발행 행에 복구 API를 호출해 HTTP 200, `published`, 사용량 `recorded`, 이벤트 1건을 관찰했고
임시 발행 행과 활성 QA 토큰이 모두 0인 것을 확인했다.
