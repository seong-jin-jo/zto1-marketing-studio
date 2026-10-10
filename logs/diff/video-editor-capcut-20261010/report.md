# 영상 편집기 CapCut·Vrew 기본 조작 실제 경로 검증

STAMP: 2026-10-11 01:34 KST | gpt-5-codex | code-builder | qa | CapCut·Vrew 공식 기능 문서와 v71 승인 시안

## 판정

PASS. page.route 없이 실제 Next dev 3482, 실제 PostgreSQL 초안·자동저장, 실제 export worker, 실제 영상 파일을 사용했다.

## 결과

- 1440x900 첫 화면: 미리보기 384px, 자막 문장 목록과 전체폭 타임라인 동시 표시, 편집 담당 대화창 겹침 0px².
- 타임라인: 기본 100%에서 전체 12.120초가 가용 폭 788px에 맞는다. 편집 후 세 클립은 194.7·224.6·233.6px, 겹침 0개이며 각 클립 이름과 실제 영상 프레임 3장이 보인다.
- 편집 조작: S 자르기 3회, Delete 선택 삭제 1회, 양끝 트림, 순서 변경, 재생헤드 이동, 125% 확대, 실행취소·다시실행을 Playwright로 조작했다.
- 편집 미리보기: 첫 클립 끝에서 다음 재배치 클립의 원본 0.033초로 실제 재생이 건너뛰었다.
- 모바일: 360·390·412·600·700·780·820·900·1000px에서 13px 미만 글자 0, 본문 토큰 16px 이상, 44px 미만 누름 0, 눌림 상태 90% 이상, 가로 넘침 0을 데이터 포함 편집 화면에서 확인했다.
- 자막: 문장 이동·수정·구간 삭제, 화면 직접 드래그(50.0%, 70.0%), 명조·120%·#ffd600을 실제 저장했다.
- MP4: 예상 8.720초, ffprobe 8.720초, 차이 0.000초.
- 삭제 프레임: 기대 구간 MAD 0.634/0.826, 삭제 구간 MAD 77.305/68.427.
- 자막: 노랑 274픽셀, 해당 프레임 활성 자막 레이어 1개. crop은 captures/04-export-subtitle-crop.png.
- 브라우저 애플리케이션 오류: 0건. 미연결 선택 제공자(목소리) HTTP 경고: 4건. 외부 SNS 게시: 0건.

## 캡처 육안 판정

- `01-first-screen-1440x900.png`: 원본 크기로 직접 열어 미리보기 높이 384px, 오른쪽 자막 3문장, 아래 5레인 타임라인이 같은 1440×900 화면 안에 있고 편집 담당 대화창이 작업대를 가리지 않는 것을 확인했다.
- `02-edited-timeline-and-subtitle.png`: 원본 크기로 직접 열어 `클립 1·2·3` 이름, 서로 다른 실제 프레임 띠, 블록 비겹침, 삭제 문장의 빨간 컷 표시, 미리보기의 노랑 자막 한 줄을 확인했다. 종전 약 140px 미리보기와 라벨이 사라진 캡처는 이 증거로 폐기한다.
- `03-export-full-frame.png`와 `04-export-subtitle-crop.png`: 실제 인물·화면 프레임 위에 수정한 노랑 자막이 한 번만 합성됐고, 두 번째 자막이나 단색 대체 프레임은 없었다.

## 실제 원본 구성

- Higgsfield 실생성 4.166초, `alignment-sample.mp4` 2초, `chairman-photo-motion.mp4` 3초 두 구간을 540×960·25fps로 이어 `video-editor-real-composite-12s.mp4` 12.120초를 만들었다. 모든 구간은 실제 영상이며 단색 생성 구간은 없다.

## 개발 게이트

- TypeScript PASS, production Webpack build PASS.
- CI 동일 `schema → seed → RLS` 환경의 전체 Vitest 518파일·3,792건 PASS, 3파일·16건 skip.
- UI 토큰 직접값 0건, 공용 터치 버튼 감사 PASS, 배달 미디어 재서명 계약 PASS.

## 증거

- captures/01-first-screen-1440x900.png
- captures/02-edited-timeline-and-subtitle.png
- captures/03-export-full-frame.png
- captures/04-export-subtitle-crop.png
- exported-video-editor.mp4
- next-dev.log, export-worker.log, observations.json

## 벤치마크 적용

CapCut의 분할·트림·클립 재정렬·타임라인 확대 조작을 차용했고, Vrew의 문장 클릭 이동·수정·삭제 기반 컷 편집을 차용했다. 이 제품은 두 방식을 한 화면의 단일 편집 계약으로 묶고, 외부 SNS 게시를 실행하지 않는 점이 다르다.

## 셀프 검증

- 이 결론이 틀렸다면 가장 그럴듯한 이유: UI 조작은 저장됐지만 worker가 다른 편집 계약을 읽었을 수 있다. 저장 JSON, ffprobe 길이, 삭제 프레임 MAD, 자막 픽셀을 함께 대조해 반박했다.
- 레드팀: 픽스처 API나 단색 영상이면 실제 고객 경로를 증명하지 못한다. page.route를 쓰지 않고 실제 PostgreSQL·실영상·worker·다운로드 경로를 사용했다.

SKILLS_USED: qa, 실제 사용자 조작과 렌더 결과 검증 절차에 사용
SKILLS_SKIPPED: 없음
KNOWLEDGE_QUERY: OSMU 편집실 제품 정본, CapCut 타임라인 편집, Vrew 문장 기반 영상 편집
HITS_USED: v71 승인 시안은 화면 구조, CapCut 공식 문서는 클립 조작, Vrew 공식 문서는 문장 기반 자막 편집 근거로 채택
HITS_REJECTED: BRAIN 일반 마케팅 자료는 이번 구현의 조작·렌더 계약과 직접 관련이 없어 미채택
CONFLICTS: 없음
PRESENTATION_CHECK: 내부 태그 잔재 없음, 캡처 4장과 MP4 프레임 렌더 확인함
SOURCES/MODEL: gpt-5-codex | docs/design/prototypes/osmu-editroom-v71-hub-claude-opus-20261001-2335.html | https://www.capcut.com/resource/how-to-use-capcut | https://www.capcut.com/resource/free-video-edit | https://vrew.ai/en/feature/text-based-video-editing/ | https://vrew.ai/en/feature/ai-video-subtitle/
