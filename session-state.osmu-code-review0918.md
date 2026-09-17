# OSMU 최근 24시간 코드 리뷰 인계

## 무엇을 어디까지 했나

- 라인: `osmu-code-review0918`
- handoff basis: 사용자의 최근 24시간 코드 공격 리뷰 요청
- 확인한 pane: `openclaw-auto:0.0`, `osmu-regress091800:0.0`. localhost 소유권과 중복 실행만 확인했고 다른 작업을 인계받지 않았다.
- 검토 범위: 2026-09-18 00:35 KST 기준 `d04c60a1..08b29f31`, 61개 커밋, 258개 파일
- 판정: MAJOR 10건, MINOR 0건, `REVIEW_VERDICT: BLOCK`
- 감사 문서: `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-18.md`
- QA 원장: `docs/qa/qa-tracker.md` 최상단 `REVIEW-24H-20260918-01`부터 `11`
- 커밋: `ea6cd73a` 감사 문서, `0803533f` QA 원장과 공용 인계 기록
- 제품 코드는 수정하지 않았다.

## 남은 이슈와 블로커

1. Studio 복구 단추가 실제 발행 원장을 고치지 않고 초안 상태와 복구 경고만 지운다.
2. YouTube가 실제 기본 계정 ID 대신 요청 account ID를 멱등 키와 예약에 사용한다.
3. YouTube 재개 시 저장된 파일 해시와 크기를 현재 파일에 대조하지 않는다.
4. TikTok 완료와 예약 발행이 사용량 outbox를 만들지 않는다.
5. 사용량 relay 실패를 HTTP 200과 정상 숫자로 표시한다.
6. 브라우저 상태 명령이 회원 브라우저 응답 없음에도 종료 코드 0을 반환한다.
7. Meta 승인 코드 검증 오류를 전부 테스터 명단 누락으로 오분류한다.
8. 네 방 E2E가 공유 설정 전체를 오래된 스냅샷으로 복원한다.
9. 새 브라우저 상태 출력이 확정 그림문자 금지 요구를 어긴다.
10. 기본 흐름과 Studio v1 E2E가 `STUDIO_LLM_PROVIDER_UNAVAILABLE`로 실패한다.

실제 SNS 발행, DB 장애 주입, 두 작업 공간 동시 동적 격리, 운영 배포는 미검증이다. 돈과 외부 공개를 일으키는 작업이라 이 코드리뷰에서는 실행하지 않았다.

## 다음에 칠 명령

```bash
sed -n '1,180p' docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-18.md
cd dashboard
npm run test
npx tsc --noEmit
set -a && source .env.local && set +a
node scripts/verify-basic-flow-e2e.mjs
node scripts/verify-studio-v1-e2e.mjs
```

code-builder는 감사의 MAJOR를 수정한 뒤 각 재현을 회귀 테스트로 고정하고, 최신 수정 소스와 일치하는 localhost에서 두 E2E를 다시 통과시켜야 한다.

## 검증했나

- `npm run test`: PASS, 374파일, 2,416건 통과, 3건 제외
- `npx tsc --noEmit`: PASS
- localhost health: HTTP 200, DB 정상
- `/api/usage`: HTTP 200, 임시 고객 토큰은 호출 뒤 폐기
- 기본 흐름 E2E: NG, 후보 0장, 공급자 사용 불가
- Studio v1 E2E: NG, 정상 생성 기대 201 대신 HTTP 200 공급자 오류
- 브라우저 상태: 회원 응답 없음과 종료 코드 0을 직접 관찰
- OAuth 분류: 만료된 승인 코드가 테스터 명단 누락으로 바뀌는 것을 직접 관찰
- `git diff --check`: PASS

⛔ 검증실패 보고: 등급 A, `osmu-api-read-sweep-v22-gpt-codex.md`의 qa-verifier 품질 검증 FAIL은 이번 코드리뷰 산출물이 아니며 재위임 또는 PASS 근거를 확인하지 못했다. 해당 산출물은 출고하지 않는다. 이번 코드리뷰 문서는 별도 범위의 BLOCK 보고로 출고했다.
