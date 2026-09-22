# OSMU 갭 재확인 인계

STAMP: 2026-09-22 19:24 KST | line: osmu-gapfill092219-codex | model: gpt-codex/gpt-5 | agent: code-builder

## 무엇을 어디까지 했나

- 두 기반 감사와 현재 schema, migration, 성과 API, 승인 디자인, pipeline과 품질 1단계 FDD를 대조했다.
- 이미 구현된 감사 항목을 제외하면 게시물별 성과 관측 이력과 최근 30일 대 직전 30일 비교만 남는다.
- 승인 FDD가 발행실과 성과실 변경을 범위 밖으로 두므로 제품 소스는 수정하지 않았다.
- 갭 재확인, QA tracker, 구현현황, 기존 wiki 인계 문서를 갱신해 커밋했다.

## 남은 이슈·블로커

- 관측 단위, 멱등 키, 보존 기간, 공급자 원본과 정규화, 기간 비교식, 표본 부족 기준의 승인 기술설계가 없다.
- 기본 흐름과 Studio v1 E2E의 정상 생성이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`로 실패한다.
- 작업 트리 TypeScript는 공유 개발 서버가 만든 `.next/dev/types` 문법 파손 때문에 실패한다. `.next`를 제외한 동일 소스 복제본은 통과했다.
- UI 제품 변경이 0건이라 시안 대 dev 픽셀 디자인 QA는 수행하지 않았다. 디자인 일치나 통과 판정도 하지 않았다.

## 다음에 칠 명령

기술설계와 pipeline 범위 승인, 생성 공급자 복구 후 실행한다.

```bash
cd dashboard
npm run test
npx tsc --noEmit
node scripts/verify-basic-flow-e2e.mjs
node scripts/verify-studio-v1-e2e.mjs
```

## 검증했나

- localhost health HTTP 200, DB up, 실행 커밋 `5d112dfc`를 관찰했다. 실측 당시 HEAD와 일치했고 이후 제품 소스가 아닌 증거 문서만 커밋했다.
- 지정 작업 공간 metrics HTTP 200, 키 `posts`, `coverage`, 게시물 0건, `history`와 `comparison` 부재를 관찰했다.
- `npm run test`: 378파일, 2,443건 통과, 3건 제외, 종료 코드 0.
- 깨끗한 동일 소스의 `npx tsc --noEmit`: 종료 코드 0. 공유 작업 트리에서는 종료 코드 2.
- `design-lint.sh src`: 종료 코드 0, 위반 0.
- 두 필수 E2E: 생성 공급자 오류로 종료 코드 1, 미통과.
- 커밋: 이 파일을 포함해 `docs(osmu): record blocked performance history gap` 선택 커밋으로 정리한다.

다음 소유자: 컨트롤러와 tech-architect가 기술계약을 합의하고 pipeline에 승인 핀을 남긴다. 이후 code-builder가 migration, 수집 저장, `history`, `comparison`, 정상·거절·경합 테스트를 구현한다.
