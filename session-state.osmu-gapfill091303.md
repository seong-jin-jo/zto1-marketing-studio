# OSMU TikTok 성과 수집 갭 build 핸드오프

STAMP | line: osmu-gapfill091303 | updated: 2026-09-13 03:46 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder

## 무엇을 어디까지 했나

- 두 갭 감사의 현재 잔여 항목을 소스와 대조해 TikTok provider 성과 수집기를 선택했다.
- TikTok `video/query`를 요청당 20개씩 호출하고 조회, 좋아요, 댓글, 공유 수치를 기존
  `published_posts`의 views, likes, replies, reposts에 저장한다.
- TikTok OAuth 범위에 `video.list`를 추가했다.
- 권한 없음과 영상 확인 불가를 게시물별 `metricsBlocked`에 기록한다.
- 성과 지원 범위, 갭 재확인, QA tracker, 구현현황을 현재 계약으로 갱신했다.
- 구현 커밋은 `7f853720`, 옛 테스트 계약 정정은 `3b8708bf`, 증거 문서는 `d22add01`이다.

## 남은 이슈·블로커

- 지정 작업 공간에 TikTok 연결 자격증명과 발행물이 없어 실제 provider 성공 수치는 미검증이다.
- 기존 TikTok 토큰에는 `video.list`가 없을 수 있으므로 새 범위로 재연결해야 한다.
- 게시물별 성과 snapshot과 재현 가능한 30일 비교는 별도 잔여 갭이다. DB 계약 합의 전에는
  구현하지 않는다.
- pipeline은 `qa` 진행 중이다. QA 승인과 운영 배포는 하지 않았다.
- 사용자 지정 v63 프로토타입과 pipeline v68 디자인 핀 충돌은 기존 상태이며 이번 비화면 변경의
  범위 밖이다.

## 다음에 칠 명령

TikTok 계정을 새 범위로 연결하고 영상 1건을 발행한 뒤 QA 검증자가 아래 흐름을 실행한다.
자격증명 값은 출력하거나 문서에 기록하지 않는다.

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio/dashboard
set -a
source ./.env.local
set +a
node scripts/verify-basic-flow-e2e.mjs
node scripts/verify-studio-v1-e2e.mjs
```

그 다음 인증 헤더로 지정 작업 공간의 `POST /api/metrics`와 `GET /api/metrics`를 호출하고,
외부 영상 ID의 provider 수치와 `published_posts.metrics_at` 및 네 성과 필드를 대조한다.

## 검증했나

- `npm run test`: 307파일, 2,054건 통과, 3건 스킵, 실패 0.
- `npx tsc --noEmit`: 오류 0.
- `npm run build`: 정적 페이지 182/182, 기존 NFT 추적 경고 1건.
- 기본 흐름 E2E: 11/11 통과.
- Studio v1 E2E: 첫 실행 provider JSON 절단 오류, 동일 검증 재실행 14/14 통과.
- design lint: `dashboard/src` 위반 0.
- localhost GET: HTTP 200, `tiktok_video_query`와 네 지표 관찰.
- localhost POST: HTTP 400, 지정 작업 공간의 수집 자격증명 없음 거절 관찰.
- 실제 TikTok provider 성공과 운영 배포: 미검증.
