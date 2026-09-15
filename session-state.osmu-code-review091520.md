# OSMU 최근 24시간 코드 공격 재리뷰 핸드오프

갱신: 2026-09-15 20:50 KST
라인: osmu
작업 목적: code-review091520
handoff basis: 사용자가 지정한 최근 24시간 전체 커밋과 기반 산출물

## 무엇을 어디까지 했나

- 검토 범위를 `0774bf9e89ad1a215bdeddeabbc92e97799e3a02..bd0d349959ffcd771db77b617d39daae55f38f34`로 고정했다. 55개 커밋, 103개 파일, 추가 12,667줄, 삭제 439줄이다.
- 승인 v63 프로토타입, 최신 승인 핀 v68, `DESIGN.md`, 확정 요구 대장, 사업 좌표, 거버넌스 결정과 요청을 실제로 읽었다.
- 판정은 MAJOR 25건, MINOR 1건, `REVIEW_VERDICT: BLOCK`이다.
- 감사 문서는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-15.md`다.
- QA 기록은 `docs/qa/qa-tracker.md` 최신 절이다.
- 제품 코드, migration, 테스트는 수정하지 않았다.
- 감사 문서 커밋은 `cbd53b7e`, QA와 공용 session-state 기록 커밋은 `84206732`다.
- 완료된 `codex-code-reviewer-10959` 백그라운드 등록은 `bg-agents.sh`에서 해제했다.

## 남은 이슈와 블로커

- 접힌 사이드바에서 네 방 이동과 현재 방 강조가 사라진다.
- 고객에게 보이는 생성 조작 세 개가 프록시에서 403으로 끝난다.
- 신규 작업 공간의 첫 queue 파일이 0바이트로 생겨 JSON 파싱이 반복 실패한다.
- Threads와 Instagram 로컬 이미지 발행 경로가 실제 운영 환경에서 막히거나 공개 R2 객체를 회수하지 않는다.
- 공유 Claude CLI 큐가 프로세스 로컬이고 ffmpeg 자막 요청에 테넌트 및 전역 동시 실행 상한이 없다.
- 느린 YouTube 업로드는 화면 timeout 뒤에도 게시될 수 있고 재시도 멱등 예약이 없다.
- self-hosted runner의 전역 Docker prune이 다른 서비스 자산을 삭제할 수 있으며 실패도 성공으로 처리한다.
- API sweep이 잘못된 오류 본문과 오래된 listener를 성공 및 현재 커밋 증거로 기록할 수 있다.
- OpenClaw tsdown 표적 테스트 26건 중 5건이 실패한다.
- pipeline 최신 승인 핀은 v68이지만 이번 과제 기반은 v63이다. 시각 표현 전체 일치 판정은 이 충돌 때문에 하지 않았다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio
sed -n '1,240p' docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-15.md
git show --stat cbd53b7e
git show --stat 84206732
```

다음 소유자는 build 워커다. 감사 문서의 MAJOR를 기능 묶음별로 수정한 새 고정 커밋을 만든 뒤, 같은 범위의 공격 리뷰와 실제 build SHA가 결속된 localhost 검증을 다시 실행한다. 배포는 QA 승인 전 금지한다.

## 검증했나

- `GET http://localhost:3456/api/health`: HTTP 200, `ok=true`, `db=up`.
- 지정 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182` 기본 흐름: 11/11, exit 0.
- Studio v1: 14/14, exit 0. 무료 재생성은 이미 소진된 409 경로를 통과했다.
- `cd dashboard && npm run test`: 361파일, 2,319건 통과, 3건 제외, exit 0.
- `cd dashboard && npx tsc --noEmit`: exit 0.
- OpenClaw tsdown 표적 테스트: 21/26, 5건 실패, exit 1.
- localhost listener는 2026-09-15 05:20:05 KST에 시작했고 검토 끝 커밋은 19:02:48 KST다. health에 build SHA가 없어 끝 커밋 실행 증거는 미검증이다.
- 운영 배포, 외부 SNS 실발행, 외부 계정 성과 수집은 미검증이다.
