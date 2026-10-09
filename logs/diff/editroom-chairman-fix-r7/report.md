# 운영 편집실 R7 교정 보고

STAMP: 2026-10-09 10:00 KST | model: gpt-6.1-sol/Codex | agent: code-builder | skill: qa | 근거: 운영 재측정 `93b72a4b`, OD-2026-10-02-1·OD-2026-10-09-2, v71, production Chromium | 고민: E2E를 운영 구형 JSON 모양으로 바꿔 읽기 호환 계층부터 카드·영상·카톡·발행 화면까지 한 흐름으로 검증했다.

기반 포맷: `logs/diff/editroom-chairman-fix-20261009/report.md`

## 결론

운영 구형 초안의 실제 사진과 만료 영상이 편집실·발행실에 다시 연결된다. 편집실에서 카톡 템플릿을 선택해 말풍선을 직접 수정할 수 있고, 카드 캔버스와 영상 타임라인도 v71 첫 화면 밀도로 복구했다.

## R8 타임라인 시각 회귀 재검증

| 항목 | v71 기준 | 수정 뒤 직접 관찰 |
|---|---|---|
| 짧은 영상 폭 | `가용폭 / 전체초`로 초당 폭 계산 | 3초 fixture는 242px/초, track·영상 레인 사용률 각각 100%. 5.875초·705px 계약은 120px/초. |
| 시간 눈금 | 타임라인 위 한 줄 눈금 | `0:00`~`0:03` 모두 `nowrap`, client·scroll·line 높이 18px. |
| 편집 블록 | 레인 시간 비율에 맞는 폭과 양끝 손잡이 | 자막 블록 3개 각각 242px, 두 손잡이 각각 44px, 겹침 0. 일반 블록 최소 24px, 편집 블록 최소 88px. |
| 5레인 높이 | 첫 화면의 다섯 레인 | 390 타임라인 248px 안에 마지막 레인 bottom 718, 컨테이너 bottom 720. 1440×900은 5레인 전체가 viewport 안에 포함. |
| 카톡 캔버스 | 편집 문구가 실제 카드 면에 표시 | 실제 `[data-card-stage]` 안에서 수정 말풍선을 확인하고 가운데로 스크롤해 캡처. 빈 크림색은 렌더 누락이 아니라 이전 캡처의 스크롤 위치 문제였다. |

비교 캡처는 `after/v71-reference-video-1440x900.png`와 `after/edit-video-1440x900.png`다. 구현 화면은 v71의 가용폭 맞춤과 5레인 구조를 계승하되, 모바일 44px 조작 계약 때문에 편집 블록의 양끝 손잡이를 더 넓게 유지한다.

## 결함별 결과

| 항목 | 원인 | 변경 | 직접 관찰 |
|---|---|---|---|
| A. 운영 실제 이미지 | 작업물 목록은 최상위 구형 필드를 읽었지만 카드 v3 진입은 `img.file` 중심이었고 원격 URL을 asset으로 승격하지 않았다. | 구형·신형 이미지 필드를 정규화하고 파일명이 없으면 업로드 뒤 background asset으로 적용했다. | 운영형 `image_urls` 픽스처의 실사 사진이 400×500 카드 배경에 보인다. |
| B. 발행실 영상 | 발행실 입력이 `vid.file`에 묶여 `vid.url` 만료 주소가 재서명 경로에 들어가지 않았다. | 모든 영상 필드를 정규화한 뒤 기존 OD-2026-10-02-1 갱신 경로에 전달했다. | 재서명 15회, readyState 4, 540×960 프레임, 발행실 이미지·영상 두 미디어를 확인했다. |
| C. 카톡 템플릿 | plain 카드에서 의미 구조 변환을 제공하지 않고 생성실 안내와 함께 비활성화했다. | 기존 validator를 통과하는 7장 카톡 v2/v3 덱으로 변환하고 자동저장·말풍선 편집을 연결했다. | 편집실에서 카톡 선택 뒤 첫 말풍선을 수정하고 변경 문구를 캡처했다. |
| D. 화면 밀도 | 카드 면이 302×377이고 도구가 우측 열을 차지했으며 영상 플레이어·대본 높이가 5레인을 아래로 밀었다. | 카드 면을 400×500으로 넓혀 중앙 배치하고 글 도구를 위로 옮겼다. 영상 조작부를 플레이어에 겹치고 대본 높이를 줄였다. | 1440 첫 화면에 카드 전체·글 도구, 영상 플레이어·대본·5개 레인이 보인다. |

## 보존 계약

- 카드 자동저장의 반대 도메인 `videoEdit:null`, 영상 자동저장의 `cardDeck:null`을 유지했다.
- 빈 말풍선, 댓글 유도 장 1개, chat 본문 최소 4장 검증을 유지했다.
- embedded text provenance, 카드 이동·크기·회전·undo, 컷 건너뛰기, 발행 플랫폼 세로 스택을 유지했다.
- DB 스키마와 외부 SNS 발행 동작은 변경하지 않았다.

## 실행 증거

| 게이트 | 결과 |
|---|---|
| TypeScript | `tsconfig.ci.json` PASS |
| production build | 카드 v3 기능 플래그 ON, PASS |
| 전체 Vitest | 520파일 중 517 PASS·3 skip, 3,796건 중 3,780 PASS·16 skip, 396.26초 |
| DB 준비 | PostgreSQL 16, schema→seed→RLS, generation migration concurrency matrix PASS |
| v70 화면 정합 | PASS, 일반 카드 clean-frame 비교와 오염 검출 유지 |
| 회장 결함 통합 E2E | PASS, 저장 6회, 콘솔 오류 0, 영상 컷 1초 건너뛰기 |
| 모바일 실측 | 360·390·412·600·700·780·820·900·1000 모두 본문 16px, 13px 미만 0, 44px 미만 0, 눌림 100%, 가로 넘침 0 |
| design-lint | 종료 코드 0, 기존 인라인 style·hex 경고 2종 |
| artifact lint | 정합 PASS, 기존 핀 위생 경고 28건 |

## 캡처

- 카드: `after/edit-card-1440x900.png`, `after/edit-card-1512x982.png`, `after/edit-card-390x844.png`
- 카톡 편집: `after/edit-card-chat-1440x900.png`
- 영상: `after/edit-video-1440x900.png`, `after/edit-video-1512x982.png`, `after/edit-video-390x844.png`
- v71 영상 기준: `after/v71-reference-video-1440x900.png`
- 발행실: `after/publish-1440x900.png`, `after/publish-1512x982.png`, `after/publish-390x844.png`, `after/publish-platforms-1440x900.png`
- 브라우저 수치: `after/result.json`

## 미검증

제품 `2f580a15`, 화면 밀도 `3b0a4960`, 전체 CI·문서·캡처 `12e45ddf`까지 로컬 커밋했다. `git push -u origin fix/editroom-r7-20261009`는 실행 정책이 승인 필요 작업으로 차단했고 이 세션은 승인 요청이 금지돼 실행 전에 거부됐다. 따라서 원격 CI와 운영 재배포는 미검증이다. 실제 외부 SNS 발행도 범위 밖이라 누르지 않았다.

SOURCES/MODEL: gpt-6.1-sol/Codex | `logs/diff/chairman-defects-20261009-recheck/report.md`@`93b72a4b` | `docs/design/prototypes/osmu-editroom-v71-hub-claude-opus-20261001-2335.html` | `.github/workflows/ci.yml` | `after/result.json`
PRESENTATION_CHECK: 태그 잔재 없음 확인 / PNG 원본 육안 확인함
