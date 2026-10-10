# 영상 편집기 CapCut·Vrew 기본 조작 실제 경로 검증

STAMP: 2026-10-10 22:46 KST | gpt-5-codex | code-builder | qa | CapCut·Vrew 공식 기능 문서와 v71 승인 시안

## 판정

PASS. page.route 없이 실제 Next dev 3482, 실제 PostgreSQL 초안·자동저장, 실제 export worker, 실제 영상 파일을 사용했다.

## 결과

- 1440x900 첫 화면: 미리보기와 타임라인 동시 표시, 편집 담당 대화창 겹침 0px².
- 편집 조작: S 자르기, Delete 선택 삭제, 양끝 트림, 순서 변경, 재생헤드 이동, 125% 확대, 실행취소·다시실행을 Playwright로 조작했다.
- 편집 미리보기: 첫 클립 끝에서 다음 재배치 클립의 원본 0.000초로 실제 재생이 건너뛰었다.
- 모바일: 360·390·412·600·700·780·820·900·1000px에서 13px 미만 글자 0, 본문 토큰 16px 이상, 44px 미만 누름 0, 눌림 상태 90% 이상, 가로 넘침 0을 데이터 포함 편집 화면에서 확인했다.
- 자막: 문장 이동·수정·구간 삭제, 화면 직접 드래그, 명조·120%·#ffd600을 실제 저장했다.
- MP4: 예상 1.200초, ffprobe 1.200초, 차이 0.000초.
- 삭제 프레임: 기대 구간 MAD 0.402/0.579, 삭제 구간 MAD 23.250/21.091.
- 자막: 노랑 267픽셀, 해당 프레임 활성 자막 레이어 1개. crop은 captures/04-export-subtitle-crop.png.
- 브라우저 애플리케이션 오류: 0건. 미연결 선택 제공자(목소리) HTTP 경고: 4건. 외부 SNS 게시: 0건.

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
