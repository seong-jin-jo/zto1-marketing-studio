# OSMU 세션 상태

## 목적
OSMU 서비스(studio 제작·taste 학습 + openclaw 채널·발행 UI)를 제품으로 완성한다. 수능 콘텐츠 실험은 그 추천·템플릿 데이터의 원천이다.

## 2026-09-06 01:11 KST | Claude opus | 전체 흐름 QA 두 바퀴, 산출물 박제

로그인 세션으로 네 방을 탐침해 재고, 고친 뒤 흐름을 처음부터 다시 돌렸다.
두 번째 바퀴 결과: 발행 `18058851209557658`, 퍼머링크 `Dc6W0HOmBGr`,
성과 수집 `updated 2 / total 3`, 성과실 표본 2건, 좁은 폭 잘림 0건.

**이번 QA 에서 찾아 고친 것 둘.**
- 폭 430 에서 미리보기 머리줄이 칸보다 18픽셀 넓어 발행 토글과 계정 관리가 잘렸다.
  문서 가로 스크롤은 0 이라 겉으로는 멀쩡해 보이지만 조작 불가 단추가 생긴다. 잘림 5→0.
- 배포 중 컨테이너 재시작으로 계정 상태 검사가 한 번 실패하자 작업 화면이 통째로
  "서비스 확인 실패"로 덮였다. 바로 뒤 같은 토큰은 200. 서버 오류만 한 번 더 물어본다.
  fail-open 금지 계약은 재시도 이후 기준으로 다시 세웠다.

산출물: `docs/qa/osmu-전체흐름-QA-2026-09-05.md`

## 2026-09-05 22:45 KST | Claude opus | 생성부터 성과까지 운영에서 한 바퀴 실제로 돌렸다

회장 계정으로 생성실에서 새 초안을 만들어 발행실로 옮기고 실제 발행한 뒤 성과 수집까지
이어서 돌렸다. 결과는 새 게시물 `17899377903603672`, 새 퍼머링크 `Dc6F_uKFI3z`,
성과 수집 `updated 1 / total 2`, 성과실 표본 1건, 예시 데이터 표기 사라짐.

**두 번째 글을 영영 못 올리던 결함을 잡았다.** 생성실에서 새 초안을 만들어도 이전 초안
번호를 그대로 들고 갔다. 그 번호가 이미 발행된 것이면 발행이 매번 `alreadyPublished` 로
닫혀 같은 옛 글만 가리켰다. 새 초안 생성 시 초안 번호와 발행 흔적을 끊게 고쳤다.
이 결함 때문에 그동안 발행 축 검증이 계속 같은 자리에서 맴돌았다.

**성과 축 확정.** 새 글은 정상 수집되고, 어제 글 하나만 계정 불일치로 측정 불가다.
화면이 미수집과 측정 불가를 나눠 적어 기다리면 되는 것과 조치가 필요한 것이 구분된다.
어제 글을 되살리려면 회장이 스레드를 그 글 올린 계정으로 다시 연결해야 한다.

## 2026-09-05 20:35 KST | Claude opus | 회장 재로그인 뒤 발행 축 실검증, 조용한 실패 3건 추가 제거

**발행 축 실검증.** 회장 계정으로 발행실에서 실제로 눌러 응답 본문까지 확보했다.
지금은 `HTTP 200 / ok:true / permalink` 로 닫히고 복구 배너 0개, 게시물 보기 링크 1개다.
같은 초안을 다시 눌러도 `alreadyPublished:true` 로 같은 글을 가리켜 중복 발행이 없다.

**중복 발행 거짓 경보 제거.** 확보한 응답이 근거다.
`stage=queue_record, publicationRecorded=true, queueRecorded=false`. 실제로 올라갔고 발행
기록도 저장됐는데 승인 큐 미러에 그 초안이 없다는 이유로 실패 처리하고 재발행을 막고
있었다. 스튜디오 직접 발행은 승인 큐를 거치지 않으므로 없는 것이 정상이다.
markQueuePublished 가 `updated`·`absent` 를 구분해 돌려주고 `absent` 는 통과시킨다.

**성과 수집이 조용히 0건.** 대상 1건인데 갱신 0건으로 끝나고 화면은 무반응이었다.
제공자 응답 실패를 그냥 건너뛰고 `ok:true` 로 닫았기 때문이다. 이제 사유를 서버 로그와
응답에 남기고 화면이 말한다. 확보한 제공자 문구는 다음과 같다.
`400 Unsupported get request. Object with ID '18406087225086251' does not exist, cannot be
loaded due to missing permissions, or does not support this operation`
기본 조회도 같은 400 이라 게시물 자체를 이 토큰으로 못 읽는 상태다. 그 식별자는
2026-09-04 기록분이고 퍼머링크는 공개적으로 열린다. **제공자 쪽 확인이 남았다.**

**미해결.** 성과 수치가 아직 0이다. 원인은 위 제공자 거절이며 추측하지 않고 남긴다.

## 2026-09-05 14:05 KST | Claude opus | 작업 중 로그아웃의 원인 제거, 게이트웨이 수출 결함 5건 해소

**작업 중 로그아웃.** 스튜디오에서 점검하던 중 접근 토큰 수명이 끝나자 그대로 로그인 화면으로
튕겼다. AuthGate 가 401 을 받으면 갱신 토큰을 한 번도 쓰지 않고 바로 로그아웃시키고 있었다.
접근 토큰은 원래 짧게 살고 갱신으로 이어 가는 것이 정상이다. 갱신을 먼저 시도하고 실패했을
때만 로그아웃하도록 고쳤다(10fec4c4). 배포본에서 반영 확인.

**게이트웨이 전체 빌드.** 수출 결함 5종을 잡아 MISSING_EXPORT 는 0이 됐다. 표식 상수 1,
배럴 재수출 3, 경로 오지정 2, 정의 없음 1. 지금은 빌드가 메모리 부족(SIGABRT)으로 죽는다.
러너 메모리 증설이 필요하며 회장 결정 사항이다. 대시보드 단독 배포는 정상이다.

**막힌 것.** 사파리 세션이 로그아웃된 상태라 발행·성과 실데이터 점검은 회장 재로그인 대기다.

## 2026-09-05 10:40 KST | Claude opus | 회장 계정으로 네 방 실사용 점검하고 조용한 실패 4건 제거

회장이 사파리에 로그인해 둔 `j.the.great.investor` 계정으로 생성·편집·발행·성과를 직접 눌러 보며 점검했다.
osascript 로 사파리를 구동한다(`Allow JavaScript from Apple Events` 를 켜 둠). 이제 로그인 뒤 화면을 직접 잴 수 있다.

실측으로 잡은 것.
- **생성실 `초안 만들기` 가 눌러도 0자 변화.** 구조 A·B·C 를 안 고르면 조용히 비활성이었다. 눌리게 두고 무엇이 없는지 말한다.
- **발행실 발행 단추가 요청도 알림도 없이 반환.** 본문이 없을 때 조용히 return 했다. 이유를 말하게 바꿨다.
- **연결이 끊긴 채널이 발행 대상에 그대로 들어갔다.** 서버는 `connection_state: reconnect` 를 주는데 화면이 그 값을 버리고 있었다. 이제 대상에서 빼고 채널별 다시 연결 링크를 준다(ADR-006 "문장만 주고 방치 금지").
- **학습 정보가 값 대신 예시 문장을 저장했다.** 주요 고객에 "뭐부터 해야 할지 모르겠다면..." 이 들어가 생성 입력이 의미상 틀렸다. 이름과 견본을 함께 저장한다.

정상 확인: 편집실 줄 클릭 → 그 줄 편집기 열림, 값 반영됨. 헤더 학습 정보 네 방 모두 표시(4/8).
벤치마크: Buffer 는 끊긴 채널을 목록 위로 올리고 재연결을 먼저 시키며, 실패 건은 자동 재시도하지 않고 `Retry Now` 를 준다.

## 2026-09-05 03:09 KST | Claude opus | 세션 이름 3종 통일(osmu)

- **정본=session-state 라인명 "osmu"** (회장 "session-state 기준으로 맞추라"). pane 제목(osmu-content-experiment-manual→osmu)·claude 세션 summary(UUID→osmu) 정렬. 라인·파일·마커는 osmu 그대로.
- 하네스: session-purpose-name-gate.sh 신규(Stop, 커밋 f6b80dd) — session-state에 목적 없으면 차단, pane≠라인명이면 경고. 정렬 후 훅 통과(exit0).
- 미해결: 라인 키를 서술형으로 바꿀지는 회장 판단(파장 커서 보류).

## 2026-09-04 08:04 KST | Codex code-builder | v77의 v75 생성실 계약 회귀 복구 완료

### 회장 요청

- v77 변경이 v75의 생성실 본문 직접 생성 동선을 없앤 회귀를 지적했다. 기존 생성 담당 대화창과 v77의 헤더 학습 정보, 남은 칸 안내, 새로고침 보존, 글 편집을 모두 유지한 채 소스를 고치고 CI 동등 전체 테스트, 헤드리스 클릭 수치, 원격 push까지 요구했다.

### 지금까지 한 것

- 원인은 `f32d132f`의 본문 직접 생성 UI 삭제와 `d48e4321`의 `V75-CREATE-01` 읽기 전용 계약 교체로 확정했다.
- 생성실 본문에 주제 입력, A·B·C 구조 선택, `초안 만들기`, 생성 결과와 오류 표시를 복구했다. 오른쪽 생성 담당 문답과 후보 선택은 함께 유지했다.
- 원래 `V75-CREATE-01`을 복구하고 직접 생성 정상, 빈 입력 거절, 대화 생성 네트워크 연결 계약을 추가했다. v77 헤더, 남은 칸, 상태 복원, 글 편집 검증도 유지했다.
- 변경 11파일을 `f41d862f`, `476ddfee`, `6aef08ad`, `1a4d69dc`, `604fd1a3`으로 나눠 커밋했다.

### 검증 증거

- `bash scripts/local-ci-db.sh test`: PostgreSQL 16 연결 상태 226파일 1,679건 통과, 1건 조건부 제외, 실패 0.
- `cd dashboard && npx tsc --noEmit`: 오류 0. `npm run build`: 정적 페이지 177/177. 기존 NFT 광범위 추적 경고 1건만 유지.
- `design-lint.sh dashboard/src`: 디자인 토큰 위반 0.
- production build 헤드리스 클릭: 본문 직접 생성 1,198자에서 1,296자, 변화 +98자. 대화창 표시 `true`. 헤더 학습 정보 1,296자에서 1,778자, 변화 +482자. 콘솔 오류 0.
- v77 보존 실측: 새로고침 뒤 주제 문자열 유지, 글 전체 편집값 반영.
- `work/v77req` 원격과 로컬 HEAD `604fd1a356cdba856152d602d5994c74452ba6f5` 일치. 머지와 배포는 하지 않았다.

### 남은 이슈와 다음 액션

- build 필수 검증은 모두 끝났다. QA 단계 승인과 운영 배포는 수행하지 않았다.
- 승인 `DESIGN.md` v37과 v68 프로토타입의 본문 읽기 전용 설명은 최신 회장 요청의 이중 생성 동선과 충돌한다. product-designer가 다음 디자인 단계에서 본문 직접 생성과 대화 생성을 함께 표시하는 정본으로 갱신해야 한다.
- 다음 소유자는 QA verifier다. 종료 증거는 `bash scripts/local-ci-db.sh test` 실패 0, production 브라우저에서 본문 생성 변화 0 초과, 대화창 표시, 헤더 학습 정보 변화 0 초과다.
- 실제 외부 생성 엔진, 운영 OAuth, 외부 게시와 운영 배포는 이번 build 범위에서 미검증이다. 운영 후보가 준비되고 QA 단계가 열릴 때 회수한다.
- 자동 생성 dirty `.codex/logs/harness.jsonl`, `docs/requests/inbox/chairman-2026-09.md`는 제품 커밋에 넣지 않고 보존했다.

## 2026-09-04 02:21 KST | Codex code-builder | v75 생성실 직접 생성 인계

### 회장 요청

- 운영 생성실에는 생성을 시작하는 단추가 없고 A·B·C 구조 카드도 클릭 전후 변화가 없었다. 주제를 입력해 `/api/studio/text`를 직접 호출하는 경로, 실제 구조 반영, 일반 영어 UI 라벨 제거, 실제 클릭 수치, `work/v75gen` push를 요구했다.

### 지금까지 한 것

- 기반은 `pipeline-state.osmu.md`의 build 허용 범위, ADR-004·005·006, 실수 원장 상단, `docs/qa/osmu-원인분석-2026-09-04.md` 8절, v68 승인 생성실 시안, v69 최신 교정 시안, `DESIGN.md` v37이다.
- 생성실 본문에 초안 주제 입력, A·B·C 구조 선택, `초안 만들기`, 생성 결과를 추가했다. 선택 구조 이름과 이야기 순서를 `/api/studio/text` 요청과 생성 프롬프트에 전달한다. 잘못된 구조는 400으로 거절한다.
- 기존 오른쪽 생성 담당의 6단계 문답, 후보 세 장, 거절과 무료 재생성, 파생 형식, 편집실 이동, 학습 정보는 삭제하지 않았다.
- 사이드바 `Custom Integration`을 `외부 연동`으로 바꾸고 저장소의 일반 영어 UI 라벨을 한국어화했다. 제품명과 플랫폼 고유명은 유지했다.
- 정상·거절 계약과 페이지 통합 계약을 추가했다. 변경은 46파일이며 제품·테스트·문서 커밋은 `9fc1d178`부터 현재 HEAD까지 쪼개 기록했다.

### 검증 증거

- 프로덕션 빌드 실제 클릭: 생성 단추 본문 1170→1268자(+98), 구조 B 카드 1155→1170자(+15).
- 브라우저 네트워크: `/api/studio/text` POST 1건, B·결과 제시형·이야기 순서 포함. 결정론적 한국어 응답이 생성 결과에 표시됐다.
- 생성실 단추 19개 전수 추출에서 일반 영어 라벨 0건, 브라우저 콘솔 오류 0건이다. 검증 서버는 종료했다.
- `npx tsc --noEmit`: 오류 0.
- `npx vitest run`: 226파일 1,636건 통과, 38건 조건부 제외, 실패 0.
- `npm run build`: 정적 페이지 177/177. 기존 NFT 광범위 추적 경고 1건 유지.
- `design-lint.sh dashboard/src`: 디자인 토큰 위반 0.

### 디자인 픽셀 대조

- 승인 시안 `docs/design/clean-frames/osmu-v68-create-normal-1024-gpt-codex-20260903-0022.png`과 dev `/tmp/osmu-v75-dev-create-1024.png`를 같은 1024 너비로 둘 다 직접 열어 대조했다.
- 픽셀 일치는 미통과다. 승인 시안은 1024×900 안에서 왼쪽 56픽셀 레일, 상단 네 방, 본문 구조 카드, 오른쪽 전체 높이 생성 담당으로 끝난다. dev는 1024×1503이고 왼쪽 96픽셀 레일, 다른 헤더와 작업 메뉴, 본문 직접 생성 카드, 아래쪽 요약·구조 카드·학습 정보가 이어진다.
- 직접 생성 카드는 이번 회장 요구로 추가한 핵심 기능이라, 직접 생성 경로가 없는 기존 승인 시안으로 되돌리면 이번 결함을 재발시킨다. code-builder가 임의로 새 시안을 확정하지 않는다.

### 남은 이슈와 다음 액션

- 디자인 QA 게이트는 미통과다. product-designer가 이번 직접 생성 요구를 포함한 최신 생성실 시안을 갱신하고, 같은 1024×900과 390×844 상태로 dev와 다시 픽셀 대조해야 한다.
- `git push origin work/v75gen`은 실행 정책이 승인 필요로 분류해 명령 시작 전에 차단했다. `git ls-remote --heads origin work/v75gen`은 비어 있다. 부모 컨트롤러가 현재 로컬 HEAD를 push하고 원격 SHA 일치를 확인해야 한다. 머지와 배포는 금지다.
- 실제 외부 생성 엔진 운영 호출, 운영 배포 화면, 실제 OAuth와 게시, App Review는 미검증이다.
- 다음 기능 QA는 실제 인증 환경에서 `V75_USE_LIVE_TEXT=1`로 주제 입력→구조 선택→초안 만들기→실제 생성 본문 표시를 재관찰하는 것이다.
- 사용자 소유 dirty `.codex/logs/harness.jsonl`, `docs/requests/inbox/chairman-2026-09.md`는 stage하지 않고 보존했다.

## 2026-09-03 19:21 KST | Codex code-builder | v72 401 승인 캐시 build 인계

### 회장 요청

- 보호 API가 전부 401인데도 이전 성공 조회의 초안 캐시가 승인 가능한 상태로 남는 운영 결함을 지적했다. 실제 SWR 캐시 전이를 재현하고, 401에서 옛 목록과 다른 보호 화면 캐시까지 제거한 뒤 전체 테스트와 `work/v72cache` push를 요구했다.

### 지금까지 한 것

- 기준은 회장이 지정한 `/private/tmp/osmu-wt-v72cache`, `work/v72cache`, `pipeline-state.osmu.md`, `DESIGN.md` v37, ADR-004·005·006, 실수 원장 상단이다.
- 원인은 v71 `fetcher`가 401을 `AuthRequiredError`로 throw해도 성공했던 `data`를 SWR 캐시에서 제거하지 않은 것이다. v71 테스트는 `data` 와 `error`를 mock으로 동시 주입해 실제 성공 캐시 뒤 401 전이를 놓쳤다.
- `fetcher`, `apiPost`, `apiDelete`가 401을 받으면 공통 이벤트를 보내고, 루트 `Providers`의 `useSWRConfig().mutate`가 현재 provider의 모든 보호 조회 캐시를 재검증 없이 제거하게 했다.
- 승인 인박스는 목록 오류가 있는 동안 캐시된 게시물을 판단 데이터로 쓰지 않고, 옛 제목·본문 대신 만료 안내와 비활성 승인·거절만 남긴다.
- 기존 카드 이동, 예약, A·R·방향키, 발행실 복귀, 제품 소스, 보이스 톤, 영상 미리보기, 제목·본문·해시태그·주제·생성 시각 표시, 재로그인 흐름을 유지했다. API, DB, OAuth, 배포 설정은 변경하지 않았다.
- 제품·테스트·증거·핸드오프 8파일을 변경했다. 커밋은 `129fb73d`, `1167af06`, `766e04de`, `8077e96c`, `61cb5728`이다.

### 검증 증거

- 실제 Map 기반 SWR provider 계약 `V72-AUTH-CACHE-01`은 수정 전 옛 제목 잔존으로 실패했고 수정 뒤 통과했다. 인박스와 `/api/settings` 캐시 동시 제거를 관찰했다.
- 지정 인증 회귀는 4파일 42건 통과, 실패 0이다.
- `cd dashboard && npx tsc --noEmit`: EXIT 0, 오류 0.
- `cd dashboard && npx vitest run`: 226파일 1,628건 통과, PostgreSQL 필요 38건 조건부 제외, 실패 0.
- `cd dashboard && npm run build`: EXIT 0, Next.js production build 정적 페이지 177/177. 기존 NFT 광범위 추적 경고 1건은 유지됐다.
- `design-lint.sh dashboard/src`: 디자인 토큰 위반 0.
- `work/v72cache` push 후 로컬·원격 HEAD `61cb5728` 일치를 확인했다. 머지와 배포는 실행하지 않았다.

### 남은 이슈와 다음 액션

- QA 소유자가 만료된 운영 로그인 세션에서 승인 인박스를 열고 401 재조회 후 옛 카드 제목·본문 비노출, 만료 안내 노출, 승인·거절 비활성을 브라우저로 직접 관찰해야 한다. 이 운영 경로는 미검증이다.
- 다음 집중 QA 명령은 `cd dashboard && npx vitest run tests/components/inbox-auth-cache-invalidation.test.tsx tests/components/inbox-v70-defects.test.tsx tests/components/operator-get-auth.test.tsx tests/components/AuthGateRouting.test.tsx`다.
- 로컬 dirty는 세션 훅이 남긴 `.codex/logs/harness.jsonl`뿐이다. 제품 커밋에 넣지 않고 보존한다.

## 2026-09-03 10:02 KST | Codex code-builder | v71 인증 변경 뒤 발행실 복원 회귀 build 인계

### 회장 요청

- v71 인증 실패 전파와 만료 세션 fail-closed 변경 뒤 `FE-V63-RETURN-01`이 전체 테스트에서 시간 초과한 회귀를 지적했다. 인박스 작업물의 발행실 복원 동작을 되살리고, 조회 실패 시 행동 차단과 인증 끊김 안내를 보존한 채 전체 테스트, TypeScript, push까지 요구했다.

### 지금까지 한 것

- `pipeline-state.osmu.md`의 build 허용 범위, `DESIGN.md` v37, ADR-004·005·006, 실수 원장, 복원 계약, 직전 인증 커밋 `ba4cc37c`와 `2cd5a9bb`를 기준으로 작업했다.
- 복원된 선택 채널 표시와 실제 발행 가능한 채널을 분리했다. 계정 조회 중에도 큐 본문과 선택 상태는 먼저 나타나며, 실제 발행 대상과 발행 단추는 계정 확인이 끝날 때까지 잠긴다.
- 전체 실행에서 Vitest가 가용 CPU 16개를 파일 워커로 모두 사용해 jsdom과 API 통합 테스트가 경합한 사실을 확인했다. 테스트 제한시간과 기대값은 바꾸지 않고 파일 워커를 1개 이상 4개 이하로 제한했다.
- 기존 인박스·캘린더 복귀, 큐 본문과 초안 결합, 잘못된 복원 거절, 조회 실패 시 승인·거절 비활성, 만료 세션 즉시 안내, POST·DELETE 401 전파를 보존했다.
- 제품과 증거 커밋은 `96465864`, `c473ba8f`, `488a61a6`이다. 변경 파일은 제품 2개와 기록 3개, 총 5개다.

### 검증 증거

- `cd dashboard && npx tsc --noEmit`: EXIT 0, 오류 0.
- `cd dashboard && npx vitest run --reporter=dot`: 225파일 1,624건 통과, PostgreSQL 필요 38건 조건부 제외, 실패 0. 전체 실행의 `FE-V63-RETURN-01`은 4.08초에 통과했다.
- 같은 전체 실행에서 `V71-AUTH-01`부터 `05`까지 통과해 조회 실패 행동 차단과 인증 만료 처리를 보존했다.
- `cd dashboard && npm run build`: EXIT 0, 정적 페이지 177/177. 기존 NFT 광범위 추적 경고 1건은 유지됐다.
- `design-lint.sh dashboard/src`: 디자인 토큰 위반 0.
- 실제 로그인 브라우저에서 인박스 복귀 링크를 누르는 QA는 아직 미검증이다.

### 남은 이슈와 다음 액션

- 시작 시 `git pull --ff-only origin work/v71auth`는 원격 브랜치가 없어 실패했다. 종료 시 `git push -u origin work/v71auth`를 실행했지만 승인 요청을 금지한 현재 실행 환경이 명령 시작 전에 차단했다. 로컬 HEAD는 `488a61a6`이고 원격 브랜치는 없다.
- push 권한이 허용된 부모 컨트롤러가 이 핸드오프 커밋을 포함한 로컬 HEAD를 `origin/work/v71auth`로 전송하고 로컬과 원격 SHA 일치를 확인한다. 머지와 배포는 하지 않는다.
- QA 소유자는 종료형 서버에서 `cd dashboard && npm run e2e:publish`를 실행하고, 로그인 고객 세션으로 인박스 복귀 링크 클릭 뒤 본문과 선택 채널 즉시 표시, 계정 확인 전 발행 잠금을 직접 관찰한다.
- 기존 사용자와 훅 소유 dirty `.codex/logs/harness.jsonl`, `docs/requests/inbox/chairman-2026-09.md`는 stage하지 않고 보존했다.

## 2026-09-03 07:58 KST | Codex code-builder | 승인 인박스 공백 승인 차단 build 인계

### 회장 요청

- 운영 승인 인박스에서 공백이나 줄바꿈만 든 본문이 정상 본문으로 판정되어 승인되는 결함을 막고, 제목 등 사람이 판단해야 하는 값도 함께 점검해 계약 테스트, 전체 지정 테스트, push까지 요구했다.

### 지금까지 한 것

- 공용 검토 콘텐츠 정규화 함수가 일반 공백과 줄바꿈뿐 아니라 zero width 문자도 제거한 뒤 본문과 제목의 실질 값을 판정하게 했다.
- 인박스 화면은 실질 본문이 없거나 제공된 제목이 공백뿐이면 한국어 경고를 표시하고 승인 단추와 A 단축키를 차단한다. 유효한 제목은 검토 카드 제목으로 표시한다.
- 개별 승인 API도 같은 검증을 적용해 누락 필드를 `REVIEW_CONTENT_MISSING` 422로 거절하며 상태를 바꾸지 않는다.
- 일괄 승인 API는 선택된 초안을 모두 먼저 검증한다. 하나라도 본문이나 제공된 제목이 비어 있으면 전체 요청을 422로 거절해 부분 승인도 막는다.
- 계약 테스트는 공백과 줄바꿈만 든 본문, 공백 제목, zero width 본문, A 단축키, 개별 API 상태 보존, 일괄 API 원자적 거절을 고정한다.
- 기존 검토 요청, 편집, 예약, 승인, 거절 흐름과 사용자 소유 dirty 파일은 삭제하거나 stage하지 않았다.

### 검증 증거

- `cd dashboard && npx tsc --noEmit`: EXIT 0, 출력 오류 0.
- `cd dashboard && npx vitest run tests/components tests/studio tests/api`: EXIT 0, 89파일 587건 통과, 15건 조건부 제외, 실패 0.
- 집중 계약 테스트: 컴포넌트 7건, 개별 승인 API 포함 12건, queue API 10건 모두 EXIT 0.
- `cd dashboard && npm run build`: EXIT 0, Next.js 컴파일과 TypeScript 검사 성공, 정적 페이지 177/177 생성. 기존 NFT 광범위 추적 경고 1건은 유지됐다.
- `bash /Users/sj/.claude/harness/bin/design-lint.sh dashboard/src`: EXIT 0, 디자인 토큰 위반 0.
- 운영 캡처 `docs/qa/osmu-live-walk-20260903/v70-inbox-1024.png`를 직접 열어 제목 아래 실질 본문이 없는데 승인 단추가 활성이고 경고가 없는 기존 결함을 관찰했다.
- 수정 뒤 운영 화면은 배포 금지 조건 때문에 미검증이다. 소스 계약과 빌드 증거만 통과했다.

### 변경 파일과 커밋

- 기준 커밋 `3ed59b81` 이후 제품 코드, 계약 테스트, QA 기록, 구현현황, 핸드오프를 포함해 11개 파일을 변경했다.
- 주요 커밋: `693892ed`, `4a43fb34`, `fc287b2a`, `1322ecdd`, `4ae52704`, `6ba8605b`. 이 정본 갱신 커밋을 추가해 `origin/work/v70impl`에 push하고 로컬과 원격 SHA 일치를 다시 확인한다.

### 남은 이슈와 다음 액션

- QA 게이트는 아직 미통과다. 운영 배포와 머지는 이번 과제 범위에서 실행하지 않았다.
- QA 소유자가 배포된 같은 인박스 항목에서 경고 노출, 승인 단추 비활성, A 단축키 차단, 개별 승인 API 422, 일괄 승인 전체 거절을 직접 관찰해야 한다. 종료 증거는 운영 캡처와 API 응답 및 상태 불변 기록이다.
- 다음 집중 QA 명령은 `cd dashboard && npx vitest run tests/components/inbox-v70-defects.test.tsx tests/publish/approve-route.test.ts tests/api/queue.test.ts`다.
- 사용자 소유 dirty `.codex/logs/harness.jsonl`, `docs/requests/inbox/chairman-2026-09.md`는 stage하지 않고 보존했다.

## 2026-09-03 07:05 KST | Codex code-builder | v70 구현 완료, 디자인 픽셀 게이트는 열림

### 회장 요청

- 운영 승인 인박스의 빈 본문 승인, 내부 식별자, 단축키 중복, 현재 위치 부재, 내부 제품 연결 문구를 고치고, 승인 v69 시안의 상단·연결 안내·미리보기·390 필터·성과실 빈 상태를 `work/v70impl`에 구현해 전체 테스트와 push까지 요구했다.

### 지금까지 한 것

- 승인 인박스: 본문 있음은 승인 가능, 빈 문자열·공백 본문은 경고와 함께 승인 단추와 A 단축키를 차단했다. `studio-handoff`와 제품 연결 문구를 고객 언어로 바꾸고 사이드바 현재 위치를 추가했다.
- v69 지정 항목: 사이드바 분수 제거, 검토·일정 우측 유틸 이동, Threads 이름과 카운터 분리, 390 필터 한 줄 스크롤, 성과실 `미수집` 반복 제거, `채널 연결 0/15` 시작 스트립 통합을 구현했다.
- 기존 기능: 작업물 전체, 학습 정보, AI 상태는 `작업` 메뉴에 보존했다. 발행·예약·검토 요청·플랫폼별 편집·성과 후속 행동을 유지했다. 낮은 반응 콘텐츠 자동 삭제 경로는 추가하지 않았다.
- 구현현황과 `wiki/ops/session-state.md`를 갱신했다. 기능 커밋은 `2586d312`, `c108389b`, `20e1690f`, `6d553f7b`다. 이 신선도 기록까지 포함한 마지막 push 뒤 로컬·원격 SHA 일치를 확인한다.

### 검증

- `npx tsc --noEmit`: 오류 0.
- 최종 `npx vitest run`: 225파일 1,612건 통과, 38건 조건부 제외, 실패 0. `tests/studio` 포함.
- `npm run build`: 정적 페이지 177/177. 기존 NFT 광범위 추적 경고 1건 유지.
- `npm run audit:ui-tokens`와 `design-lint.sh dashboard/src`: 위반 0.
- 로컬 production 390 측정: 방 헤더 자체 2행, 시작 스트립 1개, 필터 가로 스크롤, 문서 폭 390, 최소 조작 표적 44픽셀, 콘솔 오류 0.

### 디자인 픽셀 대조

- 시안 `docs/design/clean-frames/v69-publish-after@390.png`와 dev `/tmp/osmu-v70-studio-smoke.YbRv2r/studio-390-top.png`를 같은 390×844 크기로 둘 다 직접 열어 대조했다.
- 지정 결함의 동작은 화면에 들어갔지만 전체 픽셀 일치는 판정하지 않는다. 시안은 연결 3곳 상태이고 dev는 연결 0곳 상태라 동일 상태가 아니다.
- dev에는 시안에 없는 모바일 셸 머리줄이 한 줄 더 있으며, 시안의 단일 `콘텐츠 운영` 제목과 원형 작업 단추가 dev의 작업 공간 제목·부제·텍스트 `작업` 단추와 다르다. 발행 요약과 미리보기 카드 밀도도 시안과 차이가 있다.
- 따라서 디자인 QA 픽셀 게이트는 미통과다. 앞 보고의 `v69 화면 반영`은 지정된 6개 결함 구현을 뜻하며 시안 전체 일치를 뜻하지 않는다.

### 남은 이슈와 다음 액션

- QA 소유자가 동일한 연결 3곳·같은 본문·같은 쿠키 상태로 dev 390×844와 1024×900을 다시 캡처해야 한다. 종료 증거는 시안과 actual의 좌우 대조 이미지다.
- 같은 상태에서도 모바일 셸 머리줄, 제목·작업 단추, 발행 요약, 카드 밀도 차이가 남으면 design 단계로 회수해 시안 또는 제품 중 정본을 확정한 뒤 build를 다시 열어야 한다. 이 차이는 기존 기능 보존 범위를 넘을 수 있어 워커가 임의로 삭제하지 않는다.
- 실제 고객 OAuth, 외부 발행, 운영 데이터, 머지, 배포는 미검증이며 실행하지 않았다.
- 사용자 소유 dirty `.codex/logs/harness.jsonl`, `docs/requests/inbox/chairman-2026-09.md`는 stage하지 않고 보존했다.

## 2026-09-03 05:53 KST | Codex code-builder | v69copy 운영 UI 결함 build 최종 인계

### 지금까지 한 것

- 기준: 회장이 지정한 `work/v69copy`, `pipeline-state.osmu.md`의 `approved-for-build`, ADR-004·005·006, 운영 캡처 4장, 승인 v68 프로토타입, DESIGN.md v37을 따랐다. `work/v69fix`는 건드리지 않았다.
- 작업 공간 표시: 빈 이름과 이메일 형태 이름을 `기본 작업 공간`으로 바꾸는 공용 표시 함수를 추가하고 스튜디오, 성과 요약, 학습 정보에 적용했다.
- 배너: 쿠키 동의 배너의 우하단 고정 배치를 제거하고 문서 흐름에 넣어 담당 패널 입력과 전송 단추를 가리지 않게 했다.
- 채널 문구: 탭, 상태, 분석 지표, 자동화, 콘텐츠 가이드, 키워드, 저장 동작, Instagram·메시지 채널의 고객 라벨을 한국어화했다.
- 연결 안내: 공식 OAuth 연결 단추와 다계정·재연결 기능을 유지했다. 직접 입력은 `고급 연결 정보`를 펼친 뒤에만 보이며 기본 안내에서 개발자 콘솔 절차를 제거했다.
- 문구 규율: 고객 UI 문자열의 긴 대시를 AST 계약으로 금지하고 스튜디오 상단 내부 AI 실행 이름을 고객 상태 문구로 교체했다.
- 구현·검증·상세 문서 커밋: `9499d275`, `65074316`, `51227be6`, `429b3404`, `b1785c5d`, `9fb3a761`, `4185cb12`, `0d4b61ac`. 이 루트 핸드오프 갱신 커밋이 그 위에 있다.

### 검증

- `cd dashboard && npx tsc --noEmit`: 오류 0.
- `npx vitest run`: 223파일 1,600건 통과, 38건 조건부 제외, 실패 0.
- `npm run build`: 성공, 정적 페이지 177/177. 기존 NFT 광범위 추적 경고 1건 유지.
- `design-lint.sh dashboard/src`: 디자인 토큰 위반 0.
- 종료형 production server와 브라우저에서 `/channels/threads` HTTP 200 뒤 로그인 화면 이동을 관찰했다. 서버와 브라우저는 종료했다.
- 상세 근거: `docs/구현현황.md`, `docs/qa/qa-tracker.md`, `wiki/ops/session-state.md`, 로컬 `.gstack/qa-reports/qa-report-localhost-2026-09-03.md`.

### 남은 이슈

- `git push origin work/v69copy`는 실행 정책이 승인을 요구했지만 이 세션은 승인 요청 금지 모드라 명령 시작 전에 차단됐다. 읽기 전용 `git ls-remote --heads origin work/v69copy` 결과 원격 브랜치는 없다.
- worktree에 Supabase 공개 설정과 고객 세션이 없어 로그인 상태의 연결·스튜디오·성과·생성 화면을 수정 후 직접 대조하지 못했다.
- 실제 외부 OAuth 동의, 외부 게시, 운영 DB, 머지, 배포는 미검증이며 실행하지 않았다.
- 사용자 소유 dirty `.codex/logs/harness.jsonl`, `docs/requests/inbox/chairman-2026-09.md`는 복원해 보존했고 stage하지 않았다.

### 다음 액션

- push 권한이 있는 부모 컨트롤러가 현재 브랜치 tip을 `git push origin HEAD:work/v69copy`로 전송하고 `git rev-parse HEAD`와 원격 SHA 일치를 확인한다.
- QA 소유자가 로그인 상태 운영 또는 동일 조건 스테이징에서 1024 너비로 연결·스튜디오·성과·생성 화면을 재캡처한다. 종료 증거는 이메일 노출 0, 배너 겹침 0, 기존 영어 라벨 0, 공식 연결 단추 활성, 내부 실행 이름 0이다.
- 머지와 배포는 별도 QA 승인 전 실행하지 않는다.

## 2026-09-03 02:07 KST | Codex code-builder | v68 생성실·성과실 build 최종 인계

### 지금까지 한 것

- 기준: `pipeline-state.osmu.md` 최상단 `stage: build`, `status: approved-for-build`와 핀된 v68 프로토타입, 와이어프레임, DESIGN.md v37, clean frame 24장을 따랐다.
- 생성실: 기존 형식 선택, 한 번에 한 질문, 학습 정보, A/B/C 구조 초안, 공유 AI 승인 대기, 편집실 이동을 유지하며 v68 요약·비교 레이아웃과 모바일 담당 패널을 구현했다.
- 성과실: `/performance`의 홈 리다이렉트를 제거하고 네 번째 전용 방을 렌더했다. 홈의 성과 지표, 채널 필터, 잘된 콘텐츠, 제안, 답글 후보, 낮은 반응 검토는 그대로 보존했다.
- 흐름: 네 방 공용 4단계 머리줄과 발행 성공 뒤 `성과실에서 결과 보기` 링크를 추가했다. 낮은 반응 콘텐츠는 후보만 제시하며 자동 삭제 단추와 호출을 만들지 않았다.
- 커밋: `e9c54a22`, `1f066a02`, `ba67cd83`, `ef5ff0ae`. 현재 브랜치는 `work/v68rooms`다.

### 검증

- `npx tsc --noEmit`: 오류 0.
- `npx vitest run tests/components tests/publish tests/api tests/brand`: 107파일 832건 통과, 2건 조건부 제외, 실패 0.
- `npm run build`: 성공, 정적 페이지 177/177. 기존 NFT 광범위 추적 경고 1건 유지.
- `design-lint.sh dashboard/src`: 토큰 위반 0.
- 승인 시안과 같은 뷰포트 컷으로 생성실·성과실 각각 1024x900, 390x844를 실제 렌더했다. 최종 허용 캡처 로그의 브라우저 오류는 0이다.
- 구현현황과 상세 근거는 `docs/구현현황.md` 최상단과 `wiki/ops/session-state.md` 최상단에 기록했다.

### 남은 이슈

- `git push origin work/v68rooms`는 실행했으나 현재 실행 정책이 승인 필요 명령으로 차단했다. 원격은 `aa6bb843`, 로컬 HEAD는 `ef5ff0ae`이며 원격이 4커밋 뒤다.
- QA 단계 승인, 머지, 운영 배포는 실행하지 않았다.
- 실제 고객 OAuth, 운영 데이터베이스, 외부 게시물과 운영 화면은 미검증이다.
- 사용자 소유 dirty `.codex/logs/harness.jsonl`, `docs/requests/inbox/chairman-2026-09.md`는 건드리거나 stage하지 않았다.

### 다음 액션

- push 권한이 있는 부모 컨트롤러가 로컬 커밋을 `origin/work/v68rooms`로 전송하고 원격 SHA를 확인한다.
- QA 소유자가 실제 고객 세션과 운영 데이터로 생성실→편집실→발행실→성과실을 검증하고, 사람 승낙 없는 낮은 반응 콘텐츠 삭제가 없음을 재확인한다.
- 머지와 운영 배포는 QA 승인 전 실행하지 않는다.

## 2026-09-03 00:55 KST | Codex product-designer | v68 생성실·성과실 디자인 후보 최종 인계

### 회장 요청

- v67 셸을 계승해 생성실과 성과실의 프로토타입, 와이어프레임, 전체 상태 흐름, DESIGN.md 변경을 완성하고, 두 방과 여섯 상태와 두 폭의 clean frame 24장 및 감사 JSON을 만든 뒤 `work/v68rooms`에 push하라고 요청했다. 제품 코드는 수정하지 말라고 명시했다.

### 지금까지 한 것

- `docs/prototype/osmu-v68-create-performance-hub-gpt-codex-20260903-0022.html`, v68 와이어프레임, `docs/user-flow.md` v68 증분, `DESIGN.md` v37, 디자인 리뷰를 만들었다.
- 생성실의 형식 선택, A/B/C 구조 초안, 학습 정보, 공유 AI 승인 대기, 편집실 이동을 보존했다.
- 홈의 핵심·보조 성과 지표, 채널 필터, 잘된 콘텐츠, 제안, 답글 후보, 자동 반응, 낮은 반응 콘텐츠 직접 검토를 성과실 후보에 보존했다. `/performance`가 현재 홈으로 이동하는 임시 경로임을 확인했다.
- Chrome으로 clean frame 24장을 생성했다. 1024×900 12장과 390×844 12장이다. 감사 결과 가로 넘침 0장, 콘솔 오류 0건, 44px 미만 조작 표적 0개, 검수 막대 노출 0장이다.
- `pipeline-state.osmu.md` 최상단에 v68 `awaiting-approval`, `candidate-only` 블록을 추가했다. `dashboard/src/**` 변경은 0건이다.

### 남은 이슈와 충돌

- 성과실 정보구조는 디자인 산출물에서 A 전용 방을 추천하고 B 홈 통합과 함께 회수 항목으로 남겼다. `wiki/ops/session-state.md`의 최신 code-builder 기록은 A가 확정됐다고 해석하지만, 이 디자이너 세션에는 회장의 A 확정 응답이 없다. 부모 컨트롤러가 실제 승인 발화를 기준으로 정리해야 한다.
- design stage는 승인되지 않았다. build와 제품 라우팅 변경을 시작하면 안 된다.
- `git push origin work/v68rooms`는 Codex 전역 명령 정책이 승인을 요구했고 이 세션은 `AskForApproval=Never`라 실행 전 차단됐다. 원격은 `b2e0c036`, 로컬 HEAD는 `2a1733dd`이며 로컬이 4커밋 앞서 있다.
- 운영 OAuth, 실제 성과 데이터, 제품 actual frame과의 matched pair는 미검증이다.
- 남은 dirty는 자동 하네스 로그 `.codex/logs/harness.jsonl` 하나이며 산출물 커밋에서 제외했다.

### 다음 액션

- 부모 컨트롤러가 성과실 A 전용 방 또는 B 홈 통합의 회장 확정 여부를 확인한다.
- 디자인 산출물을 재검증하고 `/approve design`으로 승인한 뒤에만 v68 `approved_artifacts`를 핀한다.
- push 권한이 있는 컨트롤러가 로컬 HEAD를 `origin/work/v68rooms`로 전송하고 원격 SHA 일치를 확인한다.
- 승인 뒤 build는 같은 seed, 상태, 뷰포트의 actual frame 24장을 만들고 clean frame과 matched pair로 대조한다.

## 2026-09-02 11:14 KST | Codex code-builder | v67 발행실 집중 필터 최종 인계

### 무엇을 어디까지 했나

- 회장이 v67 시안에는 있지만 제품에 빠진 발행실 플랫폼 집중 필터를 지적했고, `전체 7곳`과 일곱 플랫폼 칩, 보기 전용 상태, 계약 테스트, 두 폭 실렌더, 원격 push를 요구했다.
- `PlatformFocusFilter`를 추가해 전체는 카드 7장, 개별 플랫폼은 1장만 보이게 했다. 필터 전환은 본문, 발행 대상, 계정 선택을 바꾸지 않는다.
- 미리보기, 직접 편집, 첫 댓글, 즉시·예약 발행, 계정 선택과 네 방 흐름을 유지했다.
- 시안과 dev 1024 이미지를 모두 열어 픽셀 대조했다. 활성 칩의 꽉 찬 파란색 이탈을 찾아 시안의 파란 테두리형으로 보정했고 최종 실렌더를 다시 생성했다.

### 검증했나

- 지정 전체 Vitest: 64파일 553건 통과, 2건 조건부 제외, 실패 0.
- 시각 보정 후 집중 회귀: 2파일 32건 통과. TypeScript 오류 0, design lint 위반 0, production build 177/177.
- 1024·390: 칩 8개, 전체 7장, X 1장, 입력·선택 보존, 가로 넘침 0, 콘솔 오류 0. 증거는 `docs/qa/osmu-v67-platform-focus-evidence-20260902/`.

### 남은 이슈·블로커

- `git push origin work/v67build`는 외부 쓰기 승인을 요구하는 현재 실행 정책에서 차단됐다. 원격 SHA는 `576945e1`이며 로컬 최종 커밋은 후속 상태 커밋으로 확정한다.
- 실제 외부 게시물과 운영 고객 데이터 경로는 QA 소유며 이 build에서 미검증이다. 머지·배포는 시도하지 않았다.
- 사용자 소유 dirty `.codex/logs/harness.jsonl`과 `docs/requests/inbox/chairman-2026-09.md`는 수정·stage하지 않고 보존했다.

### 다음 액션

- push 권한이 있는 컨트롤러가 `work/v67build`를 원격에 전송하고 원격 SHA가 로컬 HEAD와 같은지 확인한다.
- QA 소유자가 운영 배포 후 실제 고객 세션에서 필터 왕복과 발행 대상·본문 보존을 재검증한다.

## 2026-09-02 09:29 KST | Codex code-builder | v67 build 종료 훅 보강

### 무엇을 어디까지 했나

- 회장이 지정한 보존 커밋 `576945e1`과 이전 보존점 `3bb6b787`에서 `work/v67build`를 이어받았다.
- 계정 fallback 타입, 플랫폼 caption 저장·복원, 계정 로딩·미연결 상태, X 280가중 문자 경계, `twitter-text` ESM 브라우저 import를 보수했다.
- qa-tracker 최상단 v67 NG 5행을 build PASS로 전환하고, `docs/구현현황.md`와 `wiki/ops/session-state.md`를 갱신했다.
- v67 프로토타입과 현재 dev 실화면을 편집실·발행실, 1024·390로 좌우 배치한 `docs/qa/osmu-v67-prototype-dev-comparison-v1-gpt-codex.html`을 만들었다.

### 검증했나

- `cd dashboard && npx tsc --noEmit`: 오류 0.
- `npx vitest run tests/publish tests/api tests/components`: 89파일, 684건 통과, 2건 조건부 제외, 실패 0.
- `npm run build`: 성공, 정적 페이지 177/177. 기존 NFT 광범위 추적 경고 1건 유지.
- `design-lint.sh dashboard/src`: 토큰 위반 0.
- 종료형 Next.js와 Chromium: OAuth 연결 단추·동일 출처 callback, 생성→편집→두 계정 발행→성과 클릭. 1024·390 가로 넘침 0, 표시 이름 입력 0, 연결 계정 4곳, 발행 요청 2건, 콘솔 오류 0.

### 남은 이슈·블로커

- `git push origin work/v67build`는 승인 필요 명령을 허용하지 않는 현재 실행 정책에서 두 번 거절됐다. 로컬 제품·증거 커밋은 보존됐고 원격은 `576945e1`에 머물러 있다.
- 실제 외부 OAuth 동의, 외부 플랫폼 게시물, 운영 데이터베이스, 운영 배포는 미검증이다. PR 병합과 배포는 요청대로 시도하지 않았다.
- 기존 dirty `.codex/logs/harness.jsonl`, 자동 수집 요청 원문, 출처 불명 sidebar 캡처 2장은 이번 커밋에서 제외한다.

### 다음 액션

- push 권한이 있는 컨트롤러가 `git push origin work/v67build`를 실행하고 원격이 로컬 최신 커밋을 포함하는지 확인한다.
- QA 소유자는 실제 고객 OAuth와 운영 데이터로 연결→생성→편집→발행→성과를 재검증하고 외부 게시물 URL과 콘솔 오류 0을 종료 증거로 남긴다.
- 화면 비교는 `docs/qa/osmu-v67-prototype-dev-comparison-v1-gpt-codex.html`을 열어 확인한다. 새로운 선택 요청은 없으며 현재 build는 프로토타입 준수 상태를 보여 주는 단계다.

## 2026-09-02 05:24 KST | Codex 메인 컨트롤러 | v67 디자인 승인 후보 수렴
## 2026-09-02 06:36 KST | Codex → Claude 인계 | v67 디자인 승인 후보

### 무엇을 어디까지 했나

- 회장이 이후 루프를 Claude에서 돌리기로 확정했다. 인계 기준은 이 파일과 `pipeline-state.osmu.md`, Claude pane `openclaw-auto:0.0`이다.
- Codex는 v65·v66 독립 시안을 Design Score C로 반려한 뒤, 승인본 v64 셸에 통합한 v67 후보를 product-designer에게 재작업시켰다.
- `DESIGN.md` v36, v67 단일 라우팅 허브, v65·v66 증분 명세, 디자인 리뷰 B+ 88/100, 24개 clean frame과 24개 stamp를 메인 브랜치에 통합했다.
- 최신 원격 SHA는 `364dcef8`, PR #41 CI run `33558465126`은 success다.
- Codex Goal은 디자인 승인 부재가 3회 반복되어 `blocked`로 닫았다. Claude가 별도 `/goal`로 재개하면 된다.

### 남은 이슈·블로커

- `pipeline-state.osmu.md` 최상단은 `stage: design`, `status: awaiting-approval`, v67 `approval_status: candidate-only`다.
- `/approve design` 뒤 v66 미구현과 코드리뷰 MAJOR 10건을 구현해야 한다. 주요 항목은 표시 이름 읽기 전용화, 플랫폼별 실제 필드·제한, 계정 상태 보존, 하드 제한 발행 차단, 집중 필터, v65 런타임 상태와 글 형식 계약이다.
- build 뒤 동일 seed·state·viewport의 actual frame 24조합을 만들어 matched-pair를 닫아야 한다.
- 전체 QA, 원격 CI, 운영 로그인부터 실제 외부 채널 발행까지는 미검증이다.

### 다음에 칠 명령

```text
/approve design
/goal OSMU v67 승인 입력으로 MAJOR 10건 구현, 독립 코드리뷰, QA, 최신 CI, 운영 실경로 검증까지 완료
```

승인 직후 build는 별도 worktree의 code-builder 한 명이 소스를 소유하고, code-reviewer와 qa-verifier는 병렬 읽기·검증 판으로 돌린다.

### 검증했나

- design-review: B+ 88/100.
- clean frame: 24/24, ready 누락 0, console error 0, 가로 넘침 0, 44px 미만 조작면 0, 검수 제어 노출 0.
- frame purity, prototype coverage 24/24, `git diff --check`: PASS.
- 최신 원격 CI run `33558465126`: success.
- 운영 실경로: 미검증.

## 2026-09-02 06:05 KST | Codex 메인 컨트롤러 | 디자인 승인 재확인

### 무엇을 어디까지 했나

- `pipeline-state.osmu.md`의 최상단을 재확인했다. v67은 `stage: design`, `status: awaiting-approval`, `approval_status: candidate-only`다.
- 최신 원격 SHA `364dcef8`의 CI run `33558465126`이 성공 상태임을 다시 확인했다.

### 남은 이슈·블로커

- `/approve design` 기록이 없다. 단계 게이트상 제품 소스 개발은 시작할 수 없다.
- 승인 뒤 코드리뷰 MAJOR 10건 구현, 독립 리뷰, QA, 원격 CI, 운영 실경로 검증이 남아 있다.

### 다음에 칠 명령

```text
/approve design
```

### 검증했나

- 파이프라인 상태: 직접 확인.
- 최신 원격 CI: success 직접 확인.
- 운영 실경로: 미검증.

## 2026-09-02 06:04 KST | Codex 메인 컨트롤러 | v67 디자인 승인 후보 수렴

### 무엇을 어디까지 했나

- 독립 감사에서 v65·v66이 승인본 v64 셸을 상속하지 않아 Design Score C로 반려된 사실을 확인했다.
- product-designer가 승인 정본 v64 셸을 유지하고 v65 편집실과 v66 발행실을 한 클릭 라우팅 허브 v67로 통합했다. 제품 소스는 수정하지 않았다.
- `DESIGN.md` v36, v65·v66 증분 디자인 명세, 디자인 리뷰 보고서, 1024·390의 두 방 여섯 상태 clean frame 24장과 스탬프 24개를 만들었다.
- 직접 픽셀 검수 피드백을 반영해 44px 선택 히트박스 안 표시 체크를 20px로 줄였고, 390 발행실에서는 네 발행 행동을 카드보다 먼저 두고 담당 패널 152px를 계속 보이게 했다.
- `pipeline-state.osmu.md`에 v67을 `design_canonical_candidate`로만 핀했다. `/approve design` 전 승인 정본이나 제품 구현 기준은 아니다.
- active goal은 디자인 승인 뒤 개발, 코드리뷰, QA, 원격 CI, 운영 실경로 검증까지 연쇄 진행하도록 유지 중이다.

### 남은 이슈·블로커

- 디자인 게이트 승인만 남았다. matched-pair actual frame은 build 뒤 같은 seed, state, viewport로 촬영해야 하므로 현재는 design frame만 준비됐다.
- v67 승인 뒤에도 v66 미구현과 코드리뷰 MAJOR 10건이 남는다. 표시 이름 읽기 전용화, 플랫폼별 실제 필드와 제한, 계정 상태 보존, 하드 제한 발행 차단, 집중 필터, v65 런타임 상태와 글 형식 계약을 구현해야 한다.
- 운영 제품 구현, 고객 데이터, 실제 외부 채널 발행은 미검증이다.

### 다음에 칠 명령

```text
/approve design
```

승인 시 v67 허브, DESIGN.md v36, v1.0.0 증분 명세를 build 입력으로 핀한다. build 뒤에는 캡처 감사와 같은 24조합으로 actual frame을 만들고 matched-pair 대조를 닫는다.

### 검증했나

- clean frame 24장, 스탬프 24개, 감사 JSON 1개 생성.
- 감사 결과: ready 누락 0, console error 0, 가로 넘침 0, 44px 미만 상호작용 대상 0, review control 노출 0, wide rect 0.
- `check-frame-purity.sh` 통과, `prototype-coverage-check.sh` 24/24 통과, `git diff --check` 통과.
- 대표 1024 편집실, 1024 발행실 overflow, 390 발행실 normal 픽셀 직접 확인. Design Score B+ 88/100.
- 로컬 `npm run test:publish`: 27파일 258건 통과, 2건 제외.
- 로컬 `npx tsc --noEmit`: 오류 0.
- 로컬 `npm run build`: 성공. 기존 NFT tracing 경고 1건.
- PR #41 최신 HEAD `364dcef8`, CI run `33558465126`: success. TypeScript, build, PostgreSQL schema·seed·RLS, migration concurrency, 전체 테스트를 통과했다.
- 운영 실경로: 미검증.

## 2026-09-02 04:33 KST | Codex 메인 컨트롤러 | v65·v66 디자인 승인 대기

### 무엇을 어디까지 했나

- 회장의 `다 진행하고 보고`를 primary로 삼고 active goal을 걸었다. 상태 정합화, 코드리뷰, QA 준비를 병렬 실행했다.
- v64만 현재 승인본이며 v65 편집실은 디자인 승인 기록 없이 구현됐고, v66 발행실은 디자인만 있음을 확정했다.
- `pipeline-state.osmu.md`를 `stage: design`, `status: awaiting-approval`로 재개했다. 승인 후 구현 기준은 v64 전체 정본 + v65 편집실 증분 + v66 발행실 증분이다.
- 현 브랜치를 원격에 push하고 초안 PR #41을 열었다. 최신 HEAD `136a1c64`의 CI run `33549746071`은 성공했다.
- 승인 후 구현할 원문 `docs/prototype/osmu-publishfield-v66-gpt-codex-20260901-0813.html`을 열었다.

### 남은 이슈·블로커

- 하드 블로커는 `/approve design` 하나다. 현 헌법상 메인 컨트롤러가 자가 승인할 수 없다.
- 독립 리뷰에서 MAJOR 10건을 확인했다. v65 런타임 state 미연결, 글 저장 format 오류, v66 표시 이름 편집 잔존, 플랫폼별 필드·제한 미분리, 금지 용어 잔존, 집중 필터 미구현이다.
- 머지·배포·실 고객 세션 QA는 build·QA 승인 전이라 미실행이다.
- 사용자 소유 dirty 파일 `.codex/logs/harness.jsonl`, `docs/requests/inbox/chairman-2026-09.md`는 보존했다.

### 다음에 칠 명령

```text
/approve design
```

승인 직후 메인 컨트롤러가 `code-builder` 1명을 별도 worktree에 배차하고 `code-reviewer`, `qa-verifier`를 병렬로 돌린다. 종료 증거는 MAJOR 10건 해소, 전체 회귀, 390·1024 실렌더, 최신 CI, 실 고객 세션 E2E다.

### 검증했나

- `npm run test:publish`: 27파일 258건 통과, 2건 제외.
- `npx tsc --noEmit`: 오류 0.
- `npm run build`: 성공. 기존 NFT tracing 경고 1건.
- PR #41 CI run `33549746071`: success.
- 운영 실경로: 미검증.

## 2026-09-01 07:48 KST | 편집실 v65 디자인 증분

### 무엇을 어디까지 했나

- 승인된 `docs/prototype/openclaw-auto-4room-v64.html`과 DESIGN.md v33, 거버넌스, 회장 원문, 현재 편집실 구현을 정독했다.
- 제품 코드는 수정하지 않았다. DESIGN.md v34, 편집실 v65 프로토타입, 와이어프레임, 유저 플로우 증분, R-S10-31~38·41 대조 문서를 작성했다.
- 편집실은 콘텐츠 형식만 소유하고 플랫폼과 채널별 문구는 발행실이 소유하도록 분리했다. 글 전체 자유 편집, 카드 안 직접 편집과 위치 이동, 단위가 있는 한국어 라벨, 자동 저장, `발행실로 이동` 단일 주 행동을 정본에 반영했다.
- 로컬 커밋은 `66ad58dd`, `c6b4eada`다. 종료 훅 대응 핸드오프 갱신은 후속 커밋에 기록한다.

### 남은 이슈·블로커

- `git push origin work/editroom`은 실행 정책이 승인 필요로 차단했다. 이 세션은 승인 요청이 금지되어 원격 브랜치는 미생성·미검증이다.
- pipeline design pin은 v64다. v65 집중 프로토타입과 DESIGN.md v34를 디자인 게이트에서 확인한 뒤 핀을 갱신해야 후속 구현 기준이 된다.
- 전용 디자인 리뷰 스킬이 현재 세션에 없어 자동 Design Score는 미검증이다. 수동 판정은 B+다.
- `.codex/logs/harness.jsonl`은 기존 하네스 변경이므로 커밋에서 제외했다.

### 다음에 칠 명령

```bash
git push origin work/editroom
```

push 권한이 있는 컨트롤러가 실행한다. 종료 증거는 원격 `work/editroom`에 핸드오프 후속 커밋까지 보이는 것이다. 그 뒤 `/approve design` 검증으로 v65와 DESIGN.md v34의 핀 정합을 확인한다.

### 검증했나

- `cd dashboard && npx tsc --noEmit`: 오류 0.
- `cd dashboard && npx vitest run tests/publish tests/api`: 최종 단독 실행 67파일, 519건 통과, 2건 제외, 실패 0.
- Chromium 실렌더: 글·카드뉴스·영상·음악의 정상 상태와 빈 상태·불러오는 중·오류·긴 내용을 1024·390 총 16조합 확인했다. 가로 넘침 0, 자바스크립트 오류 0, 정상 상태 활성 주 버튼 1개, 차단 상태 0개.
- 제품 운영 반영: 미검증.

## 2026-09-01 05:20 KST 위임 하네스 결함과 배포 복구

- 테넌트 접속 이력(b6e0b4aa) push 하고 배포했다. run 33435731993 success. services=openclaw-dashboard-osmu.
- 워커 3판(tenantlog, r2store, connectux)은 이미 끝나 있었다. 완료 감시를 안 걸어 세션이 그것을 몰랐다.
- 워커가 매번 push 에 실패한 이유: 워커 샌드박스 기본값에 네트워크가 없다.
- 배포 워크플로 이미지 빌드를 서비스별 순차로 바꿨다. VM 7.8GiB 인데 게이트웨이 빌드가 서비스마다 heap 8GiB 를 잡아 병렬이면 OOM.
- 남은 상류 결함: 게이트웨이 전체 빌드는 extensions/qwen-portal-auth 의 QWEN_OAUTH_MARKER 미정의로 실패한다. 대시보드 배포에는 영향 없다.
- 회장 승인 대기: 발주 래퍼에 완료 마커와 네트워크 기본값을 넣는 수정이 자동 승인 정책에 막혔다.


## 2026-09-01 04:26 KST (Opus, OSMU 라인)

핸드오프 기준: 이 파일. 상세는 `session-state.osmu.md`.

현재 작업: 회장 질문 5건 처리. 연결 미판정의 진짜 원인을 값으로 잡아 고쳤다.

원인 확정(운영 실측):
- 회장 테넌트 Threads 계정 2건. 기본계정 1건인데 그 행에 장기 토큰 만료 시각이 없다.
  새로 연결한 계정은 만료 2026-10-30 으로 정상인데 기본이 아니다.
- Threads·Instagram·Facebook 은 만료 시각이 없으면 재연결 필요로 판정한다. 그래서 저장은
  됐는데 화면은 계속 미연결이었고 발행 대상도 죽은 계정을 가리켰다.
- 고침: 기존 기본계정이 못 쓰는 상태면 새로 연결한 계정으로 기본을 넘긴다(`41ac094d`).

만진 파일:
- `dashboard/src/lib/channel-accounts.ts` (기본계정 승격), 회귀 테스트 신규
- `dashboard/src/app/api/operator/customers/route.ts` (판정 입력 3값 노출)
- `dashboard/src/app/studio/page.tsx` (`승인 인박스로 보내기` → `검토 요청하기`)
- 편집실 글 문단 편집 마무리(`f4ad3326`)
- `~/.claude/harness/bin/md-to-web.sh` (다크 모드에서 다이어그램이 안 보이던 것 수정)

검증: `npx tsc --noEmit` 0. 배포 33430014377 success. 전량 테스트는 6파일 실패인데 전부
로컬 Postgres 미가동 의존 판이다.

진행 중 위임(병렬 2판):
- `osmu-r2store0901` 종료. R2 저장 계층 커밋 완료.
- `osmu-tenantlog0901` 진행 중. 별도 worktree `/tmp/osmu-wt-tenant` 에서 돈다.

다음 액션:
1. 회장이 Threads 연결을 한 번 더 누르면 기본계정이 승격돼 연결됨으로 바뀐다. 확인.
2. `osmu-tenantlog0901` 회수와 배포.
3. 편집실 나머지 항목 순차 발주.

## 2026-09-01 03:26 KST (Opus, OSMU 라인)

핸드오프 기준: 이 파일. 상세는 `session-state.osmu.md`.

현재 작업: 회장 질문 세 건(식별자 차이, 인프라 문서, R2) 처리와 편집실 글 편집 마무리.

만진 파일:
- `dashboard/src/components/studio/StudioRooms.tsx`, `EditPreview.tsx`, `EditPreview.module.css`,
  `StudioCommandPanel.tsx`, `dashboard/src/app/studio/page.tsx` (글은 문단으로 편집)
- `dashboard/src/app/api/operator/customers/route.ts` (연결 판정 입력 3값 노출, 자격증명 제외)
- `dashboard/tests/studio/studio-fe2-rooms.test.tsx` (도구 이름 변경 반영)
- `wiki/5-hubs/hub-eng/architecture/system-architecture.md` (권한 절, 미디어 절)

검증: `npx tsc --noEmit` 은 R2 워커가 쓰는 중인 `tests/lib/media-store.test.ts` 만 오류.
편집실 계약 19건 통과, 관련 UI 18파일 154건 통과. 전량 실행은 6파일 실패인데 넷은 로컬 DB
연결 끊김, 둘은 워커 작업 중 파일이다. `osmu-media` 버킷 쓰기·읽기·삭제 왕복은 직접 확인.

막힌 것:
- 회장 Threads 연결이 저장은 됐는데(계정 2건, 2026-09-01 01:32 KST) 판정은 미연결이다.
  원인 값(상태, 기본 계정, 만료 시각)을 운영자 조회에 노출했고 배포 후 확인해야 한다.
- VM SSH 가 로컬 네트워크에서 닿지 않아 컨테이너 로그를 못 본다. 배포는 self-hosted runner 로 정상.

진행 중 위임: `osmu-r2store0901`(R2 저장 계층). 커밋 `fd33b653`, `01e0f1bd`.

다음 액션:
1. R2 워커 회수, 전량 테스트, 배포.
2. 배포 후 운영자 조회로 연결 판정 3값 확인, 원인 확정.
3. 편집실 나머지 항목 순차 발주.

## 2026-09-01 01:22 KST (Opus)

한 일:
- Threads 테스터 초대 수락 확인. 콘솔에서 `대기 중` 표기가 사라졌다.
- 초대 수락을 우리 앱 안에서 끝내는 것은 불가로 판정했다. Meta 자산이고 사용자 본인 Threads
  로그인이 필요하며, 그 페이지는 로그인 리다이렉트와 교차출처 정책으로 임베드가 막힌다.
  없애는 유일한 길은 App Review 통과다.
- **정정**: 에셋은 R2 가 아니라 컨테이너 영속 볼륨 `osmu-data:/app/data` 에 저장돼 있었고
  Meta 는 `/api/images/deliver/<서명토큰>` 으로 직접 가져간다. R2 는 발행의 전제가 아니다.
  앞서 올린 "R2 미설정이라 보관되지 않는다" 결정 요청은 틀렸다. 실수 원장에 기록했다.
- Cloudflare 계정에 `osmu-media` 버킷 생성(S3 API). 공개 URL 설정은 콘솔이 필요해 미완이고,
  위 정정 때문에 급하지 않다. 보유 토큰은 터널 전용이라 R2 권한이 없다.
- R2 설정 API 가 시크릿 키를 평문으로 브라우저에 내려주던 것을 막고 회귀 테스트를 붙였다.
- OAuth 왕복 시도: 동의 화면은 권한 5개로 정상. curl 로 시작한 콜백은 브라우저 state 불일치로
  정상 거절됐다(보안 검사 작동). 왕복 완주는 회장 로그인 세션에서만 가능하다.

위임:
- `osmu-editroom0901b` 진행 중. 편집실·발행실 미충족 10건.
- 직전 `osmu-editroom0901` 은 승인 프로토타입 핀 부재로 빈손 종료. `pipeline-state.osmu.md` 에
  v64 를 핀하고 재발주했다.

남은 이슈:
- Threads 연결 왕복 완주 미확인.
- App Review 제출 조건: 권한별 성공 호출 증거와 심사용 영상.
- 전건 대조표 미충족 잔여. 가장 큰 덩어리가 편집실·발행실 화면 구조다.
- 로컬 데이터베이스 연결이 끊겨 있어 전량 테스트 중 DB 의존 판 10건이 실패한다(코드 회귀 아님).

다음 액션:
1. `osmu-editroom0901b` 회수, 검증, 배포.
2. 회장이 대시보드에서 Threads 연결을 눌러 왕복 완주 확인.
3. 연결 성립 후 권한별 성공 호출 증거 수집.


## 2026-08-31 23:48 KST (Codex) 심사 전 소셜 연결 안내 build

- 기반: 회장이 지정한 과제, `wiki/거버넌스/결정.md` ADR-004, `wiki/거버넌스/실수.md` 최신 기록,
  `wiki/5-hubs/hub-eng/architecture/system-architecture.md` OAuth 절, 현행 readiness와 연결 컴포넌트.
- 구현: readiness 선택형 `guidance` 계약, Threads와 Instagram의 서로 다른 초대 수락 링크,
  중립 안내 단계, 연결 단추 활성 유지, 초대 미수락 사람 말 변환, 실패 때 같은 링크 재노출.
- 보존: 계정 전환 도움말, 팝업 선점, origin 검증, 연결과 발행 상태 분리, readiness 장애 fail-closed.
- 커밋: `ec092a89`.
- 검증: 신규 계약 집중 Vitest 3파일 40건, 전체 Vitest 208파일 1,567건, TypeScript 오류 0,
  프로덕션 build 정적 페이지 177개, design lint 토큰 위반 0.
- 미검증: 운영 배포, 실제 Threads와 Instagram 초대 수락, 실제 OAuth 왕복.
- 출고 상태: 구현 커밋 `ec092a89`, 후속 계약·문서 커밋 `45b75f7c`. 로컬 HEAD는 원격보다 3개
  커밋 앞서 있다. `git push origin feat/design-system-and-missing-features`는 실행 정책이 승인 필요로
  차단했지만 이 세션은 승인 요청이 금지돼 원격 반영하지 못했다. 원격 HEAD는 `88407d09`로 관찰했다.
- 다음 액션: 푸시 권한이 있는 컨트롤러가 동일 브랜치를 push한 뒤 QA가 실제 OAuth 왕복을 검증한다.

## 2026-08-31 23:20 KST (Opus) 정정과 추가

- **정정**: 앞 기록이 초대 수락을 제품 흐름처럼 적었다. 그것은 App Review 통과 전에만 있는 한시 절차다.
  회장 지적으로 ADR-006 을 세웠다. 심사 전에는 화면이 링크까지 안내하고, 심사 통과가 이 절차를 없앤다.
- **정정**: 운영 화면에서 네 방을 확인했다고 볼 뻔했으나, 운영자 토큰으로 접속하면 고객 Studio 가 아니라
  운영자 관리 화면이 뜬다. 네 방이 모두 같은 숫자를 낸 것이 그 신호였다. 운영 고객 화면은 여전히 미검증이다.
  운영 Studio 는 Supabase 회원 JWT 만 받는다.
- 진행 중 위임: `osmu-connectux0831`(심사 전 안내 UX). 다음 대기: `/tmp/codex-editroom.md`(편집실·발행실 미충족 10건).
- 남은 개발: 전건 대조표의 미충족 38건 중 이번 턴에 회귀·시드·탐침 4건 해소. 나머지는 편집실·발행실 화면 구조가 큰 덩어리다.


## 2026-08-31 22:00 KST (Opus)

무엇까지: Threads 연결 실패 원인을 찾아 콘솔에서 처리했고, 네 방을 덮던 모달을 없앴고, 운영에 배포했다(run 33394212507 success).

- Threads 연결 원인: 회장 계정 `j.the.great.investor` 가 Meta 앱의 Threads 테스터 목록에 없었다. 등록된 것은 darkcupiding, isanghan.math, teamconnectors, zero_to_one_ai 4개뿐이었다. 콘솔에서 추가했고 상태는 `대기 중`이다.
- 남은 회장 조치: <https://www.threads.com/settings/website_permissions> 의 `초대` 탭에서 정성컴퍼니 초대를 수락한다. 수락 전에는 연결되지 않는다.
- 앱 번호 주의: `905965605850465` 는 Facebook 앱 번호가 아니라 Facebook 앱 `1553503759757107`(정성컴퍼니) 의 **Threads 앱 ID** 다. 운영 설정은 정상이다.
- 운영 OAuth 동의 화면은 테스터 계정으로 정상 렌더를 직접 확인했다(권한 5개 표시).
- 고친 것: 학습 정보 자동 모달 제거(네 방 차단 해소), 연결 준비상태 사유의 표시명, 로컬 데모 시드 외래키·기본키.
- 검증: `npx vitest run` 207파일 1,557건 전건 통과. `probe-four-room-flow.mjs` PASS(가린 모달 0). `verify-four-room-ui-e2e.mjs` PASS(20회 측정).
- 미검증: 운영 화면에서의 실제 생성. 운영 Studio API 는 Supabase 회원 JWT 만 받는다(운영자 토큰·테넌트 토큰 거부). 회장 로그인 세션이 있어야 눌러볼 수 있다.

## 2026-08-31 17:50 KST Claude 세션 (osmu 라인) Meta 심사 선행 조건 정리

핸드오프 기준: 이 파일(session-state.osmu.md).

## ★회장 지적 R-S17: "meta 심사 다 해놓지 않앗어? 왜 또 멈췄음?"

**컨트롤러가 워커 경고를 읽지 않고 회장께 넘긴 stopping short.** 실수 원장에 기록함.
워커가 "9개 권한 전체 제출은 세 가지가 끝나기 전에 하면 안 된다"고 했는데
그 셋이 무엇인지 열어 보지도 않고 "제가 읽고 안내하겠습니다"로 턴을 끝냈다.

**실제로 읽어 보니:**
| 선행조건 | 내용 | 상태 |
|---|---|---|
| 1 | 운영에 Privacy·Terms·Data Deletion 배포 | **이미 완료.** PR #40 에 함께 나갔다. 컨트롤러 실측 `/privacy` 200 `/terms` 200 `/data-deletion` 200 |
| 2 | 각 권한으로 최근 30일 내 성공한 API 호출 만들고 녹화 | 회장 테스터 등록 뒤 컨트롤러가 진행 |
| 3 | `instagram_business_manage_insights` 쓰는 화면 구현 또는 첫 제출 범위에서 제거 | **컨트롤러 몫.** codex `osmu-scope0831` 에 발주(범위에서 제거 방향) |

⇒ 셋 중 둘이 컨트롤러 몫이었고 하나는 이미 끝나 있었다. 멈출 이유가 없었다.

## ★Meta 테스터 등록 클릭 경로 (회장 몫. 문서 원문 그대로)

앱: `905965605850465` / <https://developers.facebook.com/apps/905965605850465/>

**Threads**: 왼쪽 `Use cases` → `Access the Threads API` 의 `Customize`
→ `Settings` 의 `User Token Generator` → `Add or Remove Threads Testers`
→ `App roles` 의 `Roles` → `Add people`
★역할은 일반 `Tester` 가 아니라 **`Threads Tester`** 를 선택해야 한다.

**초대 수락(빠지면 적용 안 됨)**: 초대한 Threads 계정으로 로그인 →
<https://www.threads.com/settings/website_permissions> → `Invites` → `Accept`

**Instagram**: 같은 앱 `App roles > Roles > Add people` → `Instagram Tester`
→ Instagram Professional 계정 추가

★ADR-004: **Meta 콘솔 자동 조작 금지.** 2026-07-01 계정 플래그 실사고.

## ★신설 훅이 첫날 제 일을 했다 (기록)

`delegation-governance-gate.sh` 가 codex 발주를 막았다. 오탐으로 의심했으나
**프롬프트 파일이 실제로 없었다**(앞선 명령이 승인 단계에서 죽어 heredoc 미실행).
훅이 없었으면 빈 프롬프트로 워커가 떠서 빈손으로 끝났을 것이다.
**교훈: 훅이 막으면 우회부터 생각하지 말고 훅이 본 것이 사실인지 먼저 확인한다.**
★codex-in-pane.sh 는 프롬프트를 **파일 경로**로 받는다. 파일이 없으면
 "프롬프트 파일 없음" 으로 죽는다. Write 도구로 파일을 먼저 만들어라.

## 가동중 codex 2판

| 세션 | 담당 | 산출물 |
|---|---|---|
| osmu-fullaudit0831 | 회장 세션 발화 R-S01~R-S16 전건 대조 | docs/qa/회장-세션발화-전건-대조표-2026-08-31.md |
| osmu-scope0831 | 미사용 권한 첫 제출 범위에서 제거 + 전 provider 전수 확인 | meta-app-review 문서 갱신 |

★scope 판에 못 박은 것: content_publish 는 절대 빼지 마라(제품 핵심).
 뺀 권한 때문에 깨지는 화면은 "아직 제공하지 않습니다"로 정직하게 표시. 0으로 표시 금지.

## 회수 완료 (앞선 항목)

- **실제 LLM 연동 배포 완료**(PR #40, 배포 33336853881 success).
  후보 A/B/C 가 실제 모델 생성. 실패를 템플릿으로 덮지 않음. 사용량 기록 선행.
  운영 컨테이너 실측: health 200, CLAUDE_CODE_OAUTH_TOKEN 존재, claude 2.1.197.
  ★**운영 화면에서 생성 버튼은 아직 안 눌러 봤다. 미검증.**
- 학습정보 8 + 생성실 11 대조(표 41행), 편집실 8 + 발행실 4 + 왕복 띠 제거(표 21행)
- 전체 시험 207파일 1,556건 통과 실패 0(컨트롤러 직접 실행)

## 남은 것

- **운영 화면에서 생성 버튼 실제 실행 확인**(최우선)
- 회장 세션 발화 전건 대조표 회수 → 발화 16건이 요구 단위로 다 들어갔는지 행 수 확인
- scope 판 회수 → **"지금 제출하셔도 됩니다" 한 줄 판정**을 회장께
- 테스터 등록되면 권한별 성공 호출 만들고 녹화 대본대로 진행
- 배포 스모크에 OAuth 왕복 완주 검사 추가
- 266건 대조표의 미충족 48 · 부분 60 처리

