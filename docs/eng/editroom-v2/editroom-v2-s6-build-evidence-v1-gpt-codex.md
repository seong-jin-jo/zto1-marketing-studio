# 편집실 v2 S6 빌드 증거

STAMP: 2026-10-07 01:35 KST | model: gpt-6.1-sol | agent: code-builder | skill: 없음 | 근거: `build-plan.md` S6, v71 승인 시안, 교차 리뷰 R1, 로컬 Chromium·FFmpeg·PostgreSQL 실구동 | 고민: 대기열 전환 뒤에도 영구 파일·인트로 시간축·자막 굽기 계보가 한 경로로 이어지는지 실제 MP4와 브라우저 양쪽에서 확인했다.

기반 포맷: `docs/eng/editroom-v2/build-plan.md`의 S6 범위·수용 기준·필수 테스트 표.

## 결론

S6 영상 5레인과 넣기 서랍은 교차 리뷰의 MAJOR 1~4와 MINOR 구현 누락을 보완했다. 실제 브라우저에서 영상 재생과 블록 이동·길이 조절·저장을 관찰했고, 실제 FFmpeg MP4에서 2초 인트로 뒤에만 자막이 나타나는 것을 프레임으로 확인했다. 운영 배포와 실제 회원 계정 왕복은 수행하지 않았다.

## 리뷰 지적 폐쇄

| 지적 | 반영 | 증거 |
|---|---|---|
| MAJOR 1 작업자와 대시보드 미디어 단절 | 두 서비스가 `osmu-data:/app/data`를 공유하고, 상태 응답은 만료 URL과 별도로 영구 `artifact_filename`을 반환한다 | compose 계약 6건 PASS, 상태 라우트 통합 PASS |
| MAJOR 2 인트로 시간축 | 서버 대기열이 자막·글·댓글 시간을 인트로 길이만큼 한 번만 이동한다 | 단위 계약과 실제 5초 MP4 PASS |
| MAJOR 3 자막 굽기 계보 | 서버가 `.subtitle-bakes.json`과 저장 계보로 글자 없는 원본을 고른다. 원본이 없으면 409로 막고, 성공 MP4의 계보를 영구 키로 기록한다 | VIDEO-BAKED-LINEAGE-05~10 6건 PASS, 신규 서버 계약 15건 PASS |
| MAJOR 4 공통 완료 조건 | 영상 API 계약, 인트로·아웃트로 각 3종, 목소리 진실 문구, 공용 Button, 타임라인 손잡이 텍스트 분리, 실제 MP4 검증을 통과했다 | 표적 42건 PASS, PostgreSQL 8건 PASS, MP4 2건 PASS |
| MINOR 렌더 누락 | 음악 offset·조건부 fade·음성 duck, 글 fade·rise·scale·type, 테넌트별 음성 결과 캐시를 렌더 경로에 연결했다 | 렌더 계획 13건, 자산 캐시 2건 PASS |

## 유지한 기존 기능

- 실제 영상 재생과 만료 URL 재서명 경로.
- `normalizeSubtitleWindows`의 겹침 정리와 짧은 자막 합치기.
- `.subtitle-bakes.json` 기반 단일 자막층과 원본 없는 재굽기 409 방어.
- 인트로·아웃트로 합성본과 원본의 stale 판정.
- S3 내보내기 대기열의 멱등 키, lease, 재시도, 카드 내보내기.
- 컷 구간의 영상·원본 음성 동시 제거와 기존 발행·예약 흐름.

## 실행 증거

| 게이트 | 결과 | 실행 조건과 관찰값 |
|---|---|---|
| TypeScript | PASS | `npm run typecheck:ci`, 종료 코드 0 |
| 무결성 | PASS | `npx vitest run tests/integrity`, 33파일 104건 |
| 계약 | PASS | `npx vitest run contract`, 107파일 625건 |
| 변경 소스 관련 | PASS | 15개 소스 기준 `vitest related`, 56파일 437건 PASS, 환경 전용 13건 skip. DB·실제 렌더는 아래에서 별도 실행 |
| 자막 계보 | PASS | VIDEO-BAKED-LINEAGE-05~10, 6건 |
| PostgreSQL | PASS | 로컬 PostgreSQL에 S3 migration 적용, 8건 PASS, 선택 환경 1건 skip |
| compose | PASS | 작업자 데이터 볼륨·경로·영구 파일명 계약 6건 |
| production build | PASS | `heavy-slot.sh npm run build`, Next.js 16.2.2 종료 코드 0 |
| dev server | PASS | `npm run dev -- -p 3476`, Ready 1.236초, `/studio?room=edit` HTTP 200 |
| 실제 Chromium | PASS | 데이터 자막 3개, 5레인, 재생 위치 0.168초, 블록 0~1.3초 → 2~3.3초 이동, 끝점 4.3초로 조절, 저장 1회, 콘솔 오류 0, 실패 요청 0 |
| 반응형 | PASS | 1440·1024·390에서 가로 넘침 0. 화면 증거는 `docs/qa/editroom-v2-s6/` |
| 모바일 실측 | PASS | 360·390·412·600·700·780·820·900·1000 전부 본문 16px, 13px 미만 0, 44px 미만 조작 0, 눌림 상태 47/47, 가로 넘침 0 |
| 실제 MP4 | PASS | FFmpeg 9.0.2 drawtext, Apple SD Gothic Neo, H.264 360×640. 기본 렌더 3초는 영상·오디오 스트림 확인. 인트로 렌더 5초는 1초 프레임 글자 0, 2.5초 프레임 “인트로 뒤 자막” 표시 |
| 디자인 lint | 조건부 PASS | 기존 인라인 style 3파일·hex 8파일 경고가 남아 있다. 이번 diff의 신규 인라인 style·hex는 0 |
| 파이프라인 산출물 lint | PASS, 경고 있음 | 상태파일 2개의 핀 실체·슬롯키·버전 정합 통과. 기존 design·qa·ship 산출물 경로 위생 경고 28건은 이번 S6 build 범위 밖이며 숨기지 않고 유지 |

### 브라우저 실행 조건

- Next dev 서버와 실제 Chromium을 사용했다.
- API는 데이터 카드 3개와 영상 파일을 반환하는 결정적 로컬 fixture로 가로챘다.
- `<video>`는 실제 4초 H.264/AAC 파일을 재생했다.
- 운영 API·회원 계정·배포 버전은 확인하지 않았다.

### MP4 실행 조건

- 실행 파일: 로컬 정적 FFmpeg·ffprobe 9.0.2, drawtext 포함.
- 인트로 fixture: 빨간 화면 2초 + 파란 본문 3초.
- 편집 계약: 원본 기준 자막 0~1.5초, 서버 변환 뒤 합성본 기준 2~3.5초.
- 결과: `docs/qa/editroom-v2-s6/s6-intro-timeline-rendered.mp4` 5.000초. `s6-intro-frame-1s.png`에는 자막이 없고 `s6-body-frame-2.5s.png`에는 자막이 있다.

## 남은 한계

- 기본 음악 5곡은 기능·믹싱 검증용 결정적 사인파다. 라이선스 검증된 실제 음원으로 교체하기 전에는 고객 출고용 음악으로 간주하지 않는다. 코드에 `TODO(S6-LICENSED-MUSIC)`를 남겼다.
- 운영 배포, 원격 CI, 실제 회원 계정과 운영 저장소 왕복은 미검증이다.
- push는 하지 않았다.

## 벤치마크 반영

- CapCut의 타임라인 직접 조작과 Adobe Premiere의 트림 핸들 개념을 차용했다.
- 이 제품은 전문 편집기의 자유도를 복제하지 않고, 5개 고정 레인과 넣기 서랍으로 범위를 줄였다.
- 포인터 이동은 MDN Pointer Capture 계약을 기준으로 브라우저 경계를 넘어도 드래그를 이어가게 했다.

SKILLS_USED: 없음
SKILLS_SKIPPED: 없음. 이 과업에 맞는 프로젝트 전용 스캐폴드 스킬이 없고, 기존 교차 리뷰 지적을 정본대로 구현했다.
SOURCES/MODEL: gpt-6.1-sol | `docs/eng/editroom-v2/build-plan.md`, `/Users/sj/wt/s6-review-r1.md`, v71 승인 시안, `wiki/거버넌스/결정.md`, `wiki/거버넌스/실수.md`, https://www.capcut.com/resource/capcut-tutorial-for-beginners, https://helpx.adobe.com/ca/premiere/desktop/edit-projects/trim-clips/about-trim-mode.html, https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture
KNOWLEDGE_QUERY: BRAIN business 허브에서 OSMU·콘텐츠 누적 성장·출시 병목을 조회했다.
HITS_USED: `wiki/business/pmf/idea-zero-one-marketing-studio.md`, `concept-일일-콘텐츠-누적-성장엔진.md`. 영상 편집이 발행 가능한 실파일로 닫혀야 한다는 판단 근거로 사용했다.
HITS_REJECTED: 범용 해외 사업 발굴 문서는 이번 확정 구현 범위를 바꾸지 않아 채택하지 않았다.
CONFLICTS: 외부 전문 편집기는 자유 레인·정밀 도구를 제공하지만, 승인 v71은 5개 고정 레인과 넣기 서랍을 요구한다. 승인 정본을 우선했다.
