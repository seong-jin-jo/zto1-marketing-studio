# OSMU API 읽기 경로 전수 실사 v16 인계

## 2026-09-19 09:44 KST

### 무엇을 어디까지 했나

- canonical `pipeline-state.osmu.md`는 착수 시 이미 `current_stage: qa`였다. 단계 값은 바꾸지 않았다.
- 격리 작업 트리 `/private/tmp/osmu-api-live-sweep0919-codex.UlKhc5`, 브랜치 `work/api-live-sweep0919-codex`에서 작업했다.
- 검증 실행본 `e0a8c02e`의 읽기 Route Handler 105개에 GET 105회와 HEAD 1회를 보냈다. 정상 88건, 계약상 거절 18건, 예상 밖 응답 0건, HTTP 500 0건이다.
- 2026-08-28 코드 재구성 95개 대비 추가 10개, 삭제 0개다. 과거 문서의 84개와 내부 합계 86은 충돌하므로 병기했다.
- 잠금 회귀가 실제 `proper-lockfile`을 사용하도록 고친 선행 커밋은 `0cc1a576`, `e0a8c02e`다. 최종 QA 보고와 원본 증거 커밋은 `8c349f8d`다.
- 최종 보고서는 `docs/qa/osmu-api-read-sweep-v16-gpt-codex.md`, 원본은 `dashboard/logs/diff/osmu-api-read-sweep-20260919-v16/`다.

### 남은 이슈와 블로커

- 기본 흐름과 Studio v1은 정상 생성에서 HTTP 429 `STUDIO_LLM_PROVIDER_RATE_LIMITED`로 실패했다. 제품 전체는 NO-GO다.
- `DESIGN.md`의 v64 승인 정본과 pipeline의 v68 `approved-for-build` 및 `candidate-only` 기록이 충돌한다. 기존 v63 디자인 정합 NG를 유지한다.
- 운영 health는 HTTP 200과 DB up이지만 운영 커밋 `c3edb4e9`가 실사 커밋 `e0a8c02e`와 다르다. 현재 전수 결과를 운영 배포본 결과로 확대하지 않는다.
- `verify-agent-quality.sh`는 전역 `deploy-hosts.tsv`에 OSMU 도메인이 없어 실제 운영 접촉을 0건으로 판정해 FAIL했다. 보고서에는 검증실패 라벨을 남겼다.

### 다음에 칠 명령

```bash
cd /private/tmp/osmu-api-live-sweep0919-codex.UlKhc5/dashboard
set -a && source .env.local && set +a
STUDIO_BASE_URL=http://127.0.0.1:3457 node scripts/verify-basic-flow-e2e.mjs
STUDIO_BASE_URL=http://127.0.0.1:3457 node scripts/verify-studio-v1-e2e.mjs
```

공급자 한도 회복 또는 자체 Anthropic 키 등록 뒤, 반드시 `e0a8c02e`와 동일한 제품 소스를 기동하고 두 명령의 종료 코드 0을 관찰한다. 컨트롤러와 product-designer는 v64와 v68 중 단일 승인 디자인 핀을 정리한다.

### 검증했나

- `npm run test`: 378파일, 2,418건 PASS, 3건 제외
- `npx tsc --noEmit`: PASS
- `npx next build --webpack`: 185/185 PASS
- schema, seed, RLS: PASS
- local `/api/health`: HTTP 200, DB up, 실행 커밋 일치
- 실제 브라우저: 390 밝음과 어두움, 768, 1024, 1440의 20화면 PASS. 가로 넘침, 가린 모달, 401, 콘솔 오류 0
- 기본 `npm run build`: 격리 worktree 외부 `node_modules` symlink 제한으로 NG
- 기본 흐름과 Studio v1: 공급자 HTTP 429로 NG
- 운영 `/api/health`: HTTP 200, DB up, 실사 커밋과 배포 커밋 불일치
