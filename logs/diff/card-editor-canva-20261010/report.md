# 카드 편집기 Canva 기본 조작 R2 실구동

STAMP: 2026-10-10 KST | model: gpt-5/Codex | agent: code-builder | skill: qa | 근거: v71, 실제 Next.js·PostgreSQL·로컬 미디어·내보내기 워커·제품 UI 다운로드 | 고민: 직접 렌더 우회를 없애고 회장이 누르는 내보내기 버튼부터 받은 PNG까지 같은 경로로 묶었다.

- 결과: PASS
- 경로: 실제 Next.js http://localhost:3481, 실제 PostgreSQL, 실제 로컬 미디어 파일, 실제 내보내기 워커. page.route 0건.
- 내보내기: 기능 플래그 미설정 기본 상태에서 제품의 내보내기 버튼이 활성이다. 제품 UI로 접수하고 4장을 렌더한 뒤 1장 PNG 다운로드 버튼으로 받은 파일을 비교했다.
- 글꼴·글 상자: 화면과 내보내기 모두 Pretendard Variable 적재를 확인했다. 글 상자는 줄바꿈·overflow·좌우 안쪽 여백 조건을 통과했고 글자 영역 픽셀 차이는 0.0000%다.
- 맥락 툴바: 높이 52.0px 한 줄, 선택값 실제 글자 폭까지 검사해 잘린 값 0건. 너비·높이·각도는 기본으로 접힌 크기·회전 항목에 있다.
- 캔버스: 1440x900에서 높이 569.5px, 편집 담당 대화창과 겹침 0, 페이지 줄과 작업 버튼이 첫 화면 안에 있다.
- 페이지: 4장 썸네일 모두 실제 장 내용을 렌더하고 2번 썸네일도 비어 있지 않다.
- 실사진: chairman-photo.jpg 1080x1350, cover 배치, 확대 배율 1.00, RGB 평균 표준편차 79.90. 단색 픽스처를 쓰지 않았다.
- PNG: 1080x1350, 화면 전체 차이 0.0034%, 글자 영역 차이 0.0000%, 두 기준 모두 2% 이하.
- 육안 판정: 1440x900 캡처와 내보낸 PNG를 원본 해상도로 직접 열어 확인했다. 글꼴 선택값이 온전히 보이고 첫 글자가 선택 테두리 안에 있으며, 2번 썸네일은 실제 장 내용이고 편집 담당 대화창은 캔버스를 가리지 않는다. 화면과 PNG의 글꼴·줄바꿈·배치가 같다.
- 오류: 브라우저 console/page 오류 0, 실패 요청 0.
- 남은 것: 외부 SNS 실제 게시는 정책에 따라 실행하지 않았다.

벤치마크: Canva 공식 도움말의 편집기 내 PNG 다운로드와 품질 선택 흐름, MDN CSS Font Loading API의 document.fonts.ready 완료 조건을 채택했다. 제품 정본에 없는 유료 옵션과 외부 SDK는 도입하지 않았다.

SKILLS_USED: qa, 실제 사용자 경로 브라우저 검증과 증거 수집에 사용
SKILLS_SKIPPED: review, 푸시·PR 전 단계이며 이번 위임은 R2 구현·실구동 검증 범위라 미호출
SOURCES/MODEL: gpt-5/Codex | docs/design/prototypes/osmu-editroom-v71-hub-claude-opus-20261001-2335.html | https://www.canva.com/help/download-or-purchase/ | https://developer.mozilla.org/en-US/docs/Web/API/Document/fonts
KNOWLEDGE_QUERY: BRAIN OSMU 편집 흐름, v71·회장 결함 보고서, Canva PNG 다운로드, MDN 글꼴 적재 완료 조건을 조회했다.
HITS_USED: v71의 편집실 셸, Canva의 제품 UI 다운로드 흐름, MDN의 document.fonts.ready를 채택했다.
HITS_REJECTED: 유료 Polotno와 react-konva 전환은 기존 공용 화면·내보내기 렌더를 이중화하므로 쓰지 않았다.
CONFLICTS: 없음
