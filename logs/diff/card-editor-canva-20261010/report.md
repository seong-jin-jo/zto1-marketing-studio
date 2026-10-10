# 카드 편집기 Canva 기본 조작 실구동

STAMP: 2026-10-10 21:46 KST | model: gpt-5/Codex | agent: code-builder | skill: qa | 근거: v71, 실제 Next.js·PostgreSQL·로컬 미디어 Playwright, 공식 Konva 변환·내보내기 문서 | 고민: 렌더러를 갈아엎지 않고 기존 화면·PNG 공용 장면을 확장해 회귀 범위와 픽셀 차이를 함께 줄였다.

- 결과: PASS
- 경로: 실제 Next.js http://localhost:3481, 실제 PostgreSQL, 실제 로컬 미디어 파일. page.route 0건.
- 조작: 선택 8핸들, 이동, Shift 비율 고정, 회전, 캔버스 위 글 수정, 글 도구, 생성 미디어, 업로드, 도형, 복제, 삭제, 레이어 양방향, 실행 취소/다시 실행, 중앙·가장자리 스냅, 페이지 추가/복제/이동/삭제를 마우스와 키보드로 실행했다.
- 배치: 1440x900에서 하단 페이지 줄이 첫 화면 안에 있고 편집 담당 대화창과 캔버스 겹침은 0이다. 390x844 가로 넘침은 0이다.
- 실사진: chairman-photo.jpg, RGB 평균 표준편차 79.90. 단색 픽스처를 쓰지 않았다.
- PNG: 화면과 내보내기 차이 1.5464%, 기준 2% 이하.
- 오류: 브라우저 console/page 오류 0, 실패 요청 0.
- 모바일: 360·390·412·600·700·780·820·900·1000 아홉 폭 모두 13px 미만 글자 0, 본문 16px, 44px 미만 누름 0, 눌림 상태 100%, 가로 넘침 0이다.
- 코드 검증: 카드 집중 Vitest 24파일·318건, TypeScript, Webpack production build의 정적 페이지 188/188이 통과했다. 기본 Turbopack build는 worktree 밖을 가리키는 `node_modules` 심링크를 거절해 중단됐으며 제품 컴파일 오류는 아니었다.
- 하네스: pipeline artifact lint는 상태파일 2개의 핀 실체·슬롯키·버전 정합을 통과했고 기존 설계·QA 산출물 핀 위생 경고 28건이 남았다. design-lint는 기존 좌표용 CSS 변수 인라인 style과 테스트 fixture hex를 경고했다.
- 라이브러리 판단: `react-konva`는 도입하지 않았다. 기존 DOM 편집기와 PNG가 `CardSlideScene`·`cardSlideRenderModel`을 공유하므로 교체하면 캔버스 직접 글 수정, 저장, 카톡 투영, 내보내기 경로가 이중화된다. Konva의 Transformer·고해상도 내보내기 패턴은 조작·검증 기준으로만 참고했다.
- 셀프심문: 가장 그럴듯한 오판은 목업이나 오류 화면에서 통과하는 것이다. 실제 DB tenant·draft·미디어 API를 만들고 데이터 카드 3장, 실사진 분산, `page.route` 0, DB 저장값을 함께 단언해 닫았다.
- 레드팀: 화면과 PNG가 같은 컴포넌트를 써도 브라우저 글꼴 래스터화로 달라질 수 있다. 그래서 1080x1350 실제 화면 캡처와 실제 PNG를 픽셀로 비교했고 차이 1.5464%를 관찰했다.
- 남은 것: 원격 CI·운영 배포·외부 SNS 실제 게시는 실행하지 않았다. design-lint의 기존 경고 2종과 artifact lint의 기존 핀 위생 경고 28건은 이번 기능 범위 밖의 미통과 항목이다.

벤치마크: [Konva Transformer 기본 조작](https://konvajs.org/docs/select_and_transform/Basic_demo.html), [Konva 고해상도 내보내기](https://konvajs.org/docs/data_and_serialization/High-Quality-Export.html). 선택·변환·내보내기 검증 관점은 차용했고, 제품 런타임은 기존 DOM 공용 렌더러를 유지했다.

PRESENTATION_CHECK: 태그 잔재 없음 확인 / 1440x900·390x844·화면 PNG·내보내기 PNG 렌더 확인함
SKILLS_USED: qa, 실제 사용자 경로 브라우저 검증과 증거 수집에 사용
SKILLS_SKIPPED: review, push·PR 반영 전이며 이번 위임은 구현·실구동 검증 범위라 별도 PR 리뷰는 미호출
SOURCES/MODEL: gpt-5/Codex | `docs/design/prototypes/osmu-editroom-v71-hub-claude-opus-20261001-2335.html` | `logs/diff/chairman-defects-20261009/report.md` | `dashboard/src/components/studio/card/CardCanvasEditor.tsx` | `dashboard/src/lib/studio/card-render-model.ts` | https://konvajs.org/docs/select_and_transform/Basic_demo.html | https://konvajs.org/docs/data_and_serialization/High-Quality-Export.html
KNOWLEDGE_QUERY: BRAIN의 OSMU 마케팅 스튜디오 자동화·존재감 문서와 Canva·미리캔버스·Konva의 선택·변환·페이지·내보내기 사례를 조회했다.
HITS_USED: BRAIN `idea-zero-one-marketing-studio.md`의 한 화면 제작 흐름, v71 편집실 구조, Konva의 변환·내보내기 검증 관점을 채택했다.
HITS_REJECTED: Polotno 유료 SDK와 react-konva 전환은 기존 DOM 직접 편집·공용 PNG 렌더·카톡 투영 경로를 중복시키므로 채택하지 않았다.
CONFLICTS: 외부 캔버스 사례는 전용 캔버스 런타임을 전제하지만 회장 정본은 기존 v71 화면과 생성→편집→발행 연결 보존을 요구했다. 기존 DOM 공용 렌더러 확장으로 정본을 우선했다.
