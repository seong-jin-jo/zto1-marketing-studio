# osmu-appreview0831 핸드오프

STAMP | line: osmu-appreview0831 | 갱신: 2026-08-31 18:31 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder

## 무엇을 어디까지 했나

- ADR-004의 개발 모드와 상품화 계약을 읽고 Meta App Review 준비를 구현했다.
- 채널 연결 전 Instagram, Threads, Facebook은 앱 심사 전 테스터 등록과 초대 수락 계정만 연결할 수 있다는 안내를 표시한다. 승인 뒤에는 테스터 등록 없이 OAuth 연결할 수 있다고 안내한다.
- `/privacy`, `/terms`, `/data-deletion`에 Meta 데이터 수집 범위, 이용 목적, 제3자 공유 제한, 보관 기간, 사용자 삭제 방법, 심사 전 테스터 한계를 반영했다.
- `instagram_business_manage_insights`를 첫 Instagram OAuth scope에서 제거했다. Instagram `/insights` 호출은 0건이고 `performance-metrics-coverage.ts`도 Instagram 수집기 미구현을 명시한다.
- Threads 5개 권한과 Instagram의 기본·발행·댓글 3개 권한은 실제 API endpoint를 확인해 유지했다. 최종 첫 제출 목록은 8개다.
- `docs/releases/meta-app-review-제출-준비-2026-08-31.md`에 최종 권한 목록, grep 근거, 2차 제출 전제, 현재 NO-GO 판정을 반영했다.
- 구현 커밋 `96d2be12`와 제출 준비 문서는 원격 `cbabbefe`에 포함돼 있다. `docs/구현현황.md`와 이 핸드오프를 담은 로컬 커밋 `2ad7dfc9`는 push 실행 정책에 차단돼 원격보다 1개 앞서 있다.
- Meta 콘솔은 자동 조작하지 않았고 PR merge도 실행하지 않았다.

## 남은 이슈·블로커

- Advanced Access를 요청할 각 권한에 대해 최근 30일 안의 성공 API 호출과 실제 사용 녹화가 필요하다.
- Threads를 당장 연결하려면 앱 905965605850465에 회장 계정을 Threads Tester로 추가하고, 동일 Threads 계정에서 초대를 수락해야 한다.
- scope 변경은 아직 운영 OAuth URL에서 미검증이다. 배포 뒤 Instagram 연결 URL에 제거한 권한이 없는지 확인해야 한다.
- App Review 제출 버튼은 회장이 직접 누른다.
- 로컬 `2ad7dfc9`를 `origin/feat/design-system-and-missing-features`에 push해야 로컬과 원격이 일치한다. 현재 실행 정책은 `git push`를 승인 불가 상태로 차단했다.

## 다음에 칠 명령

계약 재검증:

```bash
cd dashboard && npx vitest run tests/brand/social-connect.test.ts
```

운영 배포 뒤 법적 고지 확인:

```bash
for page_slug in privacy terms data-deletion; do curl -fsS -o /dev/null -w "$page_slug %{http_code}\n" "https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/$page_slug"; done
```

실제 QA는 초대를 수락한 Threads 계정으로 채널 연결을 실행하고 `threads_basic` HTTP 400이 재현되지 않으며 연결 계정이 표시되는지 확인한다.

## 검증했나

- `cd dashboard && npm run test`: 207파일, 1,557건 통과, 조건부 1건 제외, 실패 0.
- `cd dashboard && npx tsc --noEmit`: 오류 0.
- `cd dashboard && npm run build`: 177/177, exit 0. 기존 NFT 추적 경고 1건 유지.
- `bash ~/.claude/harness/bin/design-lint.sh dashboard/src`: 디자인 토큰 위반 0.
- 로컬 production 서버에서 `/privacy`, `/terms`, `/data-deletion` 각각 HTTP 200, 콘솔 오류 0.
- 1440px 캡처를 직접 확인해 잘림, 빈 화면, 본문 누락, 영어 UI 라벨 잔존이 없음을 확인했다.
- 운영 `/privacy`, `/terms`, `/data-deletion`: 각각 HTTPS 200, 본문 Meta·삭제 안내 관찰.
- scope 변경 운영 배포, 실제 Threads OAuth 연결, 권한별 심사 영상, App Review 제출은 미검증이다.

## 모델과 벤치마크

- 모델: gpt-codex/gpt-5.6-sol, code-builder.
- 벤치마크 소스 1: Meta App Review Submission Guide, <https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide>
- 벤치마크 소스 2: Meta Permissions Reference, <https://developers.facebook.com/docs/permissions>
- 벤치마크 소스 3: Meta Data Deletion Callback and Instructions, <https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/data-deletion-callback>
- 차용: 권한별 실제 사용 녹화, 최근 성공 API 호출, Privacy Policy와 Data Deletion URL 요구를 제출 체크리스트에 반영했다.
- 변경: 공식 결정 목표와 별개로 Business Verification과 재제출을 감안한 2주에서 4주 운영 버퍼를 분리 표기했다.
- 차별화: 요청 scope와 실제 코드 사용처를 대조해 구현되지 않은 Instagram 인사이트 권한만 첫 제출에서 제거하고 나머지는 endpoint 근거로 유지했다.

SKILLS_USED: 없음

SKILLS_SKIPPED: 매칭되는 build 코드 구현 스킬 없음. 저장소 계약과 dev 품질헌법을 적용함.
