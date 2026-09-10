# OSMU / openclaw 코드베이스·위키 감사 v1.0.0 (읽기 전용)

<!-- STAMP
생성: 2026-09-05 12:35 KST
모델: Claude Opus 5 (claude-opus-5[1m]) · 교차: gpt-codex(GPT-5) via codex-delegate.sh code-reviewer
에이전트: code-reviewer (조사전용, 코드·정본 문서 수정 0건)
대상 레포: /Users/sj/sj_code_master/zto1-marketing-studio (origin = openclaw-auto.git)
감사 시점 HEAD: feat/design-system-and-missing-features @ e3844da6 (감사 종료 시 8a481a42, 소유 세션이 작업 중)
기준 브랜치: origin/main @ c0791990 (git fetch origin 완료)
기반 포맷: docs/qa/ 기존 QA 보고서 서식 + BRIEF-2-codebase-audit.md §산출물 규격
고민 한 줄: 이 코드는 이미 Codex 다회차 보안 패스를 거쳤다. 쉬운 지적을 늘리는 대신 "아직 아무도 안 본 자리"를 찾는 데 시간을 썼다.
-->

## 0. 읽은 것 / 안 읽은 것

**읽은 것 (지시분)**
- `wiki/거버넌스/결정.md`(ADR-004·005·006 포함 200행) · `실수.md`(최신 40행 + 병합 원문) · `외부-콘솔-의존-항목.md`(전문) · `요청.md`(미독, 아래 참조)
- `docs/burst-20260905/INPUTS-MANIFEST.md` · `BRIEF-2-codebase-audit.md`
- `pipeline-state.osmu.md`(전문) · `CLAUDE.md`(루트·dashboard) · `DESIGN.md` 머리부 · `wiki/4-reference/ssot-routing.md`
- `dashboard/src/proxy.ts`(전문) · `lib/tenant-auth.ts`(전문) · `lib/auth.ts` · `lib/channel-accounts.ts` · `lib/studio/generation/identity.ts` · `db/rls.sql` · `db/schema.sql` 인덱스·FK 전수 · `.github/workflows/deploy-marketing.yml`

**읽은 것 (스스로 추가한 것, §2.2-2)**
- `dashboard/src/app/api/**/route.ts` 181개의 인증 참조 전수 grep + 고위험 7개 정독(gateway/restart, operator/oauth-credentials, tenant-tokens, tenants, claude-token, r2-config, llm-config)
- 삭제된 `dashboard/src/middleware.ts` 의 git 이력(b361d951). Next 16 `proxy.ts` 전환임을 확인하기 위해
- `dashboard/scripts/verify-e2e.sh` · `verify-four-room-ui-e2e.mjs` · `package.json` scripts
- `wiki/` 107개 md 링크·frontmatter 전수 스캔

**안 읽은 것 (그래서 미검증)**
- `wiki/거버넌스/요청.md` 1030행 전문. 요청 266건 대조는 이미 `docs/qa/회장-세션발화-전건-대조표-2026-08-31.md` 가 담당한다고 판단해 건너뛰었다. **축 ① 판정 중 "요청 충족 여부"는 미검증이다.**
- `data-{tenant}/prompt-guide.txt` 실물. `.gitignore:9` 가 `data-*/` 를 제외하므로 로컬 트리에 없다. **런타임 VM 에만 존재하며 이 감사에서 미검증이다.** 없다고 단정하지 않는다.
- 운영 화면. 아래 §5 사유로 실측 불가.
- `openclaw/` 하위 런타임 소스 전체(대규모). 이번 범위는 dashboard·db·배포로 한정했다.

## 1. 요약

| 심각도 | 건수 | 성격 |
|---|---|---|
| P0 | 0 | 직접 악용 가능한 인증·인가 우회 없음 |
| P1 | 4 | 배포 누락, 격리 방어심층 결손, 감사 자체를 막은 운영 URL 부재, 미머지 256커밋 |
| P2 | 6 | 테스트 신호 오염, 문서 대 코드 불일치, 위키 링크 파손, 상태 파일 이중 관리 |
| P3 | 3 | 비교 방식, frontmatter 결손, 죽은 문서 절 |

가장 중요한 한 줄: **회장 계정 연결 실패의 실제 수정(`2d351268`)이 `origin/main` 에 없다.** 코드는 고쳐졌지만 배포 기준 브랜치에 도달하지 않았다.

## 2. 축별 판정

### 축 ① 승인 산출물 대비 구현 이탈: 지적 0건 / 부분 미검토

| 확인 | 결과 |
|---|---|
| `pipeline-state.osmu.md:15` 핀 `design_system: DESIGN.md v37` | `DESIGN.md:7 version: v37` 일치 (관찰됨) |
| 핀 `design_hub: docs/prototype/osmu-v68-...-0022.html` | 파일 실재 (관찰됨) |
| v68 구조 결정 "성과실 = 네 번째 전용 방" | `src/components/home/PerformanceRoom.tsx` 실재, Sidebar·RoomHeader 에 배선 (관찰됨) |
| 시안 대 실렌더 픽셀 대조 | **미검토.** 로컬 서버 기동 금지 + 운영 URL 부재(§5). |

### 축 ② 보안: 지적 3건

| 파일:줄 | 심각도 | 근거 | 교정안 | 공수 |
|---|---|---|---|---|
| `dashboard/db/rls.sql:14-15` | **P1** | `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO osmu_service` 가 무차별로 나가는데, 37행 FORCE RLS 목록에 `tenant_tokens` 와 `tenants` 가 없다. 두 테이블은 정책 0개 + FORCE 없음 + 전체 DML 허용 상태다. 같은 파일 73행은 `tenant_access_events` 에 대해 정확히 이 위험을 인지하고 `REVOKE ALL ... FROM osmu_service` 를 넣었다. 즉 저자 스스로 세운 기준이 두 테이블에만 적용되지 않았다. 지금 당장 악용하려면 별도의 임의 SQL 경로가 필요하고 postgres.js 태그드 템플릿이 그것을 막고 있어 P0 가 아니라 P1(방어심층 결손)로 본다. | `REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_tokens, public.tenants FROM osmu_service;` 를 rls.sql 끝에 추가. `tenants` 는 운영자 목록 조회 때문에 정책을 못 걸었으므로 REVOKE 가 정합한 수단이다. | 30분 + 적용 |
| `dashboard/src/lib/tenant-auth.ts:181`, `dashboard/src/proxy.ts:295` | P3 | 운영자 토큰을 `raw === operatorToken` 로 비교한다. 같은 레포 `lib/studio/generation/identity.ts:12` 는 같은 목적에 `crypto.timingSafeEqual` 을 쓴다. 원격 타이밍 공격 실현성은 낮지만 레포 내부 기준이 갈린다. | identity.ts 의 `safeEqual` 를 공통 유틸로 올려 두 곳에서 쓴다. | 20분 |
| `dashboard/src/app/api/gateway/restart/route.ts:1-13` | P2 | 인증 판정 코드가 라우트 안에 전혀 없고 `execFileSync("docker", ["restart", container])` 를 실행한다. proxy.ts 의 운영자 토큰 게이트가 실제로 막고 있어 현재는 안전하지만, 이 방어가 프록시 한 겹뿐이다. tenant-auth.ts:163 주석이 스스로 "방어심층이 프록시 한 겹에만 의존하지 않도록" 을 원칙으로 선언했는데 이 라우트만 그 원칙 밖에 있다. 컨테이너 재시작은 되돌리기 싼 동작이 아니다. | 라우트 첫 줄에 operator bearer 재검증을 넣는다(`operator/oauth-credentials/route.ts:26` 의 `operatorAuthError` 패턴 재사용). | 30분 |

**문제없음으로 판정한 것 (근거 있음)**
- 비밀값 하드코딩: `dashboard/src`·`scripts`·`.github`·`config` 전수 정규식 스캔(sk-ant / AKIA / xox / PRIVATE KEY / ghp_) 결과 실제 비밀값 0건. 유일한 매치는 `lib/gsc-auth.ts:26` 의 PEM 헤더 제거 정규식이다.
- OAuth CSRF: `lib/social-connect.ts:62-169` 가 HMAC 서명 state + provider 바인딩 + 10분 만료 + httpOnly 쿠키 이중 바인딩을 모두 구현한다. 평문 state 다운그레이드도 명시적으로 거부한다.
- 채널 토큰 보관: `channel-accounts.ts:234` `armor(pgp_sym_encrypt(...))`, 목록 API 는 토큰을 반환하지 않는다(271행 주석과 실제 SELECT 컬럼 일치 확인).
- Studio v1 우회 경로: `proxy.ts:235` 가 통과시키지만 `lib/studio/generation/identity.ts` 가 Supabase JWT 실검증 + workspace 소유권을 강제한다. 운영에서 개발 우회는 27행이 `NODE_ENV === production` 으로 차단한다.

### 축 ③ 데이터 안전: 지적 1건

| 파일:줄 | 심각도 | 근거 | 교정안 |
|---|---|---|---|
| `dashboard/src/lib/channel-accounts.ts:234-235`, `374-393` | P3 | `OSMU_SECRET_KEY` 원문을 SQL 바인드 파라미터로 넘긴다. `log_statement` 나 `auto_explain` 이 켜진 환경, 또는 pg_stat_activity 조회에서 키가 노출될 수 있다. Supabase 기본 설정에서는 파라미터가 로그에 남지 않아 즉시 위험은 아니다. | 운영 DB 의 `log_statement`/`log_min_duration_statement` 설정을 한 번 확인하고 그 결과를 `외부-콘솔-의존-항목.md` 에 한 줄 등록한다. |

**문제없음으로 판정한 것**
- `uq_channel_accounts_one_default` 재발 경로: 없음. `promoteIfDefaultUnusable`(170-197행)과 `setDefaultAccount`(308-309행) 둘 다 "먼저 전부 내리고 다음에 올린다" 2문장 순서를 지키고, `upsertChannelAccount`(213행)와 `deleteChannelAccount`(325행)는 `pg_advisory_xact_lock` 으로 tenant+provider 단위 직렬화를 건다. **Codex 교차 리뷰도 독립적으로 "없음" 판정.**
- 인덱스: `db/schema.sql` 의 테넌트 스코프 테이블 전수에 `(tenant_id, ...)` 복합 인덱스가 있다(97·99·311·380·393·405·418·447·459·484·537행 등). FK 는 전부 `REFERENCES tenants(id) ON DELETE CASCADE` 또는 명시적 `SET NULL`.
- 마이그레이션 파괴성: `db/migrations/` 18개가 expand/contract 명명 규칙을 지키고 `rollback-migration.sh` + `verify-rollback-indexes.sql` + `migration-manifest.tsv` 가 함께 있다. 백필 없는 NOT NULL 추가나 컬럼 DROP 없음.

### 축 ④ 오류 처리·로깅·관측성: 지적 0건

`lib/observability.ts` + `reportFailure/reportRecovery` 가 인증 경계 한 곳에서만 보고하도록 설계돼 있고(`tenant-auth.ts:6-12` 주석), 401/403 은 의도적으로 알림에서 제외한다. 최근 커밋 `696491cc`("조용한 실패 4건 제거")가 같은 방향이다. 추가 지적 없음.

### 축 ⑤ 테스트 공백: 지적 2건

| 항목 | 심각도 | 실측 |
|---|---|---|
| `npm test` 전체 실행 | **P2** | Test Files 7 failed, 219 passed (226) / Tests 12 failed, 1654 passed, 30 skipped (1696) / EXIT=1. 로그: `/tmp/osmu-vitest.log` (관찰됨) |
| 실패 12건의 성격 | P2 | 9건은 `PostgresError: password authentication failed for user "postgres"` 즉 로컬 DB 미구성 탓이다(`tests/studio/shorts-factory-db.integration.test.ts:64` 외 tests/db·tests/observability). **이 테스트들은 DB 없을 때 skip 하지 않고 hard fail 한다.** 그래서 개발자 기본 상태에서 `npm test` 가 항상 빨갛고, 진짜 회귀와 환경 실패가 구분되지 않는다. 교정: DB 커넥션 확보 실패 시 `describe.skip` + 명시 경고로 전환하고, CI 에서는 `scripts/local-ci-db.sh` 필수로 강제한다. |
| 나머지 3건 | P2 | `tests/publish/publish-route.branch.test.ts` FMT-API-02, `tests/studio/four-room-empty-actions.test.tsx` V77-CREATE-NETWORK-01, `tests/db/engagement-c5` 는 전부 "Test timed out in 5000ms". 본 감사는 Codex 교차 리뷰와 동시 실행 중이었으므로 부하로 인한 flake 가능성이 크다. **단독 재실행으로 확정 필요(미검증).** `work/v74flaky` 브랜치가 존재하는 것으로 보아 flaky 이력이 이미 있다. |
| 핵심 플로우 E2E | P2 | `scripts/verify-e2e.sh` 는 로그인 진입만 검증한다. **계정 연결 → 생성실 → 발행 → 성과실 전 구간을 하나로 잇는 E2E 는 없다.** `verify-four-room-ui-e2e.mjs` 가 네 방을 돌지만 UI 렌더 캡처이지 발행 성공 판정이 아니다. 실수원장 2026-09-05 "채널 연결 0개 계정으로 전체 플로우 동작 보고" 재발을 막는 유일한 장치는 **"연결된 채널 수 > 0" 을 E2E 의 선행 assert 로 박는 것**이다. 지금 그 assert 는 어디에도 없다. 교정: `verify-e2e.sh` 첫 단계에 `/api/channel-config` 응답의 `connected=true` 개수를 세고 0이면 즉시 SKIP-AND-REPORT 로 끝내게 한다. |

### 축 ⑥ 성능: 미검토

번들 분석·쿼리 실행계획은 운영 접근과 빌드 산출물이 필요하다. 로컬 서버 기동 금지 제약과 겹쳐 이번 감사 범위에서 뺐다. 정적으로는 N+1 후보를 찾지 못했다(테넌트 조회가 전부 단일 문장 + 복합 인덱스).

### 축 ⑦ 접근성·반응형: 미검토

390 폭 넘침·44px 터치 표적은 실렌더 없이는 판정할 수 없다. `pipeline-state.osmu.md:56` 의 v68 감사 JSON 이 "가로 넘침 0장, 44px 미만 0개" 를 기록하고 있으나 그것은 시안 프레임에 대한 것이고 제품 화면이 아니다. **시안 통과를 제품 통과로 읽지 않는다.**

### 축 ⑧ 디자인 토큰: 문제없음 (실측)

- `npm run audit:ui-tokens` 결과 `total: 0`, spacing·typography·color·radius·elevation·contrast 전부 0 (관찰됨, 로그 `/tmp/osmu-tokens.log`).
- 독립 검증: `src/**` 전체에서 `bg-gray-900` 류 하드코딩 팔레트 0건, 6자리 hex 0건, `style={{` 0건, `dark:` 1건. dashboard/CLAUDE.md 의 시맨틱 토큰 규칙이 실제로 지켜지고 있다.

### 축 ⑨ 죽은 코드·중복·의존성: 지적 2건

| 파일:줄 | 심각도 | 근거 | 교정안 |
|---|---|---|---|
| `dashboard/scripts/verify-four-room-ui-e2e.mjs:5,9,12` | P2 | `import playwright from "/Users/sj/kimstudy-auto/node_modules/playwright-core/index.js"` 절대 개인 경로, 하드코딩 workspaceId `cd1d0a40-...`, 하드코딩 Chrome 실행 경로. 이 스크립트는 회장 노트북 밖 어디서도 돌지 않는다. 루트 `CLAUDE.md` "서비스 특정 코드 금지" 와도 어긋난다. | playwright 를 devDependency 로 올리고 경로·workspaceId 를 env 필수값으로 승격, 미설정 시 명시 실패. |
| `dashboard/scripts/verify-e2e.sh:11` | P3 | 기본 BASE_URL 이 `https://openclaw.example.com` 플레이스홀더다. 인자 없이 돌리면 존재하지 않는 호스트를 친다. | 기본값을 제거하고 인자 미지정 시 사용법 출력 후 종료. |

### 축 ⑩ 문서 대 코드 불일치: 지적 4건

| 파일:줄 | 심각도 | 무엇이 어긋났나 | 교정안 |
|---|---|---|---|
| `origin/main` vs `feat/design-system-and-missing-features` | **P1** | 작업 브랜치가 main 대비 **미머지 비-머지 커밋 256개**를 안고 있고, `2d351268`(uq_channel_accounts_one_default 수정) · `d3492d59`(재발행 차단) · `696491cc`(조용한 실패 제거) · `e3844da6`(발행 완료 기록) 넷 다 `git merge-base --is-ancestor origin/main` 판정 **NO**. 회장이 겪은 연결 실패의 실제 수정이 배포 기준 브랜치에 없다. `deploy-marketing.yml:18` 은 ref 지정 없는 `actions/checkout@v4` 라 dispatch 한 ref 를 그대로 쓴다. 즉 main 에서 배포를 돌리면 수정이 빠진 채 나간다. | 소유 세션이 PR #41 로 머지하거나, 배포 시 ref 를 명시하고 그 사실을 pipeline-state 에 기록한다. 어느 쪽이든 "무엇이 지금 운영에 있는가" 를 한 줄로 확정해야 한다. |
| `dashboard/CLAUDE.md:10` | P2 | "인증: `src/middleware.ts`에서 Bearer 토큰 검증" 이라고 적혀 있으나 그 파일은 `b361d951` 에서 삭제됐고 Next 16 전환으로 `src/proxy.ts` 가 그 역할을 한다. 새 세션이 이 줄만 보고 파일을 찾으면 없다. 실제로 나도 이 문장 때문에 "전역 인증 게이트 부재" 라는 **오판 직전까지 갔다.** 문서 한 줄이 P0 오보를 만들 뻔했다. | `src/proxy.ts`(Next 16 proxy, Node 런타임) 로 고치고 "Edge 아니라 DB·JWT 실검증 가능" 한 줄을 붙인다. |
| `CLAUDE.md:85,103,112-113` | P2 | "레거시 전환 로드맵" 절이 `dashboard/legacy/server.py`(Flask) 를 현재형으로 서술하고 "새 기능 추가 시 server.py 에도 동일 기능 반영(이중 구현)" 을 지시한다. **`dashboard/legacy/` 디렉토리는 존재하지 않는다.** Phase 3 가 이미 끝났는데 문서만 Phase 1 에 있다. 이 지시를 따르는 세션은 없는 파일을 찾다가 시간을 버린다. | 해당 절 전체를 삭제하고 "Flask 병행은 종료됨(Phase 3 완료)" 한 줄로 대체. |
| `wiki/거버넌스/실수.md:90,195` | P2 | 공개 URL 을 `https://openclaw.example.com` 으로 적어 두었다. 플레이스홀더다. §5 참조. | 실제 운영 호스트명을 `외부-콘솔-의존-항목.md` 표에 등록한다(값 아닌 호스트명은 비밀이 아니다). |

## 3. 위키 전수 조사 (107개 md 전수 스캔)

| 항목 | 건수 | 파일:줄 | 심각도 | 교정안 |
|---|---|---|---|---|
| 깨진 상대 링크 | 13 | `wiki/3-operations/decisions/{001,002,003,004,005,_index}.md:9` → `../../거버넌스/결정/<파일>.md` (그 디렉토리 없음, 통합본 `거버넌스/결정.md` 만 존재) / `wiki/4-reference/learnings/{6개}.md:9` → `../../거버넌스/실수-원문/<파일>.md` (동일) | P2 | 이동 안내 페이지의 첫 링크를 통합본(`../../거버넌스/결정.md`, `../../거버넌스/실수.md`)으로 교체한다. 지금은 안내를 따라간 사람이 404 를 만난다. `prompt-guide 미독 사고`(실수.md:44)와 같은 계열의 실패다. |
| frontmatter 없음 | 60 / 107 | `wiki/1-team-brand/brand.md`, `naming.md`, `4-reference/ssot-routing.md`, `env-vars.md`, `2-product/build/vision.md` 외 55개 | P3 | `wiki/0-meta/wiki-spec.md` 는 D-EDU 스펙을 정본으로 상속한다고 선언하는데 frontmatter 를 명시 요구하지 않는다. 스펙에 "모든 페이지는 title·type·updated 를 갖는다" 를 한 줄 넣거나, 요구하지 않기로 결정하고 그 사실을 적는다. 지금은 47개는 있고 60개는 없어 기준이 없는 상태다. |
| 상태 파일 이중 관리 | 2 | `wiki/ops/session-state.md`(789행) vs 레포 루트 `session-state.osmu.md`(752행) | P2 | 루트 `~/.claude/CLAUDE.md` §8 은 "상태는 wiki 에 두지 않는다" 를 명시한다. 위키 쪽을 포인터 한 줄로 축약하고 본문을 루트 파일로 일원화한다. 두 파일이 각자 갱신되는 지금은 어느 쪽이 진실인지 알 수 없다. |
| 도메인 인덱스 중복 | 4 | `wiki/{brand,product,marketing,ops}/_index.md` 가 `wiki/{1-team-brand,2-product,5-hubs/hub-mkt,3-operations}/_index.md` 를 가리키는 껍데기 | P3 | 의도된 별칭이면 `type: pointer` 를 붙여 `3-operations/decisions/_index.md:2` 와 표기를 통일한다. 지금은 `type: domain-index` 라 정본처럼 보인다. |
| 코드와 어긋난 서술 | 4 | §2 축 ⑩ 표와 동일 | P1~P2 | 상동 |

**openclaw-auto 위키**: `/Users/sj/sj_code_master/openclaw-auto/` 는 총 28KB 이며 `.git/info/exclude`, `.claude/scheduled_tasks.lock`, `.codex/logs/`, `dashboard/.next/dev/` 만 있다. **CLAUDE.md·wiki/·data-*/ 어느 것도 없는 껍데기 디렉토리다.** 브리프가 "런타임" 으로 지목한 경로에 감사할 대상이 없다. 실물 정본은 `zto1-marketing-studio`(origin = openclaw-auto.git)다. → 입력 매니페스트 교정 필요(P2, `docs/burst-20260905/INPUTS-MANIFEST.md:22`).

## 4. QA 실측

**결과: 운영 대상 QA 미실행. 사유는 아래이며 이것 자체가 P1 지적이다.**

| 단계 | 결과 |
|---|---|
| 운영 URL 탐색 | `wiki/거버넌스/외부-콘솔-의존-항목.md` 전문, `pipeline-state.osmu.md` 전문, `.github/workflows/*.yml`, `wiki/3-operations/runbooks/*`, `docs/구현현황.md` 전수 grep. **실제 호스트명이 어디에도 없다.** `OSMU_PUBLIC_URL` 은 GitHub Secret 이고, 문서에 적힌 유일한 URL 은 플레이스홀더 `openclaw.example.com` 이다. |
| 채널 연결 여부 선실측 | **불가.** 위와 같은 이유. |
| gstack qa-only / Playwright | **미실행.** 대상 URL 이 없어 실행 자체가 성립하지 않는다. 로컬 서버 기동은 지시로 금지. |
| 캡처 | 없음. |
| 대신 실행한 실측 | `npx tsc --noEmit` EXIT=0(오류 0) · `npm test` EXIT=1(12 failed / 1654 passed) · `npm run audit:ui-tokens` 위반 0 |

**P1 지적**: `외부-콘솔-의존-항목.md` 는 스스로 "코드도 CI 도 이걸 못 본다. 사람이 콘솔에서 눌러야만 되는 것들의 정본이다" 라고 선언한다(14-16행). 그런데 **그 문서를 읽고도 운영 화면에 도달할 수 없다.** 호스트명은 비밀값이 아니다. 표에 `운영 대시보드 URL` 행을 한 줄 추가하는 것으로 닫힌다. 이것이 없어서 이번 감사의 축 ①⑥⑦ 셋이 통째로 미검토가 됐다.

**재발 관점(실수원장 2026-09-05 "채널 연결 0개 QA 계정")**: 지금 구조는 같은 사고를 다시 허용한다. 근거는 축 ⑤ 의 "연결된 채널 수 > 0 선행 assert 부재" 다. 사람이 매번 기억해야 하는 규율은 규율이 아니다.

## 5. 교차 모델 리뷰 결과

| 축 | Claude(본 감사) | Codex(gpt-codex/GPT-5) | 처리 |
|---|---|---|---|
| rls.sql osmu_service 권한 | P1 (방어심층 결손. 임의 SQL 경로가 없어 즉시 악용 불가) | **P0** (토큰 탈취·타 테넌트 사칭·계정 파괴 가능, REVIEW_VERDICT: BLOCK) | **둘 다 기록한다.** 교정 SQL 은 동일. 심각도 차이는 "실현 경로 존재 여부" 판단 차이다. 소유 세션은 보수적으로 Codex 판정(P0)에 맞춰 우선 처리하는 것이 옳다. |
| uq_channel_accounts_one_default 재발 | 없음 | 없음 | 합치 |

**1차 교차 리뷰는 실패했다.** 광범위 과제(파일 10개 + 4개 질문)를 준 첫 실행은 파일만 14,524행 읽고 판정 없이 종료했다(로그 `/tmp/osmu-codex-review.log`). 2차로 파일 2개·질문 2개로 좁혀 재발주해서야 판정이 나왔다(`/tmp/osmu-codex2.log`). **교훈: 교차 리뷰 위임은 질문 2개 이하로 쪼갠다.**

## 6. 소유 세션 배정안

| # | 항목 | 심각도 | 배정 | 근거 |
|---|---|---|---|---|
| 1 | `2d351268` 외 4개 수정을 main 에 머지하거나 배포 ref 를 확정 | P1 | **컨트롤러(회장 승인 필요)** | 배포는 되돌리기 비싼 문. 세션이 임의로 열지 않는다. |
| 2 | `rls.sql` tenant_tokens·tenants REVOKE | P1(Codex P0) | tmux `osmu-build` | 마이그레이션 성격. 적용은 DB 접근이 필요하므로 회장 확인 후. |
| 3 | 운영 URL 을 `외부-콘솔-의존-항목.md` 에 등록 | P1 | 컨트롤러 | 문서 한 줄. 이것이 열려야 다음 감사가 성립한다. |
| 4 | E2E 에 "연결 채널 수 > 0" 선행 assert | P2 | tmux `osmu-build` | 실수원장 재발 방지의 이빨. |
| 5 | DB 테스트 hard fail → skip 전환 | P2 | tmux `osmu-build` | 테스트 신호 복원. |
| 6 | `gateway/restart` 라우트 자체 인증 | P2 | tmux `osmu-build` | 30분. |
| 7 | `dashboard/CLAUDE.md:10` proxy.ts 정정 + `CLAUDE.md` legacy 절 삭제 | P2 | tmux `osmu-build` | 오판 유발 문서. 최우선 문서 수정. |
| 8 | 위키 깨진 링크 13건 | P2 | 위키 담당 세션 | 기계적 치환. |
| 9 | `wiki/ops/session-state.md` 포인터화 | P2 | 위키 담당 세션 | 헌법 §8 정합. |
| 10 | `verify-four-room-ui-e2e.mjs` 개인 경로 제거 | P2 | tmux `osmu-build` | |
| 11 | timingSafeEqual 통일, frontmatter 기준 확정, 도메인 인덱스 pointer 표기 | P3 | 백로그 | |
| 12 | `INPUTS-MANIFEST.md:22` openclaw-auto 경로 정정 | P2 | 컨트롤러 | 다음 감사가 또 빈 디렉토리를 연다. |

## 부록

KNOWLEDGE_QUERY: 레포 `wiki/거버넌스/{결정,실수,요청,외부-콘솔-의존-항목}.md`, `pipeline-state.osmu.md`, `wiki/4-reference/ssot-routing.md`, `docs/burst-20260905/{INPUTS-MANIFEST,BRIEF-2}.md`, `~/.claude/standards/` 인덱스, `dashboard/src/**` 인증 경계 전수 grep, `wiki/**` 107파일 링크·frontmatter 전수 스캔, git 이력(middleware.ts 삭제 경위·브랜치 머지 상태).

HITS_USED:
- `실수.md:20`(2026-09-05 uq_channel_accounts_one_default 사고) → 축 ③ 의 재발 경로 점검 기준으로 채택. 결과 "재발 경로 없음".
- `실수.md:44`(prompt-guide 미독 = 3원 SSOT 사고) → 위키 깨진 링크 13건을 P3 가 아니라 P2 로 올린 근거. 같은 실패 계열이다.
- `결정.md` ADR-004 중앙 credential 절 → `operator/oauth-credentials/route.ts` 구현이 ADR 서술과 일치함을 확인(fail-closed, no-store, 감사 기록).
- `외부-콘솔-의존-항목.md:14-16`(존재 이유 선언) → §4 P1 지적의 직접 근거.
- `~/.claude/CLAUDE.md` §8(상태는 wiki 에 두지 않는다) → 위키 표 3번 항목 근거.

HITS_REJECTED:
- `wiki/거버넌스/요청.md` 1030행: 요청 대조는 `docs/qa/회장-세션발화-전건-대조표-2026-08-31.md` 가 이미 담당한다고 판단해 읽지 않았다. 그 대가로 축 ① 의 요청 충족 판정을 포기했고 그 사실을 §0 에 명시했다.
- BRAIN `wiki/business/` 계열: 이번 과업이 코드 감사라 제품 전략 정본은 채택 대상이 아니라고 판단했다.
- `openclaw/` 런타임 소스: 범위 밖으로 뺐다. 그 사실이 §0 에 있다.

CONFLICTS:
- 브리프가 지목한 `/Users/sj/sj_code_master/openclaw-auto/` 의 CLAUDE.md·wiki·data-*/prompt-guide.txt 는 실재하지 않는다. 실물은 `zto1-marketing-studio` 다. 지시와 실물이 어긋나면 실물이 진실이라는 원칙(`~/.claude/CLAUDE.md` §0)에 따라 실물을 감사했고 지시 쪽을 교정 대상으로 올렸다.
- rls.sql 심각도에서 Claude(P1)와 Codex(P0)가 갈렸다. 은폐하지 않고 §5 에 둘 다 적었다.

PRESENTATION_CHECK: 툴콜 태그 잔재 없음 확인 / 마크다운 구조 육안 확인 / em dash 0건 / 산출물은 경로만 보고하고 열지 않음

SKILLS_USED: 없음
SKILLS_SKIPPED: qa-only(대상 운영 URL 이 어디에도 기록돼 있지 않아 실행 자체가 성립 불가, §4), design-review(실렌더 불가), code-review(내장 스킬 대신 브리프가 지정한 10축 감사 규격을 따랐고, 고위험 축은 codex-delegate.sh code-reviewer 로 교차 실행)

SOURCES/MODEL: Claude Opus 5 (claude-opus-5[1m]) · 교차 gpt-codex(GPT-5)
근거 파일: `dashboard/src/proxy.ts` · `dashboard/src/lib/tenant-auth.ts` · `dashboard/src/lib/channel-accounts.ts` · `dashboard/src/lib/social-connect.ts` · `dashboard/src/lib/studio/generation/identity.ts` · `dashboard/db/rls.sql` · `dashboard/db/schema.sql` · `dashboard/scripts/verify-e2e.sh` · `dashboard/scripts/verify-four-room-ui-e2e.mjs` · `.github/workflows/deploy-marketing.yml` · `CLAUDE.md` · `dashboard/CLAUDE.md` · `DESIGN.md` · `pipeline-state.osmu.md` · `wiki/거버넌스/*.md` · `wiki/**`(107파일)
실행 증거: `/tmp/osmu-tsc.log`(EXIT=0) · `/tmp/osmu-vitest.log`(EXIT=1, 12 failed/1654 passed) · `/tmp/osmu-tokens.log`(위반 0) · `/tmp/osmu-codex-review.log`(1차 교차 리뷰, 판정 없이 종료) · `/tmp/osmu-codex2.log`(2차 교차 리뷰, 판정 확보)
벤치마크: OWASP Secrets Management / REST Security Cheat Sheet(ADR-004 가 이미 채택한 정본을 구현 대조 기준으로 재사용). 이번 감사에서 신규 외부 검색은 하지 않았다 (unsourced 아님, 기존 채택 정본 대조).
