# OSMU 최근 24시간 코드 공격 리뷰 핸드오프

## 무엇을 어디까지 했나

- 회장 요청 원문을 기준으로 최근 24시간의 70개 커밋을 검토했다.
- 정확한 고정 범위는 `39d32c58510565df52f330d01c0ac0d96cb0256d..fe24d05180b99b1c39e30e915b8557bd8e03d0fe`다. 189개 파일, 추가 11,113줄, 삭제 2,042줄이다.
- v63 프로토타입, `DESIGN.md`, pipeline 승인 핀, 회장 확정 요구 대장, OSMU 사업 좌표, 최근 diff를 대조했다.
- 제품 코드는 수정하지 않았다. 판정은 MAJOR 20건, MINOR 0건, `REVIEW_VERDICT: BLOCK`이다.
- 상세 보고서는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md`다.
- QA 원장과 공용 핸드오프를 갱신한 문서 커밋은 `55b48381`이다.
- 회수 완료된 `codex-code-reviewer-94774` 위임 등록을 `bg-agents.sh`에서 해제했다. 현재 실행 중 위임은 0개다.

## 남은 이슈·블로커

- 고객 허용 목록에 전역 유료 에이전트 경로가 열려 있고, 전역 이미지 폴더의 최신 파일을 고객 결과로 반환한다.
- 고객 토큰으로 `/api/higgsfield/status`를 호출하면 전역 이메일, 요금제, 크레딧, 원문 정보가 HTTP 200으로 노출된다.
- Instagram 캐러셀 로컬 이미지가 같은 R2 키를 사용해 마지막 장으로 덮어써진다.
- 예약 발행의 임차 만료, 공급자 성공 뒤 DB 기록 실패, 응답 단절이 중복 게시로 이어질 수 있다.
- 운영자 전체 스윕은 만료된 `processing` 예약의 테넌트를 찾지 않아 복구 경로가 실제 크론에서 열리지 않는다.
- 큐의 `publishing` 상태는 프로세스가 죽으면 영구 고착될 수 있고 stale 잠금 회수에는 TOCTOU 경쟁 조건이 있다.
- Threads 로컬 이미지는 공개 제3자 파일 호스트로 반출된다.
- 자막 탐침 실패가 6초 기본값으로 성공 처리되고, ffmpeg 동시 실행 한도가 없으며 작업 실패를 HTTP 200으로 반환한다.
- 시험 시드는 비시험 DB 차단 없이 고정 작업 공간 사용량을 0으로 초기화할 수 있다.
- 성과 수집은 선택 계정 대신 기본 계정을 사용하며, 영구 실패에도 재시도 백오프가 없다.
- v63과 `DESIGN.md`가 폐기한 편집 목차 위·아래 단추가 다시 들어갔다.
- 사용자 지정 v63, pipeline 최신 승인 핀 v68, `DESIGN.md`의 전체 제품 정본 v64가 충돌한다.
- 운영 배포와 실제 외부 채널 발행은 미검증이다. pipeline 상태는 바꾸지 않았다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio
sed -n '1,220p' docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md
git show --stat 55b48381
cd dashboard
npm run test
npx tsc --noEmit
set -a; source .env.local; set +a; node scripts/verify-basic-flow-e2e.mjs
set -a; source .env.local; set +a; node scripts/verify-studio-v1-e2e.mjs
```

수정 우선순위는 고객 허용 목록과 전역 핸들러 차단, 발행 멱등과 복구 상태 영속화, 자막과 성과 수집의 자원 및 재시도 제한, 승인 디자인 핀 단일화 순서다. 각 감사 재현을 새 회귀 테스트로 고정한 뒤 전체 검증을 다시 돌린다.

## 검증했나

- `npm run test`: 종료 코드 0. 342파일과 2,217건 통과, 3건 제외.
- `npx tsc --noEmit`: 종료 코드 0.
- localhost health: HTTP 200, DB up.
- 지정 작업 공간 기본 흐름: 11/11 통과.
- 지정 작업 공간 Studio v1: 14/14 통과.
- 임시 고객 토큰의 `/api/higgsfield/status`: HTTP 200, `email`, `plan`, `credits`, `raw` 키 노출 관찰. 값은 출력하지 않았고 토큰은 즉시 폐기.
- 커밋 범위 내 삭제 파일: 0개. `git diff --check`: 통과.
- 현재 공유 작업 트리에 다른 세션의 미커밋 변경이 많다. 이를 되돌리거나 커밋하지 않았다.
- 코드 변경, 실제 외부 발행, 운영 배포는 하지 않았다.
