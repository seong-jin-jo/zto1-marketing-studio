# 편집실 v2 S4 내보내기 UI·최신 판 차단 빌드 증거

STAMP: 2026-10-07 21:24 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: qa, review | 근거: S4 build-plan, v71 prototype, localhost Chromium, Vitest, 교차 리뷰 | 고민: 화면 최신 판과 발행 queue가 같은 export artifact를 가리키는지 잠금 경계까지 추적했다.

기반 포맷: `docs/qa/osmu-editroom-s5b-build-evidence-v1-gpt-codex.md`

## 결론

S4-AC1~6을 구현했다. 카드·영상 편집실의 주 행동은 독립 내보내기 패널을 열고, PostgreSQL 영속 export 계약의 진행률·장별 상태·부분 실패·재시도를 표시한다. 최신 성공 export가 아니면 발행실과 서버 enqueue 양쪽에서 차단하며, 성공하면 export ID와 source hash를 발행 queue에 고정한다. 스키마는 바꾸지 않았다.

## 기존 구현 확인과 보존

- 기존 S3 `exportRepository().latest`, create/status/retry route, PostgreSQL lease·`SKIP LOCKED` 계약을 그대로 사용했다.
- 기존 발행실 이동, 카드 v3 렌더, 카톡 덱, 영상 내보내기 코드를 삭제하지 않았다.
- `StudioRooms.tsx`는 주 행동명과 빈 장 선택 요청 연결만 최소 변경했고, 패널은 새 컴포넌트로 분리했다.

## 수용 기준 증거

| 기준 | 판정 | 직접 관찰·테스트 증거 |
|---|---|---|
| S4-AC1 | ✅ 관찰됨 | Chromium 1440·1024·390에서 `3 / 9장`, 완료 3장, 새로고침 뒤 동일 진행률, 가로 넘침 0 |
| S4-AC2 | ✅ 관찰됨 | 4장 실패 뒤 `slide_deck_s4_browser_3` 한 건만 retry, 최종 `발행실로` 버튼 노출 |
| S4-AC3 | ✅ 관찰됨 | `EXPORT_SOURCE_STALE` 사유와 `최신 내용 다시 내보내기` 행동 노출 |
| S4-AC4 | ✅ 관찰됨 | 빈 6장 안내 뒤 해당 장 선택, 카드 stage 초점 이동 |
| S4-AC5 | ✅ 테스트됨 | 성공 enqueue 응답과 queue sourceContext에 export ID·source hash·artifact URL 고정. draft 잠금 뒤 handoff를 재조회 |
| S4-AC6 | ✅ 테스트됨 | stale·empty·failed·no-success 직접 API 요청을 409로 차단 |

## 실행 조건과 로그

브라우저 검증은 다음 환경에서 실행했다. 카드 v3 운영 스위치를 켜고, 종료 trap이 있는 임시 Next dev server만 사용했다.

```text
CARD_DECK_V3_RENDER_ENABLED=1
NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED=1
PORT=3474
EDITROOM_S4_BASE_URL=http://localhost:3474
STUDIO_V70_BASE_URL=http://localhost:3474
BODY_CONFLICT_BASE_URL=http://localhost:3474
OSMU_PUBLIC_URL=http://localhost:3474
```

| 명령 | 결과 | 로그 |
|---|---|---|
| `npm run typecheck:ci` | PASS | `/tmp/zto1-s4-typecheck-final-3.log` |
| `npx vitest run tests/integrity` | 33 files, 104 tests PASS | `/tmp/zto1-s4-integrity-final-3.log` |
| `npx vitest run contract` | 107 files, 625 tests PASS | `/tmp/zto1-s4-contract-final-3.log` |
| S4 관련·경계 계약 | 49 files, 452 PASS, 1 환경 skip + 최종 hardening 18건·enqueue 16건 PASS | `/tmp/zto1-s4-related-final-pass.log`, `/tmp/zto1-s4-atomic-targeted-3.log`, `/tmp/zto1-s4-enqueue-final.log` |
| `npm run e2e:editroom-s4` | PASS, console 0, failed request 0 | `/tmp/zto1-s4-browser-e2e-final.log` |
| `npm run e2e:studio-v70-screen` | PASS, 1440·1024·390, console 0 | `/tmp/zto1-s4-v70-e2e-final.log` |
| `npm run e2e:body-conflict` | PASS, 두 탭 revision 6→8, console 0 | `/tmp/zto1-s4-body-e2e-final.log` |

S4 브라우저는 실제 Studio 화면에서 draft 저장 8회와 카드 결과 upload 72회를 거쳤다. 패널 해제·화면 전환 때 `AbortController`가 취소한 polling 요청 8건은 별도 계수했으며 실제 실패 요청에는 포함하지 않았다.

## 발견·교정한 결함

1. 최종 job을 `setJob`한 직후 effect cleanup이 같은 controller의 latest 요청까지 취소했다. latest 재조회 생명주기를 분리하고 회귀 테스트를 추가했다.
2. export 썸네일이 배달 주소를 일반 `img`로 그렸다. 공용 `DeliveredMedia`로 바꿔 만료·로드 실패 재서명 계약을 상속했다.
3. v70 회귀 게이트가 카드의 옛 직접 이동을 가정했다. 최신 성공 export fixture를 거쳐 `내보내기 → 발행실로`를 누르도록 정렬했다.
4. queue metadata만 최신 export를 가리키고 실제 media는 과거 handoff를 쓸 수 있었다. 성공 export artifact를 queue media에 직접 결선하고 draft 행 잠금 안에서 최신 handoff를 다시 읽도록 바꿨다.
5. 공개 origin이 없을 때 상대 artifact URL이 queue에 들어갈 수 있었다. 공개 HTTPS를 fail-closed로 검증하고 로컬 검증에서만 localhost HTTP를 허용했다.

## 시안 대조

v71의 내보내기 패널 구성인 `n / 9장` 진행률, 장별 상태, 실패 장 단독 재시도를 모두 반영했다. 수치는 기존 디자인 토큰과 CSS Module만 사용했고 UI token integrity는 직접 시각값 0건으로 통과했다. 1440·1024·390 캡처와 JSON은 `docs/qa/editroom-v2-s4/`에 있다.

전체 저장소를 기준으로 한 광역 `vitest related` 재실행은 이 worktree가 main보다 넓은 선행 변경을 포함해 290개 파일까지 확장됐고, S4와 무관한 `proper-lockfile` 로컬 모듈 결손 3건과 고부하 timeout 1건으로 비정상 종료했다. S4 직접 변경 경계는 위의 관련 452건, 최종 hardening 34건, 전체 contract 625건으로 다시 검증했다. PostgreSQL 실 DB 경합 테스트는 `S3_DATABASE_URL`이 없어 미검증이다.

원격 CI, QA 단계 승인, 운영 배포는 미검증이다. push하지 않았다.

PRESENTATION_CHECK: 내부 태그 잔재 없음 확인 / 실제 Chromium 렌더 확인함

SOURCES/MODEL: gpt-6.1-sol/Codex | `docs/eng/editroom-v2/build-plan.md`, `docs/design/prototypes/osmu-editroom-v71-hub-claude-opus-20261001-2335.html`, `wiki/거버넌스/결정.md`, React effect cleanup 공식 문서, Playwright assertions 공식 문서

SKILLS_USED: qa — 실제 브라우저 결함 탐색·회귀 테스트·재검증, review — API·동시성·성능·유지보수·레드팀 교차 검수와 수정 후 CLEAN 확인
SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: BRAIN business index의 export·retry·progress 관련 항목, React effect cleanup, Playwright assertions·auto-wait
HITS_USED: S4 build-plan·export queue 기술설계·v71 prototype·편집실 v2 ADR은 제품 계약으로, React cleanup·Playwright auto-wait는 브라우저 회귀 검증 방식으로 채택
HITS_REJECTED: 일반 사업·마케팅 BRAIN 결과는 S4 구현 계약과 직접 관련이 없어 미채택
CONFLICTS: 없음
