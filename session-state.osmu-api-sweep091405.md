# OSMU API 읽기 경로 전수 재실사 인계

## 무엇을 어디까지 했나

- canonical `pipeline-state.osmu.md`는 착수 때 이미 `current_stage: qa`여서 단계 상태를 바꾸지 않았다.
- `dashboard/src/app/api/**/route.ts` 중 GET을 내보내는 105개를 localhost:3456에서 실제 호출했다.
- 최종 결과는 정상 92개, 계약상 거절 13개, HTTP 500과 요청 실패 0개다.
- 실행 전후 GET 소스 합성 SHA-256은 `a011035aabbc73c19f9862f5f493ef5d9b806c6d922e0d87a3258399de37e5f1`로 동일하다.
- 상세 보고서 `docs/qa/osmu-api-read-sweep-v7-gpt-codex.md`, 원본 `logs/diff/osmu-api-read-sweep-20260914-final-v2.json`, QA 원장과 `docs/구현현황.md`를 갱신했다.
- 줄바꿈 모양에 결합된 발행실 회귀 검사를 의미 기반 호출 순서 검사로 고쳤다. 커밋은 `e56f660b`, QA 증거 커밋은 `01696482`다.

## 남은 이슈·블로커

- 별도 개발 E2E 서버에서 `/login` endpoint 작성 중 `Next.js package not found` Turbopack 치명 로그가 반복됐다. E2E와 health는 통과했지만 로그 청정성은 NG다.
- 상위 QA 품질 검증은 운영 또는 stage 환경 접촉 증거가 없어 FAIL이다. 이번 과제는 localhost 범위여서 운영으로 확장하지 않았다.
- 승인 프로토타입 v63과 canonical pipeline v68 핀이 충돌하며, 제품 전체 디자인 정합은 PASS로 판정하지 않았다.
- 승인 시안과 dev 발행실을 원본 1440폭으로 직접 대조했다. 상단 정보 구조, 요소 순서, 카드 열 구성, 버튼 위계가 달라 디자인 정합은 NG다.
- 공유 작업 트리에 다른 세션의 미커밋 변경이 다수 남아 있다. 되돌리거나 함께 커밋하지 않는다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio
bash ~/.claude/harness/bin/verify-agent-quality.sh docs/qa/osmu-api-read-sweep-v7-gpt-codex.md qa-verifier
```

개발 환경 담당은 깨끗한 설치와 단일 Next 개발 서버 조건에서 Turbopack 치명 로그를 재현한다. product-designer와 컨트롤러는 v63과 v68 중 단일 승인 디자인 핀을 확정한 뒤 8축 디자인 정합을 다시 검증한다.

## 검증했나

- 실제 GET 105개: 정상 92, 계약상 거절 13, 고장 0.
- 전체 Vitest: 339파일, 2,194건 통과, 조건부 3건 제외, 실패 0.
- `npx tsc --noEmit`: 종료 코드 0.
- production build: 184/184, 종료 코드 0, 기존 NFT 경고 1건.
- `apply-schema.sh --seed`: 멱등 적용과 고정 작업 공간 복원 통과.
- 기본 흐름 E2E: 11/11 통과.
- Studio v1 E2E: 14/14 통과.
- 디자인 lint: 토큰 위반 0. 디자인 픽셀 정합 PASS를 뜻하지 않는다.
- 운영 배포, 외부 채널 실발행: 미검증.
