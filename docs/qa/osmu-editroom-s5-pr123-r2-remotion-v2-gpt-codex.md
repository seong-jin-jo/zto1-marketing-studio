# PR 123 S5 교차 리뷰 2차 Remotion 실렌더 증거

STAMP: 2026-10-06 22:32 KST | model=gpt-codex | agent=code-builder | skill=없음 | 근거=`/Users/sj/wt/s5-review-r2.md`, `dashboard/scripts/verify-chat-s5-e2e.mjs` | 고민=운영 렌더 스위치는 유지하되 카톡 편집 진입은 기존 고급 도구로 되돌리고, PNG 넘침은 폰트 로드 뒤 실측했다.

기반 포맷: `docs/qa/osmu-editroom-s5-pr123-r1-remotion-v1-gpt-codex.md`

## 실행 결과

- 명령: `CARD_DECK_V3_RENDER_ENABLED=1 NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED=1 CHAT_S5_OUTPUT_DIR=/tmp/s5-review-r2-remotion-20261006-2230 ~/.claude/harness/bin/heavy-slot.sh npm run e2e:chat-s5`와 같은 환경으로, 포트 3475 개발 서버를 제한시간 안에서 함께 기동했다.
- 결과: PASS. 9장, 저장 4회, 브라우저 console error 0, failed request 0.
- 고급 편집 보존: 운영 렌더 스위치가 켜진 상태에서도 카톡 덱 자유 배치 진입 0건, 기존 고급 편집 도구 노출 확인.
- 덧붙임 보존: 저장된 v3 로고 요소 deep equality 유지.
- 반응형 가로 넘침: 1440px 0, 1024px 0, 390px 0.
- 넘침 거절: 실제 Remotion 렌더가 `CARD_CHAT_OVERFLOW: 2번 장 말풍선이 카드보다 깁니다. 쪼개세요.`로 실패했다. 실패 파일은 생성되지 않았다.

## PNG 직접 확인

| 구분 | 실제 경로 | 크기 | SHA-256 | 직접 확인 |
|---|---|---:|---|---|
| 표지 사진 | `/tmp/s5-review-r2-remotion-20261006-2230/s5-chat-cover-photo.png` | 1080×1350 | `74c2b6aade9b35e5b3bae1a4e187356756afed9938421cf4103ed1fe53d915a0` | 사진 위 흰 제목·부제·브랜드·장 번호가 식별되고 잘리지 않음 |
| 독자 말풍선 본문 | `/tmp/s5-review-r2-remotion-20261006-2230/s5-chat-reader-remotion.png` | 1080×1350 | `8cbe42c45fee35889a344dc35d01e472cf649e6562f4d4ceae25549d1d3dc9be` | 노란 독자 말풍선은 우측에 있고 독자 이름은 없음. 작성자 이름·프로필은 첫 작성자 말풍선에만 있으며 장 번호는 하단에 한 번만 표시됨 |
| CTA 사진 | `/tmp/s5-review-r2-remotion-20261006-2230/s5-chat-final-photo.png` | 1080×1350 | `d4ff48a76c095230081504d1c6bf4d4aa1ad9132c874903ac66543dad4e51a4e` | 사진 배경에서 CTA 말풍선·시각·작성자·장 번호가 대비를 유지하고 잘리지 않음 |

`/tmp` 경로는 이 실행의 원본 증거 위치다. 구조화 결과는 같은 디렉터리의 `s5-chat-result.json`, 개발 서버 기동 로그는 `/tmp/s5-r2-dev.log`, E2E 로그는 `/tmp/s5-r2-e2e.log`에 있다.

PRESENTATION_CHECK: 내부 태그 잔재 없음 확인 / PNG 3종 직접 렌더 확인함
SKILLS_USED: 없음
SKILLS_SKIPPED: 없음(매칭 구현 스킬 없음)
SOURCES/MODEL: gpt-codex(runtime exact ID unavailable) | `/Users/sj/wt/s5-review-r2.md`, `dashboard/scripts/verify-chat-s5-e2e.mjs`, 실제 Remotion PNG 3종
