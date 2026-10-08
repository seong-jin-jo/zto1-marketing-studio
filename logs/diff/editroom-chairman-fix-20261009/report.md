# 생성·편집·발행 미디어 경로 결함 교정 보고

STAMP: 2026-10-09 03:49 KST | model: gpt-5/Codex | agent: code-builder | skill: qa | 근거: v71 프로토타입, 회장 결함 재현 보고, 실제 Next.js Chromium E2E, Vitest 604건, production build | 고민: 화면 존재 여부가 아니라 같은 초안의 실제 미디어가 생성실부터 발행실까지 끊기지 않는지를 단일 사용자 경로로 검증했다.

## 결론

재현 6건과 부분 재현 5건을 제품 코드, 계약 테스트, 실제 브라우저 E2E로 닫았다. 외부 SNS 발행은 실행하지 않았고, 데이터 스키마도 바꾸지 않았다.

## 근본원인과 교정

| 결함 | 근본원인 | 교정 | 종료 증거 |
|---|---|---|---|
| 생성 뒤 작업물 목록과 편집실에 미디어가 없음 | 비동기 이미지·영상 성공이 화면 상태만 바꾸고 초안을 저장하지 않았다. | 생성 성공 즉시 같은 초안에 이미지와 영상을 저장하고 SWR 목록을 갱신했다. | 작업물 썸네일, 생성 결과 첫 화면, draft POST 4회 |
| 작업물 카드를 눌러도 생성실에 남음 | 상태 저장소만 바꾸고 URL `room=create`를 유지해 URL 동기화가 방을 되돌렸다. | 기존 `changeRoom` 공용 경로로 URL과 상태를 함께 변경했다. | 작업물 카드 클릭 뒤 편집실 실제 진입 |
| 카드 편집에 상·중·하와 별도 자유배치 단계가 있음 | 레거시 위치 프리셋과 v3 진입 버튼이 동시에 남았다. | 프리셋·글자 위치 버튼·별도 모드 버튼을 제거하고 기본 카드 화면에서 직접 드래그를 시작한다. | 좌표 `(749, 540) → (663, 693)`, 캔버스 픽셀 변화 |
| 편집실 카드에 실제 생성 이미지가 없음 | plain v3 덱 변환이 본문만 옮기고 생성 이미지 자산을 버렸다. | 생성 이미지 파일을 모든 카드의 실제 배경 자산으로 연결하고 대비용 흰 글자를 적용했다. | 캔버스 이미지 `naturalWidth > 0`, 실제 픽셀 캡처 |
| 편집실이 첫 화면 아래로 밀리고 챗봇 열을 침범함 | 숨김 도구 자리와 템플릿 갤러리가 캔버스 위 높이를 점유하고 캔버스 폭이 과했다. | 빈 도구 자리를 레이아웃에서 제거하고 갤러리를 캔버스 아래로 이동, 편집 무대를 25rem 상한으로 제한했다. | 1440×900, 1512×982 첫 화면 캔버스, 390 가로 넘침 0 |
| 템플릿·구조 미리보기가 자리표시자임 | 갤러리에 실제 생성 미디어를 전달하지 않았다. | 생성·편집 갤러리에 현재 이미지 URL을 전달했다. | 실제 이미지 미리보기 캡처 |
| 컷 뒤 재생이 삭제 구간을 통과함 | 컷 상태는 저장됐지만 플레이어 `timeupdate`가 잘린 구간을 건너뛰지 않았다. | 현재 시간이 컷 구간에 들어가면 다음 재생 가능 시점으로 이동한다. | `0.1초 → 0.666666초` 점프 |
| 생성 영상에 자막이 이중으로 보임 | 이미지→영상 프롬프트에 본문 문구를 다시 넣어 제공자가 유사 글자를 영상 픽셀에 만들고, 앱 자막이 그 위에 추가됐다. 두 번 굽는 ffmpeg 경로는 없었다. | 영상 프롬프트를 움직임·카메라·분위기만 전달하도록 분리하고 본문 문구를 금지했다. | 프롬프트 계약 22건, 구운 자막 계보 회귀 포함 `test:publish` 통과 |
| 발행실 미리보기에 미디어가 없고 플랫폼 카드가 가로 나열됨 | 초안 미디어 저장 누락과 그리드 레이아웃이 겹쳤다. | 같은 초안의 이미지·영상을 플랫폼 미리보기에 전달하고 카드를 한 열로 쌓았다. | 첫 3개 카드 x좌표 동일, y좌표 `952 < 1759 < 2566` |
| 사이드바 로그아웃·계정 설정 겹침 | 좁은 하단 영역에서 독립 배치가 충돌했다. | 하단을 단일 그리드 흐름으로 정렬했다. | 390 캡처에서 겹침 없음 |

## 수용 기준 E2E

`dashboard/scripts/verify-chairman-defects-20261009-e2e.mjs` 하나가 아래 경로를 연속 실행했다.

1. 이미지 생성 완료 후 생성 결과가 첫 화면에 보이고 작업물 목록에 실제 썸네일이 표시된다.
2. 그 작업물 카드를 눌러 같은 초안을 편집실에서 열고 카드 배경 이미지와 영상 파일을 확인한다.
3. 카드 글자를 실제 포인터로 끌어 좌표와 픽셀 변화를 확인하고, 영상 컷 구간 재생을 건너뛴다.
4. 발행실 각 플랫폼 미리보기에 실제 미디어가 있고 카드가 세로로 쌓였음을 확인한다. 발행 버튼은 누르지 않는다.

결과: `ok=true`, 콘솔 오류 0, 초안 저장 4회. 상세 수치는 [`after/result.json`](after/result.json)에 있다.

## 화면 증거

| 화면 | 이전 | 교정 후 |
|---|---|---|
| 생성실 1440 | [`before/create-1440x900.png`](before/create-1440x900.png) | [`after/create-1440x900.png`](after/create-1440x900.png) |
| 카드 편집 1440 | [`before/edit-card-1440x900.png`](before/edit-card-1440x900.png) | [`after/edit-card-1440x900.png`](after/edit-card-1440x900.png) |
| 카드 편집 1512 | [`before/edit-card-1512x982.png`](before/edit-card-1512x982.png) | [`after/edit-card-1512x982.png`](after/edit-card-1512x982.png) |
| 카드 편집 390 | [`before/edit-card-390x844.png`](before/edit-card-390x844.png) | [`after/edit-card-390x844.png`](after/edit-card-390x844.png) |
| 영상 편집 1440 | [`before/edit-video-1440x900.png`](before/edit-video-1440x900.png) | [`after/edit-video-1440x900.png`](after/edit-video-1440x900.png) |
| 발행실 1440 | [`before/publish-1440x900.png`](before/publish-1440x900.png) | [`after/publish-1440x900.png`](after/publish-1440x900.png) |

## 검증

| 공정 | 결과 | 증거 |
|---|---|---|
| TypeScript | PASS | `tsc --noEmit -p tsconfig.ci.json`, 종료 코드 0 |
| 편집 회귀 | PASS | 3파일 86건 |
| 발행 회귀 | PASS | 59파일 604건, 환경 의존 3건 skip |
| production build | PASS | Next.js build 종료 코드 0 |
| 실제 dev 서버 | PASS | `http://localhost:3471`, HTTP 200, Next.js Ready |
| Chromium E2E | PASS | 생성→작업물→편집→컷→발행 직전, 콘솔 오류 0 |
| 모바일 사용성 | PASS | 360·390·412·600·700·780·820·900·1000 모두 13px 미만 0, 본문 16px, 44px 미만 0, 눌림 100%, 가로 넘침 0 |
| design lint | PASS | 변경 프론트 소스, 종료 코드 0 |
| pipeline artifact lint | PASS WITH WARNINGS | 실체·슬롯키·버전 정합 통과, 기존 핀 위생 경고 28건 |

원본 로그는 [`evidence/`](evidence/)에 보존했다. 모바일은 데이터가 있는 편집실 DOM과 실제 CSS를 고정한 [`mobile-edit-data-fixture.html`](after/mobile-edit-data-fixture.html)에서 측정했다.

첫 최종 TypeScript 재검사는 dev 종료 시 절단된 `.next/dev/types` 생성 캐시 때문에 실패했다. 캐시를 `/tmp/zto1-chairman-next-dev-types-corrupt-20261009-0355`로 보존 이동한 뒤 동일 명령과 production build를 다시 실행해 통과했다. 제품 소스 오류로 숨기지 않았다.

## 벤치마크 적용

- Canva의 레이어 직접 선택과 이동 패턴을 차용해 별도 자유배치 모드 없이 캔버스에서 바로 움직이게 했다.
- Adobe Express와 CapCut의 트림 모델을 참고해 컷 구간을 재생 헤드가 실제로 건너뛰게 했다.
- 제품 고유 차이는 생성실, 편집실, 발행실이 같은 초안 미디어 키를 공유한다는 점이다.

## 셀프심문과 레드팀

가장 취약한 가정은 “초안 저장 POST가 성공하면 실제 사용자 경로도 이어진다”였다. 실제 작업물 카드를 클릭했을 때 URL 동기화가 생성실로 되돌리는 결함이 추가로 드러나 공용 방 전환 함수로 고쳤다.

까다로운 고객 관점의 공격은 “캔버스가 보이기만 하고 실제 이미지는 또 없는 것 아닌가”였다. E2E를 요소 존재 검사로 끝내지 않고 이미지의 실제 디코딩 폭, 드래그 전후 픽셀, 영상 현재 시간, 플랫폼 카드 좌표를 측정하도록 강화했다.

미검증: 외부 SNS 실제 게시와 운영 배포는 범위 밖이며 실행하지 않았다. Higgsfield 운영 생성 성공은 이전 재현 보고의 실제 운영 증거를 사용했고, 이번 회귀 E2E는 외부 제공자 응답만 고정한 뒤 실제 미디어 파일을 브라우저에서 디코딩했다.

SKILLS_USED: qa, 결함 재현부터 단일 사용자 경로 E2E와 증거 캡처에 사용
SKILLS_SKIPPED: review, 별도 PR 리뷰는 PR 생성 후 원격 검토 단계이며 이번 구현·자체검증에는 qa를 우선 적용
SOURCES/MODEL: gpt-5/Codex | `logs/diff/chairman-defects-20261009/report.md` | `docs/design/prototypes/osmu-editroom-v71-hub-claude-opus-20261001-2335.html` | `docs/design/design-spec-editroom-v70.md` | https://www.canva.com/help/layers/ | https://helpx.adobe.com/express/web/create-and-edit-videos/edit-videos/trim-videos.html | https://www.capcut.com/resource/how-to-trim-video
PRESENTATION_CHECK: 내부 태그 잔재 없음, 전후 캡처와 Markdown 구조 확인함
KNOWLEDGE_QUERY: BRAIN의 ZERO-ONE Marketing Studio PMF·편집기 모델, Canva 레이어 이동, Adobe Express·CapCut 영상 트림을 조회했다.
HITS_USED: `wiki/business/pmf/idea-zero-one-marketing-studio.md`의 한 초안 다중 채널 원칙, v71의 3열 편집 구조, Canva 직접 조작, Adobe·CapCut 트림 동작을 채택했다.
HITS_REJECTED: 일반 마케팅 심리·가격·PMF 문서는 이번 미디어 편집 결함과 직접 관련이 없어 반영하지 않았다.
CONFLICTS: pipeline-state의 v68 핀과 회장이 지정한 v71이 충돌해 회장 최신 지시와 실제 v71 프로토타입을 우선했다.
